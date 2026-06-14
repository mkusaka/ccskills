---
name: "code-review-angle-e-wrapperproxy-correctness"
description: "Code-review finder angle for wrapping types (caches, proxies, decorators), checking every method forwards faithfully to the wrapped object"
metadata:
  originalName: "Skill: Code Review (Angle E — wrapper/proxy correctness)"
  ccVersion: "2.1.173"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-angle-e-wrapperproxy-correctness.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-angle-e-wrapperproxy-correctness.md"
---

### Angle E — wrapper/proxy correctness

When the PR adds or modifies a type that wraps another (cache, proxy, decorator,
adapter): check that every method routes to the wrapped instance and not back
through a registry/session/global — e.g. a caching provider holding a
`delegate` field that resolves IDs via `session.get(...)` instead of
`delegate.get(...)` will re-enter the cache or recurse. Also check that the
wrapper forwards all the methods the callers actually use.
