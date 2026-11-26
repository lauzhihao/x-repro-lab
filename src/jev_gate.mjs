import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadLocalConfig, loadJevQuestions, loadCapabilities, proxyEnv } from './config.mjs';

const DEFAULT_API_URL = 'https://api.typesafe.ai/v1/systemone';

export function resolveJevApiKey() {
  const envKey = String(process.env.TYPESAFE_API_KEY || '').trim();
  if (envKey) return envKey;
  const local = loadLocalConfig();
  if (local.jev_credentials_path && fs.existsSync(local.jev_credentials_path)) {
    try {
      const data = JSON.parse(fs.readFileSync(local.jev_credentials_path, 'utf8'));
      return String(data.api_key || '').trim();
    } catch {}
  }
  return '';
}

export function callJev(state, questions, { model = 'jev-1.14.0', timeoutMs = 10000 } = {}) {
  const apiKey = resolveJevApiKey();
  if (!apiKey) return { ok: false, reason: 'jev_no_key' };
  const headerFile = path.join(os.tmpdir(), `xrl-jev-${process.pid}-${randomUUID()}.cfg`);
  fs.writeFileSync(
    headerFile,
    [
      `header = "Authorization: Bearer ${apiKey}"`,
      'header = "Content-Type: application/json"',
      'header = "User-Agent: x-repro-lab/1.0"',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  try {
    const secs = Math.max(1, Math.ceil(timeoutMs / 1000));
    const res = spawnSync(
      'curl',
      ['-sS', '--max-time', String(secs), '-K', headerFile, '-X', 'POST', '-w', '\n__STATUS__%{http_code}', '--data-binary', '@-', DEFAULT_API_URL],
      { input: JSON.stringify({ model, state, questions }), encoding: 'utf8', env: proxyEnv(), timeout: timeoutMs + 1500, maxBuffer: 2 * 1024 * 1024 }
    );
    if (res.error) return { ok: false, reason: res.error.code === 'ETIMEDOUT' ? 'jev_timeout' : 'jev_network' };
    if (res.status !== 0) return { ok: false, reason: 'jev_network', stderr: (res.stderr || '').slice(0, 200) };
    const raw = res.stdout || '';
    const mark = raw.lastIndexOf('\n__STATUS__');
    if (mark < 0) return { ok: false, reason: 'jev_bad_response' };
    const httpStatus = Number(raw.slice(mark + '\n__STATUS__'.length).trim());
    if (httpStatus !== 200) return { ok: false, reason: 'jev_http', status: httpStatus };
    const body = JSON.parse(raw.slice(0, mark));
    if (!body || typeof body.answers !== 'object') return { ok: false, reason: 'jev_bad_response' };
    return { ok: true, answers: body.answers, model: body.model || model, usage: body.usage || null };
  } catch (err) {
    return { ok: false, reason: 'jev_exception', error: String(err.message || err) };
  } finally {
    try { fs.unlinkSync(headerFile); } catch {}
  }
}

function noulScore(answers, id) {
  const val = answers?.[id];
  const s = typeof val === 'number' ? val : val?.noul;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
}

export function evaluateJevGate(factCardEn, { evaluate = callJev } = {}) {
  const qCfg = loadJevQuestions();
  const caps = loadCapabilities();
  const state = {
    fact_card: factCardEn,
    capabilities: caps,
  };

  const questionsPayload = {};
  for (const [id, q] of Object.entries(qCfg.questions)) {
    questionsPayload[id] = { type: q.type, instructions: q.instructions, criteria: q.criteria };
  }

  const res = evaluate(state, questionsPayload, { model: qCfg.model || 'jev-1.14.0', timeoutMs: 12000 });
  if (!res?.ok || !res.answers) {
    return {
      verdict: 'NO_GO',
      reason: res?.reason || 'jev_unavailable',
      model: qCfg.model || 'jev-1.14.0',
      yes_threshold: qCfg.yes_threshold,
      no_threshold: qCfg.no_threshold,
      slots: [],
      failed_slots: [res?.reason || 'jev_unavailable'],
      raw_answers: null,
    };
  }

  const slots = [];
  const failed = [];
  for (const [id, q] of Object.entries(qCfg.questions)) {
    const score = noulScore(res.answers, id);
    const isPos = q.role === 'positive';
    const expected = isPos ? `>= ${qCfg.yes_threshold}` : `<= ${qCfg.no_threshold}`;
    const passed = score !== null && (isPos ? score >= qCfg.yes_threshold : score <= qCfg.no_threshold);
    const zone = score === null ? 'missing' : score >= qCfg.yes_threshold ? 'YES' : score <= qCfg.no_threshold ? 'NO' : 'UNSURE';
    if (!passed) failed.push(`${id}=${score ?? 'null'}(${zone})`);
    slots.push({
      id,
      role: q.role,
      label_zh: q.label_zh,
      question: q.instructions.question,
      criteria_true: q.criteria.true.what,
      criteria_false: q.criteria.false.what,
      expected,
      score,
      zone,
      passed,
    });
  }

  const verdict = failed.length === 0 ? 'GO' : 'NO_GO';
  return {
    verdict,
    reason: verdict === 'GO' ? 'all_9_slots_passed' : `blocked:${failed.join(',')}`,
    model: res.model || qCfg.model || 'jev-1.14.0',
    usage: res.usage || null,
    yes_threshold: qCfg.yes_threshold,
    no_threshold: qCfg.no_threshold,
    slots,
    failed_slots: failed,
    raw_answers: res.answers,
  };
}
