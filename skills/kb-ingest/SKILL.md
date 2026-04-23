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
- `scripts/ingest.js` — must include PDF handling (`arxivPdfToHtmlUrl`, `fetchViaPdftotext`, `fetch_method: arxiv_html_alt`), KB_ENV_FILE whitespace tolerance, and the `note_tweet.text` fallback in `fetchViaXApiArticle`. Shipped in kb-skills at commit `d6f4da2` or later. If the local `scripts/ingest.js` predates these features, re-run `/kb-init` to refresh or copy the updated file from this repo.
- `raw/` directory
- For PDF sources: `pdftotext` on PATH (poppler-utils / xpdf). Git-for-Windows bundles it at `C:\Program Files\Git\mingw64\bin\pdftotext.exe`. macOS: `brew install poppler`. Ubuntu: `apt install poppler-utils`.

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
- **`pdftotext not installed on PATH`**: poppler-utils / xpdf is missing. Git-for-Windows ships it at `C:\Program Files\Git\mingw64\bin\pdftotext.exe`; otherwise `brew install poppler` (macOS) or `apt install poppler-utils` (Linux).

## PDF Sources

The ingest script detects PDF URLs (any `*.pdf` or `arxiv.org/pdf/<id>` path) and processes them through a two-stage chain:

1. **arxiv HTML alternative** — For `arxiv.org/pdf/<id>` URLs, the script first tries `arxiv.org/html/<id>`. When available, this is preferred (cleaner structure, smaller, no layout artifacts). Recorded as `fetch_method: arxiv_html_alt`.
2. **`pdftotext` extraction** — If the HTML version returns 404 (common for brand-new papers) or the URL isn't an arxiv paper, the script downloads the PDF and runs `pdftotext <file> -` (reading-order mode — **not** `-layout`, which interleaves columns on 2-column academic papers). Recorded as `fetch_method: pdftotext`.

**Known pdftotext quirks:**
- Some xpdf builds (including the one bundled with Git-for-Windows) return exit code 99 for `pdftotext -v`. Don't use `-v` to probe for availability; run the extraction and surface an install hint only on `ENOENT` / exit 127 / "not recognized."
- The `-layout` flag preserves visual column positions but jumbles reading order on 2-column PDFs. Default mode (no flag) flows columns top-to-bottom, which reads correctly for arxiv-style papers.

**Manual override**: if a paper extracts poorly, fetch via `arxiv.org/abs/<id>` (abstract page) or ask the user for an alternate URL.

## After Ingestion

1. Show the ingest summary (fetched/skipped/failed counts)
2. If any embedded links were found (especially X Articles), ask: "Found N linked articles. Want to ingest those too?"
3. Suggest: "Run /kb-compile to compile new sources into the wiki."

## Supervised vs. Batch Mode

For the first 10 sources in a new KB, recommend **supervised ingestion**: process one source at a time, read the summary, guide the AI on what to emphasize. This produces dramatically better wiki articles than batch-processing everything at once. After the wiki has 10+ articles and established patterns, batch mode is fine.
