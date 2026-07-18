---
name: "artifact-pr-review-description"
description: "Trigger description for creating a shareable PR review briefing Artifact with a recommendation, reviewer judgment calls, visual explainer, signals, and blind spots"
metadata:
  originalName: "Skill: Artifact PR review description"
  ccVersion: "2.1.213"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-artifact-pr-review-description.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-artifact-pr-review-description.md"
---

Create a PR review artifact — a structured review briefing for a GitHub pull request (synthesis title and bottom line, a recommendation, reviewer judgment calls, a visual explainer, signals, and blind spots), published as a shareable page. Use when the user asks to review a PR as an artifact, publish a PR review page, or share a review briefing. NOT a narrative walkthrough — for a tour-the-diff walkthrough artifact use pr-explainer. Only for CREATING a new artifact; edits to an existing artifact modify its HTML directly.
