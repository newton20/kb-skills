#!/usr/bin/env node
/**
 * compile.js — Delta computation and deterministic index generation for wiki compilation.
 *
 * This script handles the DETERMINISTIC parts of compilation:
 * - Scans raw/ for uncompiled files (status: raw in frontmatter)
 * - Generates wiki/_index.md from wiki file frontmatter
 * - Validates internal links
 * - Reports health check results
 *
 * The CREATIVE parts (writing wiki articles) are handled by the /kb-compile skill.
 *
 * Usage:
 *   node scripts/compile.js delta      # Show uncompiled raw files
 *   node scripts/compile.js index      # Regenerate wiki/_index.md from frontmatter
 *   node scripts/compile.js health     # Run health checks on wiki
 *   node scripts/compile.js status     # Show KB status summary
 */

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'raw');
const WIKI_DIR = path.join(__dirname, '..', 'wiki');
const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');
const MANIFEST_PATH = path.join(__dirname, '..', 'ingest_manifest.json');

// ── Frontmatter Parser ──────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colon = line.indexOf(':');
    if (colon > 0 && !line.startsWith('  ')) {
      const key = line.slice(0, colon).trim();
      let val = line.slice(colon + 1).trim();
      // Check if next lines are YAML list items (  - value)
      if (val === '' && i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
        const items = [];
        while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
          i++;
          let item = lines[i].replace(/^\s+-\s*/, '').trim();
          if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
            item = item.slice(1, -1);
          }
          items.push(item);
        }
        fm[key] = items;
      } else {
        // Strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Parse inline arrays [a, b, c]
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        }
        fm[key] = val;
      }
    }
    i++;
  }
  return fm;
}

