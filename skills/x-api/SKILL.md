---
name: x-api
description: X/Twitter API integration for posting tweets, threads, reading timelines, search, and analytics. Covers OAuth auth patterns, rate limits, and platform-native content posting. Use when the user wants to interact with X programmatically.
origin: ECC
---

<!--
  Provenance (distribution fork — audit trail):
    Upstream repo:   affaan-m/everything-claude-code
    Upstream path:   .agents/skills/x-api/
    Upstream commit: 1a50145d39c0fa415311da62e7a018edd4e6d976
    SKILL.md blob:   9100664ce19c5ec51d57b8d5b34c2061ce352c28
    Modifications from upstream:
      1. `allow_implicit_invocation` flipped to false in agents/openai.yaml
      2. Hardcoded `@affaanmustafa` replaced with `<username>` placeholder in query examples
      3. "Related Skills" section removed (upstream references unshipped skills: `brand-voice`, `content-engine`, `crosspost`, `connections-optimizer`; last of those is a dead reference that 404s upstream)
      4. "Hard Guardrails" block added under Security section: writes require explicit user confirmation, no token echo, no .env cat, no arbitrary media upload
      5. Environment Loading section added documenting dotenv + shell pre-load patterns
-->

# X API

Programmatic interaction with X (Twitter) for posting, reading, searching, and analytics.

## When to Activate

- User wants to post tweets or threads programmatically
- Reading timeline, mentions, or user data from X
- Searching X for content, trends, or conversations
- Building X integrations or bots
- Analytics and engagement tracking
- User says "post to X", "tweet", "X API", or "Twitter API"

## Authentication

### Environment Loading

Credentials are loaded from a `.env` file (gitignored). All code examples assume the five `X_*` variables are available via `os.environ`. Two ways to make that true:

**Option A — Python code loads `.env` directly (preferred for scripts):**

```python
from dotenv import load_dotenv
load_dotenv()  # reads ./.env
```

Install once: `pip install python-dotenv` (or `uv pip install python-dotenv`).

**Option B — shell pre-loads before launching Claude Code (preferred for interactive work):**

```bash
set -a; source .env; set +a
claude
```

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^([A-Z_][A-Z0-9_]*)=(.*)$') { Set-Item "Env:$($Matches[1])" $Matches[2].Trim('"').Trim("'") }
}
claude
```

### OAuth 2.0 Bearer Token (App-Only)

Best for: read-heavy operations, search, public data.

```bash
# Environment setup
export X_BEARER_TOKEN="your-bearer-token"
```

```python
import os
import requests

bearer = os.environ["X_BEARER_TOKEN"]
headers = {"Authorization": f"Bearer {bearer}"}

# Search recent tweets
resp = requests.get(
    "https://api.x.com/2/tweets/search/recent",
    headers=headers,
    params={"query": "claude code", "max_results": 10}
)
tweets = resp.json()
```

### OAuth 1.0a (User Context)

Required for: posting tweets, managing account, DMs, and any write flow.

```bash
# Environment setup — source before use
export X_CONSUMER_KEY="your-consumer-key"
export X_CONSUMER_SECRET="your-consumer-secret"
export X_ACCESS_TOKEN="your-access-token"
export X_ACCESS_TOKEN_SECRET="your-access-token-secret"
```

Legacy aliases such as `X_API_KEY`, `X_API_SECRET`, and `X_ACCESS_SECRET` may exist in older setups. Prefer the `X_CONSUMER_*` and `X_ACCESS_TOKEN_SECRET` names when documenting or wiring new flows.

```python
import os
from requests_oauthlib import OAuth1Session

oauth = OAuth1Session(
    os.environ["X_CONSUMER_KEY"],
    client_secret=os.environ["X_CONSUMER_SECRET"],
    resource_owner_key=os.environ["X_ACCESS_TOKEN"],
    resource_owner_secret=os.environ["X_ACCESS_TOKEN_SECRET"],
)
```

## Core Operations

### Post a Tweet

```python
resp = oauth.post(
    "https://api.x.com/2/tweets",
    json={"text": "Hello from Claude Code"}
)
resp.raise_for_status()
tweet_id = resp.json()["data"]["id"]
```

### Post a Thread

```python
def post_thread(oauth, tweets: list[str]) -> list[str]:
    ids = []
    reply_to = None
    for text in tweets:
        payload = {"text": text}
        if reply_to:
            payload["reply"] = {"in_reply_to_tweet_id": reply_to}
        resp = oauth.post("https://api.x.com/2/tweets", json=payload)
        tweet_id = resp.json()["data"]["id"]
        ids.append(tweet_id)
        reply_to = tweet_id
    return ids
