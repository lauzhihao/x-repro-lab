import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadLocalConfig } from './config.mjs';
import { appendEvent, unregisterActiveRun } from './trace.mjs';

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
}

export async function killProcessGroup(pgid, logFn = () => {}) {
  if (!Number.isSafeInteger(pgid) || pgid < 2) return false;
  if (!pidAlive(pgid)) return false;
  try {
    process.kill(-pgid, 'SIGTERM');
    logFn(`sent SIGTERM to pgid ${pgid}`);
  } catch {
    try { process.kill(pgid, 'SIGTERM'); } catch {}
  }
  await new Promise((r) => setTimeout(r, 3000));
  if (pidAlive(pgid)) {
    try {
      process.kill(-pgid, 'SIGKILL');
      logFn(`sent SIGKILL to pgid ${pgid}`);
    } catch {
      try { process.kill(pgid, 'SIGKILL'); } catch {}
    }
  }
  return true;
}

export async function teardownRun(runId, meta = {}, { runDir = null } = {}) {
  const local = loadLocalConfig();
  const details = [];
  const logStep = (step, status, extra = {}) => {
    details.push({ step, status, ...extra });
    if (runDir) appendEvent(runDir, runId, { type: 'teardown', step, status, ...extra });
  };

  // 1. Kill local child process group if still running
  if (meta.pgid || meta.pid) {
    const killed = await killProcessGroup(meta.pgid || meta.pid, (msg) => logStep('kill_process_group', 'done', { msg }));
    if (!killed) logStep('kill_process_group', 'already_exited');
  }

  // 2. Clean Ubuntu RTX 5060 Docker containers + /tmp/xrl-<runId>
  const ubuntuHost = local.nodes?.ubuntu_rtx5060?.ssh_host;
  if (ubuntuHost) {
    const cmd = `ids=$(docker ps -aq --filter label=xrl.run_id=${runId}); if [ -n "$ids" ]; then docker rm -f $ids; fi; rm -rf /tmp/xrl-${runId}`;
    const r = spawnSync('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', ubuntuHost, cmd], { encoding: 'utf8', timeout: 25000 });
    logStep('ubuntu_cleanup', r.status === 0 ? 'cleaned' : 'warn', { exit: r.status });
  }

  // 3. Clean Orin temp dir & matching processes
  const orinHost = local.nodes?.orin_64g?.ssh_host;
  if (orinHost && (meta.node === 'orin_64g' || meta.touched_nodes?.includes?.('orin_64g'))) {
    const cmd = `pkill -f "xrl-${runId}" || true; rm -rf /tmp/xrl-${runId}`;
    const r = spawnSync('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', orinHost, cmd], { encoding: 'utf8', timeout: 20000 });
    logStep('orin_cleanup', r.status === 0 ? 'cleaned' : 'warn', { exit: r.status });
  }

  // 4. Clean local scratch dir
  const localTmp = `/tmp/xrl-${runId}`;
  if (fs.existsSync(localTmp)) {
    fs.rmSync(localTmp, { recursive: true, force: true });
    logStep('local_tmp_cleanup', 'removed');
  } else {
    logStep('local_tmp_cleanup', 'absent');
  }

  // 5. Close Ego Lite TaskSpace if any was recorded
  if (meta.ego_space_id) {
    const script = `const t = await taskSpace(${Number(meta.ego_space_id)}); await t.finish({ keep: [] });`;
    const r = spawnSync('ego-browser', ['nodejs', '-e', script], { encoding: 'utf8', timeout: 15000 });
    logStep('ego_space_cleanup', r.status === 0 ? 'closed' : 'warn', { space_id: meta.ego_space_id, exit: r.status });
  }

  unregisterActiveRun(runId);
  return details;
}
