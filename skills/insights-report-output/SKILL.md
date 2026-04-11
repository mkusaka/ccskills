---
name: "insights-report-output"
description: "Formats and displays the insights usage report results after the user runs the /insights slash command"
metadata:
  originalName: "Skill: /insights report output"
  ccVersion: "2.1.101"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-insights-report-output.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-insights-report-output.md"
  variables:
    - "INSIGHTS_DATA"
    - "REPORT_URL"
    - "HTML_FILE_PATH"
    - "FACETS_DIRECTORY"
    - "AT_A_GLANCE_SUMMARY"
    - "ADDITIONAL_CONTEXT_BLOCK"
    - "ADDITIONAL_MESSAGE_BLOCK"
---

The user just ran /insights to generate a usage report analyzing their Claude Code sessions.

Here is the full insights data:
${INSIGHTS_DATA}

Report URL: ${REPORT_URL}
HTML file: ${HTML_FILE_PATH}
Facets directory: ${FACETS_DIRECTORY}

At-a-glance summary (for your context only — the user has not seen any output yet):
${AT_A_GLANCE_SUMMARY}${ADDITIONAL_CONTEXT_BLOCK}

Output the text between <message> tags verbatim as your entire response. Do not omit any line:

<message>
Your shareable insights report is ready:
${REPORT_URL}${ADDITIONAL_MESSAGE_BLOCK}

Want to dig into any section or try one of the suggestions?
</message>
