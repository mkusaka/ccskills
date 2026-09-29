---
name: "dynamic-pacing-loop-execution-re-arm-decision"
description: "Re-arm decision step for dynamic-pacing /loop ticks: call ScheduleWakeup with a fallback-heartbeat or observed-cadence delay, a short reason, the dynamic-mode sentinel prompt, and a noop flag, or stop the loop instead"
metadata:
  originalName: "Skill: Dynamic pacing loop execution (re-arm decision)"
  ccVersion: "2.1.284"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-dynamic-pacing-loop-execution-re-arm-decision.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-dynamic-pacing-loop-execution-re-arm-decision.md"
  variables:
    - "SCHEDULE_WAKEUP_TOOL_NAME"
    - "MONITOR_TOOL_NAME"
    - "DYNAMIC_MODE_SENTINEL"
---

If the next check is worth running, call ${SCHEDULE_WAKEUP_TOOL_NAME} with:
   - `delaySeconds`: with a ${MONITOR_TOOL_NAME} armed this is the fallback heartbeat (lean 1200–1800s). Without one, pick based on what you observed this turn — quiet branch? wait longer. Lots in flight? wait shorter. Read the tool's own description for cache-aware delay guidance.
   - `reason`: one short sentence on why you picked that delay.
   - `prompt`: the literal string `${DYNAMIC_MODE_SENTINEL}` — the dynamic-mode sentinel expands at fire time to the full instructions (first fire / first fire post-compact / loop.md edited) or a dynamic-pacing-specific short reminder (subsequent fires). Do not pass the full instructions; that is handled automatically.
   - `noop`: `true` if this tick changed nothing ("still waiting", "quiet hold"); `false` if it did something worth keeping. Consecutive `noop: true` ticks collapse in the terminal.
   If it isn't, stop instead (step 6) — re-arming is a per-turn choice, not a default.