```

### Read User Timeline

```python
resp = requests.get(
    f"https://api.x.com/2/users/{user_id}/tweets",
    headers=headers,
    params={
        "max_results": 10,
        "tweet.fields": "created_at,public_metrics",
    }
)
```

### Search Tweets

Replace `<username>` with the handle you intend to query. Do not ship code with hardcoded handles.

```python
resp = requests.get(
    "https://api.x.com/2/tweets/search/recent",
    headers=headers,
    params={
        "query": "from:<username> -is:retweet",
        "max_results": 10,
        "tweet.fields": "public_metrics,created_at",
    }
)
```

### Fetch an X Article (body text)

X Articles are long-form posts stored separately from the tweet text. The tweet body only contains a `t.co` redirect link. Use `article.plain_text` via expansions:

```python
resp = requests.get(
    f"https://api.x.com/2/tweets/{tweet_id}",
    headers=headers,
    params={
        "tweet.fields": "article,created_at,public_metrics",
        "expansions": "author_id",
        "user.fields": "username,name",
    }
)
data = resp.json()
article = data["data"].get("article")
if article:
    title = article["title"]
    body = article["plain_text"]
```

### Pull Recent Original Posts for Voice Modeling

```python
resp = requests.get(
    "https://api.x.com/2/tweets/search/recent",
    headers=headers,
    params={
        "query": "from:<username> -is:retweet -is:reply",
        "max_results": 25,
        "tweet.fields": "created_at,public_metrics",
    }
)
voice_samples = resp.json()
```

### Get User by Username

```python
resp = requests.get(
    "https://api.x.com/2/users/by/username/<username>",
    headers=headers,
    params={"user.fields": "public_metrics,description,created_at"}
)
```

### Upload Media and Post

```python
# Media upload uses v1.1 endpoint

# Step 1: Upload media
media_resp = oauth.post(
    "https://upload.twitter.com/1.1/media/upload.json",
    files={"media": open("image.png", "rb")}
)
media_id = media_resp.json()["media_id_string"]

# Step 2: Post with media
resp = oauth.post(
    "https://api.x.com/2/tweets",
    json={"text": "Check this out", "media": {"media_ids": [media_id]}}
)
```

## Rate Limits

X API rate limits vary by endpoint, auth method, and account tier, and they change over time. Always:
- Check the current X developer docs before hardcoding assumptions
- Read `x-rate-limit-remaining` and `x-rate-limit-reset` headers at runtime
- Back off automatically instead of relying on static tables in code

```python
import time

remaining = int(resp.headers.get("x-rate-limit-remaining", 0))
if remaining < 5:
    reset = int(resp.headers.get("x-rate-limit-reset", 0))
    wait = max(0, reset - int(time.time()))
    print(f"Rate limit approaching. Resets in {wait}s")
```

## Error Handling

```python
resp = oauth.post("https://api.x.com/2/tweets", json={"text": content})
if resp.status_code == 201:
    return resp.json()["data"]["id"]
elif resp.status_code == 429:
    reset = int(resp.headers["x-rate-limit-reset"])
    raise Exception(f"Rate limited. Resets at {reset}")
elif resp.status_code == 403:
    raise Exception(f"Forbidden: {resp.json().get('detail', 'check permissions')}")
else:
    raise Exception(f"X API error {resp.status_code}: {resp.text}")
```

## Security

### Hard Guardrails (MUST follow)

- **Never POST to `/2/tweets`, DM endpoints, or any write endpoint without an explicit user confirmation in the immediately preceding turn.** Drafts are for review. "Post this" / "send it" / "go ahead" in the same turn that requests the write counts as confirmation; inferred intent does not.
- **Never include the literal bearer token, consumer secret, or access token secret in any tool output, commit, log, or message body** — including error messages, debug prints, or screenshots of env dumps. If a token surfaces accidentally, tell the user to rotate immediately.
- **Never read `.env` files and echo their contents back to the user or to any network destination.** Use env vars via `os.environ`; do not cat the file.
- **Media uploads must use a path the user has explicitly named in this session.** Do not upload arbitrary files from the working directory.

### Credential Hygiene

- **Never hardcode tokens.** Use environment variables or `.env` files.
- **Never commit `.env` files.** Add to `.gitignore`.
- **Rotate tokens** if exposed. Regenerate at developer.x.com.
- **Use read-only tokens** when write access is not needed. Prefer a bearer-only shell profile for read work; only export OAuth1 write creds in dedicated project shells.
- **Store OAuth secrets securely** — not in source code or logs.
