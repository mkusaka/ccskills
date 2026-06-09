---
name: "design-sync"
description: "Skill for syncing a React design system to claude.ai/design by building, verifying, and uploading real component artifacts"
metadata:
  originalName: "Skill: Design sync"
  ccVersion: "2.1.169"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-design-sync.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-design-sync.md"
---

---
name: design-sync
description: Push a React design system to claude.ai/design. This runs a converter that bundles the real component code (from Storybook or a bare package) and uploads it. Use when the user runs /design-sync or says "sync my design system to Claude Design".
---

# Sync a design system to claude.ai/design

## What this is for

**Claude Design** (claude.ai/design) is Claude's design tool: users prompt a design agent and it builds working UI — screens, flows, prototypes — rendered live in the browser from real React code. Out of the box it designs with generic components. This skill changes that: it converts the user's design-system repo into the format Claude Design consumes and uploads it, so from then on **the design agent builds with the customer's actual components** — every design it produces is on-brand, made of their real parts, and maps 1:1 onto code their engineers can ship.

That framing should drive every judgment call in this skill, because each uploaded artifact is an input to that agent (or to the humans steering it):

| Uploaded artifact | Consumed by | For |
|---|---|---|
| `_ds_bundle.js` + `_vendor/` | the design agent's runtime | every design it produces renders these real compiled components from `window.<globalName>.*` |
| `styles.css`, `fonts/`, `tokens/`, `_ds_bundle.css` | every rendered design | the look — tokens, fonts, and component styles, all reachable from `styles.css`'s `@import` closure (designs receive only that closure) |
| `<Name>.d.ts` (`<Name>Props`) | the design agent | the API contract it codes against |
| `<Name>.prompt.md` | the design agent | its usage reference — how to compose the component, with examples |
| `<Name>.html` preview card | humans in the component picker | how they find components and trust the sync |
| `_ds_sync.json` | future syncs | the sync anchor — content hashes that let a re-sync (any machine) skip re-verifying unchanged components AND compute exactly what to upload/delete |

This is why fidelity is the whole game: a component that renders wrong here renders wrong in **every design the agent ever builds with it**, and a wrong `.d.ts` or misleading `.prompt.md` makes the agent misuse the API everywhere. The verification loops in the sub-skills exist because of this — they are not bureaucracy.

The converter builds all of the above deterministically from the repo's own `dist/`. With a Storybook, previews come from the repo's stories and are verified against its own storybook render (kept as a local reference, never uploaded). Without one, every component still ships fully functional, and rich previews are authored from the repo's own usage examples for the components the user scopes in, graded on an absolute rubric. **Core principle: ship what the customer already built** — the bundle is their compiled `dist/`, never a reimplementation.

You have a `DesignSync` tool that reads and writes the user's claude.ai/design projects.

## 0. First sync? Set expectations before any work

Check for `design-sync.config.json`. If it exists, this is a re-sync — skip this section (§2 covers honoring prior state). If it's absent, tell the user up front, before doing anything else:

- No configuration from a previous sync was found — this is a first-time import.
- This skill attempts a **high-fidelity** import of their design system: by default that means iterating on the build and visually verifying the quality of every component preview, which can take **up to a few hours** on a large repo.
- They can interrupt at any time — a message mid-run to check progress or redirect the effort is welcome and won't break anything.
- **The final upload will ask for their approval** — if they step away, the finished sync waits at that prompt until they return, so they should plan to check back near the end (or watch for the notification).
- The run records config and notes as it goes, so future syncs are faster and mostly deterministic.

Then confirm they want to proceed — this process can use a significant number of tokens (`AskUserQuestion`: proceed with the full high-fidelity sync, or adjust scope first). If their request already acknowledged the time/cost, note that and continue without re-asking.

## 1. Pick the target project

If `DesignSync` isn't already in your tool list, load it via `ToolSearch(query: "select:DesignSync")` first. **If `design-sync.config.json` has a `projectId`, that's the target** — `DesignSync(get_project)` to confirm it still exists and is `PROJECT_TYPE_DESIGN_SYSTEM`, mention which project you're syncing to, and only re-ask if it's gone or the user redirects. No pinned project → call `DesignSync(list_projects)`. One or several results → `AskUserQuestion` listing each, plus a final "Create a new project called '<name>'" option — propose a name that does NOT collide with any existing project in the list (a duplicate gets rejected and costs a round-trip), and only call `DesignSync(create_project)` AFTER the user has confirmed the name through that question (the call itself raises a permission prompt; on an unattended/bridge session an unconfirmed creation can stall the whole run). None → offer `create_project` directly. If the user gave a UUID, `DesignSync(get_project)` and check `type` is `PROJECT_TYPE_DESIGN_SYSTEM`.

## 2. Explore, then write config

