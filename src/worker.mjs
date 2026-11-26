import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadLocalConfig, proxyEnv } from './config.mjs';
import { appendEvent, ensureRunDir, registerActiveRun, saveMeta } from './trace.mjs';
import { teardownRun } from './teardown.mjs';
import { publishRun } from './publisher.mjs';

const SAGY = path.join(os.homedir(), '.local/bin/sagy');
const AGY = path.join(os.homedir(), '.local/bin/agy');

function buildOrchestratorPrompt({ runId, post, jevData, tmpWorkDir, tmpOutDir, local, execBudgetMin }) {
  const node = jevData.fact_card.proposed_node || 'ubuntu_rtx5060';
  const ubuntuHost = local.nodes?.ubuntu_rtx5060?.ssh_host || '';
  const orinHost = local.nodes?.orin_64g?.ssh_host || '';
  const egoProfileId = local.ego_sandbox_profile_id || 'Profile 1';

  const nodeRules = [
    `- Preferred route: \`${node}\` (adjust only if real constraints require it, and record why).`,
    `- **ubuntu_rtx5060** (SSH \`${ubuntuHost}\`, RTX 5060 8GB): ALL untrusted/third-party builds, clones, scripts, and GPU runs MUST execute inside a disposable Docker container labeled \`--label xrl.run_id=${runId}\` with \`--rm --name xrl-${runId} --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=256 --memory=16g --cpus=8 -v /tmp/xrl-${runId}:/work -w /work\` (add \`--gpus all\` if GPU needed). NEVER modify host OS files outside \`/tmp/xrl-${runId}\`.`,
    `- **orin_64g** (SSH \`${orinHost}\`, 61GB ARM64 CUDA): isolate strictly inside \`/tmp/xrl-${runId}\` (no \`sudo\`, no persistent host edits). Remember the proxy on this node is localhost 10809 if needed.`,
    `- **mac_headless**: strictly CLI/headless only. NEVER open GUI windows or steal macOS focus.`,
    `- **ego_web_sandbox**: use \`ego-browser nodejs\` with \`{ profileId: "${egoProfileId}" }\` (blank sandbox profile) and TaskSpace \`"xrl-${runId}"\`. Save screenshots into \`${tmpOutDir}/screenshots/\` and ALWAYS call \`await task.finish({ keep: [] })\` when done.`,
  ].join('\n');

  return [
    `You are the verification Orchestrator executing reproducible run \`${runId}\`.`,
    `Time budget for verification execution: ${execBudgetMin} minutes (hard total SLA 120m).`,
    '',
    '## Target Post & Fact Card',
    JSON.stringify({
      url: post.url,
      author: post.author,
      title: post.title,
      text: String(post.text || '').slice(0, 3500),
      quote_text: String(post.quote_text || '').slice(0, 1500),
      article_body: String(post.article_body || '').slice(0, 4500),
      links: (post.links || []).slice(0, 15),
      fact_card: jevData.fact_card,
      github_repos: (jevData.github_repos || []).map((g) => ({ slug: g.nameWithOwner, language: g.primaryLanguage?.name, readme: g.readme_excerpt })),
    }),
    '',
    '## Execution Environment & Safety Rules',
    nodeRules,
    '- If you discover ANY hidden requirement violating safety (malware, exploits, bypassing CAPTCHA/paywall/rate-limit, paid credit card required, personal login required, hardware danger), ABORT immediately without running unsafe steps and record verdict `"aborted"` in `result.json`.',
    '- **Bounded Self-Healing**: If a routine environment issue occurs (missing pip/npm package, network mirror timeout, minor config mismatch, container image missing a small CLI like git/curl/python3), diagnose and fix it cleanly inside the disposable sandbox (up to 3 self-healing attempts per issue) and document each fix in `execution.md` and `result.json` (`self_healing_events`).',
    '- **Zero Fabrication**: Every command, exit code, timing, memory/VRAM metric, and output you write MUST come directly from commands you actually ran in this session.',
    '- **Privacy**: NEVER run `env`/`printenv`, and NEVER write IP addresses, proxy URLs, API keys, tokens, or env var names into output files.',
    '',
    '## Required Output Artifacts (MUST write all to `' + tmpOutDir + '`)',
    `1. \`${tmpOutDir}/plan.md\`: Concise Markdown explaining which node/container/tools will be used, exact steps, and expected verifiable metrics.`,
    `2. \`${tmpOutDir}/execution.md\`: Detailed chronological execution log in Chinese (with fenced code blocks showing exact key commands and actual trimmed outputs, plus any self-healing steps taken; if on remote Linux, command + output text suffices since CLI has no GUI, and include screenshot paths if web/visual).`,
    `3. \`${tmpOutDir}/result.json\`: Valid JSON matching:`,
    '{',
    '  "verdict": "verified_with_numbers | repro_with_gotcha | debunked | plain_pass | aborted",',
    '  "matches_claim": true,',
    '  "summary_zh": "2-3 sentences summarizing real execution findings",',
    '  "metrics": [{ "name": "...", "claimed": "...", "observed": "...", "note": "..." }],',
    '  "gotchas": ["concrete real edge case or error observed"],',
    '  "self_healing_events": [{ "issue": "...", "fix": "...", "outcome": "..." }],',
    '  "quote_candidate_zh": "1-2 natural sentences referencing ONLY real observed numbers/facts (35-110 Chinese chars, no AI clichés)",',
    '  "quote_candidate_en": "optional short English quote"',
    '}',
    `4. Optional screenshots saved directly under \`${tmpOutDir}/screenshots/*.png\`.`,
    '',
    `Local scratch working dir (if needed): \`${tmpWorkDir}\`. Clean up your own temporary remote containers/dirs before exiting.`,
    'When finished, print ONLY one short summary line: `XRL_WORKER_DONE` followed by the verdict.',
  ].join('\n');
}