function getBodyText(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

// ── Commands ─────────────────────────────────────────────────

function cmdDelta() {
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md'));
  const uncompiled = [];
  const compiled = [];

  for (const file of rawFiles) {
    const content = fs.readFileSync(path.join(RAW_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    const body = getBodyText(content);
    if (fm.status === 'compiled') {
      compiled.push(file);
    } else {
      uncompiled.push({ file, title: fm.title || file, type: fm.type || 'unknown', chars: body.length });
    }
  }

  console.log(`\n📊 Compilation Delta`);
  console.log(`  Raw files: ${rawFiles.length} total`);
  console.log(`  Compiled: ${compiled.length}`);
  console.log(`  Uncompiled: ${uncompiled.length}\n`);

  if (uncompiled.length === 0) {
    console.log('  All raw files are compiled. Nothing to do.');
    return;
  }

  console.log('  Uncompiled files:');
  uncompiled.forEach(u => {
    console.log(`    - ${u.file} (${u.type}, ${u.chars} chars)`);
  });
  return uncompiled;
}

function cmdIndex() {
  fs.mkdirSync(WIKI_DIR, { recursive: true });
  const wikiFiles = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md') && f !== '_index.md');

  if (wikiFiles.length === 0) {
    console.log('No wiki articles found. Run /kb-compile first.');
    return;
  }

  const articles = [];
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    const body = getBodyText(content);
    // Extract first paragraph as summary
    const firstPara = body.split('\n\n').find(p => p.trim() && !p.startsWith('#'));
    articles.push({
      file,
      title: fm.title || file.replace('.md', ''),
      tags: Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []),
      sources: Array.isArray(fm.sources) ? fm.sources : [],
      last_compiled: fm.last_compiled || 'unknown',
      summary: (firstPara || '').slice(0, 150).trim(),
      wordCount: body.split(/\s+/).length,
    });
  }

  // Build index
  let index = `---\ntitle: "Knowledge Base Index"\ntype: index\ngenerated: ${new Date().toISOString().slice(0, 10)}\n---\n\n`;
  index += `# Knowledge Base Index\n\n`;
  index += `**${articles.length} articles** | Last generated: ${new Date().toISOString().slice(0, 10)}\n\n`;

  // Group by tags
  const tagMap = {};
  articles.forEach(a => {
    if (a.tags.length === 0) {
      (tagMap['uncategorized'] = tagMap['uncategorized'] || []).push(a);
    } else {
      a.tags.forEach(t => {
        (tagMap[t] = tagMap[t] || []).push(a);
      });
    }
  });

  index += `## Articles\n\n`;
  articles.sort((a, b) => a.title.localeCompare(b.title));
  articles.forEach(a => {
    index += `- **[${a.title}](${a.file})** — ${a.summary}${a.summary.length >= 150 ? '...' : ''}\n`;
  });

  if (Object.keys(tagMap).length > 0) {
    index += `\n## By Tag\n\n`;
    Object.keys(tagMap).sort().forEach(tag => {
      index += `### ${tag}\n`;
      tagMap[tag].forEach(a => {
        index += `- [${a.title}](${a.file})\n`;
      });
      index += '\n';
    });
  }

  // Coverage gaps from raw sources
  const manifest = loadManifest();
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md'));
  const uncompiledRaw = rawFiles.filter(f => {
    const content = fs.readFileSync(path.join(RAW_DIR, f), 'utf8');
    return parseFrontmatter(content).status !== 'compiled';
  });

  if (uncompiledRaw.length > 0) {
    index += `## Coverage Gaps\n\n`;
    index += `${uncompiledRaw.length} raw source(s) not yet compiled:\n`;
    uncompiledRaw.forEach(f => { index += `- ${f}\n`; });
  }

  fs.writeFileSync(path.join(WIKI_DIR, '_index.md'), index);
  console.log(`✓ Generated wiki/_index.md (${articles.length} articles, ${Object.keys(tagMap).length} tags)`);
}

function cmdHealth() {
  const wikiFiles = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md') && f !== '_index.md');

  if (wikiFiles.length === 0) {
    console.log('No wiki articles to check. Run /kb-compile first.');
    return;
  }

  console.log(`\n🏥 Wiki Health Check\n`);
  let issues = 0;

  // Check for broken internal links
  const existingFiles = new Set(wikiFiles);
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const linkMatches = content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      const target = match[2];
      if (!target.startsWith('http') && !target.startsWith('#') && !target.startsWith('raw/')) {
        if (!existingFiles.has(target) && !fs.existsSync(path.join(WIKI_DIR, target))) {
          console.log(`  ⚠ Broken link in ${file}: [${match[1]}](${target})`);
          issues++;
        }
      }
    }
  }

  // Check for missing sources references
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    if (fm.sources && Array.isArray(fm.sources)) {
      for (const src of fm.sources) {
        if (!fs.existsSync(path.join(__dirname, '..', src))) {
          console.log(`  ⚠ Missing source in ${file}: ${src}`);
          issues++;
        }
      }
    }
  }

  // Check for articles without sources
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    if (!content.includes('## Sources')) {
      console.log(`  ⚠ No Sources section in ${file}`);
      issues++;
    }
  }

  // Check for orphan pages — no inbound links from any other wiki page
  const inboundLinks = {};
  wikiFiles.forEach(f => { inboundLinks[f] = 0; });
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const linkMatches = content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      const target = match[2];
      if (wikiFiles.includes(target)) {
        inboundLinks[target] = (inboundLinks[target] || 0) + 1;
      }
    }
  }
  for (const [file, count] of Object.entries(inboundLinks)) {
    if (count === 0) {
      console.log(`  🟡 Orphan page: ${file} — no other articles link to it`);
      issues++;
    }
  }

  // Check for missing cross-references — articles sharing tags but not linking
  const tagToFiles = {};
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
    tags.forEach(tag => {
      (tagToFiles[tag] = tagToFiles[tag] || []).push(file);
    });
  }
  for (const [tag, files] of Object.entries(tagToFiles)) {
    if (files.length < 2) continue;
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const content1 = fs.readFileSync(path.join(WIKI_DIR, files[i]), 'utf8');
        if (!content1.includes(files[j])) {
          console.log(`  🔵 Missing cross-reference: ${files[i]} and ${files[j]} share tag '${tag}' but don't link`);
          issues++;
        }
      }
    }
  }

  // Check for stale articles — last_compiled older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    if (fm.last_compiled && fm.last_compiled < thirtyDaysAgo && fm.status !== 'reviewed') {
      console.log(`  🟡 Stale article: ${file} — last compiled ${fm.last_compiled}`);
      issues++;
    }
  }

  // Check for articles without source citations in body text
  for (const file of wikiFiles) {
    const content = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const body = getBodyText(content);
    // Count paragraphs vs paragraphs with citations
    const paragraphs = body.split('\n\n').filter(p => p.trim() && !p.startsWith('#') && !p.startsWith('-') && !p.startsWith('|') && !p.startsWith('>') && !p.startsWith('```') && p.trim().length > 100);
    const uncited = paragraphs.filter(p => !p.includes('[Source:') && !p.includes('raw/') && !p.includes('(../raw/'));
    if (uncited.length > 3) {
      console.log(`  🟡 Low citation density in ${file}: ${uncited.length}/${paragraphs.length} paragraphs lack source citations`);
      issues++;
    }
  }

  if (issues === 0) {
    console.log('  ✓ No issues found. Wiki is healthy.');
  } else {
    const errors = issues; // all counted
    console.log(`\n  Found ${issues} issue(s). (🔴 = error, 🟡 = warning, 🔵 = info)`);
  }

  return issues;
}

