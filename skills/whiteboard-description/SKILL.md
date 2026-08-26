---
name: "whiteboard-description"
description: "Trigger description for the Whiteboard skill, covering creation of a shared sketch canvas for collaborative drawing, design discussion, and planning"
metadata:
  originalName: "Skill: Whiteboard description"
  ccVersion: "2.1.246"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-whiteboard-description.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-whiteboard-description.md"
---

Create a whiteboard artifact - a shared sketch canvas for wireframe-fidelity diagrams (boxes, databases, decision diamonds, sticky notes, arrows, freehand pen, text) that you and the user both draw on. The user sketches and hits Publish; this session is woken, reads the board (scene data plus a picture of it), and answers by drawing back on the same canvas - or plans from what they drew. Use when the user asks for a whiteboard, wants to sketch a design or diagram to talk through, or wants to draw something and have you answer on the canvas or plan from it. Only for CREATING a new whiteboard; an existing one is read and answered through its published artifact.
