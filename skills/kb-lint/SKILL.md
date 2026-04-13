---
name: kb-lint
description: Run full health check on the knowledge base wiki. Use when asked to "lint wiki", "health check", "kb lint", "check wiki quality", or "monthly check".
---

# Lint Knowledge Base

Run a comprehensive health check on the wiki following the Karpathy second-brain lint workflow.

## Step 1: Run Structural Checks

```bash
node scripts/compile.js health
```

Review the output. These are deterministic checks (broken links, orphan pages, missing cross-references, stale articles).

## Step 2: Run Semantic Checks (LLM-powered)

Read `wiki/_index.md` to get the full article list, then read EVERY wiki article. For each article, check:

### 2a. Contradiction Scan

Compare claims across articles. Flag any claims that contradict claims in other articles:

> **CONTRADICTION** in `{article1}` vs `{article2}`:
> - `{article1}` claims: "{claim A}"
> - `{article2}` claims: "{claim B}"
> - Severity: {high if factual conflict, medium if nuance difference}

### 2b. Staleness Scan

For articles with `status: needs_update` or `last_compiled` older than 30 days:
- Check if newer raw sources exist that should have updated them
- Flag: "**STALE**: `{article}` — last compiled {date}, but {N} newer raw sources exist that may be relevant"

### 2c. Unsourced Claims Scan

For each article, identify paragraphs making factual claims without any source citation (`[Source: ...]`, `raw/`, or `(../raw/)`):
- Flag: "**UNSOURCED** in `{article}`: '{first 80 chars of paragraph}...'"

### 2d. Gap Analysis

Based on all wiki content, identify 3-5 topics that are:
- Mentioned frequently across multiple articles but have no dedicated wiki page
- Referenced in raw sources but never compiled into wiki articles
- Obvious gaps given the knowledge base's stated focus areas

## Step 3: Generate Report

Write report to `wiki/lint-report-YYYY-MM-DD.md` with this structure:

```markdown
---
title: "Lint Report YYYY-MM-DD"
type: lint-report
date: YYYY-MM-DD
---

# Wiki Lint Report — YYYY-MM-DD

## Summary

- Total articles: N
- Errors (must fix): N
- Warnings (should fix): N
- Info (nice to fix): N

## Errors

[List all items from structural checks and contradictions]

## Warnings

[Orphan pages, stale articles, unsourced claims]

## Info

[Missing cross-references, low-priority items]

## Knowledge Gaps

Top 3 suggested articles to fill:
1. **[Topic]** — mentioned in {N} articles, no dedicated page
2. **[Topic]** — {reason}
3. **[Topic]** — {reason}
```

## Step 4: Summary

Print: "Lint complete. N errors, M warnings, K info items. Report saved to wiki/lint-report-YYYY-MM-DD.md"

If errors > 0, suggest: "Run /kb-compile --full to recompile and fix structural issues."