function cmdStatus() {
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md'));
  const wikiFiles = fs.existsSync(WIKI_DIR) ? fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md') && f !== '_index.md') : [];
  const outputFiles = fs.existsSync(OUTPUTS_DIR) ? fs.readdirSync(OUTPUTS_DIR).filter(f => f.endsWith('.md')) : [];

  const uncompiled = rawFiles.filter(f => {
    const content = fs.readFileSync(path.join(RAW_DIR, f), 'utf8');
    return parseFrontmatter(content).status !== 'compiled';
  });

  console.log(`\n📦 Knowledge Base Status`);
  console.log(`  Raw sources:      ${rawFiles.length} (${uncompiled.length} uncompiled)`);
  console.log(`  Wiki articles:    ${wikiFiles.length}`);
  console.log(`  Outputs:          ${outputFiles.length}`);

  const manifest = loadManifest();
  const totalCredits = Object.values(manifest).reduce((sum, v) => sum + (v.credits_used || 0), 0);
  console.log(`  Credits used:     ${totalCredits}`);
  console.log(`  Last ingest:      ${Object.values(manifest).map(v => v.fetched_at).sort().pop() || 'never'}`);
}

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
  catch { return {}; }
}

// ── Code Research Versioning ────────────────────────────────

const CODE_RESEARCH_PATTERN = /^code-research-(.+)-(\d{4}-\d{2}-\d{2})(-\d+)?\.md$/;

function parseCodeResearchFilename(filename) {
  const match = filename.match(CODE_RESEARCH_PATTERN);
  if (!match) return null;
  return {
    repoName: match[1],
    date: match[2],
    counter: match[3] ? parseInt(match[3].slice(1)) : 0,
  };
}

function groupCodeResearchByRepo() {
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md'));
  const groups = new Map();

  for (const file of rawFiles) {
    const parsed = parseCodeResearchFilename(file);
    if (!parsed) continue;
    const content = fs.readFileSync(path.join(RAW_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    if (!groups.has(parsed.repoName)) groups.set(parsed.repoName, []);
    groups.get(parsed.repoName).push({
      file,
      date: parsed.date,
      counter: parsed.counter,
      status: fm.status || 'raw',
      research_goal: fm.research_goal || '',
    });
  }

  // Sort each group by date ascending, then counter ascending
  for (const [, versions] of groups) {
    versions.sort((a, b) => a.date.localeCompare(b.date) || a.counter - b.counter);
  }

  return groups;
}

function cmdGroup() {
  const groups = groupCodeResearchByRepo();

  if (groups.size === 0) {
    console.log('\nNo versioned code-research files found.');
    return;
  }

  console.log(`\n📂 Code Research Files by Repo (${groups.size} repos)\n`);
  for (const [repoName, versions] of [...groups.entries()].sort()) {
    console.log(`  ${repoName} (${versions.length} version${versions.length > 1 ? 's' : ''}):`);
    versions.forEach((v, i) => {
      const marker = v.status === 'compiled' ? '✓' : '○';
      const goalSnippet = v.research_goal ? ` — ${v.research_goal.slice(0, 60)}` : '';
      console.log(`    ${marker} ${v.file}${goalSnippet}`);
    });
  }
}

// ── Main ─────────────────────────────────────────────────────

const cmd = process.argv[2] || 'status';
switch (cmd) {
  case 'delta': cmdDelta(); break;
  case 'index': cmdIndex(); break;
  case 'health': cmdHealth(); break;
  case 'status': cmdStatus(); break;
  case 'group': cmdGroup(); break;
  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Usage: node scripts/compile.js [delta|index|health|status|group]');
    process.exit(1);
}
