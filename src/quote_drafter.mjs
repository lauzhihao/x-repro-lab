import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { proxyEnv } from './config.mjs';
import { sanitizeText, auditTexts } from './privacy_guard.mjs';

const SAGY = path.join(os.homedir(), '.local/bin/sagy');
const POSITIVE_VERDICTS = new Set(['verified_with_numbers', 'verified', 'repro_with_gotcha', 'gotcha', 'plain_pass']);
const QA_PHRASING = /(?:实测可复现|经核实|确有其事|确有引用|符合预期|verified reproducible|\bconfirmed\b)/i;

export function xWeightedLength(text) {
  const noUrl = String(text || '').replace(/https?:\/\/\S+/g, 'X'.repeat(23));
  let total = 0;
  for (const ch of noUrl) {
    const cp = ch.codePointAt(0);
    total += cp <= 0x10FF ? 1 : 2;
  }
  return total;
}

function isChineseDominant(post, factCard) {
  const sample = `${post?.text || ''}\n${post?.title || ''}\n${factCard?.title_zh || ''}`;
  const cjkCount = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const postText = String(post?.text || '').trim();
  const postCjk = (postText.match(/[\u4e00-\u9fff]/g) || []).length;
  if (postText.length > 0) return postCjk >= 4;
  return cjkCount >= 4;
}

export function draftQuote({ post = {}, factCard = {}, resultData = {}, issueUrl = '' } = {}) {
  if (!resultData || !POSITIVE_VERDICTS.has(resultData.verdict) || resultData.matches_claim === false) {
    return null;
  }

  const zh = isChineseDominant(post, factCard);
  const langInstruction = zh
    ? '原帖是中文，请用自然地道的中文口语写 1–2 句（65–115 字，确保加上文末记录链接后总长仍在 X 280 权重字符以内），就像你亲手用完后在 X 上热情安利给同行的口吻。'
    : 'Original post is English: write 1–2 crisp, natural English sentences (100–190 characters) as a developer casually sharing a genuinely useful open-source repo you just ran with your followers.';

  const prompt = [
    '你是一个喜欢折腾并测评开源 GitHub 项目的开发者博主。你刚刚亲自把下面这个开源项目拉进本地/远程沙箱容器部署跑通，现在想转引（Quote Tweet）原作者的推文，用肯定、赞叹、同频安利的语气分享给你的粉丝。',
    '',
    '写作要求：',
    `- ${langInstruction}`,
    '- 第一句必须说人话讲清「给谁用、解决什么具体痛点」：假设读者没点开 README、只扫一眼转推，直接用大白话讲明白项目定位与真实使用场景（谁做的、装给谁用、治什么痛点）。不要以“刚在容器里跑通…”开头，也不要把 REAL_RESULT 里的内部缩写/黑话（如“最佳实践 CLI”、“常驻摘要”、“探针”）未经解释直接甩给读者。',
    '- 实测数字必须挂钩人话收益：带出 1–2 个真实指标时顺带点明对使用者的意义（例如说“装进 AI 工具里只占 904 字节几乎不烧上下文”，而不是干巴巴的“常驻摘要仅 904 字节”）。',
    '- 保留真实细节对比与上手避坑：如果 REAL_RESULT.gotchas 或 metrics 里出现了具体的版本/tag/分支差异、源码实测发现或环境/使用限制（比如 master 比 release tag 多补了什么具体功能或修复、缺 git 会报错、只支持英文检索等），务必要把“具体差在哪/踩什么坑”用实测事实点出来，不要只写空泛建议。',
    '- 严禁编造数据：所有数字、功能、版本差异只能来自下方 REAL_RESULT，不能胡编没测过的指标。',
    '- 严禁查岗/打假/质检腔：绝对不要出现“实测可复现、经核实、确有其事、确有引用、符合预期、verified reproducible、confirmed”这类居高临下核查别人真假的词。',
    '- 严禁 AI 套话：不用“赋能、闭环、底层逻辑、省心、暗礁、生产管线、第一道坎、往往、太真实了”。',
    '- 正文不要带 #标签，不要自己写 URL（代码会在结尾自动附带 Issue 实测记录链接），不要加引号或任何额外解释，直接输出正文。',
    '',
    'ORIGINAL_POST:',
    JSON.stringify({
      author: post.author || '',
      title: factCard.title_zh || factCard.title_en || post.title || '',
      artifact: factCard.claimed_artifact || '',
      text: String(post.text || '').slice(0, 1200),
    }),
    '',
    'REAL_RESULT (ONLY cite facts observed here):',
    JSON.stringify({
      what_it_does_zh: resultData.what_it_does_zh || '',
      summary_zh: resultData.summary_zh || '',
      highlights: resultData.highlights || [],
      metrics: resultData.metrics || [],
      gotchas: resultData.gotchas || [],
    }),
  ].join('\n');

  const runModel = (promptText) => {
    const r = spawnSync(
      SAGY,
      ['auto', '-p', promptText, '--model', 'gemini-4-hydrogen-medium', '--disable-slash-commands', '--print-timeout', '120s'],
      { cwd: os.tmpdir(), env: proxyEnv(), encoding: 'utf8', timeout: 140000, maxBuffer: 4 * 1024 * 1024 }
    );
    if (r.error || r.status !== 0) {
      throw new Error(`sagy quote drafter failed (exit=${r.status}): ${(r.stderr || r.stdout || r.error?.message || '').slice(-400)}`);
    }
    const rawLines = String(r.stdout || '')
      .split('\n')
      .filter((l) => !/^\[sagy\]\s+/i.test(l.trim()));
    return sanitizeText(rawLines.join(' ').replace(/\r?\n+/g, ' ').replace(/^["'“”「」]+|["'“”「」]+$/g, '').trim());
  };

  let body = runModel(prompt);
  if (!body) throw new Error('quote_drafter produced empty output');

  const footer = issueUrl ? (zh ? `\n\n实测记录：${issueUrl}` : `\n\nFull hands-on test log: ${issueUrl}`) : '';
  let fullDraft = `${body}${footer}`;
  if (xWeightedLength(fullDraft) > 280) {
    const shortenPrompt = `${prompt}\n\n【字数超限重试】：你上一版正文长度导致加上链接后超过 X 平台 280 权重字符上限。请把正文精简到 ${zh ? '100 字以内（约 200 权重字符内）' : '180 字符以内'}，同时保留核心定位、1–2 个关键实测数字和真实避坑点。\n上一版：\n${body}`;
    const shorter = runModel(shortenPrompt);
    if (shorter) {
      body = shorter;
      fullDraft = `${body}${footer}`;
    }
  }

  if (QA_PHRASING.test(body)) {
    throw new Error(`quote_drafter emitted disallowed QA phrasing: ${body}`);
  }
  if (xWeightedLength(fullDraft) > 280) {
    throw new Error(`quote_drafter exceeded X 280 weighted limit (${xWeightedLength(fullDraft)}): ${fullDraft}`);
  }

  auditTexts({ quote_draft: fullDraft });
  return fullDraft;
}
