---
name: kb-init
description: Initialize a Karpathy-style LLM knowledge base. Use when asked to "create knowledge base", "set up KB", "new knowledge base", or "kb init".
argument-hint: "[topic name, e.g. 'agentic trading']"
---

# Initialize Knowledge Base

<topic> #$ARGUMENTS </topic>

**If the topic above is empty, ask the user:** "What topic should this knowledge base cover?"

## Steps

1. **Create directory structure:**
   ```bash
   mkdir -p raw/images wiki outputs scripts
   ```

2. **Create .gitignore FIRST** (before .env):
   ```
   .env
   *.key
   *.secret
   .firecrawl/
   .raw_cache/
   node_modules/
   ```

3. **Create .env template:**
   ```
   SCRAPECREATORS_API_KEY=<your-key-here>
   XAI_API_KEY=<your-key-here>
   ```
   Tell the user: "Add your API keys to .env. Get ScrapeCreators key from scrapecreators.com. Get xAI key from x.ai."

4. **Create package.json:**
   ```json
   {
     "name": "kb-<topic-slug>",
     "version": "1.0.0",
     "private": true,
     "scripts": { "ingest": "node scripts/ingest.js", "compile": "node scripts/compile.js", "query": "node scripts/query.js" },
     "dependencies": { "dotenv": "^16.4.0" }
   }
   ```

5. **Run npm install**

6. **Copy scripts** from the reference implementation:
   - Copy `scripts/ingest.js` from `~/.claude/skills/kb-init/scripts/` or generate from the template in the kb-ingest skill
   - Copy `scripts/compile.js` and `scripts/query.js` similarly

7. **Create CLAUDE.md** with the knowledge base schema. Parameterize the topic name from the user's input.

   The CLAUDE.md MUST include these sections (in addition to the standard structure/commands/source types sections):

   ```markdown
   ## Wiki Conventions
   - Every wiki file starts with YAML frontmatter (see Frontmatter Schema)
   - After frontmatter, a one-paragraph summary
   - Every factual claim cites its source: [Source: filename.md]
   - When new info contradicts existing content, flag explicitly:
     > CONTRADICTION: [old claim] vs [new claim] from [source]
   - Use ## Related section for bidirectional links between wiki pages
   - New articles start with status: draft. Mark reviewed after human verification.

   ## Focus Areas
   [List 3-5 specific topics this knowledge base covers — these guide compilation priorities]
   ```

8. **Create empty files:**
   - `ingest_manifest.json` → `{}`
   - `log.md` → `# Knowledge Base Operation Log\n\nAppend-only log of all operations.\n\n---`
   - `raw_source_list.txt` → empty

9. **Initialize git repository:**
   ```bash
   git init
   git add -A
   git commit -m "Initialize knowledge base for [topic]"
   ```
   This enables version control from day one — full history, branching, and the ability to undo any AI-generated changes.

10. **Print success summary:**
    "Knowledge base initialized for [topic]. Next: add URLs to raw_source_list.txt and run /kb-ingest raw_source_list.txt"
