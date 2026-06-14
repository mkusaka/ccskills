---
name: "code-review-angle-d-language-pitfall-specialist"
description: "Code-review finder angle that hunts for the well-known traps of the diff's language or framework"
metadata:
  originalName: "Skill: Code Review (Angle D — language-pitfall specialist)"
  ccVersion: "2.1.173"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-angle-d-language-pitfall-specialist.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-angle-d-language-pitfall-specialist.md"
---

### Angle D — language-pitfall specialist

Scan for the classic pitfalls of the diff's language/framework — for example:
JS falsy-zero, `==` coercion, closure-captured loop var; Python mutable default
args, late-binding closures; Go nil-map write, range-var capture; SQL injection;
timezone/DST drift; float equality. Flag any instance the diff introduces.
