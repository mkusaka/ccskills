---
name: "design-sync-package-source-shape"
description: "Shape-specific /design-sync instructions for syncing a React design system from a built package without Storybook"
metadata:
  originalName: "Skill: /design-sync package source shape"
  ccVersion: "2.1.162"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-design-sync-package-source-shape.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-design-sync-package-source-shape.md"
---

# Package source shape

No Storybook — the component list comes from the package's shipped `.d.ts` exports. Previews are generated from the `.d.ts` prop types plus `cfg.previewArgs`.

## 2. Explore, then write config (continued)

3. The converter needs the built `dist/` entry + its `.d.ts` tree. Check whether the entry (from `package.json` `module`/`main`/`exports['.']`) already exists — install may have built it via `prepare`. If missing:
   - Run `<pm> run build`. No `build` script → try `prepare`/`prepack`. In a monorepo, the build may be at the repo root (`turbo build --filter=<pkg>`, `pnpm -F <pkg> build`, `nx build <pkg>`). **Some build scripts fork a watcher and exit 0 early — after the command returns, `ls` the expected output (dist/, build/esm/, or whatever `package.json` `module`/`main` points at) and confirm it's populated before continuing.** If it's empty, check for a `--watch` flag in the script and use the one-shot variant, or poll the output dir.
   - Still missing → `AskUserQuestion`("What command builds this package?", options = any `scripts.*` containing `tsc|tsup|rollup|vite build|esbuild|swc`, plus freeform). Record the answer as `buildCmd` in the config.
   - User says there's no build → the converter will synthesize an entry from `src/` (last resort — `.d.ts` contracts will be weaker; recommend adding a build).
