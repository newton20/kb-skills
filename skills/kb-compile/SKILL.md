---
name: kb-compile
description: Compile raw sources into the wiki and run health checks. Use when asked to "compile wiki", "update wiki", "build knowledge base", "health check", or "kb compile".
argument-hint: "[--full to recompile everything, default is incremental]"
---

# Compile Wiki

<args> #$ARGUMENTS </args>

## Step 1: Compute Delta

Run the compile utility to find uncompiled sources:

```bash
node scripts/compile.js delta
```

If no uncompiled files exist and `--full` was NOT specified, say: "All sources are compiled. Nothing to do. Run with --full to recompile everything."

## Step 2: Read Sources

Read all uncompiled raw files (or all raw files for --full). For each file, note:
- The title, author, source URL
- Key concepts, strategies, people, events mentioned
- Any claims that might contradict existing wiki articles

## Step 2b: Discuss Key Takeaways (Supervised Mode)

If compiling **5 or fewer** sources:
1. For each source, present a brief summary of key takeaways (3-5 bullet points)
2. Ask the user: "Anything to emphasize, correct, or skip before I write the wiki articles?"
3. Incorporate feedback before writing wiki articles

If compiling **more than 5** sources (batch mode):
- Skip this step and proceed directly to Step 3
- Print: "Batch mode: processing N sources automatically. For supervised compilation, run with fewer sources."

## Step 3: Search Before Write

For each concept/topic identified:
1. Check if `wiki/_index.md` exists — read it for existing article list
2. If an article on this topic exists → READ it and UPDATE with new information
3. If no article exists → CREATE a new one

**NEVER duplicate articles.** Always search existing wiki first.

## Step 4: Write/Update Wiki Articles

For each wiki article (new or updated):

```markdown
---
title: "Article Title"
type: wiki
tags: [tag1, tag2]
sources:
  - raw/file1.md
  - raw/file2.md
source_count: 2
status: draft           # draft | reviewed | needs_update
last_compiled: YYYY-MM-DD
---

# Article Title

[Summary paragraph — 2-3 sentences capturing the key point]

## [Subtopic sections as needed]

[Detailed content organized by subtopics.
Every factual claim should cite its source: [Source: filename.md]]

## Sources

- [raw/file1.md](../raw/file1.md) — brief description of what this source contributed
- [raw/file2.md](../raw/file2.md) — brief description

## Related

- [Other Article](other-article.md) — one-line description of the relationship

## Open Questions

- Any unresolved items or contradictions between sources
```

**Contradiction handling:** When sources disagree, present BOTH claims with attribution:
> Source A (raw/file1.md) claims X. Source B (raw/file2.md) claims Y.

## Step 4b: Cross-Pollinate Across Wiki

**This is the most important step.** A single source should touch 5-15 wiki pages, not just 1-2.

For EACH new or updated wiki article from Step 4:

1. Read `wiki/_index.md` to get the full list of existing articles
2. For each OTHER existing wiki article, assess:
   - Does the new source contain information relevant to this article?
   - Would adding a paragraph, a citation, or updating a section improve it?
3. If yes: READ the existing article fully, then ADD the relevant information with a source citation `[Source: raw/filename.md]`
4. Update `## Related` sections with **bidirectional links**:
   - In the NEW article: add a link to the existing article
   - In the EXISTING article: add a link back to the new article
   - Format: `- [Article Title](article-filename.md) — one-line description of relationship`
5. Update the `source_count` in frontmatter of any article you modified
6. Do NOT create new articles in this step — only update existing ones

**Target:** each compilation pass should update at least 5 existing wiki pages beyond the primary article(s) written in Step 4.

**Skip conditions:** If the wiki has fewer than 3 articles, skip this step (not enough to cross-pollinate).

## Step 5: Update Raw File Status

After compiling, update each processed raw file's frontmatter. Use the Edit tool to change `status: raw` to `status: compiled` and add `compiled_to` and `compiled_date` fields.

## Step 6: Regenerate Index

```bash
node scripts/compile.js index
```

## Step 7: Health Check

```bash
node scripts/compile.js health
```

## Step 8: Append to Log

Append a summary line to `log.md`:
```
- **[timestamp]** — Compiled N sources into M articles. X new articles, Y updated. Z health issues.
```

## Success Summary

Print: "Compiled N new sources into M wiki articles. X contradictions. Y coverage gaps."
