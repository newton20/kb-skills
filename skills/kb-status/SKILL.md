---
name: kb-status
description: Show knowledge base status — source count, wiki articles, last compile, pending work. Use when asked to "kb status", "what's in my KB", "knowledge base status", or returning to the project.
---

# Knowledge Base Status

Run the status command:

```bash
node scripts/compile.js status
```

Then provide additional context:

1. **If there are uncompiled sources:** "You have N uncompiled sources. Run /kb-compile to process them."
2. **If wiki is empty:** "Wiki has no articles yet. Run /kb-compile to generate articles from your N raw sources."
3. **If everything is compiled:** "Knowledge base is up to date. Run /kb-query to ask questions."

Also show:
- Most recent log entries (last 5 lines of log.md)
- Any health issues (run `node scripts/compile.js health` if wiki exists)
