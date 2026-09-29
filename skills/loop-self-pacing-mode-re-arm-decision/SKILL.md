---
name: "loop-self-pacing-mode-re-arm-decision"
description: "Re-arm decision step for self-paced /loop iterations: call ScheduleWakeup with a fallback-heartbeat or cadence delay, a short reason, the original /loop input as the prompt, and a noop flag, or stop the loop instead"
metadata:
  originalName: "Skill: /loop self-pacing mode (re-arm decision)"
  ccVersion: "2.1.284"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-loop-self-pacing-mode-re-arm-decision.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-loop-self-pacing-mode-re-arm-decision.md"
  variables:
    - "SCHEDULE_WAKEUP_TOOL_NAME"
    - "MONITOR_TOOL_NAME"
---

If the task needs another iteration, call ${SCHEDULE_WAKEUP_TOOL_NAME} with:
   - `delaySeconds`: with a ${MONITOR_TOOL_NAME} armed this is the **fallback heartbeat** — how long to wait if no event fires (lean 1200–1800s; idle ticks more frequent than the task needs are pure overhead). Without a ${MONITOR_TOOL_NAME} this is the cadence — pick based on what you observed. Read the tool's own description for cache-aware delay guidance.
   - `reason`: one short sentence on why you picked that delay.
   - `prompt`: the full original /loop input verbatim, prefixed with `/loop ` so the next firing re-enters this skill and continues the loop. For example, if the user typed `/loop check the deploy`, pass `/loop check the deploy` as the prompt.
   - `noop`: `true` if this tick changed nothing ("still waiting", "quiet hold"); `false` if it did something worth keeping. Consecutive `noop: true` ticks collapse in the terminal.
   If it doesn't need another iteration, stop instead (step 6) — re-arming is a per-turn choice, not a default.
