#!/usr/bin/env node
/**
 * ingest.js — Fetch URLs and save as structured markdown in raw/
 *
 * Usage:
 *   node scripts/ingest.js <url>                  # Single URL
 *   node scripts/ingest.js raw_source_list.txt     # Batch from file
 *   node scripts/ingest.js --dry-run <url>         # Test without API calls
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_PATH = path.join(__dirname, '..', 'ingest_manifest.json');
const RAW_DIR = path.join(__dirname, '..', 'raw');
const IMG_DIR = path.join(RAW_DIR, 'images');
const LOG_PATH = path.join(__dirname, '..', 'log.md');
const CACHE_DIR = path.join(__dirname, '..', '.raw_cache');

// Ensure directories exist
[RAW_DIR, IMG_DIR, CACHE_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Helpers ──────────────────────────────────────────────────

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch { return {}; }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function appendLog(message) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_PATH, `\n- **${ts}** — ${message}`);
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const opts = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Agent-Browser Fallback (for Cloudflare-blocked sites) ────

function fetchViaAgentBrowser(url) {
  return new Promise((resolve, reject) => {
    const { execSync } = require('child_process');
    try {
      // Open URL in headed browser to pass Cloudflare challenge
      execSync(`npx agent-browser --headed open "${url}"`, { timeout: 30000, stdio: 'pipe' });
      // Wait for page load
      execSync(`npx agent-browser wait 5000`, { timeout: 15000, stdio: 'pipe' });
      // Extract text content
      const text = execSync(`npx agent-browser get text "body"`, { timeout: 15000, encoding: 'utf8' });
      // Close browser
      execSync(`npx agent-browser close --all`, { timeout: 10000, stdio: 'pipe' });
      resolve(text.trim());
    } catch (err) {
      try { execSync(`npx agent-browser close --all`, { timeout: 5000, stdio: 'pipe' }); } catch {}
      reject(new Error(`agent-browser failed: ${err.message}`));
    }
  });
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', err => { fs.unlink(filepath, () => {}); reject(err); });
  });
}

// ── URL Classification ───────────────────────────────────────

function classifyUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { type: 'invalid', reason: 'HTTPS only' };
    const host = parsed.hostname.toLowerCase();
    // Reject private/link-local IPs
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.)/.test(host)) {
      return { type: 'invalid', reason: 'Private IP rejected' };
    }
    if (host === 'x.com' || host === 'twitter.com' || host === 'www.x.com') {
      return { type: 'x_tweet', url };
    }
    if (host === 'github.com' || host === 'www.github.com') {
      return { type: 'github_repo', url };
    }
    return { type: 'web_article', url };
  } catch {
    return { type: 'invalid', reason: 'Malformed URL' };
  }
}

function extractTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

function extractHandle(url) {
  const match = url.match(/(?:x\.com|twitter\.com)\/([^\/\?]+)/);
  return match ? match[1] : 'unknown';
}

// ── ScrapeCreators API ───────────────────────────────────────

async function fetchViaScrapeCreators(url) {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'SCRAPECREATORS_API_KEY not set.\n' +
      'Why: The .env file is missing this key.\n' +
      'Fix: Add SCRAPECREATORS_API_KEY=<your-key> to .env'
    );
  }

  const apiUrl = `https://api.scrapecreators.com/v1/twitter/tweet?url=${encodeURIComponent(url)}`;
  const res = await httpRequest(apiUrl, {
    headers: { 'x-api-key': apiKey }
  });

  const data = JSON.parse(res.body);
  if (!data.success) {
    throw new Error(`ScrapeCreators error: ${data.message || data.error || 'unknown'}`);
  }

  // Cache raw response
  const tweetId = extractTweetId(url);
  fs.writeFileSync(path.join(CACHE_DIR, `${tweetId}.json`), res.body);

  return data;
}

function extractTweetContent(data) {
  const longText = data?.note_tweet?.note_tweet_results?.result?.text;
  const shortText = data?.legacy?.full_text;
  const text = longText || shortText || '';

  const author = data?.core?.user_results?.result?.core?.name || 'Unknown';
  const handle = data?.core?.user_results?.result?.core?.screen_name || 'unknown';
  const createdAt = data?.legacy?.created_at || '';
  const date = createdAt ? new Date(createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  // Engagement
  const likes = data?.legacy?.favorite_count || 0;
  const retweets = data?.legacy?.retweet_count || 0;
  const views = data?.views?.count || '0';

  // Media
  const media = (data?.legacy?.extended_entities?.media || []).map((m, i) => ({
    url: m.media_url_https,
    type: m.type,
    index: i
  }));

  // Links from entities
  const entityUrls = data?.note_tweet?.note_tweet_results?.result?.entity_set?.urls
    || data?.legacy?.entities?.urls || [];
  const links = entityUrls.map(u => u.expanded_url).filter(Boolean);

  return { text, author, handle, date, likes, retweets, views, media, links };
}

// ── xAI Grok API (for X Articles) ───────────────────────────

async function fetchViaXaiGrok(url) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'XAI_API_KEY not set.\n' +
      'Why: The .env file is missing this key. Needed for X Article fallback.\n' +
      'Fix: Add XAI_API_KEY=<your-key> to .env'
    );
  }

  const body = JSON.stringify({
    model: 'grok-4',
    tools: [{ type: 'x_search' }],
    input: `Reproduce the FULL content of the X post/article at ${url}. ` +
           `Include all text, sections, and details. Return the complete content.`
  });

  const res = await httpRequest('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body
  });

  const data = JSON.parse(res.body);
  const output = data.output || [];
  const text = output
    .filter(o => o.type === 'message')
    .map(o => (o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join(''))
    .join('\n');

  return text || '';
}

// ── GitHub README Fetcher ────────────────────────────────────

function extractGitHubInfo(url) {
  // https://github.com/owner/repo or https://github.com/owner/repo/...
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

async function fetchGitHubReadme(owner, repo) {
  // Try main, then master branch
  for (const branch of ['main', 'master']) {
    try {
      const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
      const res = await httpRequest(readmeUrl);
      return { content: res.body, branch };
    } catch {
      // Try next branch
    }
  }
  throw new Error(`No README.md found on main or master branch for ${owner}/${repo}`);
}

function githubToMarkdown(url, owner, repo, readmeContent) {
  let md = `---\ntitle: "${owner}/${repo} — GitHub Repository"\n`;
  md += `source: ${url}\n`;
  md += `author: ${owner}\n`;
  md += `date: ${new Date().toISOString().slice(0, 10)}\n`;
  md += `fetched: ${new Date().toISOString().slice(0, 10)}\n`;
  md += `type: github\n`;
  md += `status: raw\n`;
  md += `---\n\n`;
  md += `# ${owner}/${repo}\n\n`;
  md += `**Repository:** ${url}\n\n`;
  md += `---\n\n`;
  md += readmeContent;
  return md;
}

// ── Markdown Generation ──────────────────────────────────────

function tweetToMarkdown(url, content, tweetId) {
  const { text, author, handle, date, likes, retweets, views, media, links } = content;

  let md = `---\ntitle: "${author} — ${slugify(text.slice(0, 50))}"\n`;
  md += `source: ${url}\n`;
  md += `author: ${author}\n`;
  md += `handle: ${handle}\n`;
  md += `date: ${date}\n`;
  md += `fetched: ${new Date().toISOString().slice(0, 10)}\n`;
  md += `type: tweet\n`;
  md += `status: raw\n`;
  md += `---\n\n`;
  md += `# ${author} (@${handle})\n\n`;
  md += `${text}\n`;

  if (media.length > 0) {
    md += `\n## Media\n`;
    media.forEach(m => {
      const ext = m.url.includes('.png') ? 'png' : 'jpg';
      md += `- ![image](images/${tweetId}_${m.index}.${ext})\n`;
    });
  }

  if (links.length > 0) {
    md += `\n## Links\n`;
    links.forEach(l => { md += `- ${l}\n`; });
  }

  md += `\n## Engagement\n`;
  md += `- ${likes.toLocaleString()} likes | ${retweets.toLocaleString()} retweets | ${Number(views).toLocaleString()} views\n`;

  return md;
}

function articleToMarkdown(url, text, handle) {
  let md = `---\ntitle: "X Article by ${handle}"\n`;
  md += `source: ${url}\n`;
  md += `handle: ${handle}\n`;
  md += `date: ${new Date().toISOString().slice(0, 10)}\n`;
  md += `fetched: ${new Date().toISOString().slice(0, 10)}\n`;
  md += `type: article\n`;
  md += `status: raw\n`;
  md += `---\n\n`;
  md += text;
  return md;
}

// ── Main Ingest Logic ────────────────────────────────────────

async function ingestUrl(url, manifest, dryRun = false) {
  // Already fetched?
  if (manifest[url] && manifest[url].status === 'fetched') {
    console.log(`  SKIP: Already fetched → ${manifest[url].file}`);
    return;
  }
  // Pending manual entries stay skipped unless status was reset to needs_refetch
  if (manifest[url] && manifest[url].status === 'pending_manual') {
    console.log(`  SKIP: Pending manual fetch`);
    return;
  }

  const classified = classifyUrl(url);
  if (classified.type === 'invalid') {
    console.error(`  ERROR: ${classified.reason} — ${url}`);
    manifest[url] = { status: 'failed', error: classified.reason, fetched_at: new Date().toISOString() };
    return;
  }

  if (dryRun) {
    console.log(`  DRY-RUN: Would fetch ${classified.type} from ${url}`);
    return;
  }

  const tweetId = extractTweetId(url);
  const handle = extractHandle(url);

  if (classified.type === 'x_tweet') {
    try {
      // Try ScrapeCreators first
      console.log(`  Fetching via ScrapeCreators...`);
      const data = await fetchViaScrapeCreators(url);
      const content = extractTweetContent(data);

      const isUrlOnly = /^\s*https?:\/\/\S+\s*$/.test(content.text);
      if (!content.text || content.text.length < 100 || isUrlOnly) {
        // Likely an X Article — fall back to Grok
        console.log(`  Short/empty content. Falling back to xAI Grok (X Article)...`);
        const articleText = await fetchViaXaiGrok(url);
        if (articleText) {
          const filename = `${handle}-${tweetId}.md`;
          const filepath = path.join(RAW_DIR, filename);
          fs.writeFileSync(filepath, articleToMarkdown(url, articleText, handle));
          manifest[url] = { status: 'fetched', file: `raw/${filename}`, type: 'x_article', fetched_at: new Date().toISOString() };
          console.log(`  ✓ Saved X Article → raw/${filename} (${articleText.length} chars)`);
          appendLog(`Ingested X Article: ${url} → raw/${filename}`);
          return;
        }
      }

      // Regular tweet
      const filename = `${content.handle}-${tweetId}.md`;
      const filepath = path.join(RAW_DIR, filename);
      fs.writeFileSync(filepath, tweetToMarkdown(url, content, tweetId));

      // Download images
      for (const m of content.media) {
        try {
          const ext = m.url.includes('.png') ? 'png' : 'jpg';
          const imgPath = path.join(IMG_DIR, `${tweetId}_${m.index}.${ext}`);
          await downloadImage(m.url, imgPath);
          console.log(`    ↓ Image saved: images/${tweetId}_${m.index}.${ext}`);
        } catch (err) {
          console.log(`    ⚠ Image download failed: ${err.message}`);
        }
      }

      manifest[url] = {
        status: 'fetched',
        file: `raw/${filename}`,
        type: 'tweet',
        credits_used: 1,
        links_found: content.links,
        fetched_at: new Date().toISOString()
      };
      console.log(`  ✓ Saved tweet → raw/${filename} (${content.text.length} chars, ${content.media.length} images)`);
      appendLog(`Ingested tweet: ${url} → raw/${filename}`);

    } catch (err) {
      // ScrapeCreators failed entirely — try Grok
      console.log(`  ScrapeCreators failed: ${err.message}`);
      console.log(`  Falling back to xAI Grok...`);
      try {
        const articleText = await fetchViaXaiGrok(url);
        if (articleText) {
          const filename = `${handle}-${tweetId}.md`;
          const filepath = path.join(RAW_DIR, filename);
          fs.writeFileSync(filepath, articleToMarkdown(url, articleText, handle));
          manifest[url] = { status: 'fetched', file: `raw/${filename}`, type: 'x_article_fallback', fetched_at: new Date().toISOString() };
          console.log(`  ✓ Saved via Grok fallback → raw/${filename}`);
          appendLog(`Ingested via Grok fallback: ${url} → raw/${filename}`);
          return;
        }
      } catch (grokErr) {
        console.error(`  ✗ Both APIs failed. ScrapeCreators: ${err.message}. Grok: ${grokErr.message}`);
        manifest[url] = { status: 'failed', error: `ScrapeCreators: ${err.message}; Grok: ${grokErr.message}`, fetched_at: new Date().toISOString() };
      }
    }
  } else if (classified.type === 'github_repo') {
    const info = extractGitHubInfo(url);
    if (!info) {
      console.error(`  ERROR: Could not parse GitHub owner/repo from ${url}`);
      manifest[url] = { status: 'failed', error: 'Could not parse GitHub URL', fetched_at: new Date().toISOString() };
      return;
    }
    try {
      console.log(`  Fetching GitHub README for ${info.owner}/${info.repo}...`);
      const { content, branch } = await fetchGitHubReadme(info.owner, info.repo);
      const filename = `${info.owner}-${info.repo}.md`;
      const filepath = path.join(RAW_DIR, filename);
      fs.writeFileSync(filepath, githubToMarkdown(url, info.owner, info.repo, content));
      manifest[url] = { status: 'fetched', file: `raw/${filename}`, type: 'github', branch, fetched_at: new Date().toISOString() };
      console.log(`  ✓ Saved GitHub README → raw/${filename} (${content.length} chars, ${branch} branch)`);
      appendLog(`Ingested GitHub: ${url} → raw/${filename}`);
    } catch (err) {
      console.error(`  ✗ GitHub fetch failed: ${err.message}`);
      manifest[url] = { status: 'failed', error: err.message, fetched_at: new Date().toISOString() };
    }
  } else if (classified.type === 'web_article') {
    // Fetch HTML, strip tags, save as markdown
    try {
      console.log(`  Fetching web article...`);
      const res = await httpRequest(url);
      const html = res.body;

      // Extract title from <title> tag
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

      // Strip HTML tags and normalize whitespace
      let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < 100) {
        console.log(`  ⚠ Web article content too short (${text.length} chars), may need manual fetch`);
        manifest[url] = { status: 'pending_manual', type: 'web_article', reason: 'content_too_short', fetched_at: new Date().toISOString() };
        return;
      }

      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const pathSlug = slugify(new URL(url).pathname);
      const filename = `${slugify(hostname)}-${pathSlug || 'index'}.md`;
      const filepath = path.join(RAW_DIR, filename);

      // Determine type from URL
      const isArxiv = hostname.includes('arxiv.org');
      const docType = isArxiv ? 'paper' : 'article';

      let md = `---\ntitle: "${title.replace(/"/g, '\\"')}"\n`;
      md += `source: ${url}\n`;
      md += `date: ${new Date().toISOString().slice(0, 10)}\n`;
      md += `fetched: ${new Date().toISOString().slice(0, 10)}\n`;
      md += `type: ${docType}\n`;
      md += `status: raw\n`;
      md += `---\n\n`;
      md += `# ${title}\n\n`;
      md += `**Source:** ${url}\n\n`;
      md += `---\n\n`;
      md += text;

      fs.writeFileSync(filepath, md);
      manifest[url] = { status: 'fetched', file: `raw/${filename}`, type: docType, fetched_at: new Date().toISOString() };
      console.log(`  ✓ Saved web article → raw/${filename} (${text.length} chars)`);
      appendLog(`Ingested web article: ${url} → raw/${filename}`);

    } catch (err) {
      // HTTP fetch failed (e.g. 403 Cloudflare) — try agent-browser, then Grok
      console.log(`  Web fetch failed: ${err.message}`);

      // Fallback 1: agent-browser (headed browser, solves Cloudflare challenges)
      console.log(`  Falling back to agent-browser (headed)...`);
      try {
        const browserText = await fetchViaAgentBrowser(url);
        if (browserText && browserText.length > 200) {
          // Strip nav/footer boilerplate
          let cleaned = browserText
            .replace(/^[\s\S]*?(?=\w{3,}\s+\d{1,2},\s+\d{4})/m, '') // skip to first date-like line
            .replace(/Subscribe to our newsletter[\s\S]*$/m, '')
            .trim();
          if (cleaned.length < 200) cleaned = browserText; // fallback to full text

          const hostname = new URL(url).hostname.replace(/^www\./, '');
          const pathSlug = slugify(new URL(url).pathname);
          const filename = `${slugify(hostname)}-${pathSlug || 'index'}.md`;
          const filepath = path.join(RAW_DIR, filename);

          // Extract title from first substantial line
          const titleLine = cleaned.split('\n').find(l => l.trim().length > 10) || hostname;

          let md = `---\ntitle: "${titleLine.slice(0, 100).replace(/"/g, '\\"')}"\n`;
          md += `source: ${url}\n`;
          md += `date: ${new Date().toISOString().slice(0, 10)}\n`;
          md += `fetched: ${new Date().toISOString().slice(0, 10)}\n`;
          md += `type: article\n`;
          md += `status: raw\n`;
          md += `fetch_method: agent-browser\n`;
          md += `---\n\n`;
          md += cleaned;

          fs.writeFileSync(filepath, md);
          manifest[url] = { status: 'fetched', file: `raw/${filename}`, type: 'article', fetch_method: 'agent-browser', fetched_at: new Date().toISOString() };
          console.log(`  ✓ Saved via agent-browser → raw/${filename} (${cleaned.length} chars)`);
          appendLog(`Ingested via agent-browser: ${url} → raw/${filename}`);
          return;
        }
      } catch (browserErr) {
        console.log(`  agent-browser failed: ${browserErr.message}`);
      }

      // Fallback 2: xAI Grok
      console.log(`  Falling back to xAI Grok...`);
      try {
        const grokText = await fetchViaXaiGrok(url);
        if (grokText && grokText.length > 100) {
          const hostname = new URL(url).hostname.replace(/^www\./, '');
          const pathSlug = slugify(new URL(url).pathname);
          const filename = `${slugify(hostname)}-${pathSlug || 'index'}.md`;
          const filepath = path.join(RAW_DIR, filename);

          let md = `---\ntitle: "Article from ${hostname}"\n`;
          md += `source: ${url}\n`;
          md += `date: ${new Date().toISOString().slice(0, 10)}\n`;
          md += `fetched: ${new Date().toISOString().slice(0, 10)}\n`;
          md += `type: article\n`;
          md += `status: raw\n`;
          md += `fetch_method: grok_fallback\n`;
          md += `---\n\n`;
          md += grokText;

          fs.writeFileSync(filepath, md);
          manifest[url] = { status: 'fetched', file: `raw/${filename}`, type: 'article', fetch_method: 'grok_fallback', fetched_at: new Date().toISOString() };
          console.log(`  ✓ Saved via Grok fallback → raw/${filename} (${grokText.length} chars)`);
          appendLog(`Ingested via Grok fallback: ${url} → raw/${filename}`);
          return;
        }
      } catch (grokErr) {
        console.error(`  ✗ Grok fallback also failed: ${grokErr.message}`);
      }
      manifest[url] = { status: 'failed', error: err.message, fetched_at: new Date().toISOString() };
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputs = args.filter(a => a !== '--dry-run');

  if (inputs.length === 0) {
    console.error('Usage: node scripts/ingest.js [--dry-run] <url-or-file>');
    console.error('  Single URL:  node scripts/ingest.js https://x.com/user/status/123');
    console.error('  Batch file:  node scripts/ingest.js raw_source_list.txt');
    process.exit(1);
  }

  const manifest = loadManifest();
  let urls = [];

  for (const input of inputs) {
    if (fs.existsSync(input) && !input.startsWith('http')) {
      // Read URLs from file
      const lines = fs.readFileSync(input, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      urls.push(...lines);
    } else {
      urls.push(input);
    }
  }

  console.log(`\nKB Ingest — ${urls.length} URL(s)${dryRun ? ' [DRY RUN]' : ''}\n`);

  let fetched = 0, skipped = 0, failed = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] ${url}`);
    const before = manifest[url]?.status;
    await ingestUrl(url, manifest, dryRun);
    const after = manifest[url]?.status;

    if (before === 'fetched') skipped++;
    else if (after === 'fetched') fetched++;
    else if (after === 'failed') failed++;

    // Save manifest after each URL (resume-from-failure)
    saveManifest(manifest);

    // Rate limiting: 500ms between API calls
    if (i < urls.length - 1 && !dryRun) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\nDone. Fetched: ${fetched} | Skipped: ${skipped} | Failed: ${failed}`);
  if (!dryRun) {
    appendLog(`Batch ingest complete: ${fetched} fetched, ${skipped} skipped, ${failed} failed from ${urls.length} URLs`);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
