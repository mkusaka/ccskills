---
name: "claude-guide-unavailable-reference-fallback"
description: "Provides the Claude guide skill with an embedded live-sources reference and fallback instructions when its reference files cannot be written to disk"
metadata:
  originalName: "Skill: Claude guide unavailable reference fallback"
  ccVersion: "2.1.310"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-claude-guide-unavailable-reference-fallback.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-claude-guide-unavailable-reference-fallback.md"
  variables:
    - "LIVE_SOURCES_DOC"
---

## Reference Files Unavailable

This skill's reference files could not be written to disk for this session, so the `{lang}/…`, `shared/…`, and `curl/…` files cited above cannot be Read. Do not guess their contents — fetch the matching URL from `shared/live-sources.md`, included below, whenever the Reading Guide points at one of those files. If a cited `shared/…` file has no matching URL below (skill-authored guides such as `shared/prompt-audit.md`, `shared/agent-design.md`, `shared/platform-availability.md`), state that the reference is unavailable this session and proceed best-effort from this document.

<doc path="shared/live-sources.md">
${LIVE_SOURCES_DOC}
</doc>
