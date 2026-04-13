---
name: kb-ingest
description: Ingest URLs into the knowledge base raw/ folder. Use when asked to "add source", "ingest", "fetch tweet", "add URL", "import article", or "kb ingest".
argument-hint: "[URL or path to URL list file]"
---

# Ingest Sources

<input> #$ARGUMENTS </input>

**If the input above is empty, ask the user:** "What URL(s) would you like to ingest? Provide a single URL or path to a file containing URLs."

## Prerequisites

Check that these exist:
- `.env` with `SCRAPECREATORS_API_KEY` and `XAI_API_KEY`
- `scripts/ingest.js`
- `raw/` directory

If any are missing, tell the user: "Knowledge base not initialized. Run /kb-init first." and create `raw/`, `wiki/`, `outputs/` if they don't exist.

## Execution

Run the ingest script:

```bash
node scripts/ingest.js <input>
```

Where `<input>` is the user's URL or file path from the arguments.

## Error Handling

If the script reports errors:
- **Missing API key**: Tell user which key is missing and where to get it
- **API credit exhaustion**: Tell user to check ScrapeCreators dashboard
- **X Article fallback**: This is normal — some X posts are articles that need xAI Grok
- **Network timeout**: Suggest retry with the same URL

## After Ingestion

1. Show the ingest summary (fetched/skipped/failed counts)
2. If any embedded links were found (especially X Articles), ask: "Found N linked articles. Want to ingest those too?"
3. Suggest: "Run /kb-compile to compile new sources into the wiki."

## Supervised vs. Batch Mode

For the first 10 sources in a new KB, recommend **supervised ingestion**: process one source at a time, read the summary, guide the AI on what to emphasize. This produces dramatically better wiki articles than batch-processing everything at once. After the wiki has 10+ articles and established patterns, batch mode is fine.
