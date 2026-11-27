import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { RUNS_DIR, RUNTIME_DIR } from './config.mjs';

const ACTIVE_FILE = path.join(RUNTIME_DIR, 'active_runs.json');
const HISTORY_FILE = path.join(RUNTIME_DIR, 'history.jsonl');

export function makeRunId(postId = 'manual') {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const cleanId = String(postId || 'manual').replace(/[^A-Za-z0-9_-]/g, '').slice(-12) || 'manual';
  return `lab-${stamp}-${cleanId}-${randomBytes(3).toString('hex')}`;
}

export function ensureRunDir(runId) {
  const dir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
  return dir;
}

export function saveMeta(runDir, meta) {
  const target = path.join(runDir, 'meta.json');
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, target);
}

export function loadMeta(runDir) {
  return JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
}

export function appendEvent(runDir, runId, event) {
  fs.mkdirSync(runDir, { recursive: true });
  const evFile = path.join(runDir, 'events.jsonl');
  let seq = 1;
  if (fs.existsSync(evFile)) {
    const raw = fs.readFileSync(evFile, 'utf8').trim();
    if (raw) seq = raw.split('\n').length + 1;
  }
  const entry = {
    seq,
    ts: new Date().toISOString(),
    run_id: runId,
    ...event,
  };
  fs.appendFileSync(evFile, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function readActiveMap() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeActiveMap(map) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const tmp = `${ACTIVE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, ACTIVE_FILE);
}

export function registerActiveRun(runId, info) {
  const map = readActiveMap();
  map[runId] = { run_id: runId, ...info };
  writeActiveMap(map);
}

export function getActiveRuns() {
  return readActiveMap();
}

export function unregisterActiveRun(runId) {
  const map = readActiveMap();
  if (runId in map) {
    delete map[runId];
    writeActiveMap(map);
  }
}

export function appendHistory(entry) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.appendFileSync(HISTORY_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}

export function loadSeenStatusIds() {
  const seen = new Set();
  const extract = (u) => String(u || '').match(/\/status\/(\d+)/)?.[1] || '';
  if (fs.existsSync(RUNS_DIR)) {
    for (const d of fs.readdirSync(RUNS_DIR)) {
      const mPath = path.join(RUNS_DIR, d, 'meta.json');
      if (!fs.existsSync(mPath)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
        const id = extract(m.post_url);
        if (id) seen.add(id);
      } catch {}
    }
  }
  if (fs.existsSync(HISTORY_FILE)) {
    for (const line of fs.readFileSync(HISTORY_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const id = extract(row.post_url);
        if (id) seen.add(id);
      } catch {}
    }
  }
  return seen;
}
