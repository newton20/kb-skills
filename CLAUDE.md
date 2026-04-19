# KB Skills

Reusable Claude Code skills for Karpathy-style LLM knowledge bases.

## Structure

```
skills/         # Claude Code skill files (SKILL.md per skill)
  kb-init/      # Initialize a new knowledge base
  kb-ingest/    # Fetch URLs into raw/
  kb-compile/   # Build wiki from raw sources
  kb-query/     # Query the knowledge base
  kb-status/    # Show KB status
  kb-lint/      # Full health check
  kb-explore/   # Find unexplored connections
  x-api/        # X/Twitter API reference (auth, posting, reading, article bodies)
scripts/        # Node.js automation (shared across all KBs)
  ingest.js     # URL fetching. X Articles: ScrapeCreators -> X API v2 article.plain_text -> xAI Grok
  compile.js    # Delta computation, index generation, health checks
  query.js      # Query output naming
```

## Key Design Decisions

- Skills are LLM instructions (SKILL.md), scripts are deterministic code (Node.js)
- The LLM does creative work (writing wiki articles, finding connections). Scripts do mechanical work (fetching URLs, counting files, checking links)
- Cross-pollination (Step 4b in kb-compile) is the core innovation: each source should touch 5-15 wiki pages
- Supervised mode (<=5 sources) asks the user about key takeaways before writing
- Inline citations `[Source: raw/filename.md]` on every factual claim
