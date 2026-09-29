---
name: "dynamic-pacing-loop-execution"
description: "Step-by-step instructions for executing a dynamic pacing loop that runs tasks, arms and re-arms event monitors, schedules fallback heartbeat ticks, and handles task notifications"
metadata:
  originalName: "Skill: Dynamic pacing loop execution"
  ccVersion: "2.1.284"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-dynamic-pacing-loop-execution.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-dynamic-pacing-loop-execution.md"
  variables:
    - "TASK_RUN_LABEL"
    - "MONITOR_TOOL_NAME"
    - "MONITOR_ARMING_GUIDANCE_FN"
    - "SCHEDULE_WAKEUP_TOOL_NAME"
    - "MONITOR_REARM_GUIDANCE_FN"
    - "CONFIRM_AND_DECIDE_STEPS_BLOCK"
    - "REARM_WITH_STATUS_UPDATE_FN"
    - "DYNAMIC_MODE_SENTINEL"
    - "TASK_STOP_TOOL_NAME"
    - "TASK_LIST_TOOL_NAME"
    - "STOPPED_LOOP_OUTCOME_NOTE_FN"
    - "ADDITIONAL_INFO_FN"
---

1. **Run ${TASK_RUN_LABEL} now**, following the instructions inlined below.
2. **If the next tick is gated on an event** (CI finishing, a PR comment, a log line) and no ${MONITOR_TOOL_NAME} is already running for it: ${MONITOR_ARMING_GUIDANCE_FN()}. Its events wake this loop immediately — you do not wait for the ${SCHEDULE_WAKEUP_TOOL_NAME} deadline. ${MONITOR_REARM_GUIDANCE_FN("ticks")}
${CONFIRM_AND_DECIDE_STEPS_BLOCK}
5. **If woken by a `<task-notification>`** rather than this prompt: handle the event, then make the same decision. If the loop should continue, ${REARM_WITH_STATUS_UPDATE_FN(`call ${SCHEDULE_WAKEUP_TOOL_NAME} again with `${DYNAMIC_MODE_SENTINEL}` and the same 1200–1800s `delaySeconds` (the ${MONITOR_TOOL_NAME} remains the wake signal; the new wakeup is only the fallback heartbeat)`)}. If the event means the work is finished, stop (step 6).
6. **To stop the loop** — the task is complete, further iterations can't make progress, or the user asked you to stop — call ${SCHEDULE_WAKEUP_TOOL_NAME} with `stop: true` (no other fields) and ${TASK_STOP_TOOL_NAME} any ${MONITOR_TOOL_NAME} you armed (use ${TASK_LIST_TOOL_NAME} to find the task ID if it is no longer in context).${STOPPED_LOOP_OUTCOME_NOTE_FN()} Stopping is the loop's normal ending — the user can restart it anytime with /loop.${ADDITIONAL_INFO_FN()}
