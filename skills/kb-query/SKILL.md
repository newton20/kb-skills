---
name: kb-query
description: Ask questions or generate reports from the knowledge base. Use when asked to "query KB", "ask knowledge base", "research", "generate report", "kb query", or "what does the KB say about".
argument-hint: "[question or topic, use --report for long-form]"
---

# Query Knowledge Base

<query> #$ARGUMENTS </query>

**If the query above is empty, ask the user:** "What would you like to know? Ask any question about the knowledge base topics."

## Determine Mode

- If `--report` is in the arguments → **Report mode** (long-form, comprehensive)
- Otherwise → **Answer mode** (focused, concise)

## Suggested High-Value Questions

If the user's query is vague or they want ideas, suggest these:
- "What are the three biggest gaps in this knowledge base?"
- "Which sources disagree with each other, and on what?"
- "What should I research next based on what's here?"
- "What connections exist between [concept A] and [concept B]?"
- "Write a 500-word briefing on [topic] using only wiki content"

## Step 1: Read Context

1. Read `wiki/_index.md` to understand the knowledge landscape
2. Identify which wiki articles are relevant to the question
3. Read 3-8 most relevant articles for full context

## Step 2: Generate Response

**Answer mode:**
- Concise, well-structured answer (300-800 words)
- Cite specific wiki articles as sources
- Note any gaps or open questions from the wiki

**Report mode:**
- Comprehensive research report (1000-3000 words)
- Executive summary paragraph
- Multiple sections with evidence from wiki articles
- Citations for every major claim
- Conclusions and recommendations
- "Further Research" section for gaps

## Step 3: Save Output

Generate the output filename:
```bash
node scripts/query.js name "the user's question"
# or for reports:
node scripts/query.js name --report "the topic"
```

Write the output file with frontmatter:
```markdown
---
title: "Answer/Report title"
source: "kb-query"
date: YYYY-MM-DD
type: answer | report
query: "the original question"
wiki_sources: [wiki/file1.md, wiki/file2.md]
---

# Title

[Content]

## Sources

- [Wiki Article 1](../wiki/file1.md)
- [Wiki Article 2](../wiki/file2.md)
```

## Step 4: Offer Wiki Promotion

Ask the user: "File insights back into the wiki? (This will add an `origin: generated` tag)"

If yes:
1. Identify which wiki article(s) would benefit from the new insights
2. Update those articles, adding new content clearly marked
3. Add `origin: generated` to the frontmatter of any new wiki content

## Success Summary

Print: "Answer saved to outputs/[filename] (N words, M sources cited)."
