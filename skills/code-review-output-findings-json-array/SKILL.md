---
name: "code-review-output-findings-json-array"
description: "Defines the code-review skill's result shape: a JSON array of findings carrying file, line, summary, and failure_scenario"
metadata:
  originalName: "Skill: Code Review (Output — findings JSON array)"
  ccVersion: "2.1.288"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-code-review-output-findings-json-array.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-code-review-output-findings-json-array.md"
  variables:
    - "MAX_FINDINGS"
    - "PLURALIZE_FN"
    - "REPORT_FINDINGS_TOOL_NAME"
---

## Output

Return findings as a JSON array ${MAX_FINDINGS==="all"?"with one object for every finding that survives, no maximum":`of at most ${MAX_FINDINGS} ${PLURALIZE_FN(MAX_FINDINGS,"object")}`}:

```json
[
  {
    "file": "path/to/file.ext",
    "line": 123,
    "summary": "one-sentence statement of the bug",
    "failure_scenario": "concrete inputs/state → wrong output/crash"
  }
]
```

Ranked most-severe first. ${MAX_FINDINGS==="all"?"Keep every finding that survives. There is no maximum.":`If more than ${MAX_FINDINGS} survive, keep the ${MAX_FINDINGS} most
severe.`} If nothing survives verification, return `[]`. Do not call the
${REPORT_FINDINGS_TOOL_NAME} tool even if it is available - this review's
output contract is the JSON block above.
