---
name: "code-review-efficiency-dimension"
description: "Code-review pass that surfaces wasted effort the diff adds — duplicate computation or I/O, avoidable serialization, large scopes held by closures — and points to the cheaper option"
metadata:
  originalName: "Skill: /code-review efficiency dimension"
  ccVersion: "2.1.173"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-efficiency-dimension.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-efficiency-dimension.md"
---

### Efficiency

Flag wasted work the diff introduces: redundant computation or repeated I/O,
independent operations run sequentially, blocking work added to startup or
hot paths. Also flag long-lived objects built from closures or captured
environments — they keep the entire enclosing scope alive for the object's
lifetime (a memory leak when that scope holds large values); prefer a
class/struct that copies only the fields it needs. Name the cheaper
alternative.
