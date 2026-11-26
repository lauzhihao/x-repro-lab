import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadLocalConfig, loadSafetyPolicy, loadCapabilities, proxyEnv } from './config.mjs';

const SAGY = path.join(os.homedir(), '.local/bin/sagy');
const EGO = path.join(os.homedir(), '.local/bin/ego-browser');

export function extractStatusId(url) {
  const m = String(url || '').match(/\/status\/(\d+)/);
  return m ? m[1] : 'manual';
}

export function checkStaticSafety(rawText, links = []) {
  const policy = loadSafetyPolicy();
  const blob = [rawText, ...links].filter(Boolean).join('\n');
  for (const rule of policy.rules || []) {
    const re = new RegExp(rule.pattern, 'i');
    if (re.test(blob)) {
      return { blocked: true, rule_id: rule.id, description: rule.description };
    }
  }
  return { blocked: false };
}

export function fetchTweetViaEgo(url) {
  const local = loadLocalConfig();
  const profileId = local.ego_x_read_profile_id || 'Default';
  const targetUrl = String(url).trim();
  const script = `
const task = await taskSpace("xrl-read-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
try {
  const page = task.page("p1");
  await page.goto(${JSON.stringify(targetUrl)}, { timeout: 60000, waitUntil: "domcontentloaded" });
  await page.waitForSelector('article[data-testid="tweet"], [data-testid="twitterArticleReadView"]', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const clicked = await page.evaluate(() => {
    const focal = document.querySelector('article[data-testid="tweet"]');
    if (!focal) return 0;
    const btns = [...focal.querySelectorAll('[data-testid="tweet-text-show-more-link"], button, [role="button"]')]
      .filter(el => !(el.tagName === "A" && el.getAttribute("href")) && /^(显示更多|展开|Show more|查看原文|Show original)$/i.test((el.innerText || "").trim()));
    for (const b of btns) b.click();
    return btns.length;
  });
  if (clicked > 0) await new Promise(r => setTimeout(r, 1000));
  const data = await page.evaluate(() => {
    const targetId = (${JSON.stringify(targetUrl)}.match(/\\/status\\/(\\d+)/) || [])[1] || "";
    const arts = [...document.querySelectorAll('article[data-testid="tweet"]')].filter(a => !a.closest('[data-testid="twitterArticleReadView"]'));
    const focal = arts.find(a => [...a.querySelectorAll('time')].some(t => (t.closest('a')?.href || '').includes('/status/' + targetId))) || arts[0];
    if (!focal) return { error: "tweet_not_found" };
    const textWithEmojis = root => {
      if (!root) return "";
      const clone = root.cloneNode(true);
      for (const img of clone.querySelectorAll("img")) img.replaceWith(document.createTextNode(img.getAttribute("alt") || ""));
      return (clone.innerText || clone.textContent || "").trim();
    };
    const quoteCandidates = [...focal.querySelectorAll('div[role="link"]')].filter(n => n.querySelector('[data-testid^="UserAvatar-Container-"]'));
    const own = n => !quoteCandidates.some(qc => qc.contains(n));
    const userHrefs = [...(focal.querySelector('[data-testid="User-Name"]')?.querySelectorAll('a[href]') || [])]
      .map(a => a.getAttribute('href') || '').filter(h => /^\\/[A-Za-z0-9_]+$/.test(h));
    const author = userHrefs[0] ? userHrefs[0].slice(1) : "";
    const timeEl = [...focal.querySelectorAll('time')].filter(own)[0];
    const rv = focal.querySelector('[data-testid="twitterArticleReadView"]') || document.querySelector('[data-testid="twitterArticleReadView"]');
    const title = (document.querySelector('[data-testid="twitter-article-title"]')?.innerText || "").trim();
    const ownText = [...focal.querySelectorAll('[data-testid="tweetText"]')].filter(own).map(textWithEmojis).join("\\n").trim();
    const quoteText = [...focal.querySelectorAll('[data-testid="tweetText"]')].filter(n => !own(n)).map(textWithEmojis).join("\\n").trim();
    const links = [...focal.querySelectorAll('a[href]')].map(a => a.title || a.href).filter(Boolean);
    const articleBody = rv ? (rv.innerText || "").slice(0, 8000) : "";
    return {
      url: location.href,
      author,
      datetime: timeEl?.getAttribute("datetime") || "",
      title,
      text: ownText,
      quote_text: quoteText,
      article_body: articleBody,
      links: [...new Set(links)],
    };
  });
  console.log("XRL_TWEET_JSON:" + JSON.stringify(data));
} finally {
  await task.finish({ keep: [] });
}
`;
  const r = spawnSync(EGO, ['nodejs'], { input: script, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const marker = (r.stdout || '').split('\n').find((l) => l.startsWith('XRL_TWEET_JSON:'));
  if (!marker) {
    throw new Error(`ego-browser failed to read tweet (exit=${r.status}): ${(r.stderr || r.stdout || '').slice(-400)}`);
  }
  const parsed = JSON.parse(marker.slice('XRL_TWEET_JSON:'.length));
  if (parsed.error) throw new Error(`tweet read error: ${parsed.error}`);
  return parsed;
}

export function fetchGithubContext(post) {
  const env = proxyEnv();
  const textPool = [
    post.text || '',
    post.quote_text || '',
    post.article_body || '',
    ...(post.links || []),
    ...(post.context?.linked || []).map((l) => l.url || ''),
  ].join('\n').replace(/https?:\/\/\s+/gi, (m) => m.trim());

  const matches = [...textPool.matchAll(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi)];
  const repos = [];
  const seen = new Set();
  for (const m of matches) {
    const owner = m[1];
    const name = m[2].replace(/\.git$/i, '').replace(/[.,;:!?)]+$/, '');
    const slug = `${owner}/${name}`;
    if (seen.has(slug.toLowerCase()) || /^(features|topics|sponsors|settings|marketplace|explore|about)$/i.test(owner)) continue;
    seen.add(slug.toLowerCase());
    try {
      const viewOut = execFileSync(
        'gh',
        ['repo', 'view', slug, '--json', 'nameWithOwner,description,primaryLanguage,stargazerCount,diskUsage,licenseInfo,isArchived'],
        { encoding: 'utf8', env, timeout: 15000 }
      );
      const repoInfo = JSON.parse(viewOut);
      let readme = '';
      try {
        const rmB64 = execFileSync('gh', ['api', `repos/${slug}/readme`, '--jq', '.content'], { encoding: 'utf8', env, timeout: 15000 }).trim();
        readme = Buffer.from(rmB64.replace(/\s+/g, ''), 'base64').toString('utf8').slice(0, 4500);
      } catch {}
      repos.push({ slug, ...repoInfo, readme_excerpt: readme });
    } catch {}
    if (repos.length >= 2) break;
  }
  return repos;
}

function parseJsonObject(txt) {
  const cleaned = String(txt || '').replace(/```(?:json)?/gi, '');
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(`No JSON in sagy output: ${cleaned.slice(0, 240)}`);
  return JSON.parse(cleaned.slice(a, b + 1));
}

function stripNonAsciiForJev(s) {
  return String(s || '')
    .replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ')
    .replace(/\b(?:worth quoting|recommend quoting|should quote|easy to understand)\b/gi, 'testable')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractFactCard(post, githubRepos = []) {
  const caps = loadCapabilities();
  const prompt = [
    'You are a strict neutral technical fact clerk. Do NOT judge worthiness or make recommendations.',
    'Extract ONLY literal facts from the X post (and any GitHub repo metadata below) into ONE valid JSON object.',
    'Keep all `*_en` fields in plain neutral English (NO Chinese characters, NO marketing hype, NO "worth quoting" advocacy).',
    'Available nodes for `proposed_node`: ubuntu_rtx5060 | orin_64g | mac_headless | ego_web_sandbox | prompt_cli.',
    'Default to `ubuntu_rtx5060` for general CLI/Python/Node/Docker/GPU repos (<=8GB VRAM). Use `ego_web_sandbox` only for public web apps/demos without code.',
    '',
    'Required JSON keys:',
    '{',
    '  "title_zh": "10-28 Chinese character concise title summarizing the technical topic",',
    '  "title_en": "concise English title",',
    '  "claimed_artifact": "repo owner/name, CLI/package, web demo URL, or none",',
    '  "artifact_type": "github_repo | cli_tool | web_demo | prompt_workflow | none",',
    '  "claimed_steps_en": ["literal step or claim in English"],',
    '  "verification_goal_en": "what single concrete test could confirm or falsify the post claims",',
    '  "detected_requirements_en": ["explicit runtime, hardware, account, payment, API key, or OS dependencies"],',
    '  "proposed_node": "ubuntu_rtx5060 | orin_64g | mac_headless | ego_web_sandbox | prompt_cli",',
    '  "estimated_minutes": 20',
    '}',
    '',
    'CAPABILITIES REFERENCE:',
    JSON.stringify(caps),
    '',
    'POST DATA:',
    JSON.stringify({
      url: post.url || post.link || '',
      author: post.author || '',
      title: post.title || '',
      text: String(post.text || '').slice(0, 3000),
      quote_text: String(post.quote_text || '').slice(0, 1500),
      article_body: String(post.article_body || '').slice(0, 4500),
      links: (post.links || []).slice(0, 15),
    }),
    '',
    'GITHUB CONTEXT:',
    JSON.stringify(githubRepos.map((g) => ({
      slug: g.nameWithOwner,
      description: g.description,
      language: g.primaryLanguage?.name || '',
      stars: g.stargazerCount,
      disk_kb: g.diskUsage,
      readme_excerpt: g.readme_excerpt,
    }))),
  ].join('\n');

  const r = spawnSync(
    SAGY,
    ['auto', '-p', prompt, '--model', 'gemini-4-hydrogen-low', '--disable-slash-commands', '--print-timeout', '180s'],
    { cwd: os.tmpdir(), env: proxyEnv(), encoding: 'utf8', timeout: 200000, maxBuffer: 8 * 1024 * 1024 }
  );
  if (r.error || r.status !== 0) {
    throw new Error(`sagy fact clerk failed (exit=${r.status}): ${(r.stderr || r.stdout || r.error?.message || '').slice(-400)}`);
  }
  const parsed = parseJsonObject(r.stdout);

  const factCard = {
    title_zh: String(parsed.title_zh || post.title || '技术实测').trim(),
    title_en: stripNonAsciiForJev(parsed.title_en || 'Technical verification test'),
    claimed_artifact: stripNonAsciiForJev(parsed.claimed_artifact || 'none'),
    artifact_type: stripNonAsciiForJev(parsed.artifact_type || 'none'),
    claimed_steps_en: (Array.isArray(parsed.claimed_steps_en) ? parsed.claimed_steps_en : []).map(stripNonAsciiForJev).filter(Boolean),
    verification_goal_en: stripNonAsciiForJev(parsed.verification_goal_en || ''),
    detected_requirements_en: (Array.isArray(parsed.detected_requirements_en) ? parsed.detected_requirements_en : []).map(stripNonAsciiForJev).filter(Boolean),
    proposed_node: String(parsed.proposed_node || 'ubuntu_rtx5060').trim(),
    estimated_minutes: Number.isFinite(Number(parsed.estimated_minutes)) ? Number(parsed.estimated_minutes) : 30,
  };

  // JEV receives only pure English fields
  const factCardForJev = {
    title_en: factCard.title_en,
    claimed_artifact: factCard.claimed_artifact,
    artifact_type: factCard.artifact_type,
    claimed_steps_en: factCard.claimed_steps_en,
    verification_goal_en: factCard.verification_goal_en,
    detected_requirements_en: factCard.detected_requirements_en,
    proposed_node: factCard.proposed_node,
    estimated_minutes: factCard.estimated_minutes,
  };

  return { factCard, factCardForJev };
}

export function prepareIntake({ url, postInput = null }) {
  const post = postInput ? { ...postInput, url: postInput.url || postInput.link || url } : fetchTweetViaEgo(url);
  const links = [...(post.links || [])];
  const staticCheck = checkStaticSafety(
    [post.title, post.text, post.quote_text, post.article_body].filter(Boolean).join('\n'),
    links
  );
  const githubRepos = fetchGithubContext(post);
  if (staticCheck.blocked) {
    return { post, githubRepos, staticCheck, factCard: null, factCardForJev: null };
  }
  const { factCard, factCardForJev } = extractFactCard(post, githubRepos);
  return { post, githubRepos, staticCheck, factCard, factCardForJev };
}
