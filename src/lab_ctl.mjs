#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { RUNS_DIR, loadLocalConfig } from './config.mjs';
import { prepareIntake, extractStatusId } from './intake.mjs';
import { evaluateJevGate } from './jev_gate.mjs';
import { appendEvent, appendHistory, ensureRunDir, getActiveRuns, loadMeta, makeRunId, saveMeta } from './trace.mjs';
import { teardownRun } from './teardown.mjs';
import { publishRun } from './publisher.mjs';
import { runLabWorker } from './worker.mjs';

function flagVal(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function cmdStatus() {
  const active = getActiveRuns();
  const entries = Object.values(active);
  if (!entries.length) {
    console.log('No active verification runs.');
    return;
  }
  const now = Date.now();
  for (const r of entries) {
    const remMin = r.deadline_at ? Math.round((Date.parse(r.deadline_at) - now) / 60000) : '?';
    console.log(`${r.run_id}  node=${r.node}  pid=${r.pid}  remaining=${remMin}m  url=${r.post_url}`);
  }
}

function cmdList() {
  if (!fs.existsSync(RUNS_DIR)) {
    console.log('No recorded runs yet.');
    return;
  }
  const dirs = fs.readdirSync(RUNS_DIR).sort().reverse().slice(0, 30);
  for (const d of dirs) {
    const metaPath = path.join(RUNS_DIR, d, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    console.log(`${m.run_id}  ${String(m.status || '?').padEnd(10)}  ${String(m.node || '?').padEnd(15)}  ${m.elapsed_minutes ?? '?'}m  ${m.title || m.post_url}`);
  }
}

async function cmdCancel(runId) {
  if (!runId) throw new Error('usage: lab_ctl.mjs cancel <run_id>');
  const active = getActiveRuns()[runId];
  const runDir = path.join(RUNS_DIR, runId);
  const meta = fs.existsSync(path.join(runDir, 'meta.json')) ? loadMeta(runDir) : (active || { run_id: runId });
  meta.status = 'cancelled';
  meta.cancel_reason = 'manual_cancel_command';
  meta.finished_at = new Date().toISOString();
  if (meta.decided_at) {
    meta.elapsed_minutes = Math.round(((Date.parse(meta.finished_at) - Date.parse(meta.decided_at)) / 60000) * 10) / 10;
  }
  if (fs.existsSync(runDir)) saveMeta(runDir, meta);

  const details = await teardownRun(runId, { ...active, ...meta }, { runDir: fs.existsSync(runDir) ? runDir : null });
  let published = null;
  if (fs.existsSync(runDir) && !fs.existsSync(path.join(runDir, 'issue_body.md'))) {
    try { published = publishRun(runDir); } catch (err) { published = { error: err.message }; }
  }
  console.log(JSON.stringify({ cancelled: runId, teardown: details, published }, null, 2));
}

function cmdReplay(runId) {
  if (!runId) throw new Error('usage: lab_ctl.mjs replay <run_id>');
  const evFile = path.join(RUNS_DIR, runId, 'events.jsonl');
  if (!fs.existsSync(evFile)) throw new Error(`events.jsonl not found for ${runId}`);
  const lines = fs.readFileSync(evFile, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const ev = JSON.parse(line);
    if (ev.type === 'orchestrator_event') {
      const inner = ev.event || {};
      const kind = inner.type || inner.event?.type || 'msg';
      const summary = inner.message?.content?.[0]?.text || inner.result || inner.subtype || JSON.stringify(inner).slice(0, 160);
      console.log(`[#${ev.seq} ${ev.ts}] orch:${kind} -> ${String(summary).replace(/\s+/g, ' ').slice(0, 160)}`);
    } else {
      const { seq, ts, run_id, type, ...rest } = ev;
      console.log(`[#${seq} ${ts}] ${type} ${JSON.stringify(rest).slice(0, 200)}`);
    }
  }
}

async function cmdEvaluate({ url, postJsonPath = null }) {
  const postInput = postJsonPath ? JSON.parse(fs.readFileSync(postJsonPath, 'utf8')) : null;
  const intake = prepareIntake({ url, postInput });
  if (intake.staticCheck.blocked) {
    return {
      verdict: 'NO_GO',
      stage: 'static_safety_policy',
      reason: `${intake.staticCheck.rule_id}: ${intake.staticCheck.description}`,
      intake,
      gate: null,
    };
  }
  const gate = evaluateJevGate(intake.factCardForJev);
  return {
    verdict: gate.verdict,
    stage: 'jev_gate',
    reason: gate.reason,
    intake,
    gate,
  };
}

async function cmdRun({ url, postJsonPath = null, dryPublish = false }) {
  const decidedAt = new Date().toISOString();
  const res = await cmdEvaluate({ url, postJsonPath });
  if (res.verdict !== 'GO') {
    appendHistory({
      post_url: res.intake.post.url || url,
      verdict: 'NO_GO',
      stage: res.stage,
      reason: res.reason,
    });
    console.log(JSON.stringify({ verdict: 'NO_GO', stage: res.stage, reason: res.reason, slots: res.gate?.slots || [] }, null, 2));
    return { verdict: 'NO_GO', ...res };
  }

  const runId = makeRunId(extractStatusId(res.intake.post.url || url));
  const out = await runLabWorker({
    runId,
    post: res.intake.post,
    jevData: { github_repos: res.intake.githubRepos, fact_card: res.intake.factCard, gate: res.gate },
    decidedAt,
    dryPublish,
  });
  console.log(JSON.stringify({ run_id: out.runId, status: out.meta.status, elapsed_minutes: out.meta.elapsed_minutes, published: out.published }, null, 2));
  return out;
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'status') cmdStatus();
  else if (cmd === 'list') cmdList();
  else if (cmd === 'cancel') await cmdCancel(args[0]);
  else if (cmd === 'replay') cmdReplay(args[0]);
  else if (cmd === 'evaluate') {
    const url = flagVal(args, '--url');
    const postJsonPath = flagVal(args, '--post-json');
    if (!url && !postJsonPath) throw new Error('usage: lab_ctl.mjs evaluate --url <x_url> [--post-json <file>]');
    const res = await cmdEvaluate({ url, postJsonPath });
    console.log(JSON.stringify({ verdict: res.verdict, stage: res.stage, reason: res.reason, fact_card: res.intake.factCard, gate: res.gate }, null, 2));
  } else if (cmd === 'run') {
    const url = flagVal(args, '--url');
    const postJsonPath = flagVal(args, '--post-json');
    const dryPublish = args.includes('--dry-publish');
    if (!url && !postJsonPath) throw new Error('usage: lab_ctl.mjs run --url <x_url> [--post-json <file>] [--dry-publish]');
    await cmdRun({ url, postJsonPath, dryPublish });
  } else if (cmd === 'intake-batch') {
    const file = flagVal(args, '--file');
    if (!file || !fs.existsSync(file)) throw new Error('usage: lab_ctl.mjs intake-batch --file <json>');
    const local = loadLocalConfig();
    const cap = Number(local.daily_auto_cap || 2);
    const todayPrefix = `lab-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const existingToday = fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).filter((d) => d.startsWith(todayPrefix)).length : 0;
    const candidates = JSON.parse(fs.readFileSync(file, 'utf8'));
    let launched = 0;
    for (const c of candidates) {
      if (existingToday + launched >= cap || Object.keys(getActiveRuns()).length >= 1) break;
      const tmpPost = `/tmp/xrl-batch-${process.pid}-${launched}.json`;
      fs.writeFileSync(tmpPost, JSON.stringify(c), 'utf8');
      try {
        const res = await cmdEvaluate({ url: c.url, postJsonPath: tmpPost });
        if (res.verdict === 'GO') {
          launched++;
          await cmdRun({ url: c.url, postJsonPath: tmpPost });
        }
      } finally {
        try { fs.unlinkSync(tmpPost); } catch {}
      }
    }
  } else {
    console.error('usage: lab_ctl.mjs status|list|cancel|replay|evaluate|run|intake-batch');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err?.stack || err);
  process.exitCode = 1;
}
