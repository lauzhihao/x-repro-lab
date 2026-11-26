import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LAB_ROOT, loadLocalConfig } from './config.mjs';

const SENSITIVE_ENV_NAMES = [
  'TYPESAFE_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SESSION_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
];

const TOKEN_PATTERNS = [
  /\b(?:gho|ghp|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{25,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[bpas]-[0-9A-Za-z-]{10,}\b/g,
  /(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
];

const AUDIT_PATTERNS = [
  { name: 'secret_token_prefix', re: /\b(?:gho|ghp|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b|\bAIza[0-9A-Za-z\-_]{25,}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[bpas]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'private_key_block', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: 'bearer_header', re: /Authorization\s*:\s*Bearer\s+(?!\[REDACTED)/i },
  { name: 'ipv4_address', re: /(?:^|[^0-9.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?::\d{1,5})?(?![0-9.])/ },
  { name: 'tailnet_domain', re: /\b[a-zA-Z0-9-]+\.ts\.net\b/i },
  { name: 'email_address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'sensitive_env_name', re: new RegExp(`\\b(?:${SENSITIVE_ENV_NAMES.join('|')})\\b`, 'i') },
  { name: 'generic_secret_assignment', re: /\b[A-Z0-9_]{3,}_(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY)\b\s*[:=]\s*\S+/ },
  { name: 'local_home_path', re: /\/(?:Users|home)\/[A-Za-z0-9._-]+/ },
];

const ALLOWLIST_TEXT_EXTS = new Set(['.md', '.json', '.jsonl', '.txt', '.log', '.yml', '.yaml']);
const ALLOWLIST_SCREENSHOT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDynamicReplacements() {
  const local = loadLocalConfig();
  const pairs = [];
  const add = (raw, mask) => {
    const val = String(raw || '').trim();
    if (val && val.length >= 3) pairs.push([val, mask]);
  };

  add(os.homedir(), '[REDACTED_PATH]');
  add(local.xops_root, '[REDACTED_XOPS_PATH]');
  if (local.jev_credentials_path) add(local.jev_credentials_path, '[REDACTED_CRED_PATH]');
  add(os.hostname(), '[REDACTED_HOST]');
  const user = os.userInfo()?.username;
  if (user && user.length >= 4) {
    add(`/Users/${user}`, '[REDACTED_PATH]');
    add(`/home/${user}`, '[REDACTED_PATH]');
  }
  if (local.nodes?.ubuntu_rtx5060?.ssh_host) add(local.nodes.ubuntu_rtx5060.ssh_host, 'ubuntu-rtx5060');
  if (local.nodes?.orin_64g?.ssh_host) add(local.nodes.orin_64g.ssh_host, 'orin-64g');
  if (local.proxy) add(local.proxy, '[REDACTED_PROXY]');

  // Also scrub any live secret values loaded in environment or typesafe credentials file
  for (const name of SENSITIVE_ENV_NAMES) {
    const v = process.env[name];
    if (v && v.length >= 6 && !/^(localhost|127\.0\.0\.1)$/i.test(v)) add(v, '[REDACTED_SECRET]');
  }
  try {
    if (local.jev_credentials_path && fs.existsSync(local.jev_credentials_path)) {
      const cred = JSON.parse(fs.readFileSync(local.jev_credentials_path, 'utf8'));
      if (cred?.api_key) add(cred.api_key, '[REDACTED_SECRET]');
    }
  } catch {}

  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

export function sanitizeText(input) {
  if (input === null || input === undefined) return '';
  let text = String(input);

  for (const [literal, mask] of buildDynamicReplacements()) {
    text = text.replace(new RegExp(escapeRegExp(literal), 'gi'), mask);
  }

  // Redact explicit env vars with optional values first
  const envUnion = SENSITIVE_ENV_NAMES.join('|');
  text = text.replace(
    new RegExp(`\\b(?:${envUnion})\\b(?:\\s*[:=]\\s*(?:"[^"\\n]*"|'[^'\\n]*'|\\S+))?`, 'gi'),
    '[REDACTED_ENV]'
  );

  // Redact generic *_API_KEY / *_SECRET / *_TOKEN / *_PASSWORD assignments
  text = text.replace(
    /\b[A-Z0-9_]{2,}_(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|COOKIE|CREDENTIAL|PRIVATE_KEY)\b\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|\S+)/g,
    '[REDACTED_ENV]'
  );

  // Redact token patterns
  for (const re of TOKEN_PATTERNS) {
    text = text.replace(re, (match, g1) => (g1 ? `${g1}[REDACTED_SECRET]` : '[REDACTED_SECRET]'));
  }

  // Redact .ts.net domains
  text = text.replace(/\b[a-zA-Z0-9-]+\.ts\.net\b/gi, '[REDACTED_HOST]');

  // Redact IPv4 addresses (optionally with :port), careful not to touch 3-part semver like 1.20.2
  text = text.replace(
    /(^|[^0-9.])((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})(?::\d{1,5})?(?![0-9.])/g,
    '$1[REDACTED_IP]'
  );

  // Redact IPv6 addresses (standard compressed/full forms with at least 2 colons and hex segments)
  text = text.replace(
    /(?:^|[\s[(])(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}(?:\/\d{1,3})?(?=[\s\])/:,;]|$)/g,
    (m) => m.replace(/[0-9a-fA-F:]+(?:\/\d{1,3})?/, '[REDACTED_IP]')
  );

  // Redact email addresses
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');

  // Redact any remaining /Users/<name> or /home/<name>
  text = text.replace(/\/(?:Users|home)\/[A-Za-z0-9._-]+/g, '[REDACTED_PATH]');

  return text;
}

export function sanitizeRunDir(runDir) {
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ALLOWLIST_TEXT_EXTS.has(path.extname(ent.name).toLowerCase())) {
        const raw = fs.readFileSync(full, 'utf8');
        const clean = sanitizeText(raw);
        if (clean !== raw) fs.writeFileSync(full, clean, 'utf8');
      }
    }
  };
  walk(runDir);
}

export function auditTexts(namedTexts) {
  const local = loadLocalConfig();
  const dynamicBans = [];
  const addDyn = (name, val) => {
    const s = String(val || '').trim();
    if (s && s.length >= 4) dynamicBans.push({ name, re: new RegExp(escapeRegExp(s), 'i') });
  };
  addDyn('local_ssh_host', local.nodes?.ubuntu_rtx5060?.ssh_host);
  addDyn('orin_ssh_host', local.nodes?.orin_64g?.ssh_host);
  addDyn('local_proxy', local.proxy);
  addDyn('local_username', os.userInfo()?.username);

  const violations = [];
  for (const [label, content] of Object.entries(namedTexts)) {
    const text = String(content || '');
    const lines = text.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      for (const pat of [...AUDIT_PATTERNS, ...dynamicBans]) {
        if (pat.re.test(line)) {
          violations.push(`${label}:${idx + 1} (${pat.name})`);
        }
      }
    }
  }
  if (violations.length) {
    throw new Error(`PRIVACY_GUARD_BLOCKED: ${violations.slice(0, 12).join('; ')}`);
  }
}

export function auditGitStaged(repoDir = LAB_ROOT) {
  const out = execFileSync('git', ['-C', repoDir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim();
  if (!out) return [];
  const files = out.split('\n').filter(Boolean);
  const runAndDocTexts = {};
  const srcTexts = {};
  for (const rel of files) {
    const full = path.join(repoDir, rel);
    if (!fs.existsSync(full)) continue;
    const ext = path.extname(rel).toLowerCase();
    const norm = rel.replace(/\\/g, '/');
    if (/(^|\/)\.env/.test(norm) || /(^|\/)\.runtime\//.test(norm) || /\.(?:key|pem|p12)$/i.test(norm)) {
      throw new Error(`PRIVACY_GUARD_BLOCKED: forbidden file staged (${rel})`);
    }
    if (norm.startsWith('runs/')) {
      if (norm.includes('/screenshots/') && ALLOWLIST_SCREENSHOT_EXTS.has(ext)) continue;
      if (!ALLOWLIST_TEXT_EXTS.has(ext)) {
        throw new Error(`PRIVACY_GUARD_BLOCKED: unallowlisted file under runs/ (${rel})`);
      }
      runAndDocTexts[rel] = fs.readFileSync(full, 'utf8');
    } else if (norm.startsWith('config/') || norm === 'README.md') {
      runAndDocTexts[rel] = fs.readFileSync(full, 'utf8');
    } else if (norm.startsWith('src/') && ext === '.mjs' && norm !== 'src/privacy_guard.mjs') {
      srcTexts[rel] = fs.readFileSync(full, 'utf8');
    }
  }
  auditTexts(runAndDocTexts);
  // Check src/*.mjs for hardcoded secrets, non-loopback IPs, tailnet hosts, emails, or personal home paths
  const srcPat = [
    AUDIT_PATTERNS[0],
    AUDIT_PATTERNS[1],
    AUDIT_PATTERNS[4],
    AUDIT_PATTERNS[5],
    AUDIT_PATTERNS[8],
  ];
  for (const [rel, txt] of Object.entries(srcTexts)) {
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const p of srcPat) {
        if (p.re.test(lines[i])) throw new Error(`PRIVACY_GUARD_BLOCKED: ${rel}:${i + 1} (${p.name})`);
      }
    }
  }
  return files;
}
