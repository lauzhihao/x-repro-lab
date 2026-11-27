import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { proxyEnv } from './config.mjs';
import { sanitizeText, auditTexts } from './privacy_guard.mjs';

const SAGY = path.join(os.homedir(), '.local/bin/sagy');
const POSITIVE_VERDICTS = new Set(['verified_with_numbers', 'verified', 'repro_with_gotcha', 'gotcha', 'plain_pass']);
const QA_PHRASING = /(?:实测可复现|经核实|确有其事|确有引用|符合预期|verified reproducible|\bconfirmed\b)/i;

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
    ? '原帖是中文，请用自然地道的中文口语写 1–2 句（45–110 字），就像你亲手把项目拉下来跑通后，在 X 上热情推荐给关注者的口吻。'
    : 'Original post is English: write 1–2 crisp, natural English sentences (70–160 characters) as a developer casually sharing a genuinely useful open-source repo you just ran with your followers.';

  const prompt = [
    '你是一个喜欢折腾并测评开源 GitHub 项目的开发者博主。你刚刚亲自把下面这个开源项目拉进本地/远程沙箱容器部署跑通，现在想转引（Quote Tweet）原作者的推文，用肯定、赞叹、同频安利的语气分享给你的粉丝。',
    '',
    '写作要求：',
    `- ${langInstruction}`,
    '- 内容结构：先一句话点明「这个库是干嘛的 / 解决什么痛点」，紧接着带出 1–2 个你真实跑出来的亮点、耗时/效果数字或实用上手提示（例如建议拉哪个分支、是否零依赖）。',
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

  const r = spawnSync(
    SAGY,
    ['auto', '-p', prompt, '--model', 'gemini-4-hydrogen-low', '--disable-slash-commands', '--print-timeout', '120s'],
    { cwd: os.tmpdir(), env: proxyEnv(), encoding: 'utf8', timeout: 140000, maxBuffer: 4 * 1024 * 1024 }
  );
  if (r.error || r.status !== 0) {
    throw new Error(`sagy quote drafter failed (exit=${r.status}): ${(r.stderr || r.stdout || r.error?.message || '').slice(-400)}`);
  }

  // Strip any [sagy] preamble line and normalize whitespace
  const rawLines = String(r.stdout || '')
    .split('\n')
    .filter((l) => !/^\[sagy\]\s+/i.test(l.trim()));
  let body = rawLines.join(' ').replace(/\r?\n+/g, ' ').replace(/^["'“”「」]+|["'“”「」]+$/g, '').trim();
  body = sanitizeText(body);

  if (!body) throw new Error('quote_drafter produced empty output');
  if (QA_PHRASING.test(body)) {
    throw new Error(`quote_drafter emitted disallowed QA phrasing: ${body}`);
  }

  const footer = issueUrl ? (zh ? `\n\n实测记录：${issueUrl}` : `\n\nFull hands-on test log: ${issueUrl}`) : '';
  const fullDraft = `${body}${footer}`;
  auditTexts({ quote_draft: fullDraft });
  return fullDraft;
}