4. **Check what's already in the project.** `DesignSync(list_files)` on the target. If it returns files, read `_ds_bundle.js` via `DesignSync(get_file)` and note the component names from its first-line `/* @ds-bundle: {…} */` header — but **always still rebuild** (step 7); the existing bundle is stale the moment source changes. The header's `sourceHashes` diff decides what to *upload* incrementally via `DesignSync`, not what to build.
5. **Confirm the plan with the user before building.** `AskUserQuestion` with: the component list you found (or a count + a few names if it's long), which files the tokens/CSS are coming from, and which build command you'll run. The build can take minutes and burn tokens — aligning now avoids re-running because it was pointed at the wrong package or missed half the components.
   - If the project already has N components (step 4), include that in the question and offer the scope: **(a)** full rebuild + re-upload everything, **(b)** update only the changed components (diff from `sourceHashes`), **(c)** tokens + CSS only (no component rebuild). Default to (b) when the diff is small.
6. **Write `design-sync.config.json` and commit it** — re-sync reuses it so output is reproducible. Only `pkg` and `globalName` are required. **If the file already exists, read it first and preserve `previewArgs`, `dtsPropsFor`, `libOverrides`, and `overrides` — only add to those fields, never replace them.** They accumulate fixes from prior verify-loop iterations. **Also Read `.design-sync/NOTES.md` (or whatever `cfg.notes` points at) before anything else** — it holds repo-specific gotchas a prior sync recorded.

   | Field | Value |
   |---|---|
   | `pkg` / `globalName` | package name and the `window.*` global to assign — required |
   | `shape` | `'storybook'` or `'package'` — pins the source shape (overrides auto-detection). Written on first run. |
   | `buildCmd` | the discovered build command; re-sync re-runs it |
   | `srcDir` | source root when not `src/`/`lib/`/`components/` |
   | `tsconfig` | path to `tsconfig.json` — esbuild reads `compilerOptions.paths` so `@/…` path aliases resolve in synth-entry mode |
   | `extraEntries` | package names to merge into `window.<globalName>` alongside the DS entry (e.g. the DS's separate icon package). Sibling icon packages under the same scope are auto-detected (`[ICON_PKG]`). |
   | `componentSrcMap` | **sparse** `{Name: path}` — non-null pins/adds a component's src path; `null` excludes a `.d.ts`-exported internal |
   | `dtsPropsFor` | `{Name: "prop?: Type; …"}` — hand-written `<Name>Props` body when auto-extraction fails (complex generics, cross-package types) |
   | `previewArgs` | `{Name: {prop: value, …}}` — props rendered as a `Preview` export in the auto-generated `.design-sync/previews/<Name>.tsx`. Use for simple flat props; for composed JSX children edit the `.tsx` directly. |
   | `cssEntry` / `tokensPkg` / `tokensGlob` | stylesheet + token files |
   | `docsDir` | directory (package-relative; may point outside, e.g. `../../apps/docs`) holding per-component `.md`/`.mdx` docs. Auto-detected as `docs/` or `documentation/` under the package. |
   | `docsMap` | sparse `{Name: path \| null}` — explicit doc path per component (overrides discovery); `null` excludes |
   | `guidelinesGlob` | string or string[] (package-relative) of design-guideline `.md` files to copy into `guidelines/`. Default `['docs/guides/**/*.md', 'docs/*.md', 'guides/**/*.md']`. |
   | `extraFonts` | paths (package-relative; may point outside the package, e.g. a sibling typography package) to `@font-face` `.css` files or bare `.woff2`/`.ttf`/`.otf` for brand families the DS expects its host app to provide. CSS entries are parsed and their local font files copied to `fonts/`; bare font files are copied as-is. Use when validate prints `[FONT_MISSING]`. |
   | `runtimeFontPrefixes` | string[] — family-name prefixes for fonts the host app serves at runtime from a font service (via a `<script>` or JS loader, so there's no `@font-face` to ship). Suppresses `[FONT_MISSING]` for matching families. Use when the brand font is never meant to ship with the bundle. |
   | `replaces` | `{<raw-element>: [<ComponentName>, …]}` — extends the adherence-config raw-element map |
   | `libOverrides` | `{"<name>.mjs": "<one-line reason>"}` — declares which `.design-sync/lib/*.mjs` files this repo forks and why (see §Troubleshooting). Cross-checked at build time. |
   | `notes` | path to a markdown notes file — default `"./.design-sync/NOTES.md"`. |

   **`.design-sync/NOTES.md`** is where repo-specific quirks live (workspace build order, flaky stories, odd entry paths, anything a future re-sync should know). Write it as multi-line markdown — one bullet per gotcha. **Append to it whenever you learn something during the verify loop**, and commit it alongside the config.

7. **Run the converter.** For large DSes (200+ components) the ts-morph `.d.ts` parse can take several minutes — `[DTS]` progress lines on stderr show it's working.

```bash
# Converter ships under the skill dir — stage the whole set. If `cp` is
# permission-denied, write via `cat`: `cat "<src>" > ./lib/<name>.mjs`.
cp -r "<skill-base-dir>"/package-build.mjs "<skill-base-dir>"/package-validate.mjs "<skill-base-dir>"/lib .
npm i --no-save esbuild ts-morph @types/react   # see the pnpm note below if this repo uses pnpm
node package-build.mjs --config design-sync.config.json --node-modules ./node_modules \
  --entry ./dist/index.es.js --out ./ds-bundle
node package-validate.mjs ./ds-bundle
```

Run `package-build.mjs` and `package-validate.mjs` as separate commands and check each exit code — a chained `build && validate` in the background exits non-zero with no visible log when the build step fails. **In a headless / `-p` session, run both synchronously** (no `run_in_background`) — there is no task-notification re-invocation in headless mode, so a backgrounded run is never resumed. In an interactive session, backgrounding the build is fine.

In the DS's own repo `node_modules/<pkg>` usually doesn't exist (npm won't self-install), hence `--entry`.

**esbuild/ts-morph on a pnpm repo:** `npm i --no-save esbuild ts-morph` can fail or stay un-hoisted on a pnpm-managed `node_modules` (the converter's imports then won't resolve). If so, install where pnpm can see it (`pnpm add -D esbuild ts-morph @types/react`) or symlink the converter's resolution targets from `$(pnpm root)/.pnpm/`.

`@types/react` is required for prop extraction — without it `React.ComponentPropsWithoutRef<…>` and similar utility types resolve to `any` and the emitted `<Name>.d.ts` loses inherited props (converter prints `[DTS_REACT]`).

If building the monorepo is complex, `npm install <your-pkg>@latest react react-dom` into a scratch dir and pass `--node-modules <scratch>/node_modules` — uses your published dist with flattened deps.

## Source shapes

Two shapes, same output. **storybook** when `.storybook/` is found (component list + story args from `storybook-static/index.json`); **package** otherwise (bundles `dist/`, enriches each component from `src/` — JSDoc and group — when present). Previews render self-contained from `_ds_bundle.js` either way; a component with no story args gets a scaffold.

## What the converter emits

Per component, under `components/<group>/<Name>/`: `<Name>.jsx` (one-line re-export stub), `<Name>.d.ts` (props interface from the shipped types), `<Name>.prompt.md`, and `<Name>.html` (the preview card). You don't write any of these — the converter does.

`<Name>.prompt.md` is the matched per-component doc when one exists (sibling `<Name>.md`/`.mdx` → `cfg.docsDir` lookup → `<Name>.stories.mdx`; frontmatter `category` sets the component's `<group>`). Otherwise it's synthesized from the `.d.ts` props body, the leading JSDoc, and any examples in `.design-sync/previews/<Name>.tsx` — strictly richer than the previous stub. `[DOCS_UNMAPPED]` lists components that didn't match.

`<Name>.html` renders the component from `window.<GLOBAL>.<Name>` via the compiled `.design-sync/previews/<Name>.tsx` (each named export = one labeled cell). When that file's build failed it falls back to the older story-grid / `.d.ts`-scaffold paths. **Structural/compound components that need composed children**: edit `.design-sync/previews/<Name>.tsx` (real JSX, with DS imports) and delete its first-line marker — that's the fix, not "expected blank". Hand-edits to a `.html` are overwritten on rebuild.

**`.design-sync/previews/`**: one `<Name>.tsx` per component, auto-generated each run from the best available source (CSF3 render-fn JSX → story args → `cfg.previewArgs` → `.d.ts` variant grid → namespace stub → default). The first line is `// @ds-preview generated <sha12> — …`; the sha12 is the hash of the body below it. While the marker is present and the hash matches, the file is regenerated; delete the marker to take ownership and the converter leaves it untouched (logs `(preview override: <Name>)`). If you edit the body but leave the marker, the converter warns `(preview edited under marker: <Name>)` and skips — delete line 1 to keep your edit, or delete the file to regenerate. Commit alongside `design-sync.config.json`, `.design-sync/NOTES.md`, and `.design-sync/lib/`.

## 3. Self-heal loop

`package-validate.mjs` emits `[TAG]`-prefixed diagnostics on stderr. For each error: match the tag in this table → apply the fix → rebuild → re-validate. Repeat until it exits 0. A few stories that genuinely can't render statically (interaction-driven, data-fetching) go in `cfg.overrides.<Component>.skip` (inline in `design-sync.config.json`, or `cfg.overrides` can be a path to a separate JSON file).

| Tag | Symptom | Fix |
|---|---|---|
| `[NO_DIST]` | `entry <path> doesn't exist` | The DS package isn't built. Run its build script (`npm run build` / `turbo run build`), or use the published-dist alternative above. |
| `[WORKSPACE_SIBLING]` | `Could not resolve "<sibling>"` during bundle | A workspace sibling package isn't built. Build it (`turbo build`), or `npm install` the published versions into a scratch dir. |
| `[CONFIG]` | `<path>: <json error>` | `design-sync.config.json` is missing or malformed JSON. Fix the syntax. |
| `[ZERO_MATCH]` | no components discovered | No PascalCase `.d.ts` exports and `componentSrcMap` empty. |
| `[OUT_UNSAFE]` | `refusing to rm <path>` | `--out` points at `/`, `$HOME`, cwd, or a non-empty dir that isn't a prior bundle. Point `--out` at an empty directory. |
| `[UNRESOLVED_IMPORT]` | `<pkg> missing from node_modules` | A dependency the DS imports isn't installed. Run the repo's install (step 2.1) or add the package. |
| `[DSCARD_MISSING]` | `<path>: first line isn't a @dsCard comment` | The preview's first line must be `<!-- @dsCard group="…" -->` for the DS pane to register it. Usually a local `lib/emit.mjs` edit dropped the header — restore it, or re-run the converter. |
| `[LINK_HREF_MISSING]` | `<path>: <link href="…"> doesn't resolve` | The preview's stylesheet path doesn't resolve relative to the file (previews ship unstyled). Emit-depth mismatch — re-run the converter; if you hand-edited the preview, fix the `../` depth. |
| `[CSS_IMPORT_MISSING]` | `styles.css @imports "…" which doesn't exist` | A scraped CSS file referenced by `styles.css` isn't on disk. Check `cfg.cssEntry` / `cfg.tokensGlob` point at files that exist, and re-run. |
| `[PROMPT_EMPTY]` | `<path>: first line is empty` | The `.prompt.md` first line is the element-index summary the design agent reads. Re-run the converter; if still empty, the component has no JSDoc — add one to its source. |
| `[RENDER]` | `<path>: root empty` | A `<Name>.html` didn't render in headless chromium. Check `.render-check.json` for `firstErr`; usually a provider/context the component reads that isn't in `cfg.provider`. If it's a data-fetching or interaction-only story, add it to `cfg.overrides.<Component>.skip`. |
| `[RENDER_ERRORS]` | `<path>: <first pageerror>` | Informational — the preview rendered (root non-empty) but threw `pageerror`(s). Usually a provider/context the component reads that isn't in `cfg.provider` (see §Troubleshooting). Non-blocking unless `[RENDER]` also fires. |
| `[RENDER_BLANK]` | `<path>: renders but PNG is <5KB` | The preview renders (no error) but the screenshot is effectively blank — the auto-generated JSX didn't produce visible content. Add `cfg.previewArgs.<Name>` with representative props (see `<Name>.d.ts`); for compound components needing composed children, edit `.design-sync/previews/<Name>.tsx` directly and delete its first-line marker. |
| `[RENDER_THIN]` | `mounted text is just "<Name>"` / `variants render identically` | The preview renders but shows only placeholder text, or every variant looks the same. Same fix as `[RENDER_BLANK]`. |
| `[CSS_PLACEHOLDER]` | `_ds_bundle.css` is an `@import`-only stub | Set `cfg.cssEntry` to the compiled stylesheet (look for the largest `.css` under `dist/` or wherever the package's own docs say to import from). |
| `[TOKENS_MISSING]` | `N CSS custom properties referenced but not defined` | Non-blocking. The component CSS uses `var(--token-*)` but no shipped stylesheet defines them — usually the DS keeps tokens in a sibling package. Set `cfg.tokensPkg` to that package (check the build log for `[TOKENS_PKG]` — same-scope `*tokens*`/`*theme*` deps are auto-detected). If the tokens are injected at runtime by a theme provider rather than a stylesheet, set `cfg.provider` instead. |
| `[CSS_RUNTIME]` | no static CSS found anywhere; wrote a self-styling `styles.css` | Informational, **non-blocking** (`validate` still exits 0). Expected for CSS-in-JS DSes that inject styles at runtime — the bundle is self-styling. Confirm the render check passes. **Only** if the DS actually ships a stylesheet the scrape missed: set `cfg.cssEntry` to it. For anything else global (e.g. a remote webfont), author a small CSS file and point `cfg.cssEntry` at it. |
| `[FONT_MISSING]` | families referenced by the shipped CSS with no shipped `@font-face` | Non-blocking. The DS references brand families (often via font tokens) it expects the host app to provide. Set `cfg.extraFonts` to the `@font-face` css / woff2s (often a sibling typography package) and rebuild, or accept substitutes — the DS pane renders those components with system fonts. |
| `[DOCS_UNMAPPED]` | `<Name>` — no per-component doc file found | Informational. Set `cfg.docsDir` to the docs tree or `cfg.docsMap.<Name>` to the file. Unmatched components get a synthesized `.prompt.md` from the `.d.ts` + previews instead. |
| `[FONT_DANGLING]` | an `@font-face` rule is shipped but its `url()` target file isn't | Non-blocking. The font file wasn't copied into `fonts/` — usually a `! extraFonts:` / `! cssEntry:` skip in the build log. Fix the `cfg.extraFonts` path, or copy the woff2 under the DS package. |
| — | Icons render as empty boxes or are missing | The DS's icon package isn't in the bundle. Check the build log for `[ICON_PKG]` (same-scope icon packages are auto-included); if it didn't fire, add the icon package name to `cfg.extraEntries`. |
| — | Components render but no CSS | Set `cfg.cssEntry` to the package's stylesheet. |
| — | "Missing brand fonts" banner in the DS pane | Same root cause as `[FONT_MISSING]`: the bundle references families it doesn't ship. Wire them via `cfg.extraFonts` if the files are available and licensing allows, or accept substitutes. |
| — | `! extraFonts: <path> resolves outside the workspace root — skipped` | `extraFonts` entries are bounded to `dirname(--node-modules)`. In pnpm-workspace / yarn-nohoist repos where `--node-modules` is the per-package `node_modules`, a sibling typography package falls outside that boundary. Workaround: copy the `@font-face` css + woff2s under the DS package and point `extraFonts` there, or re-run with the repo-root `node_modules` where the package manager allows it. |

## 4. Verify previews render

`package-validate.mjs`'s headless render check (opens every `<Name>.html`, fails on empty root) needs playwright + chromium. **Check for an existing install first** — `ls ~/.cache/ms-playwright/` or `which chromium chromium-headless-shell google-chrome`. If a chromium build is cached, **install the matching playwright version** (the directory name is `chromium-<build>`; `npm view playwright@latest` rarely matches it — instead check the repo's own `package.json`/lockfile for a pinned `playwright`/`@playwright/test` and `npm i -D playwright@<that-version>`). Mismatched playwright↔chromium gives `browserType.launch: Executable doesn't exist`.

**If not found, `AskUserQuestion`** before installing anything:
> "For automated preview verification I'd install playwright + chromium (~200MB). Options: (a) OK to install, (b) Skip — I'll open previews in my own browser, (c) Skip verification entirely."

- **(a) OK** → `npm i -D playwright && npx playwright install chromium`. If install fails (CDN blocked, version mismatch), fall through to (b).
- **(b) I'll open** → `npx serve ds-bundle`, list 5–8 preview paths (a mix of simple, compound, overlay) for the user to open. Ask which looked blank or wrong; add a `cfg.previewArgs.<Name>` entry for each from their description and re-run.
- **(c) Skip entirely** → ship with the smart-scaffold defaults. Note in your final output that previews weren't visually verified.

> **When backgrounding a long-running command** (playwright install, the build, a server): capture its PID with `PID=$!` and poll with `kill -0 "$PID"`. Don't `pgrep -f '<command string>'` — the pgrep invocation itself matches its own argument, so the loop never exits.

With playwright available (existing or installed), **`package-validate.mjs` screenshots every preview** to `ds-bundle/_screenshots/<group>__<Name>.png` and writes per-component status to `ds-bundle/.render-check.json` (`[{name, group, errs, firstErr, pngBytes, blank, rootEmpty, thin, nameOnly, allHollow, collapsed, hasPlaceholder, maxHeight, variantsIdentical, bad, texts}]`). Read `.render-check.json` and:

1. **Sweep.** Read `_screenshots/contact-sheets.json`. If it's missing, the sheet step didn't complete — go to step 2. Otherwise Read every `_screenshots/contact-sheet-N.png` it lists (each tiles ~16 labeled previews); note any tile that looks off — name-only, empty variant labels, visually broken, or a placeholder.
2. **Drill.** For every component that is (a) flagged in `.render-check.json` (`bad`, `thin`, `hasPlaceholder`, or `variantsIdentical` true), (b) looked off in the sweep, or (c) **any** component if step 1 found no json: Read its individual `_screenshots/<group>__<Name>.png` — never judge from a sheet thumbnail, never sample. If it already looks right (a Divider is just a line; an Icon is just a glyph), move on — `thin` is a hint, not a verdict. Otherwise Read `<Name>.d.ts` and either write a `cfg.previewArgs.<Name>` entry (simple flat props) or, for compound components needing composed children or inline fixture data, open `.design-sync/previews/<Name>.tsx`, edit the JSX, and delete its first-line `// @ds-preview generated` marker so the converter keeps your edit. `hasPlaceholder: true` means the generated dashed-box placeholder is what's showing — edit the `.tsx` with real content. `blank: true` (PNG <5KB) usually means the auto-generated JSX synthesized nothing useful; `errs > 0` with a context/provider message → see §Troubleshooting. If the build log shows `(preview: <Name> — N renderSource(s) reference undeclared …)`, the story's JSX closes over story-file-local fixtures — inline that data into the `.tsx`.
   **Choosing `cfg.previewArgs` vs editing the `.tsx`:** `previewArgs` is for flat JSON-serializable props — it surfaces as one extra `Preview` export in the generated `.tsx`. For composed children (`<Tabs><Tab/><Tab/></Tabs>`), fixture data, or anything needing real JSX, edit `.design-sync/previews/<Name>.tsx` directly and delete its marker line; `previewArgs` can't express those. If `firstErr` is a TypeScript error (`Property '…' is missing`, `Type '…' is not assignable`), the fix is in the `.tsx` — the generated JSX has the wrong prop shape.
3. Re-run `package-build.mjs` then `package-validate.mjs`. Only the components whose `.tsx` you edited (marker deleted → kept) or whose `previewArgs` you added change; marker-bearing files are regenerated.
4. Repeat until the `bad` set is empty or 3 iterations.
5. After the final pass, call `DesignSync({method: 'report_validate', counts: {total, bad, thin, variantsIdentical, iterations}})` with the aggregate from `.render-check.json` (`total` = entries; `bad`/`thin`/`variantsIdentical` = count of true; `iterations` = rebuild passes you ran).
6. If validate printed `[FONT_MISSING]`: in an interactive session, `AskUserQuestion` whether to wire the families via `cfg.extraFonts` (and rebuild) or accept system-font substitutes. If headless, note it in your final summary and proceed.

Steps 1–5 are the gate for §5 — don't move on to `finalize_plan`/upload until they're complete.

**Final output to the user**: "N/M previews render cleanly; X fixed via previewArgs; Y still need attention: [names]; reviewed Y/Y flagged previews + S contact sheets." For Y, Read and attach the PNGs so the user can see what's wrong.

Auto-generated previews use the best available source per component (CSF3 render-fn JSX → story args → `cfg.previewArgs` → `.d.ts` variant grid → namespace stub → default). Compound/overlay components may legitimately need `cfg.previewArgs` or a hand-edited `.tsx` — that's expected, not a converter bug.

Also confirm:
- The `components:` count matches what you confirmed with the user in §2. Shortfall → §Troubleshooting (`componentSrcMap`).
- In the browser console on any preview (`npx serve ds-bundle`), `Object.keys(window.<globalName>)` lists every exported component.

## 5. Upload

Only upload after the converter has fully finished and `package-validate.mjs` exits 0 — a mid-run snapshot produces a bundle with dangling references.

Upload at the **DS project root** — the self-check expects `_ds_bundle.js`, `styles.css`, `components/`, `tokens/`, `fonts/`, and `README.md` at the top level.

Create an empty `./ds-bundle/_ds_needs_recompile` (e.g. `touch ds-bundle/_ds_needs_recompile`).

`DesignSync(finalize_plan)` with `localDir: "./ds-bundle"`, `writes: ["components/**", "tokens/**", "fonts/**", "_vendor/**", "_preview/**", "guidelines/**", "_ds_bundle.js", "_ds_bundle.css", "styles.css", "README.md", "_ds_needs_recompile"]` (the converter's output set plus the recompile sentinel), and `deletes: []` (required, even when empty). Dot-prefixed root entries (`.ds-build-meta.json`, `.ds-bundle`, `.pkg-entry.mjs`, `.bundle-entry.mjs`, `.sb-static/`) and `_screenshots/` are build artifacts and stay local. `_vendor/` does upload (the preview cards load React from it). Add `"demo.html"` only when `cfg.demo` is set.

`finalize_plan` shows the user an interactive approval prompt. **If it's denied, stop** — don't retry with different `localDir`/`writes` values; denial means the session can't approve, not that the arguments were wrong. The bundle is already validated at §4; report the `ds-bundle/` path and let the user run the upload interactively.

As the **first** write after plan approval, `DesignSync(write_files, [{path: "_ds_needs_recompile", localPath: "_ds_needs_recompile"}])` — this fences the app's manifest/copy machinery while the upload is in progress, so consumers never see a half-uploaded state. Then `DesignSync(write_files)` for every other file matching the plan, preserving the root-relative paths verbatim. The tool caps at 256 files per call, so list the tree, chunk into ≤256-file batches, and issue multiple `write_files` calls under the same `planId`. After all other uploads complete, write the sentinel again — `DesignSync(write_files, [{path: "_ds_needs_recompile", localPath: "_ds_needs_recompile"}])` — to re-arm the recompile in case the project was opened mid-sync. `DesignSync(list_files)` to confirm the count matches. Each `<Name>.html` carries a first-line `<!-- @dsCard group="…" -->` comment that the claude.ai/design app's self-check reads to register the cards.

When done, tell the user: the project URL (`https://claude.ai/design/p/<projectId>`), the component count, files uploaded, and that `package-validate.mjs` exited clean. **Commit `design-sync.config.json`, `.design-sync/NOTES.md`, and any `.design-sync/lib/` overrides to the repo** so future runs reuse the `previewArgs`/`dtsPropsFor`/`libOverrides` and notes you added during the verify loop.

## 6. Self-check (server-side)

You're done after the upload. The app's self-check fires on project open (the `_ds_needs_recompile` sentinel you wrote triggers it), so the DS pane populates within a few seconds. The self-check reads each `<Name>.d.ts` as the component's API contract (the `<Name>Props` interface is what the design agent sees), reads the `@dsCard` line from each `<Name>.html` to register preview cards, regenerates the adherence config and `ds_manifest` from the uploaded source, and clears the sentinel.

## How it works

Two independent build paths:

**Importable bundle** (root `_ds_bundle.js`): esbuild takes the package's published `dist/` entry → one IIFE assigning every export to `window.<globalName>`, with a first-line `/* @ds-bundle: {…} */` header the app's self-check reads. Its CSS sidecar (`_ds_bundle.css`) plus the scraped tokens/fonts are wired through a root `styles.css` that `@import`s them. This is what the claude.ai/design agent actually imports and builds with. Storybook-independent; works on every DS.

The converter does NOT emit the adherence config, the `ds_manifest`, a version file, or a barrel `index.js` — the app's self-check regenerates those from the uploaded source.

**Scope**: React design systems. Both `_ds_bundle.js` and the previews render via React — a non-React DS has nothing for the claude.ai/design agent to build with.

**To inspect**: `npx serve ds-bundle` and open any `<Name>.html`.

## Troubleshooting

**Previews show "context" or "provider" errors** (e.g. "No <X> context", "use<Hook> must be inside <Provider>") → the DS needs a provider wrapper. Set `cfg.provider` to the DS's top-level provider. For a chain, nest via `inner`:
```json
{"provider": {"component": "ThemeProvider", "props": {"theme": {}}, "inner": {"component": "RouterProvider"}}}
```
Look for exports named `*Provider` or `Theme`, or check the DS's own docs for "wrap your app in". `component` may be a dotted path into a DS export (e.g. `"<ExportedContext>.Provider"`).


**Output missing/wrong components?** `grep ASSUMPTION lib/*.mjs` — each line names the `cfg.*` field that overrides that heuristic. Add the override to `design-sync.config.json` and re-run. `componentSrcMap` covers most cases: `{"Portal": null}` excludes an exported internal; `{"TextInput": "src/forms/text-input/index.tsx"}` pins a src path the fuzzy-find missed. In synth-entry mode (no dist, no `.d.ts`), the content scan may over-include PascalCase non-component exports (e.g. `ButtonVariants`) — prune with `componentSrcMap: {"ButtonVariants": null}`.

**Render check on large DSes:** `package-validate.mjs` screenshots every preview by default. For very large DSes (200+ components) where that's too slow, pass `--render-sample N` to check a deterministic stride of N.

**Forking a lib script for this repo:** when no config override fits, copy the specific adapter to `.design-sync/lib/<name>.mjs` (e.g. `.design-sync/lib/dts.mjs`) and edit it there. `package-build.mjs` checks `.design-sync/lib/` first and logs `[OVERRIDE]` when a fork is used. Add a header comment `// forked from design-sync lib/<name>.mjs — <one-line reason>`, add the same reason to `cfg.libOverrides` (e.g. `"libOverrides": {"dts.mjs": "VariantProps intersection pattern"}`), and commit both alongside `design-sync.config.json` so re-sync is reproducible. A fork's own `import './common.mjs'` resolves under `.design-sync/lib/`, so also copy (unchanged) any sibling lib files the fork imports from. On re-sync, diff `.design-sync/lib/<name>.mjs` against the bundled `lib/<name>.mjs` and offer to merge upstream changes. `lib/emit.mjs` and `lib/bundle.mjs` define the output contract with the app's self-check — don't fork those; use config overrides or `cfg.dtsPropsFor` instead.

**Known limitations:**
- `.d.ts` props are resolved via the TypeScript checker (ts-morph) — generics, `extends` chains, intersections, and type aliases resolve to their structural shape; React and CSS-in-JS style-system props are filtered. Upstream type bugs propagate as-is.
- A provider the component reads from context (theme, router, i18n) must be in `cfg.provider`, else the preview renders blank.
- Monorepo with a central `apps/storybook`: set `cfg.storybookConfigDir` to run the storybook shape instead.
- Tokens-only DS (no components): emits `styles.css` only with an empty-bodied `_ds_bundle.js`.

## What this is not

Not an LLM rewriting components. The customer's real shipped code is the source of truth; the converter bundles it deterministically and renders with the customer's own Storybook config. You (the agent) do discovery, config, and the self-heal tail — never component authoring.
