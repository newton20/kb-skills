#!/usr/bin/env node
/**
 * query.js — Output file management for Q&A and reports.
 *
 * Handles date-prefixed file naming, slug generation, and deduplication.
 *
 * Usage:
 *   node scripts/query.js name "What is market making?"      # Generate filename
 *   node scripts/query.js name --report "State of trading"   # Report filename
 *   node scripts/query.js list                               # List all outputs
 *   node scripts/query.js list --recent 5                    # Last 5 outputs
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .replace(/-$/, '');
}

function generateFilename(query, isReport = false) {
  const date = new Date().toISOString().slice(0, 10);
  const prefix = isReport ? 'report' : 'answer';
  const slug = slugify(query);
  const base = `${date}-${prefix}-${slug}`;

  // Deduplicate
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const existing = fs.readdirSync(OUTPUTS_DIR);
  let filename = `${base}.md`;
  let counter = 1;
  while (existing.includes(filename)) {
    filename = `${base}-${counter}.md`;
    counter++;
  }

  return path.join(OUTPUTS_DIR, filename);
}

function listOutputs(limit) {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    console.log('No outputs yet.');
    return;
  }

  const files = fs.readdirSync(OUTPUTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  const show = limit ? files.slice(0, limit) : files;

  if (show.length === 0) {
    console.log('No outputs yet.');
    return;
  }

  console.log(`\n📄 Outputs (${show.length} of ${files.length}):\n`);
  show.forEach(f => {
    const content = fs.readFileSync(path.join(OUTPUTS_DIR, f), 'utf8');
    const titleMatch = content.match(/^# (.+)/m);
    const title = titleMatch ? titleMatch[1] : f;
    const words = content.split(/\s+/).length;
    console.log(`  ${f} — ${title} (${words} words)`);
  });
}

// ── Main ─────────────────────────────────────────────────────

const cmd = process.argv[2] || 'list';
switch (cmd) {
  case 'name': {
    const isReport = process.argv.includes('--report');
    const query = process.argv.slice(3).filter(a => a !== '--report').join(' ');
    if (!query) {
      console.error('Usage: node scripts/query.js name "your question"');
      process.exit(1);
    }
    console.log(generateFilename(query, isReport));
    break;
  }
  case 'list': {
    const recentIdx = process.argv.indexOf('--recent');
    const limit = recentIdx >= 0 ? parseInt(process.argv[recentIdx + 1]) : null;
    listOutputs(limit);
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Usage: node scripts/query.js [name|list]');
    process.exit(1);
}
