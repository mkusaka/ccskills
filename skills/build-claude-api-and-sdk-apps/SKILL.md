---
name: "build-claude-api-and-sdk-apps"
description: "Trigger rules for activating guidance when users are building applications with the Claude API, Anthropic SDKs, or Managed Agents"
metadata:
  originalName: "Skill: Build Claude API and SDK apps"
  ccVersion: "2.1.101"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-build-claude-api-and-sdk-apps.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-build-claude-api-and-sdk-apps.md"
---

Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.
TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`; user asks to use the Claude API, Anthropic SDKs, or Managed Agents (`/v1/agents`, `/v1/sessions`); user asks to add, modify, debug, optimize, or improve a Claude feature (prompt caching, cache hit rate, adaptive thinking, compaction, code_execution, batch, files API, citations, memory tool) or a Claude model (Opus/Sonnet/Haiku) in a file; or user asks about prompt caching / cache hit rate / cache reads / cache creation in any project that uses the Anthropic SDK (even without mentioning Claude by name).
DO NOT TRIGGER when: file imports `openai`/non-Anthropic SDK, filename signals another provider (`agent-openai.py`, `*-generic.py`), code is provider-neutral, or task is general programming/ML.
