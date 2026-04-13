# KB Skills

Reusable Claude Code skills for building [Karpathy-style LLM knowledge bases](https://karpathy.ai/blog/fringe.html). Dump sources, let the AI maintain a structured wiki.

## What This Does

You feed it URLs (tweets, articles, papers, GitHub repos). It fetches them, builds a cross-referenced wiki, and lets you query it. The AI handles all maintenance: compilation, cross-pollination, health checks, and gap analysis.

Built for Claude Code. Works with any topic.

## Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| `kb-init` | `/kb-init "topic"` | Scaffold a new KB (folders, CLAUDE.md, scripts, git init) |
| `kb-ingest` | `/kb-ingest url` | Fetch URLs into `raw/` (tweets via ScrapeCreators, web via HTTPS/agent-browser/Grok) |
| `kb-compile` | `/kb-compile` | Build wiki from raw sources. Supervised mode for <=5 sources, cross-pollinates across 5-15 pages per source |
| `kb-query` | `/kb-query "question"` | Answer questions from the wiki with citations. `--report` for long-form |
| `kb-lint` | `/kb-lint` | Full health check: structural + semantic (contradictions, staleness, gaps). Generates `wiki/lint-report-YYYY-MM-DD.md` |
| `kb-explore` | `/kb-explore` | Find 5 unexplored connections between topics. Offer to create wiki pages |
| `kb-status` | `/kb-status` | Dashboard: source count, article count, last compile, pending work |

## Install

Copy the skills into your Claude Code skills directory:

```bash
# Clone
git clone https://github.com/newton20/kb-skills.git

# Copy skills
cp -r kb-skills/skills/kb-* ~/.claude/skills/

# Copy scripts to your KB project
cp -r kb-skills/scripts/ your-kb-project/scripts/
```

Then install the Node.js dependency in your KB project:

```bash
cd your-kb-project
npm install dotenv
```

## Quick Start

```bash
# 1. Initialize a new knowledge base
# (in Claude Code)
/kb-init "your topic"

# 2. Add source URLs
echo "https://example.com/article" >> raw_source_list.txt

# 3. Fetch sources
/kb-ingest raw_source_list.txt

# 4. Build the wiki
/kb-compile

# 5. Ask questions
/kb-query "What are the key insights?"

# 6. Monthly health check
/kb-lint
```

## How It Works

```
raw_source_list.txt    /kb-ingest     raw/*.md        /kb-compile      wiki/*.md
  (URLs)          ──────────────>  (fetched docs)  ──────────────>  (synthesized articles)
                                                                         │
                                                        /kb-query  <─────┘
                                                        /kb-lint
                                                        /kb-explore
```

**Ingest** fetches URLs with a 3-tier fallback:
1. Direct HTTPS (most sites)
2. `agent-browser --headed` (Cloudflare-protected sites)
3. xAI Grok (last resort, uses X search)

X/Twitter URLs use ScrapeCreators API for tweets, with Grok fallback for X Articles.

**Compile** follows the Karpathy methodology:
- Each source touches 5-15 wiki pages (cross-pollination)
- Supervised mode (<=5 sources) discusses takeaways before writing
- Bidirectional backlinks in `## Related` sections
- Every factual claim cites its source: `[Source: raw/filename.md]`
- Contradiction handling with attribution

**Lint** runs structural checks (`compile.js health`) plus LLM-powered semantic analysis:
- Contradiction scan across articles
- Orphan page detection
- Unsourced claim flagging
- Knowledge gap identification
- Severity levels: error/warning/info

## KB Project Structure

After `kb-init`, your project looks like:

```
your-kb/
  raw/              # Fetched source documents (immutable)
  raw/images/       # Downloaded media
  wiki/             # AI-maintained wiki articles
  outputs/          # Query answers and reports
  scripts/          # ingest.js, compile.js, query.js
  CLAUDE.md         # Schema file
  .env              # API keys
  log.md            # Append-only operation log
  ingest_manifest.json  # Tracks fetch status per URL
  raw_source_list.txt   # Master URL list
```

## API Keys

The ingest script uses two optional APIs:

- **SCRAPECREATORS_API_KEY** — For fetching tweets ([scrapecreators.com](https://scrapecreators.com))
- **XAI_API_KEY** — For X Articles and fallback fetching ([x.ai](https://x.ai))

Add them to `.env` in your KB project root.

## Requirements

- Claude Code (CLI, desktop, or web)
- Node.js 18+
- `agent-browser` (optional, for Cloudflare-blocked sites): `npm i -g agent-browser`

## License

MIT
