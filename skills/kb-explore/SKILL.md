---
name: kb-explore
description: Discover unexplored connections in the knowledge base. Use when asked to "explore KB", "find connections", "kb explore", "what's interesting", or "what connections exist".
---

# Explore Knowledge Base

Identify the most interesting unexplored connections between existing topics.

## Step 1: Load Context

1. Read `wiki/_index.md` to understand the knowledge landscape
2. Read ALL wiki articles to build a complete mental model of the knowledge base
3. Note the stated focus areas from CLAUDE.md

## Step 2: Find Connections

Identify the **5 most interesting unexplored connections** between existing topics. For each:

1. **Connection**: Name the two topics/concepts being connected
2. **Insight**: Explain what insight the connection might reveal (1-2 sentences)
3. **Evidence**: Point to specific claims in existing wiki articles that hint at this connection
4. **Source suggestion**: What source (URL, paper, research query) would help confirm or develop this connection
5. **Confidence**: high / medium / low

Prioritize connections that are:
- Non-obvious (not already discussed in existing articles)
- Actionable (could lead to a useful new wiki article or insight)
- Grounded in evidence from multiple existing articles

## Step 3: Offer Actions

Present the 5 connections to the user. For each, offer:

a) **Create a new wiki page** exploring this connection in depth
b) **Add notes** to the relevant existing articles about this connection
c) **Skip** this connection

## Step 4: Execute User Choices

For connections where the user selects (a):
- Create a new wiki article with `origin: generated` in frontmatter
- Include citations to the existing wiki articles that informed the connection
- Update `wiki/_index.md` via `node scripts/compile.js index`

For connections where the user selects (b):
- Add a brief note to the relevant existing articles' `## Related` or `## Open Questions` sections
- Include `[Source: generated exploration]` attribution

## Step 5: Save Exploration

Save the full exploration (all 5 connections with analysis) to `outputs/explore-YYYY-MM-DD.md` with frontmatter:

```markdown
---
title: "Knowledge Base Exploration"
type: exploration
date: YYYY-MM-DD
query: "unexplored connections"
wiki_sources: [list of all wiki articles read]
---
```

Print: "Exploration complete. Found N connections. M new wiki pages created. Saved to outputs/explore-YYYY-MM-DD.md"
