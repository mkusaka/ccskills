---
name: "schedule-recurring-cron-and-run-immediately"
description: "Converts an interval to a cron expression, schedules a recurring task via the cron creation tool, confirms to the user, and immediately executes the task without waiting for the first cron fire"
metadata:
  originalName: "Skill: Schedule recurring cron and run immediately"
  ccVersion: "2.1.101"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-schedule-recurring-cron-and-run-immediately.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-schedule-recurring-cron-and-run-immediately.md"
  variables:
    - "PREAMBLE"
    - "INTERVAL"
    - "CRON_CREATE_TOOL_NAME"
    - "SCHEDULED_PROMPT"
    - "PROMPT_DESCRIPTION"
    - "CONFIRMATION_MESSAGE"
    - "IMMEDIATE_RUN_REFERENCE"
    - "INLINE_TASK_INSTRUCTIONS"
    - "ADDITIONAL_CONTEXT"
---

${PREAMBLE}

## Action

1. Convert `${INTERVAL}` to a 5-field cron expression. Supported suffixes: `s` → ceil to nearest minute, `m` (minutes), `h` (hours), `d` (days). Examples: `5m` → `*/5 * * * *`, `1h` → `0 * * * *`, `1d` → `0 0 * * *`. If the interval doesn't cleanly divide its unit, round to the nearest clean interval and tell the user what you rounded to.
2. Call ${CRON_CREATE_TOOL_NAME} with:
   - `cron`: the expression from step 1
   - `prompt`: the literal string `${SCHEDULED_PROMPT}` — ${PROMPT_DESCRIPTION}
   - `recurring`: `true`
3. Briefly confirm: ${CONFIRMATION_MESSAGE}
4. **Then immediately run ${IMMEDIATE_RUN_REFERENCE} now**, following the instructions inlined below. Don't wait for the first cron fire.

${INLINE_TASK_INSTRUCTIONS}

${ADDITIONAL_CONTEXT}
