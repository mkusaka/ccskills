---
name: "code-review-phase-0-gather-the-diff"
description: "Opening step of the code-review skill: assemble the unified diff to review with git diff"
metadata:
  originalName: "Skill: Code Review (Phase 0 — gather the diff)"
  ccVersion: "2.1.329"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-phase-0-gather-the-diff.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-phase-0-gather-the-diff.md"
  variables:
    - "REVIEW_WORKING_TREE_DIFF_GUIDANCE_BLOCK"
---

## Phase 0 — Gather the diff

Unless a review target is named above, run `git diff origin/HEAD...HEAD` by
itself, exactly as written, to get the unified diff under review: the whole branch
against the default branch. Only if that fails, or it and `git diff HEAD` both
print nothing, run `git diff main...HEAD`, with the default branch's name in place
of `main` if it has another (`git branch -a` lists the branches), or
`git diff HEAD~1` if you can't tell the base. Three forms need permission, so
never write them: `@{upstream}` or `@{u}` next to `..` or `...`, commands
grouped in parentheses, and shell variables such as `$?`. ${REVIEW_WORKING_TREE_DIFF_GUIDANCE_BLOCK}
