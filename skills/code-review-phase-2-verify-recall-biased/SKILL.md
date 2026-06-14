---
name: "code-review-phase-2-verify-recall-biased"
description: "Recall-tier verification step: one verifier per candidate finding, biased toward keeping anything plausible"
metadata:
  originalName: "Skill: Code Review (Phase 2 — verify, recall-biased)"
  ccVersion: "2.1.173"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-phase-2-verify-recall-biased.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-phase-2-verify-recall-biased.md"
  variables:
    - "AGENT_TOOL_NAME"
    - "RECALL_BIASED_RUBRIC"
---

## Phase 2 — Verify (1-vote, recall-biased)

Dedup near-duplicates (same defect, same location, same reason → keep one). For
each remaining candidate, run **one verifier** via the ${AGENT_TOOL_NAME} tool:
give it the diff, the relevant file(s), and the candidate; it returns exactly
one of **CONFIRMED / PLAUSIBLE / REFUTED**.

${RECALL_BIASED_RUBRIC}

Keep **CONFIRMED and PLAUSIBLE**. Drop REFUTED.
