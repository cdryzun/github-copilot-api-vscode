---
title: I Built a VS Code Extension That Turns GitHub Copilot Into a Full OpenAI-Compatible API
published: true
description: Stop paying for OpenAI API. Your Copilot subscription already has GPT-4. Here's how to use it for everything.
tags: ai, opensource, vscode, productivity
cover_image: https://github.com/suhaibbinyounis/github-copilot-api-vscode/raw/main/Showcase.png
---

## The Problem

I was paying for too many AI services.

- GitHub Copilot: $10/month
- OpenAI API: $50-100/month
- ChatGPT Plus: $20/month

One day I realized something obvious: Copilot uses GPT-4. I'm already paying for access to one of the best language models. I just couldn't use it outside of VS Code's autocomplete.

So I fixed that.

## What I Built

**GitHub Copilot API Gateway** — a VS Code extension that exposes your Copilot subscription as a local HTTP server.

![GitHub Copilot API Gateway](https://github.com/suhaibbinyounis/github-copilot-api-vscode/raw/main/Showcase.png)

It implements three API formats:
- OpenAI (`/v1/chat/completions`)
- Anthropic (`/v1/messages`)
- Google Gemini (`/v1beta/models/:model:generateContent`)

Any tool that works with these APIs now works with your Copilot subscription.

## Why This Matters

### For Individual Developers

You no longer need to:
- Pay for OpenAI API credits to test LangChain
- Set up Ollama and download 40GB models
- Configure local inference with LM Studio
- Manage API keys across different services

Just point your code at `http://127.0.0.1:3030/v1` and it works.

### For Teams and Enterprises

The math is simple:

| Without This | With This |
|--------------|-----------|
| $10 Copilot + $50-200 API costs | $10 Copilot |
| Per developer, per month | Per developer, per month |

For a team of 50, that's potentially **$2,500-10,000/month in savings**.

## How It Works

### Installation

```bash
# Install from VS Code Marketplace
ext install suhaibbinyounis.github-copilot-api-vscode
```

Or search "GitHub Copilot API Gateway" in VS Code.

### Start the Server

1. Open the Copilot API sidebar
2. Click "Start Server"
3. Server runs at `http://127.0.0.1:3030`

### Use It

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

That's it. Your existing OpenAI code works unchanged.

## Framework Integrations

### LangChain

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="not-needed"
)

response = llm.invoke("Explain recursion")
```

### LlamaIndex

```python
from llama_index.llms.openai import OpenAI

llm = OpenAI(
    api_base="http://127.0.0.1:3030/v1",
    api_key="not-needed"
)
```

### AutoGPT / CrewAI / Any Agent

```bash
export OPENAI_API_BASE=http://127.0.0.1:3030/v1
export OPENAI_API_KEY=not-needed

# Now run your agent
python agent.py
```

## Built-in AI Apps

The extension also includes purpose-built AI applications:

![Apps Hub](https://github.com/suhaibbinyounis/github-copilot-api-vscode/raw/main/Apps.png)

- **Playwright Test Generator** — Describe tests in English, get complete projects
- **Code Review Assistant** — AI feedback on your diffs
- **Commit Message Generator** — Semantic commits from staged changes
- **Documentation Generator** — Auto-docs for any codebase

These run directly in VS Code. No external tools needed.

## Security Features

This isn't a toy. It includes production-ready security:

- IP allowlisting
- Bearer token authentication
- Rate limiting
- Request payload limits
- Automatic data redaction in logs

Configure via VS Code settings:

```json
{
  "githubCopilotApi.server.apiKey": "your-secret",
  "githubCopilotApi.server.ipAllowlist": ["192.168.1.0/24"],
  "githubCopilotApi.server.rateLimitPerMinute": 60
}
```

## API Documentation

Full Swagger UI included at `/docs`:

![Swagger Documentation](https://github.com/suhaibbinyounis/github-copilot-api-vscode/raw/main/Swagger.png)

## Source Code

Everything is open source:

{% github suhaibbinyounis/github-copilot-api-vscode %}

## Try It

```bash
ext install suhaibbinyounis.github-copilot-api-vscode
```

Or visit the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=suhaibbinyounis.github-copilot-api-vscode).

---

If this is useful, consider starring the repo. Questions or feedback? Drop a comment below.