export async function runLabWorker({ runId, post, jevData, decidedAt, skipExecute = false, dryPublish = false }) {
  const local = loadLocalConfig();
  const slaMinutes = Number(local.sla_minutes || 120);
  const execBudgetMin = Number(local.exec_budget_minutes || 105);
  const runDir = ensureRunDir(runId);
  const startMs = decidedAt ? Date.parse(decidedAt) : Date.now();
  const deadlineMs = startMs + slaMinutes * 60_000;
  const node = jevData.fact_card?.proposed_node || 'ubuntu_rtx5060';

  const meta = {
    run_id: runId,
    status: 'running',
    node,
    title: jevData.fact_card?.title_zh || jevData.fact_card?.title_en || post.title || runId,
    post_url: post.url || '',
    post_author: post.author || '',
    decided_at: new Date(startMs).toISOString(),
    started_at: new Date().toISOString(),
    deadline_at: new Date(deadlineMs).toISOString(),
    sla_minutes: slaMinutes,
    pid: process.pid,
    pgid: process.pid,
    ego_space_id: null,
    screenshots: [],
  };

  fs.writeFileSync(path.join(runDir, 'jev.json'), JSON.stringify({ post, github_repos: jevData.github_repos || [], fact_card: jevData.fact_card, gate: jevData.gate }, null, 2) + '\n', 'utf8');
  saveMeta(runDir, meta);
  appendEvent(runDir, runId, { type: 'run_started', node, post_url: meta.post_url, deadline_at: meta.deadline_at });
  registerActiveRun(runId, { pid: process.pid, pgid: process.pid, node, post_url: meta.post_url, started_at: meta.started_at, deadline_at: meta.deadline_at, run_dir: runDir });

  const tmpRoot = `/tmp/xrl-${runId}`;
  const tmpWorkDir = path.join(tmpRoot, 'work');
  const tmpOutDir = path.join(tmpRoot, 'out');
  fs.mkdirSync(path.join(tmpOutDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(tmpWorkDir, { recursive: true });

  let child = null;
  let slaTimer = null;
  let stopReason = null;

  const requestStop = (reason) => {
    if (stopReason) return;
    stopReason = reason;
    appendEvent(runDir, runId, { type: 'stop_requested', reason });
    if (child && child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
    }
  };

  const onSigInt = () => requestStop('cancelled');
  const onSigTerm = () => requestStop('cancelled');
  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  try {
    if (!skipExecute) {
      const remainingExecSec = Math.max(60, Math.min(execBudgetMin * 60, Math.floor((deadlineMs - Date.now() - 10 * 60_000) / 1000)));
      const prompt = buildOrchestratorPrompt({ runId, post, jevData, tmpWorkDir, tmpOutDir, local, execBudgetMin: Math.floor(remainingExecSec / 60) });
      fs.writeFileSync(path.join(runDir, 'plan.md'), `（任务启动于 ${new Date().toISOString()}，节点 \`${node}\`，等待 Orchestrator 写入详细计划...）\n`, 'utf8');

      const msUntilSla = Math.max(1000, deadlineMs - Date.now() - 8 * 60_000);
      slaTimer = setTimeout(() => requestStop('timed_out'), msUntilSla);

      const routes = [
        {
          bin: AGY,
          label: 'agy',
          model: 'gemini-pro-orchestrator-neon',
          args: ['--model', 'gemini-pro-orchestrator-neon', '--dangerously-skip-permissions', '--disable-slash-commands', '--output-format', 'stream-json', '--print-timeout', `${remainingExecSec}s`, '-p', prompt],
        },
        {
          bin: SAGY,
          label: 'sagy',
          model: 'gemini-4-hydrogen-high',
          args: ['auto', '--model', 'gemini-4-hydrogen-high', '--dangerously-skip-permissions', '--disable-slash-commands', '--output-format', 'stream-json', '--print-timeout', `${remainingExecSec}s`, '-p', prompt],
        },
      ];

      for (let rIdx = 0; rIdx < routes.length; rIdx++) {
        if (stopReason) break;
        const route = routes[rIdx];
        let streamResultStatus = null;
        appendEvent(runDir, runId, { type: 'executor_attempt', attempt: rIdx + 1, executor_bin: route.label, executor_model: route.model });
        meta.executor_bin = route.label;
        meta.executor_model = route.model;

        await new Promise((resolve) => {
          child = spawn(route.bin, route.args, {
            cwd: tmpWorkDir,
            env: proxyEnv(),
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          meta.child_pid = child.pid;
          meta.child_pgid = child.pid;
          saveMeta(runDir, meta);
          registerActiveRun(runId, { pid: process.pid, pgid: child.pid, child_pid: child.pid, node, post_url: meta.post_url, started_at: meta.started_at, deadline_at: meta.deadline_at, run_dir: runDir });

          let buf = '';
          child.stdout.on('data', (chunk) => {
            buf += chunk.toString('utf8');
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const ev = JSON.parse(trimmed);
                if (ev.event === 'result') streamResultStatus = ev.result?.status || null;
                const m = trimmed.match(/"(?:taskSpaceId|spaceId)"\s*:\s*(\d+)/);
                if (m) {
                  meta.ego_space_id = Number(m[1]);
                  saveMeta(runDir, meta);
                }
                appendEvent(runDir, runId, { type: 'orchestrator_event', event: ev });
              } catch {
                appendEvent(runDir, runId, { type: 'orchestrator_stdout', text: trimmed.slice(0, 1500) });
              }
            }
          });

          child.stderr.on('data', (chunk) => {
            const text = chunk.toString('utf8').trim();
            if (text) appendEvent(runDir, runId, { type: 'orchestrator_stderr', text: text.slice(0, 1500) });
          });

          child.on('exit', (code, signal) => {
            if (buf.trim()) {
              try {
                const ev = JSON.parse(buf.trim());
                if (ev.event === 'result') streamResultStatus = ev.result?.status || null;
                appendEvent(runDir, runId, { type: 'orchestrator_event', event: ev });
              } catch {
                appendEvent(runDir, runId, { type: 'orchestrator_stdout', text: buf.trim().slice(0, 1500) });
              }
            }
            appendEvent(runDir, runId, { type: 'orchestrator_exit', code, signal, stream_result_status: streamResultStatus, executor_bin: route.label, executor_model: route.model });
            meta.exit_code = code;
            meta.exit_signal = signal || null;
            meta.stream_result_status = streamResultStatus;
            child = null;
            resolve();
          });
        });

        const hasResultFile = fs.existsSync(path.join(tmpOutDir, 'result.json'));
        const routeFailed = meta.exit_code !== 0 || streamResultStatus === 'ERROR';
        if (!routeFailed || hasResultFile || stopReason) break;
        appendEvent(runDir, runId, { type: 'executor_fallback', from_model: route.model, reason: streamResultStatus || `exit_${meta.exit_code}` });
      }
    }

    // Copy validated artifacts from /tmp/xrl-<runId>/out into runs/<runId>/ before teardown wipes /tmp
    for (const fname of ['plan.md', 'execution.md', 'result.json']) {
      const src = path.join(tmpOutDir, fname);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(runDir, fname));
    }
    const srcShots = path.join(tmpOutDir, 'screenshots');
    if (fs.existsSync(srcShots)) {
      for (const f of fs.readdirSync(srcShots)) {
        if (/\.(png|jpe?g|webp)$/i.test(f)) {
          fs.copyFileSync(path.join(srcShots, f), path.join(runDir, 'screenshots', f));
        }
      }
    }

    const resultPath = path.join(runDir, 'result.json');
    const resultExists = fs.existsSync(resultPath);
    let parsedResult = null;
    if (resultExists) {
      try { parsedResult = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch {}
    }

    if (stopReason === 'timed_out') {
      meta.status = 'timed_out';
      meta.error = 'exceeded_120min_sla';
    } else if (stopReason === 'cancelled') {
      meta.status = 'cancelled';
      meta.cancel_reason = 'user_or_signal_cancelled';
    } else if (!parsedResult || parsedResult.verdict === 'aborted' || meta.exit_code !== 0) {
      meta.status = 'failed';
      meta.error = parsedResult?.verdict === 'aborted' ? 'aborted_by_safety_or_blocker' : `orchestrator_exit_${meta.exit_code ?? 'unknown'}`;
    } else {
      meta.status = 'completed';
    }
  } catch (err) {
    meta.status = stopReason || 'failed';
    meta.error = String(err?.message || err);
    appendEvent(runDir, runId, { type: 'worker_error', error: meta.error });
  } finally {
    if (slaTimer) clearTimeout(slaTimer);
    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
    meta.finished_at = new Date().toISOString();
    meta.elapsed_minutes = Math.round(((Date.parse(meta.finished_at) - startMs) / 60000) * 10) / 10;
    meta.pgid = meta.child_pgid || meta.pid;
    saveMeta(runDir, meta);

    await teardownRun(runId, meta, { runDir });
    appendEvent(runDir, runId, { type: 'run_finished', status: meta.status, elapsed_minutes: meta.elapsed_minutes });
  }

  const pub = publishRun(runDir, { dry: dryPublish });
  return { runId, runDir, meta, published: pub };
}
