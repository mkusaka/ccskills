---
name: "design-sync-storybook-source-shape"
description: "Shape-specific /design-sync instructions for syncing a React design system from Storybook output, including build steps, converter configuration, validation fixes, and DesignSync upload"
metadata:
  originalName: "Skill: /design-sync Storybook source shape"
  ccVersion: "2.1.166"
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

1. **Build the DS package *and its workspace dependencies*.** The converter bundles `dist/` into `window.<Global>`. Run `<pm> run build`; in a monorepo use `turbo run build --filter=<pkg>` or `pnpm -F "<pkg>..." build` (the trailing `...` is required — bare `-F <pkg>` skips dependencies and you'll see `Cannot find module '@scope/tokens'`). If `package.json` `module`/`exports['.']` points at TS source, find the actual built entry and pass it via `--entry`. **Do this before step 2** — storybook often imports sibling packages from their built `dist/`, so building storybook first fails with `Failed to resolve entry for <pkg>`.
2. **Build Storybook directly into `ds-bundle/_sb/`.** Run `npx storybook build -c <storybookConfigDir> -o ds-bundle/_sb` — **not** the repo's `npm run build-storybook` script (that writes to `./storybook-static/` or wherever the script's own `-o` points, and the converter then exits with `[SB_MISSING]`). If you've already built to `./storybook-static/`, either `cp -r storybook-static ds-bundle/_sb` or pass `--storybook-static storybook-static` to the converter. Check `ds-bundle/_sb/iframe.html` exists and is >10KB — `index.json` alone can exist with a failed build.
3. **Write `design-sync.config.json`** — only `pkg` and `globalName` required. **If it already exists, read it first and keep what's there — add or update fields, but don't drop prior entries unless you've confirmed they're stale.** Also Read `.design-sync/NOTES.md` (or whatever `cfg.notes` points at) — it holds repo-specific gotchas a prior sync recorded. Commit both.

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

   **`.design-sync/NOTES.md`** is where repo-specific quirks live that don't map to a config field. **Append a bullet whenever the user tells you about an issue or you learn something during the self-heal loop**, so the next sync picks it up.

4. **Run the converter.** Stage the scripts into `.ds-sync/` (NOT the repo root — some repos have their own `storybook/` dir that would collide). Install converter deps isolated in `.ds-sync/node_modules` so the repo's lockfile and package manager are untouched:

```bash
mkdir -p .ds-sync && cp -r "<skill-base-dir>"/lib "<skill-base-dir>"/storybook .ds-sync/
echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json
(cd .ds-sync && npm i esbuild ts-morph @types/react playwright && npx playwright install chromium)
node .ds-sync/storybook/build.mjs --config design-sync.config.json --node-modules <pkg-node-modules> \
  --pkg-dir <pkg-dir> --out ./ds-bundle
node .ds-sync/storybook/validate.mjs ./ds-bundle
```

In a monorepo, point `--node-modules` at the DS package's own `node_modules` (where its `react` resolves), and `--pkg-dir` at the package dir — not the repo root. If all deps are already hoisted at repo root (`ls node_modules/{esbuild,ts-morph,playwright}` all exist), you can `ln -sfn "$(pwd)/node_modules" .ds-sync/node_modules` instead of the isolated `npm i`.

Run build and validate synchronously (foreground) and check each exit code. If chromium install fails, run `npx playwright install-deps chromium` first; if the environment can't install chromium, set `DS_CHROMIUM_PATH=<path-to-system-chromium>`.

## 3. Self-heal loop

