import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";

import {
  buildSkillDocument,
  extractPromptMetadata,
  matchesSelection,
  normalizePromptToSkill,
  parseArgs,
  parseSource,
  promptFileToSkillSlug,
  resolveLocalSourceDir
} from "../src/sync-piebald-skills.ts";

test("parseArgs supports source, selection, output dir, and dry-run", () => {
  const parsed = parseArgs([
    "Piebald-AI/claude-code-system-prompts",
    "--selection",
    "skill-related",
    "--output-dir",
    "tmp-skills",
    "--dry-run"
  ]);

  assert.deepEqual(parsed, {
    source: "Piebald-AI/claude-code-system-prompts",
    outputDir: "tmp-skills",
    selection: "skill-related",
    dryRun: true
  });
});

test("parseSource handles GitHub tree URLs", () => {
  const parsed = parseSource(
    "https://github.com/Piebald-AI/claude-code-system-prompts/tree/main/system-prompts"
  );

  assert.deepEqual(parsed, {
    type: "github",
    owner: "Piebald-AI",
    repo: "claude-code-system-prompts",
    ref: "main",
    subpath: "system-prompts"
  });
});

test("parseSource handles local paths", () => {
  const parsed = parseSource("./fixtures");
  assert.equal(parsed.type, "local");
  assert.ok(parsed.rootPath.endsWith(path.join("ccskills", "fixtures")));
});

test("matchesSelection differentiates builtin and related skill prompts", () => {
  assert.equal(matchesSelection("skill-debugging.md", "builtin-skills"), true);
  assert.equal(matchesSelection("system-prompt-skillify-current-session.md", "builtin-skills"), false);
  assert.equal(matchesSelection("system-prompt-skillify-current-session.md", "skill-related"), true);
  assert.equal(matchesSelection("README.md", "skill-related"), false);
});

test("promptFileToSkillSlug drops only the leading skill- prefix", () => {
  assert.equal(promptFileToSkillSlug("skill-debugging.md"), "debugging");
  assert.equal(promptFileToSkillSlug("tool-description-skill.md"), "tool-description-skill");
});

test("extractPromptMetadata parses the HTML comment block and body", () => {
  const prompt = `<!--
name: 'Skill: Debugging'
description: Instructions for debugging an issue
ccVersion: 2.1.71
variables:
  - DEBUG_LOG_PATH
-->
# Debug Skill
Use the logs.`;

  const extracted = extractPromptMetadata(prompt);

  assert.deepEqual(extracted.metadata, {
    name: "Skill: Debugging",
    description: "Instructions for debugging an issue",
    ccVersion: "2.1.71",
    variables: ["DEBUG_LOG_PATH"]
  });
  assert.equal(extracted.body, "# Debug Skill\nUse the logs.");
});

test("normalizePromptToSkill keeps source metadata and uses the filename slug", () => {
  const normalized = normalizePromptToSkill(
    {
      filename: "skill-debugging.md",
      relativePath: "system-prompts/skill-debugging.md",
      sourceUrl: "https://example.com/debugging",
      content: `<!--
name: 'Skill: Debugging'
description: Instructions for debugging an issue
ccVersion: 2.1.71
variables:
  - DEBUG_LOG_PATH
-->
# Debug Skill`
    },
    {
      owner: "Piebald-AI",
      repo: "claude-code-system-prompts",
      ref: "main"
    }
  );

  assert.equal(normalized.slug, "debugging");
  assert.equal(normalized.originalName, "Skill: Debugging");
  assert.deepEqual(normalized.variables, ["DEBUG_LOG_PATH"]);
  assert.equal(normalized.source.path, "system-prompts/skill-debugging.md");
});

test("buildSkillDocument renders frontmatter that npx skills add can consume", () => {
  const document = buildSkillDocument({
    slug: "debugging",
    description: "Instructions for debugging an issue",
    originalName: "Skill: Debugging",
    ccVersion: "2.1.71",
    sourceUrl: "https://example.com/debugging",
    source: {
      owner: "Piebald-AI",
      repo: "claude-code-system-prompts",
      ref: "main",
      path: "system-prompts/skill-debugging.md"
    },
    variables: ["DEBUG_LOG_PATH"],
    body: "# Debug Skill\nUse the logs."
  });

  assert.match(document, /^---\nname: "debugging"\ndescription: "Instructions for debugging an issue"/);
  assert.match(document, /metadata:\n  originalName: "Skill: Debugging"/);
  assert.match(document, /\n---\n\n# Debug Skill\nUse the logs\.$/);
});

test("resolveLocalSourceDir prefers system-prompts when the repo root is passed", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ccskills-local-"));
  const sourceRoot = path.join(tempRoot, "claude-code-system-prompts");
  const systemPromptsDir = path.join(sourceRoot, "system-prompts");

  await mkdir(systemPromptsDir, { recursive: true });
  await writeFile(path.join(sourceRoot, "README.md"), "# temp\n", "utf8");
  await writeFile(path.join(systemPromptsDir, "skill-debugging.md"), "test", "utf8");

  const resolved = await resolveLocalSourceDir(sourceRoot, "builtin-skills");
  assert.equal(resolved, systemPromptsDir);
});