The workflow is **explore the repo → write `design-sync.config.json` → run the converter deterministically from it**. The converter's discovery is heuristic-based; each heuristic has a config override (after the sub-skill stages the scripts: `grep -r ASSUMPTION .ds-sync/*.mjs .ds-sync/lib/*.mjs` lists them) so repos that don't match the defaults write config, not code. Edit `lib/*.mjs` only as a last resort (see the sub-skill's escape-hatch section: storybook §5, package §Troubleshooting).

**The upload format is the contract; the converter is the deterministic path to it, not the only path.** What the app consumes is fully specified by the output layout (`_ds_bundle.js` + `@ds-bundle` header, `styles.css`, `components/<group>/<Name>/{.html,.jsx,.d.ts,.prompt.md}` with the `@dsCard` first line, `_preview/`, `_vendor/`, `fonts/`, `_ds_sync.json` — see the sub-skill's layout and upload sections). An off-script layout should also produce `_ds_sync.json` when it can (package shape: `lib/sync-hashes.mjs` gives `styleShaFor`/`renderHashFor`; the envelope is `{shape, styleSha, renderHashes, sourceHashes, auxSha, bundleSha12}` — see the sidecar block in `package-build.mjs`; `sourceHashes` itself comes from `stampHeader` in `lib/bundle.mjs`). The storybook shape's recipe needs story facts an off-script generator may not have — omitting the sidecar is then the honest choice: the next sync simply has no anchor and re-verifies everything, which is correct. One invariant that's easy to miss when producing the layout by hand: rendered designs receive only `styles.css`'s transitive `@import` closure, so any real component CSS (`_ds_bundle.css`) must be `@import`ed from `styles.css` — a card linking it directly proves nothing about designs. For a repo genuinely outside the converter's envelope (non-esbuild-bundlable builds, exotic toolchains), produce that layout by whatever means the repo allows — but the gates don't move: `package-validate.mjs` must exit clean, and every story must be graded before upload — from true screenshot pairs in the storybook shape, on the absolute rubric in the package shape. Off-script generation is legitimate; off-script *verification* is not.

**State from prior runs.** If `design-sync.config.json` or `.design-sync/NOTES.md` already exist, Read both first and honor what's there — they hold corrections from earlier syncs. **Whenever the user tells you about an issue mid-run** (a path, a build flag, a component to skip, a package-manager quirk), persist it immediately so the next sync doesn't need telling again: a value that maps to a `cfg.*` field goes into `design-sync.config.json`; anything else goes as a bullet in `.design-sync/NOTES.md`. Both get committed at the end (the sub-skill says when).

1. **Faithful install with the repo's own package manager.** Use the repo's pinned node version (`.nvmrc` / `engines.node`), then detect via lockfile: `yarn.lock` → `yarn install --immutable`; `pnpm-lock.yaml` → `pnpm i --frozen-lockfile`; `bun.lockb`/`bun.lock` → `bun install --frozen-lockfile`; `package-lock.json` → `npm ci`.
2. **Determine the source shape.** If `design-sync.config.json` already exists and has a `"shape"` field, use that. Otherwise `Glob` for `**/.storybook/main.*` and `**/storybook/main.*` (some repos drop the dot; exclude `node_modules`) — monorepo DSes keep it in a subpackage, so never assume it's at repo root:
   - Any match → `shape = 'storybook'`. The match's grandparent is the package to run from. Found several → `AskUserQuestion` which one is the design system's; that dir becomes `storybookConfigDir`. **Do not fall back to package just because `.storybook` isn't at repo root.**
   - Found `*.stories.*` files but no `.storybook/` dir in the target → `AskUserQuestion`: "Found story files but no `.storybook/` here — is there a Storybook config elsewhere in this repo (e.g. `apps/storybook/.storybook` in a monorepo)?" If they point at one → `shape = 'storybook'`, record that path as `storybookConfigDir`. If they say no → `shape = 'package'`.
   - No `.storybook/` and no `*.stories.*` → `AskUserQuestion` whether a Storybook exists at all. If they point at one, record it as `storybookConfigDir` and `shape = 'storybook'`. If no, `shape = 'package'`.

Then `Read` `<skill-base-dir>/storybook/SKILL.md` or `<skill-base-dir>/non-storybook/SKILL.md` and follow it from there (the storybook one points back into the package one's shared tables where they overlap). Record `"shape"` (and `"storybookConfigDir"` when set) in `design-sync.config.json` when you write it so re-sync skips detection. Both shapes run `<skill-base-dir>/package-build.mjs` as the converter entry; shared adapters live at `<skill-base-dir>/lib/`, and `<skill-base-dir>/storybook/` holds the storybook-only harness (`compare.mjs` — preview-vs-storybook matching; `probe.mjs` — provider inference fallback).