| Tag | Symptom | Fix |
|---|---|---|
| `[SB_MISSING]` | no `iframe.html` / `index.json` in `ds-bundle/_sb/` | Run `npx storybook build -c <dir> -o ds-bundle/_sb` (NOT `npm run build-storybook` — wrong output dir). Or, if `./storybook-static/` already exists, re-run the converter with `--storybook-static ./storybook-static`. Check PIPESTATUS — the build can exit 0 with a broken output. |
| `[NO_DIST]` / `[CONFIG] can't find <pkg>/package.json` | package not built or not found | Run the DS build. In the DS's own source repo, `--pkg-dir` usually needs to point at the built output (e.g. `./dist`) where `package.json` + `.d.ts` have the published layout, with `--entry ./dist/<esm-entry>`. |
| `[BUILD_OOM]` / `JavaScript heap out of memory` | large monorepo or many type files | Retry with `NODE_OPTIONS=--max-old-space-size=8192 node .ds-sync/storybook/build.mjs …`. |
| `[ZERO_MATCH]` | no story titles matched an export | Check `titleMap` — titles should resolve to export names. |
| `[TITLE_UNMAPPED]` | N titles didn't match | Add `cfg.titleMap` entries. |
| `[BUNDLE_EXPORT]` | N components aren't functions on `window.<Global>` | Check `extraEntries` for subpath exports; check the dist entry is the full build. |
| `[SCHEDULER_MISSING]` | DS `dist/` imports `scheduler` directly | Usually means `react-dom` leaked into the DS's compiled dist (it should be a peer dep). Check the DS build's `external` config. |
| `[PNPM_SELF_PROVISION]` | `packageManager: pnpm@X` tries to auto-install and fails | Corepack: set `COREPACK_ENABLE_STRICT=0` (use system pnpm). npm's own provisioning: `npm_config_manage_package_manager_versions=false`. Retry. |
| `[FONT_MISSING]` | `<family>` referenced in styles.css but no `@font-face` ships it | Check `.storybook/preview-head.html` for a `<link>` to a font CDN (host-provided). Either accept system-font substitutes, or add via `cfg.extraFonts: [".../X.css"]` (a `@font-face` stylesheet) or a `.woff2` path + a matching `@font-face` in a separate extraFonts `.css`. |
| `[BUNDLE_MOUNT]` | first component threw on mount | Usually the provider needs a required prop (theme, locale, etc.). Set `cfg.provider` with props: `{"component": "<Provider>", "props": {"theme": {...}}}`. For a chain, nest via `"inner": {...}`. |
| `[BUNDLE_STYLE]` | rendered but no styling reached the element | For CSS-in-JS DSes this usually means the provider wrapper isn't passing a theme — set `cfg.provider` with the theme prop the DS expects. Otherwise check `styles.css` has `@import './_ds_bundle.css'` + the storybook-static CSS concat. |
| `[NO_CHROMIUM]` | playwright not installed | Degraded — `.prompt.md` has no argTypes table and provider isn't auto-detected. Set `cfg.provider` manually if the DS needs one. |
| `[TOKENS_MISSING]` | `styles.css` has no custom properties | Informational — CSS-in-JS DSes may have none. |
| `[IFRAME_LOAD]` | first preview iframe didn't render | `_sb/iframe.html` failed to load a story. Open it in a browser; check for missing `_sb/` assets the strip dropped. |
| `[SB_SIZE]` | `_sb/` >50MB | Consider excluding dev/playground/kitchen-sink stories from the storybook config's `stories` glob. |
| `[PROVIDER_DETECTED]` | `<Chain>` | Informational — written to config + README so the design agent wraps output the same way. |

## 4. Upload

`DesignSync(finalize_plan)` with `localDir: "./ds-bundle"`, `writes: ["components/**", "_sb/**", "_vendor/**", "guidelines/**", "fonts/**", "_ds_bundle.js", "_ds_bundle.css", "styles.css", "README.md", "_ds_needs_recompile"]`, `deletes: []`. Dot-prefixed entries stay local.

As the **first** write after plan approval, `DesignSync(write_files, [{path: "_ds_needs_recompile", localPath: "_ds_needs_recompile"}])` — build.mjs writes this file (`{"by":"design-sync-cli"}`); uploading it first fences the app's manifest/copy machinery against a half-uploaded state. Then upload everything else (chunked into ≤256-file `write_files` calls under the same `planId`). After all other uploads complete, write the sentinel **again** to re-arm the recompile in case the project was opened mid-sync.

When done, tell the user: the project URL, component count, `_sb/` size, and that validate exited clean. Commit `design-sync.config.json` and `.design-sync/NOTES.md`.

## What this is not

Not an LLM rewriting components. The previews are the repo's own Storybook verbatim; the bundle is their compiled `dist/`.
