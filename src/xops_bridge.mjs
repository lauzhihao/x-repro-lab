import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadLocalConfig } from './config.mjs';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

export function statusIdOf(url) {
  return String(url || '').match(/\/status\/(\d+)/)?.[1] || '';
}

function shanghaiDateStr(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shanghaiClockMs(dateStr, hm) {
  return Date.parse(`${dateStr}T${hm}:00+08:00`);
}

function shanghaiHmsCompact(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.hour}${map.minute}${map.second}`;
}

function parseExplicitAt(explicitAt) {
  const m = String(explicitAt || '').trim().match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Invalid --at timestamp (expected YYYY-MM-DD HH:MM): ${explicitAt}`);
  const sec = m[3] || '00';
  const ms = Date.parse(`${m[1]}T${m[2]}:${sec}+08:00`);
  if (!Number.isFinite(ms)) throw new Error(`Unparseable --at timestamp: ${explicitAt}`);
  return { date: m[1], ms };
}

function collectQueueFiles(qdir) {
  if (!fs.existsSync(qdir)) return [];
  return fs.readdirSync(qdir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
}

function loadDailyConfig(xopsRoot) {
  const p = path.join(xopsRoot, 'tools/daily_config.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { window: ['08:30', '23:30'], min_post_gap_min: 90 };
  }
}

function pickAutoSlot({ qdir, nowMs, windowHm, minGapMs, dailyQuoteCap }) {
  const startHm = Array.isArray(windowHm) && windowHm[0] ? windowHm[0] : '08:30';
  const endHm = Array.isArray(windowHm) && windowHm[1] ? windowHm[1] : '23:30';

  for (let offset = 0; offset < 3; offset++) {
    const dateStr = shanghaiDateStr(new Date(nowMs + offset * DAY_MS));
    const qPath = path.join(qdir, `${dateStr}.json`);
    const q = fs.existsSync(qPath) ? JSON.parse(fs.readFileSync(qPath, 'utf8')) : { posts: [] };
    const posts = q.posts || [];
    const labCount = posts.filter((p) => p.kind === 'lab_quote' && !['skipped', 'stale', 'held'].includes(p.status)).length;
    if (labCount >= dailyQuoteCap) continue;

    const existingTimes = posts
      .filter((p) => !p.reply_to && !['skipped', 'stale', 'held'].includes(p.status))
      .map((p) => Date.parse(p.posted_at || p.planned_at || ''))
      .filter(Number.isFinite);

    const winStart = shanghaiClockMs(dateStr, startHm);
    const winEnd = shanghaiClockMs(dateStr, endHm);
    const earliest = offset === 0
      ? Math.max(winStart + 15 * MIN_MS, nowMs + 10 * MIN_MS)
      : winStart + 15 * MIN_MS;

    // Step by 5 minutes to find the first conflict-free slot inside the daily window.
    for (let t = Math.ceil(earliest / (5 * MIN_MS)) * (5 * MIN_MS); t <= winEnd - 5 * MIN_MS; t += 5 * MIN_MS) {
      if (existingTimes.every((et) => Math.abs(t - et) >= minGapMs)) {
        return { date: dateStr, ms: t };
      }
    }
  }
  throw new Error('No available publish slot found within the next 3 days');
}

export async function enqueueLabQuote({ meta, jevData, issueUrl = '', quoteDraft = '', explicitAt = null } = {}) {
  const local = loadLocalConfig();
  const xopsRoot = String(local.xops_root || '').trim();
  if (!xopsRoot || !fs.existsSync(xopsRoot)) {
    return { skipped: 'no_xops_root' };
  }

  const text = String(quoteDraft || '').trim();
  if (!text) return { skipped: 'empty_quote_draft' };

  const postUrl = String(jevData?.post?.url || meta?.post_url || '').trim();
  const targetId = statusIdOf(postUrl);
  if (!targetId) return { skipped: 'missing_target_status_id' };

  const qdir = path.join(xopsRoot, 'queue');
  fs.mkdirSync(qdir, { recursive: true });

  // Deduplicate across all existing queue dates before acquiring a date lock.
  for (const f of collectQueueFiles(qdir)) {
    const q = JSON.parse(fs.readFileSync(path.join(qdir, f), 'utf8'));
    const existing = (q.posts || []).find((p) =>
      !['skipped', 'stale'].includes(p.status) &&
      (p.lab_run_id === meta?.run_id || (p.quote_of && statusIdOf(p.quote_of) === targetId))
    );
    if (existing) {
      return { skipped: 'already_queued', existing_id: existing.id, date: f.slice(0, -5), status: existing.status, planned_at: existing.planned_at };
    }
  }

  const daily = loadDailyConfig(xopsRoot);
  const windowHm = Array.isArray(daily.window) && daily.window.length === 2 ? daily.window : ['08:30', '23:30'];
  const minGapMs = Math.max(12, Number(daily.min_post_gap_min) || 90) * MIN_MS;
  const dailyQuoteCap = Math.max(1, Number(local.daily_auto_quote_cap || 3));

  const chosen = explicitAt
    ? parseExplicitAt(explicitAt)
    : pickAutoSlot({ qdir, nowMs: Date.now(), windowHm, minGapMs, dailyQuoteCap });

  const plannedAtIso = new Date(chosen.ms).toISOString();
  const authorHandle = String(jevData?.post?.author || meta?.post_author || '').replace(/^@/, '').trim();
  const id = `${chosen.date.slice(5).replace('-', '')}-L${shanghaiHmsCompact(chosen.ms)}-${randomUUID().slice(0, 6)}`;

  const lockMod = await import(pathToFileURL(path.join(xopsRoot, 'tools/queue_lock.mjs')).href);
  const entry = {
    id,
    kind: 'lab_quote',
    lab_run_id: meta?.run_id || '',
    lab_issue_url: issueUrl,
    text,
    media: '',
    reply_to: '',
    quote_of: postUrl,
    target_author: authorHandle,
    target_id: targetId,
    discovery_source: 'x_repro_lab',
    status: 'pending',
    planned_at: plannedAtIso,
    posted_at: null,
    result: null,
  };

  lockMod.withQueueLock(chosen.date, () => {
    const qPath = path.join(qdir, `${chosen.date}.json`);
    const q = fs.existsSync(qPath)
      ? JSON.parse(fs.readFileSync(qPath, 'utf8'))
      : { date: chosen.date, ready: true, source: 'xq-auto-reply-queue', window: windowHm, posts: [] };
    q.posts ||= [];
    q.posts.push(entry);
    const tmp = `${qPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(q, null, 1), 'utf8');
    fs.renameSync(tmp, qPath);
  });

  return { queued: true, id, date: chosen.date, planned_at: plannedAtIso, quote_of: postUrl };
}
