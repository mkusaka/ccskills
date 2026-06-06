---
name: "design-sync-slash-command"
description: "Skill definition for syncing a React design system to claude.ai/design, including project selection, source-shape detection, converter configuration, validation, upload planning, and self-check behavior"
metadata:
  originalName: "Skill: /design-sync slash command"
  ccVersion: "2.1.166"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-design-sync-slash-command.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-design-sync-slash-command.md"
---

---
name: design-sync
description: Push a React design system to claude.ai/design. This runs a converter that bundles the real component code (from Storybook or a bare package) and uploads it. Use when the user runs /design-sync or says "sync my design system to Claude Design".
---

# Sync a design system to claude.ai/design

You have a `DesignSync` tool that reads and writes the user's claude.ai/design projects. This skill turns a React design-system repo into the format claude.ai/design consumes, then uploads it.

**The goal — what a design-system project looks like on claude.ai/design:**
- One `_ds_bundle.js` at the project root that assigns every component to `window.<globalName>.*`, so the design agent can build with the real code.
- One `styles.css` that `@import`s the tokens, component CSS, and fonts.
- Per component, `components/<group>/<Name>/`: a `<Name>.d.ts` whose `<Name>Props` interface is the component's API contract, a `<Name>.prompt.md` with usage examples, and a `<Name>.html` preview card.

The converter builds all of that deterministically from the repo's own `dist/`. Storybook is the happy path (richest previews); any built npm package also works. **Core principle: ship what the customer already built** — the bundle is their compiled `dist/`, not a reimplementation.

## 1. Pick the target project

If `DesignSync` isn't already in your tool list, load it via `ToolSearch(query: "select:DesignSync")` first. Then call `DesignSync(list_projects)`. One or several results → `AskUserQuestion` listing each, plus a final "Create a new project called '<name>'" option (name from the package/design-system); if they pick it, `DesignSync(create_project)`. None → offer `create_project` directly. If the user gave a UUID, `DesignSync(get_project)` and check `type` is `PROJECT_TYPE_DESIGN_SYSTEM`.

## 2. Explore, then write config

The workflow is **explore the repo → write `design-sync.config.json` → run the converter deterministically from it**. The converter's discovery is heuristic-based; each heuristic has a config override (`grep ASSUMPTION lib/*.mjs` lists them) so repos that don't match the defaults write config, not code. Edit `lib/*.mjs` only as a last resort (§Troubleshooting).

**State from prior runs.** If `design-sync.config.json` or `.design-sync/NOTES.md` already exist, Read both first and honor what's there — they hold corrections from earlier syncs. **Whenever the user tells you about an issue mid-run** (a path, a build flag, a component to skip, a package-manager quirk), persist it immediately so the next sync doesn't need telling again: a value that maps to a `cfg.*` field goes into `design-sync.config.json`; anything else goes as a bullet in `.design-sync/NOTES.md`. Both get committed at the end (the sub-skill says when).

1. **Faithful install with the repo's own package manager.** Use the repo's pinned node version (`.nvmrc` / `engines.node`), then detect via lockfile: `yarn.lock` → `yarn install --immutable`; `pnpm-lock.yaml` → `pnpm i --frozen-lockfile`; `bun.lockb`/`bun.lock` → `bun install --frozen-lockfile`; `package-lock.json` → `npm ci`.
2. **Determine the source shape.** If `design-sync.config.json` already exists and has a `"shape"` field, use that. Otherwise `Glob` for `**/.storybook/main.*` and `**/storybook/main.*` (some repos drop the dot; exclude `node_modules`) — monorepo DSes keep it in a subpackage, so never assume it's at repo root:
   - Any match → `shape = 'storybook'`. The match's grandparent is the package to run from. Found several → `AskUserQuestion` which one is the design system's; that dir becomes `storybookConfigDir`. **Do not fall back to package just because `.storybook` isn't at repo root.**
   - Found `*.stories.*` files but no `.storybook/` dir in the target → `AskUserQuestion`: "Found story files but no `.storybook/` here — is there a Storybook config elsewhere in this repo (e.g. `apps/storybook/.storybook` in a monorepo)?" If they point at one → `shape = 'storybook'`, record that path as `storybookConfigDir`. If they say no → `shape = 'package'`.
   - No `.storybook/` and no `*.stories.*` → `AskUserQuestion` whether a Storybook exists at all. If they point at one, record it as `storybookConfigDir` and `shape = 'storybook'`. If no, `shape = 'package'`.

Then `Read` `<skill-base-dir>/storybook/SKILL.md` or `<skill-base-dir>/non-storybook/SKILL.md` and follow it from there — each is self-contained. Record `"shape"` (and `"storybookConfigDir"` when set) in `design-sync.config.json` when you write it so re-sync skips detection. The converter scripts live at `<skill-base-dir>/lib/` (shared) and `<skill-base-dir>/storybook/` (storybook-shape entry points); the package shape's entry is `<skill-base-dir>/package-build.mjs`.
