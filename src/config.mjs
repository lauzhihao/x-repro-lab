import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LAB_ROOT = path.resolve(__dirname, '..');
export const RUNS_DIR = path.join(LAB_ROOT, 'runs');
export const RUNTIME_DIR = path.join(LAB_ROOT, '.runtime');

export function readJson(relPath, fallback = null) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(LAB_ROOT, relPath);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    if (fallback !== null) return fallback;
    throw new Error(`Failed to read JSON ${full}: ${err.message}`);
  }
}

export function loadLocalConfig() {
  return readJson('.env.local.json', {
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '',
    jev_credentials_path: '',
    xops_root: '',
    nodes: {
      ubuntu_rtx5060: { ssh_host: '', docker: true, gpu: true },
      orin_64g: { ssh_host: '', docker: false, gpu: true },
      mac_headless: { local: true },
    },
    ego_sandbox_profile_id: 'Profile 1',
    ego_x_read_profile_id: 'Default',
    github_repo: 'lauzhihao/x-repro-lab',
    sla_minutes: 120,
    exec_budget_minutes: 105,
    daily_auto_cap: 2,
  });
}

export function loadCapabilities() {
  return readJson('config/capabilities.json');
}

export function loadSafetyPolicy() {
  return readJson('config/safety_policy.json');
}

export function loadJevQuestions() {
  return readJson('config/jev_questions.json');
}

export function proxyEnv(extra = {}) {
  const local = loadLocalConfig();
  const p = String(local.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  const base = { ...process.env, ...extra };
  const extraPaths = [path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', path.dirname(process.execPath)];
  const currentPaths = String(base.PATH || '').split(':').filter(Boolean);
  for (const ep of extraPaths.reverse()) {
    if (!currentPaths.includes(ep)) currentPaths.unshift(ep);
  }
  base.PATH = currentPaths.join(':');
  if (p) {
    base.HTTP_PROXY = p;
    base.HTTPS_PROXY = p;
    base.http_proxy = p;
    base.https_proxy = p;
    base.NO_PROXY = 'localhost,127.0.0.1,::1,.local,.ts.net';
    base.no_proxy = 'localhost,127.0.0.1,::1,.local,.ts.net';
  }
  return base;
}
