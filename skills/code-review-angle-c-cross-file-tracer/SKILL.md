---
name: "code-review-angle-c-cross-file-tracer"
description: "Code-review finder angle that follows each changed function out to its callers, checking the diff hasn't broken a call-site contract"
metadata:
  originalName: "Skill: Code Review (Angle C — cross-file tracer)"
  ccVersion: "2.1.173"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-angle-c-cross-file-tracer.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-angle-c-cross-file-tracer.md"
---

### Angle C — cross-file tracer

For each function the diff changes, find its callers (Grep for the symbol) and
check whether the change breaks any call site: a new precondition, a changed
return shape, a new exception, a timing/ordering dependency. Also check callees:
does a parallel change in the same PR make a call unsafe?
