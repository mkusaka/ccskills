---
name: "design-sync-storybook-source-shape"
description: "Shape-specific /design-sync instructions for syncing a React design system from Storybook output, including build steps, converter configuration, validation fixes, and DesignSync upload"
metadata:
  originalName: "Skill: /design-sync Storybook source shape"
  ccVersion: "2.1.163"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-design-sync-storybook-source-shape.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-design-sync-storybook-source-shape.md"
---

# Storybook source shape

`.storybook/` found — the repo's own Storybook is the preview source. The converter ships `storybook-static/` as `_sb/` and each preview card is an iframe grid of `_sb/iframe.html?id=<storyId>`, so whatever renders in their Storybook renders here verbatim (their builder's CSS, addons, and providers apply as-is).

Requires React 18+.

## 2. Build, then run the converter

1. **Build the DS package.** The converter bundles `dist/` into `window.<Global>`. Run `<pm> run build` (or `turbo run build --filter=<pkg>`, `pnpm -F <pkg> build`, `nx build <pkg>` in a monorepo). If `package.json` `module`/`exports['.']` points at TS source, find the actual built entry and pass it via `--entry`.
2. **Build Storybook directly into `ds-bundle/_sb/`.** `npx storybook build -o ds-bundle/_sb` (or `npm run build-storybook -- -o ds-bundle/_sb`). Check `ds-bundle/_sb/iframe.html` exists and is >10KB — `index.json` alone can exist with a failed build. Building straight into `_sb/` means no copy step; the converter strips `.map`/manager files in-place.
3. **Write `design-sync.config.json`** — only `pkg` and `globalName` required. Commit it.

   | Field | Value |
   |---|---|
   | `pkg` / `globalName` | package name and the `window.*` global — required |
   | `buildCmd` | the DS build command — Claude re-runs this before the converter on re-sync |
   | `entry` | explicit dist entry if `package.json` doesn't point at it |
   | `extraEntries` | package names/subpaths to merge into `window.<Global>` (icon package, `<pkg>/experimental`, etc.) |
   | `titleMap` | `{title: ExportName}` when story titles don't match export names |
   | `docsDir` / `docsMap` / `guidelinesGlob` | per-component docs + design guidelines |
   | `extraFonts` | `@font-face` css or `.woff2` files when `[FONT_MISSING]` fires |
   | `replaces` | extends the adherence-config raw-element map |
   | `notes` | path to a notes file — default `./.design-sync/NOTES.md` |

4. **Run the converter.** Stage `lib/` + `storybook/`, install deps (use the repo's own package manager if `npm i --no-save` fails on `workspace:` protocol), then:

```bash
cp -r "<skill-base-dir>"/lib "<skill-base-dir>"/storybook .
npm i --no-save esbuild ts-morph @types/react playwright && npx playwright install chromium
node storybook/build.mjs --config design-sync.config.json --node-modules ./node_modules \
  --pkg-dir . --out ./ds-bundle
node storybook/validate.mjs ./ds-bundle
```

Run build and validate synchronously (foreground) and check each exit code. If chromium install fails, run `npx playwright install-deps chromium` first.

## 3. Self-heal loop

| Tag | Symptom | Fix |
|---|---|---|
| `[SB_MISSING]` | no `iframe.html` / `index.json` | Run `build-storybook`. Check PIPESTATUS — the build can exit 0 with a broken output. |
| `[NO_DIST]` / `[CONFIG] can't find <pkg>/package.json` | package not built or not found | Run the DS build; pass `--pkg-dir` / `--entry`. |
| `[ZERO_MATCH]` | no story titles matched an export | Check `titleMap` — titles should resolve to export names. |
| `[TITLE_UNMAPPED]` | N titles didn't match | Add `cfg.titleMap` entries. |
| `[BUNDLE_EXPORT]` | N components aren't functions on `window.<Global>` | Check `extraEntries` for subpath exports; check the dist entry is the full build. |
| `[BUNDLE_MOUNT]` | first component threw on mount | Usually the provider needs a required prop (theme, locale, etc.). Set `cfg.provider` with props: `{"component": "<Provider>", "props": {"theme": {...}}}`. For a chain, nest via `"inner": {...}`. |
| `[BUNDLE_STYLE]` | rendered but no styling reached the element | For CSS-in-JS DSes this usually means the provider wrapper isn't passing a theme — set `cfg.provider` with the theme prop the DS expects. Otherwise check `styles.css` has `@import './_ds_bundle.css'` + the storybook-static CSS concat. |
| `[NO_CHROMIUM]` | playwright not installed | Degraded — `.prompt.md` has no argTypes table and provider isn't auto-detected. Set `cfg.provider` manually if the DS needs one. |
| `[TOKENS_MISSING]` | `styles.css` has no custom properties | Informational — CSS-in-JS DSes may have none. |
| `[IFRAME_LOAD]` | first preview iframe didn't render | `_sb/iframe.html` failed to load a story. Open it in a browser; check for missing `_sb/` assets the strip dropped. |
| `[SB_SIZE]` | `_sb/` >50MB | Consider excluding dev/playground/kitchen-sink stories from the storybook config's `stories` glob. |
| `[PROVIDER_DETECTED]` | `<Chain>` | Informational — written to config + README so the design agent wraps output the same way. |

## 4. Upload

`DesignSync(finalize_plan)` with `localDir: "./ds-bundle"`, `writes: ["components/**", "_sb/**", "_vendor/**", "guidelines/**", "fonts/**", "_ds_bundle.js", "_ds_bundle.css", "styles.css", "README.md", "_ds_needs_recompile"]`, `deletes: []`. Dot-prefixed entries stay local.

When done, tell the user: the project URL, component count, `_sb/` size, and that validate exited clean. Commit `design-sync.config.json` and `.design-sync/NOTES.md`.

## What this is not

Not an LLM rewriting components. The previews are the repo's own Storybook verbatim; the bundle is their compiled `dist/`.
