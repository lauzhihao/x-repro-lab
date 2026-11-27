import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { LAB_ROOT, loadLocalConfig, proxyEnv } from './config.mjs';
import { sanitizeText, sanitizeRunDir, auditTexts, auditGitStaged } from './privacy_guard.mjs';
import { appendEvent, appendHistory, loadMeta, saveMeta } from './trace.mjs';
import { draftQuote } from './quote_drafter.mjs';

function verdictLabel(status, verdict) {
  if (status === 'timed_out') return 'timed-out';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  if (verdict === 'verified_with_numbers' || verdict === 'verified') return 'verified';
  if (verdict === 'repro_with_gotcha' || verdict === 'gotcha') return 'gotcha';
  if (verdict === 'debunked') return 'debunked';
  return 'plain-pass';
}

export function buildIssueMarkdown({ meta, jevData, planMd, executionMd, resultData, quoteDraftText = '', repo }) {
  const f = jevData?.fact_card || {};
  const gate = jevData?.gate || {};
  const post = jevData?.post || {};
  const slots = gate.slots || [];
  const postTitle = meta.title || f.title_zh || f.title_en || f.claimed_artifact || meta.run_id;
  const runUrlBase = `https://github.com/${repo}/blob/main/runs/${meta.run_id}`;

  const lines = [];
  lines.push(`# ${postTitle}`);
  lines.push('');
  lines.push(`- **全局追踪 ID (\`run_id\`)**: \`${meta.run_id}\``);
  lines.push(`- **当前终态**: \`${meta.status}\`（实测结论: \`${resultData?.verdict || meta.status}\`）`);
  lines.push(`- **原帖链接**: ${post.url || meta.post_url || ''}`);
  const authorHandle = String(post.author || meta.post_author || '').replace(/^@/, '').trim();
  lines.push(`- **原帖作者**: ${authorHandle ? `[@${authorHandle}](https://x.com/${authorHandle})` : 'unknown'}`);
  lines.push(`- **原帖标题/主题**: ${postTitle}`);
  lines.push(`- **执行节点**: \`${meta.node || f.proposed_node || 'ubuntu_rtx5060'}\``);
  lines.push(`- **SLA 计时**: 决定引用 \`${meta.decided_at}\` -> 结束 \`${meta.finished_at}\`（耗时 **${meta.elapsed_minutes ?? '?'} 分钟** / 上限 ${meta.sla_minutes || 120} 分钟）`);
  lines.push('');

  lines.push('## 一、JEV 立项判定（引用理由）');
  lines.push('');
  lines.push(`- **裁决模型**: \`${gate.model || 'jev-1.14.0'}\` | **通过门槛**: 正向题 \`>= ${gate.yes_threshold ?? 0.7}\`，阻断题 \`<= ${gate.no_threshold ?? 0.3}\`（中间区 \`0.30~0.70\` 一律作罢）`);
  lines.push(`- **最终结论**: \`${gate.verdict || 'GO'}\`（\`${gate.reason || ''}\`）`);
  if (f.claimed_artifact) lines.push(`- **识别到的实测对象**: \`${f.claimed_artifact}\`（${f.artifact_type || 'unknown'}）`);
  if (f.verification_goal_en) lines.push(`- **提炼验证目标**: ${f.verification_goal_en}`);
  lines.push('');
  if (slots.length) {
    lines.push('| 编号 | 角色 | 判断题（中文摘要） | 选项判定标准 | 得分 | 结果 |');
    lines.push('|:-----|:-----|:-------------------|:-------------|-----:|:-----|');
    for (const s of slots) {
      lines.push(`| \`${s.id}\` | ${s.role === 'positive' ? '正向立项' : '风险/成本阻断'} | ${s.label_zh} | ${s.expected} | ${s.score !== null ? s.score.toFixed(2) : 'null'} | ${s.passed ? 'PASS' : 'FAIL'} (${s.zone}) |`);
    }
    lines.push('');
  }

  lines.push('## 二、执行计划');
  lines.push('');
  lines.push((planMd || '（未生成独立计划，见下方执行记录）').trim());
  lines.push('');

  lines.push('## 三、执行过程与自愈记录');
  lines.push('');
  lines.push((executionMd || '（任务在产出完整执行记录前中止，请查看运行回放日志）').trim());
  lines.push('');

  const screenshots = meta.screenshots || [];
  if (screenshots.length) {
    lines.push('### 实测截图');
    lines.push('');
    for (const sc of screenshots) {
      lines.push(`![${sc}](${runUrlBase}/screenshots/${encodeURIComponent(sc)}?raw=1)`);
    }
    lines.push('');
  }

  lines.push(`- 完整全程回放日志: [events.jsonl](${runUrlBase}/events.jsonl)`);
  lines.push('');

  lines.push('## 四、执行结果与实测数据');
  lines.push('');
  if (resultData) {
    if (resultData.what_it_does_zh) lines.push(`- **项目定位**: ${resultData.what_it_does_zh}`);
    lines.push(`- **是否可成功部署运行**: \`${resultData.matches_claim === true ? '是（已跑通）' : resultData.matches_claim === false ? '否（存在偏差/未跑通）' : '未完成'}\``);
    lines.push(`- **结果摘要**: ${resultData.summary_zh || resultData.summary || ''}`);
    if (Array.isArray(resultData.highlights) && resultData.highlights.length) {
      lines.push('');
      lines.push('### 实测亮点');
      for (const h of resultData.highlights) lines.push(`- ${h}`);
    }
    if (Array.isArray(resultData.metrics) && resultData.metrics.length) {
      lines.push('');
      lines.push('| 指标项 | 原帖声称 | 我方实测 | 备注 |');
      lines.push('|:-------|:---------|:---------|:-----|');
      for (const m of resultData.metrics) {
        lines.push(`| ${m.name || ''} | ${m.claimed || '-'} | ${m.observed || '-'} | ${m.note || ''} |`);
      }
    }
    if (Array.isArray(resultData.self_healing_events) && resultData.self_healing_events.length) {
      lines.push('');
      lines.push('### 自愈修复记录');
      for (const sh of resultData.self_healing_events) {
        lines.push(`- ${typeof sh === 'string' ? sh : `${sh.issue || ''}: ${sh.fix || ''} -> ${sh.outcome || ''}`}`);
      }
    }
    if (Array.isArray(resultData.gotchas) && resultData.gotchas.length) {
      lines.push('');
      lines.push('### 上手提醒 / 踩坑点');
      for (const g of resultData.gotchas) lines.push(`- ${g}`);
    }
    const quoteBody = quoteDraftText || resultData.quote_candidate_zh || '';
    if (quoteBody) {
      lines.push('');
      lines.push('### 拟引用推文草稿（一期仅存档，不自动发送）');
      for (const l of String(quoteBody).split('\n')) {
        lines.push(`> ${l}`);
      }
    }
  } else {
    lines.push(`- 任务以 \`${meta.status}\` 结束（原因: \`${meta.error || meta.cancel_reason || 'unknown'}\`），已执行无残留清理。`);
  }

  return lines.join('\n') + '\n';
}

function ensureLabels(repo, labels, env) {
  for (const label of labels) {
    spawnSync('gh', ['label', 'create', label, '--repo', repo, '--force'], { encoding: 'utf8', env, timeout: 10000 });
  }
}

export function publishRun(runDir, { dry = false } = {}) {
  const local = loadLocalConfig();
  const repo = local.github_repo || 'lauzhihao/x-repro-lab';
  const meta = loadMeta(runDir);
  const readOptJson = (name) => {
    const p = path.join(runDir, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const readOptText = (name) => {
    const p = path.join(runDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };

  const scDir = path.join(runDir, 'screenshots');
  if (fs.existsSync(scDir)) {
    meta.screenshots = fs.readdirSync(scDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  } else {
    meta.screenshots = [];
  }
  saveMeta(runDir, meta);

  const jevData = readOptJson('jev.json');
  const resultData = readOptJson('result.json');

  // 1. Scrub all text files under runDir and build scrubbed issue body
  sanitizeRunDir(runDir);
  const rawBody = buildIssueMarkdown({
    meta: loadMeta(runDir),
    jevData: readOptJson('jev.json'),
    planMd: readOptText('plan.md'),
    executionMd: readOptText('execution.md'),
    resultData: readOptJson('result.json'),
    quoteDraftText: readOptText('quote_draft.txt'),
    repo,
  });
  const issueBody = sanitizeText(rawBody);
  const bodyFile = path.join(runDir, 'issue_body.md');
  fs.writeFileSync(bodyFile, issueBody, 'utf8');

  const safeTitle = sanitizeText(meta.title || jevData?.fact_card?.title_zh || jevData?.fact_card?.title_en || meta.run_id).replace(/\s+/g, ' ').trim().slice(0, 120);
  const vLabel = verdictLabel(meta.status, resultData?.verdict);
  const labels = ['lab-run', vLabel];
  if (meta.node) labels.push(String(meta.node).replace(/_/g, '-'));

  // 2. Hard fail-closed audit before ANY git commit or GitHub call
  auditTexts({ issue_title: safeTitle, issue_body: issueBody });
  if (dry) {
    return { dry: true, title: safeTitle, labels, bodyFile };
  }

  const env = proxyEnv();
  execFileSync('git', ['-C', LAB_ROOT, 'add', '--', `runs/${meta.run_id}`], { encoding: 'utf8' });
  auditGitStaged(LAB_ROOT);

  const staged = execFileSync('git', ['-C', LAB_ROOT, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim();
  if (staged) {
    execFileSync('git', ['-C', LAB_ROOT, 'commit', '-m', `lab: record ${meta.run_id} (${vLabel})`], { encoding: 'utf8' });
    execFileSync('git', ['-C', LAB_ROOT, 'push', 'origin', 'HEAD:main'], { encoding: 'utf8', env, timeout: 60000 });
  }

  ensureLabels(repo, labels, env);
  const res = spawnSync(
    'gh',
    ['issue', 'create', '--repo', repo, '--title', safeTitle, '--body-file', bodyFile, ...labels.flatMap((l) => ['--label', l])],
    { encoding: 'utf8', env, timeout: 30000 }
  );
  if (res.status !== 0) {
    throw new Error(`gh issue create failed: ${(res.stderr || res.stdout || '').slice(0, 400)}`);
  }
  const issueUrl = (res.stdout || '').trim().split('\n').pop().trim();
  const numMatch = issueUrl.match(/\/issues\/(\d+)/);
  const issueNumber = numMatch ? Number(numMatch[1]) : null;

  // 3. For positive completed runs, draft an enthusiastic follower-facing Quote referencing the real Issue URL
  let quoteDraft = null;
  if (meta.status === 'completed' && resultData && issueUrl) {
    try {
      quoteDraft = redraftQuote(runDir, { issueUrl, issueNumber });
    } catch (qErr) {
      appendEvent(runDir, meta.run_id, { type: 'quote_draft_warn', error: String(qErr?.message || qErr) });
    }
  }

  if (['failed', 'timed_out', 'cancelled'].includes(meta.status) && issueNumber) {
    spawnSync(
      'gh',
      ['issue', 'close', String(issueNumber), '--repo', repo, '--comment', `Run \`${meta.run_id}\` ended with status \`${meta.status}\`; sandbox cleaned with zero residue.`],
      { encoding: 'utf8', env, timeout: 20000 }
    );
  }

  appendEvent(runDir, meta.run_id, { type: 'published', issue_url: issueUrl, issue_number: issueNumber, labels, quote_drafted: !!quoteDraft });
  appendHistory({ run_id: meta.run_id, status: meta.status, verdict: vLabel, node: meta.node, issue_url: issueUrl, issue_number: issueNumber, title: safeTitle, quote_drafted: !!quoteDraft });
  return { issue_url: issueUrl, issue_number: issueNumber, title: safeTitle, labels, quote_draft: quoteDraft };
}

export function redraftQuote(runDir, { issueUrl = '', issueNumber = null } = {}) {
  const local = loadLocalConfig();
  const repo = local.github_repo || 'lauzhihao/x-repro-lab';
  const meta = loadMeta(runDir);
  const readOptJson = (name) => {
    const p = path.join(runDir, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const readOptText = (name) => {
    const p = path.join(runDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };

  const jevData = readOptJson('jev.json');
  const resultData = readOptJson('result.json');
  const quoteDraft = draftQuote({
    post: jevData?.post,
    factCard: jevData?.fact_card,
    resultData,
    issueUrl,
  });
  if (!quoteDraft) return null;

  fs.writeFileSync(path.join(runDir, 'quote_draft.txt'), quoteDraft + '\n', 'utf8');
  const bodyFile = path.join(runDir, 'issue_body.md');
  const updatedBody = sanitizeText(buildIssueMarkdown({
    meta,
    jevData,
    planMd: readOptText('plan.md'),
    executionMd: readOptText('execution.md'),
    resultData,
    quoteDraftText: quoteDraft,
    repo,
  }));
  fs.writeFileSync(bodyFile, updatedBody, 'utf8');
  auditTexts({ issue_body: updatedBody, quote_draft: quoteDraft });

  const env = proxyEnv();
  execFileSync('git', ['-C', LAB_ROOT, 'add', '--', `runs/${meta.run_id}/quote_draft.txt`, `runs/${meta.run_id}/issue_body.md`], { encoding: 'utf8' });
  auditGitStaged(LAB_ROOT);
  const staged = execFileSync('git', ['-C', LAB_ROOT, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim();
  if (staged) {
    execFileSync('git', ['-C', LAB_ROOT, 'commit', '-m', `lab: update quote draft for ${meta.run_id}`], { encoding: 'utf8' });
    execFileSync('git', ['-C', LAB_ROOT, 'push', 'origin', 'HEAD:main'], { encoding: 'utf8', env, timeout: 60000 });
  }
  if (issueNumber) {
    const editRes = spawnSync('gh', ['issue', 'edit', String(issueNumber), '--repo', repo, '--body-file', bodyFile], { encoding: 'utf8', env, timeout: 25000 });
    if (editRes.status !== 0) {
      throw new Error(`gh issue edit failed: ${(editRes.stderr || editRes.stdout || '').slice(0, 300)}`);
    }
  }
  return quoteDraft;
}
