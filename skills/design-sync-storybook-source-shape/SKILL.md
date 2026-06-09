---
name: "design-sync-storybook-source-shape"
description: "Design sync sub-skill instructions for using a repo's Storybook as the fidelity oracle when generating and verifying preview artifacts"
metadata:
  originalName: "Skill: Design sync Storybook source shape"
  ccVersion: "2.1.169"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-design-sync-storybook-source-shape.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-design-sync-storybook-source-shape.md"
---

# Storybook source shape

Storybook is the **fidelity oracle, not the runtime**. The converter bundles the package's compiled `dist/` into `_ds_bundle.js` — the same bundle the claude.ai/design agent builds with — and generates each preview by **compiling the story source module itself** (hooks, fixtures, local helpers — the whole closure comes along), with every component import resolved to that shipped bundle (`lib/story-imports.mjs` redirects package *and* relative component imports to `window.<Global>`). The repo's own storybook render is the ground truth those previews must match: a compare harness screenshots each story in the reference storybook and the matching preview render side by side, and you iterate until they match. Nothing from storybook-static is uploaded, and no story code is ever evaluated at build time — stories run only in the browser, against the real artifact.


Requires React 18+. Playwright + chromium are **required** for this shape (the compare loop is the verification), not optional.

**First sync or re-sync?** If `design-sync.config.json` and `.design-sync/` already exist, this is a **re-sync** — most of this document doesn't apply; go to §7, where the compare run's change detection routes the work and untouched components cost nothing. The full flow (§2 build → §3 self-heal → §4 match → §6 upload) is for the first sync, which is where every component gets verified and graded once.

## 2. Build, then run the converter

1. **Build the DS package *and its workspace dependencies*.** The converter bundles `dist/` into `window.<Global>`. Run `<pm> run build`; in a monorepo use `turbo run build --filter=<pkg>` or `pnpm -F "<pkg>..." build` (the trailing `...` is required — bare `-F <pkg>` skips dependencies and you'll see `Cannot find module '@scope/tokens'`). If `package.json` `module`/`exports['.']` points at TS source, find the actual built entry and pass it via `--entry`. **Do this before step 2** — storybook often imports sibling packages from their built `dist/`.
2. **Build the reference storybook ONCE into `.design-sync/sb-reference/`** — NOT under `ds-bundle/` (the converter wipes `--out` on every rebuild, and storybook builds take minutes; the reference must survive the fix loop):

   ```bash
   npx storybook build -c <storybookConfigDir> -o .design-sync/sb-reference
   ```

   Run it from the directory whose `package.json` has the storybook devDependencies (usually the one containing the `.storybook/` dir — monorepos often have several storybooks; pick the one covering the package you're syncing), but **make `-o` the repo-root path** (e.g. `-o "$(git rev-parse --show-toplevel)/.design-sync/sb-reference"`) — the converter and compare resolve `.design-sync/` from the repo root they run in, so a cwd-relative `-o` in a subpackage puts the reference where nothing will find it. Use `npx storybook build` directly, **not** the repo's `npm run build-storybook` script (wrong output dir). Check `.design-sync/sb-reference/iframe.html` exists and is >10KB — `index.json` alone can exist with a failed build. Long builds: background them **through your shell tool's background mode only** and wait for the completion notification — never a bare `&` (untracked, the notification never comes) and never a `pgrep -f '<script>'` poll loop (it matches its own command line and spins to timeout). Add `.design-sync/sb-reference/`, `.design-sync/learnings/`, `.design-sync/.cache/`, `.ds-sync/`, and `ds-bundle/` to `.gitignore` (build artifact, transient scratch, verification working state, staged scripts + their node_modules, and regenerated converter output); `previews/` (your authored files ONLY — generated story-module wrappers live in `.design-sync/.cache/previews/` and regenerate on every build; the converter never writes or deletes anything in `previews/`) and `NOTES.md` ARE committed. Verification state is never committed — cross-machine carry-forward comes from the uploaded project's `_ds_sync.json`. Rebuild the reference only when stories or the DS source change.
3. **Write `design-sync.config.json`** — only `pkg` and `globalName` required. **If it already exists, read it first and keep what's there** — `previewArgs`, `titleMap`, `overrides`, and `provider` accumulate fixes from prior syncs. Also Read `.design-sync/NOTES.md` first — its **Re-sync risks** section is the prior run's watch-list; re-verify those items instead of assuming carry-forward covers them. The package-shape field table in `../non-storybook/SKILL.md` §2.6 applies verbatim; the fields that matter most here:

   | Field | Value |
   |---|---|
   | `pkg` / `globalName` | `pkg` required; `globalName` auto-derived from it when omitted |
   | `shape` | `"storybook"` — pins detection |
   | `storybookStatic` | `".design-sync/sb-reference"` — so re-syncs and compare find the reference without flags |
   | `storybookConfigDir` | the `.storybook/` dir (monorepos) |
   | `buildCmd` | what to re-run before the converter on re-sync |
   | `titleMap` | `{title: ExportName}` when story titles don't match export names; `{title: null}` excludes a non-visual/internal component from the sync entirely |
   | `overrides` | `{<Name>: {skip: [storyIds], cardMode: "single", primaryStory: "<Export>", viewport: "WxH"}}` — `skip` for stories that can't render statically; the card keys for overlay components (§4a.5, §5) |
   | `provider` | usually unnecessary — `.storybook/preview` decorators are auto-bundled; set only when that fails. Format: `{"component": "ThemeProvider", "props": {…}, "inner": {…}}` — a nested chain, outermost first; each `component` must be a bundle export and `props` must be JSON-serializable (they're inlined into the preview html — inline real data like a locale JSON rather than referencing variables). A prop that must be a bundle export (a theme object too large to inline) can be `{"$ref": "LIGHT_THEME"}` — emits `window.<Global>.LIGHT_THEME` instead of a literal |

4. **Stage scripts + install converter deps** (isolated in `.ds-sync/`, repo lockfile untouched):

   ```bash
   mkdir -p .ds-sync && cp -r "<skill-base-dir>"/package-build.mjs "<skill-base-dir>"/package-validate.mjs "<skill-base-dir>"/lib "<skill-base-dir>"/storybook "<skill-base-dir>"/non-storybook .ds-sync/
   echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json
   (cd .ds-sync && npm i esbuild ts-morph @types/react playwright && npx playwright install chromium)
   ```

   If chromium install fails, `npx playwright install-deps chromium` first; if the environment can't install chromium, set `DS_CHROMIUM_PATH=<system-chromium>`.
5. **Run the converter, validator, and compare** — synchronously, stopping at the first non-zero exit (compare only runs once build + validate are clean — §3). Large DSes (≈100+ components) may need `NODE_OPTIONS=--max-old-space-size=<MB>` for the build; **never pipe the build through `head`/`tail`** (the pipeline masks the exit code — an OOM looks like success); redirect to a file and read it:

   ```bash
   node .ds-sync/package-build.mjs --config design-sync.config.json --node-modules <pkg-node-modules> \
     --entry <built-dist-entry> --out ./ds-bundle
   node .ds-sync/package-validate.mjs ./ds-bundle
   node .ds-sync/storybook/compare.mjs --out ./ds-bundle --storybook-static .design-sync/sb-reference \
     --components <solo-phase picks>   # scope the FIRST compare to the §4b solo components
   ```

   In a monorepo, `--node-modules` is the DS package's own `node_modules`; in the DS's own source repo `node_modules/<pkg>` doesn't exist, hence `--entry`. The build logs `[ICON_PKG]` / `[TOKENS_PKG]` auto-detections and bundles `.storybook/preview` decorators as the preview wrapper (`preview-decorators.js`) so previews get the same provider chain stories do.

   Scope the first compare run: a full capture of a large DS is thousands of chromium navigations — pointless before the solo phase has flushed global issues (each global fix invalidates every capture). Run the **full** compare for the first time at §4b step 3. For a DS with >100 storied components, also tell the user the expected scale (components × stories) before fan-out and let them narrow scope if they want.

## 3. Self-heal loop (build + validate)

Fix `[TAG]` errors → rebuild → re-validate until both exit 0, **before** starting the compare loop in §4 — there's no point pixel-matching previews while the bundle itself is broken. Shared converter tags (`[NO_DIST]`, `[WORKSPACE_SIBLING]`, `[CSS_*]`, `[FONT_*]`, `[TOKENS_MISSING]`, `[DTS_*]`, `[RENDER*]`, …) behave identically to the package shape — use the table in `../non-storybook/SKILL.md` §3. Storybook-specific:

| Tag | Symptom | Fix |
|---|---|---|
| `[SB_REFERENCE_MISSING]` | compare can't find `iframe.html` | Build the reference (§2.2); set `cfg.storybookStatic`. |
| `[SB_BUILD_FAIL]` | converter's own storybook build failed | You skipped §2.2 — build the reference yourself and set `cfg.storybookStatic` so the converter never needs to. |
| `[ZERO_MATCH]` (storybook flavor) | no story entries matched | Check the storybook config's `stories` glob; then `titleMap`. |
| `[TITLE_UNMAPPED]` | N titles don't match an export | `cfg.titleMap {<title-name>: <export-name>}`. |
| `(preview: <Name> — no story exports paired …)` | index story names couldn't be matched to module export keys (pairing tries the display name, then the story ID's tail) | the component shows the floor card; fix the pairing — usually an owned `.tsx` re-exporting the stories under matchable names. |
| a preview cell errors with `undefined`-component / wrong-context messages | a story import resolved the wrong way — relative, tsconfig-alias, and bare-workspace imports all go through the same policy (see `lib/story-imports.mjs`'s rules) | `cfg.storyImports.shim` / `cfg.storyImports.bundle` substring patterns force the resolution per resolved path — the cheap fix before forking the seam. |
| `! preview build failed: <Name>` | the story module didn't COMPILE (top-level await, an import of a package esbuild can't resolve, an asset extension with no loader) | read the esbuild error above the line. Unknown asset extension → `cfg.storyImports.loaders` (merged over the defaults, e.g. `{".yaml": "text"}`); unresolvable import → own the `.tsx` and drop it. The component shows the floor card until fixed. |
| a story's own stylesheet is missing from its cell | story-local `.css`/`.scss` side-effect imports compile as empty (component styles ship via the bundle css). Exception: `.module.css` IS compiled — classes resolve and `_preview/<Name>.css` is linked automatically | usually nothing — the styles are decoration the storybook page adds. If the story genuinely depends on them, inline the styles in an owned `.tsx`. |
| `[BUNDLE_EXPORT]` | components aren't functions on `window.<Global>` | `extraEntries` for subpath/icon exports; check the dist entry is the full build. |
| `[SCHEDULER_MISSING]` | dist imports `scheduler` | react-dom leaked into the DS dist — check its build's externals. |
| `! preview decorator bundle failed` | decorators couldn't be bundled | Set `cfg.provider` manually, or run `node .ds-sync/storybook/probe.mjs --storybook-static .design-sync/sb-reference` to infer the chain from the live storybook (replace each `$hint` with a real value). |
| previews error at `_vendor/preview-decorators.js` load (storybook-API `undefined` errors) | the `.storybook/preview` import graph reached a storybook-runtime module the stubs don't cover | `manager-api`/`preview-api` are stubbed with functional no-op hooks and every other `@storybook/*`/`msw` module with inert callables (`fn()`, `action()`, `setupWorker()` at module scope all evaluate harmlessly); if some other API still crashes, set `cfg.provider` explicitly — it skips decorator bundling entirely. |
| `[ASSETS_BLOCKED]` from compare | the capture browser inherited a network-sandboxed shell — story assets (CDN images/fonts) failed on **both** panels, so grades can falsely pass while end users see different output | re-run `package-validate.mjs` + `compare.mjs --force` from a shell with egress to the listed hosts: approve running the command without the sandbox when prompted, or add the hosts to the sandbox allowlist. Don't grade image-bearing components while this prints. |

## 4. Match previews to storybook

`compare.mjs` is a **capture harness — it photographs, you grade.** It computes no similarity heuristics (pixel/text/font scores mislead whenever framing legitimately differs); the judgment is made from the two true screenshots. Compiled previews capture **per story** — each story renders alone via `?story=<Export>` at the full capture viewport, exactly as storybook frames the reference side — so sibling stories can't interfere (portal stacking, shared radio-group names, focus, container measurement). Two output tiers:
- **Transient** (under `ds-bundle/`, wiped by rebuilds): `_screenshots/compare/<group>__<Name>.png` — sheet with one row per story: the **true storybook render | the true preview render**, side by side. Sheet images are shrunk to fit; the full-resolution originals are in `…/compare/raw/` (`…__sb.png` / `…__ds.png`) — Read those when the sheet is too small to judge confidently.
- **Campaign state** (in `.design-sync/.cache/compare/`, gitignored): `<Name>.grade.json` — your verdicts — and `<Name>.json` — capture facts: story↔cell pairing, shot paths, `previewKind`, the component's `srcSha` (story-file fingerprint), spot-check anchors. Reconstructible — absence just means "capture again". The only verdicts the script emits are factual: `sb-error` (story doesn't render in storybook), `unpaired` (no preview cell for the story), `error` (cell threw); every rendered pair is `needs-grade`.

Compare captures at most 6 stories per component by default — `[STORY_CAP]` in the log names components with more, and `--max-stories <n>` raises the cap. The cap is NOT part of the grade contract (the contract hashes the full story list either way): raising it just captures the tail stories for incremental grading, and existing verdicts survive. One consequence to know: a capped component that grades fully `good` is verified-by-upload in full on future syncs even though its tail stories were never individually graded — raise the cap when those tail stories carry distinct variants worth verifying. Fan-out subagents must not change it mid-wave (sheets would cover different story sets than the orchestrator's worklist assumed).

**State across runs** — the first run verifies everything once; after that, one rule: **a grade lives until its contract changes**. The contract is the story file (`srcSha`), the preview source, and the preview's styling files. Renders and screenshots are *not* part of it — both sides mount the same compiled code, so when component internals change they move in lockstep and the fidelity judgment stays valid; pixel jitter can never churn grades.
- *Contract unchanged* + fully graded `match`/`close` → **skipped outright** (`carried forward`): no capture, no re-grade — even when the bundle or storybook were rebuilt. `--force` recaptures everything **and clears all grades** — it demands fresh verdicts, so use it for systemic re-verification (after a spot-check divergence or a suspect converter change), not casually for sheet regeneration.
- *Contract changed* (story edited, `.tsx` edited, css/fonts/tokens/provider changed) → recapture, grade cleared, re-grade from the fresh sheet. `[STORY_CHANGED]` marks stories whose code moved — those are the ones where an OWNED `.tsx` **must be updated** (generated previews re-derive automatically); a recapture *without* `[STORY_CHANGED]` usually just needs the re-grade.
- *`[SPOT_CHECK]`* → on full runs after shared-input changes, compare re-captures a random couple of carried-forward components **without clearing their grades** — the lockstep assumption keeps earning trust instead of being trusted blindly. Read their fresh sheets and confirm they still match the recorded grades. Because their contracts are unchanged, a divergence here is **systemic by construction** (build skew, converter regression — never a component bug): stop, diagnose, fix the root cause, then `--force` a full pass. `--spot-check N` tunes the sample (0 disables); `--spot-check-components A,B` names the picks explicitly with the same grades-kept semantics, and is honored on scoped runs too (the §7.3 re-sync flow).
- *`[REFERENCE_STALE?]`* → the bundle changed but the reference storybook didn't. If the DS source changed, rebuild `.design-sync/sb-reference` before grading — a stale reference makes every grade a comparison against the *old* design.
- *A story renders differently every capture* (`new Date()`/`Math.random()` content) → the fingerprint is the story FILE, so the contract is stable — but the pixels aren't, and grading judges pixels. The frozen capture clock stabilizes date renders; for truly random content, pin values in an owned `.tsx` or `cfg.overrides.<Name>.skip` the story with a NOTES.md line.

Captures are stabilized for grading comparability (animations fast-forwarded, reduced motion, frozen clock — both panels show the same settled frame, the same rendered date). This is verification-only: shipped previews are untouched and fully animated.

**Grading is done by whoever is working the component** — you in the solo phase, each subagent for its own components in fan-out. After each compare run: Read the sheet (and raw PNGs when in doubt), judge each story **from the images alone**, Write the verdicts to `.design-sync/.cache/compare/<Name>.grade.json` (campaign-local working state — what makes a verdict durable is the upload: the uploaded `_ds_sync.json` anchors verified-by-upload skips on every future sync, any machine):

```json
{"stories": {"Default": {"verdict": "match"}, "Loading": {"verdict": "mismatch", "note": "spinner missing — story uses MSW mock"}}}
```

Rubric — grade what a designer would care about, looking at the two renders:
- `match` — same content, composition, and styling. Ignore antialiasing fuzz, scrollbar slivers, sub-5px offsets, and framing differences (the storybook canvas and the preview page frame differently — judge the component, not its surroundings).
- `close` — recognizably the same rendering with a minor delta (slightly different padding, focus ring, placeholder text). **`close` is still a fix target, not an exit:** if you can name the delta, you can usually name the knob — keep iterating. Accept `close` only after an iteration fails to improve it or no actionable cause remains, and the note must then say both *what's off* and *what you tried / why it's not fixable* (e.g. "focus ring color differs — storybook applies a global focus addon, not part of the DS").
- `mismatch` — wrong/missing content, unstyled output, wrong variant, missing icons/images, default fonts. The note must say *what* differs — it drives the next fix.

When the REFERENCE side is the artifact — storybook gates the story behind UI chrome (a theme/control toggle message) while the preview renders the real component — judge the component render on its own and note the gating; a preview that renders *more* than the gated reference is not `close`.

### 4a. Fix decision tree — global first

Work top-down; a global fix repairs every component at once, a per-component fix repairs one:

1. **Most/all components wrong the same way** → global, fix in config + full rebuild:
   - Context/provider errors in cells (`use<X> must be inside <Provider>`) → decorators didn't bundle (§3 `! preview decorator bundle failed` rows) → `cfg.provider`.
   - Everything unstyled / default fonts → `cfg.cssEntry` (check `[CSS_FROM_STORYBOOK]` in the build log), `cfg.tokensPkg`, `cfg.extraFonts`.
   - **`[FONT_MISSING]` — the compare loop cannot see this one.** When neither side ships the font, both panels render the same chromium fallback, so the sheets look "matching" while every claude.ai/design user gets the wrong font — never accept "both sides fall back the same way" as a pass. Resolve per the `[FONT_MISSING]` row in `../non-storybook/SKILL.md` §3; storybook-specific extras: `cfg.extraFonts` paths are bounded by the git repo enclosing `dirname(--node-modules)` — sibling typography packages in the monorepo work as-is; only with no `.git` ancestor does the bound narrow to `dirname(--node-modules)`, and if you add a font the reference lacks, inject the same `@font-face` into `.design-sync/sb-reference/iframe.html` so the oracle verifies with the real font on both sides.
   - Icons missing everywhere → `cfg.extraEntries` (check `[ICON_PKG]`).
2. **One component, `unpaired` or `fallback preview`** → its `.tsx` lacks a cell for that story. Previews compile the story MODULE whole (hooks, fixtures, local helpers all included — closures are not a failure mode), so the causes are: pairing failed (`storyName` override), the wrapper build failed (`! preview build failed` in the build log), or the module threw at load — check the sheet's `(page)` error row for the real exception (module-scope calls into a package the stubs don't cover). Open the wrapper (generated: `.design-sync/.cache/previews/<Name>.tsx`; owned: `.design-sync/previews/<Name>.tsx`), add/rename the export or drop the offending import — and if it's the generated one, save your fix as `.design-sync/previews/<Name>.tsx` WITHOUT the first-line marker (an in-place cache edit is preserved on this machine but gitignored — it vanishes on a fresh clone). Story imports use the location-independent `@ds-stories/<repo-relative path>` form, so the file works unchanged from either home.
3. **One component, you graded `mismatch`** → wrong props/composition. Read the story source; mirror it in an owned `.design-sync/previews/<Name>.tsx` (copy the cache wrapper there minus its marker line). That's the only lever for compiled story previews — `cfg.previewArgs` applies to floor-card render attempts, not story-module previews.
4. **`sb-error`** → the story doesn't render in storybook either (data-fetching, interaction-driven). Add its id to `cfg.overrides.<Name>.skip` and note why in NOTES.md.
5. **`[PORTAL?]` / overlay components** (Dialog/Tooltip/Toast) → grading is already isolated (per-story capture), but the PRODUCT card renders the whole grid html, so open-overlay stories paint over sibling cells there too. Set `cfg.overrides.<Name>.cardMode: "single"` — the card renders one story (`primaryStory` picks it; first export otherwise) full-bleed in a wrapper that contains `position:fixed` descendants, and declares the grading viewport on the card so the product renders at the size you verified. Rebuild + re-grade that component.

**Rebuild rules:**
- Config change (provider/css/fonts/entries/titleMap/skip) → full `package-build.mjs` + `package-validate.mjs`, then full `compare.mjs`. Styling/provider changes alter every component's grade contract, so expect a full re-grade — that's correct, the previews all render differently now. **On a large DS, verify the fix is right BEFORE paying the full rebuild**: run the targeted loop below on one affected component (or probe its rendered page) first — a wrong guess validated by a full rebuild costs the whole cycle. **Intermediate validates can sample**: global breakage is systemic by nature, so `--render-sample 10` answers "did the fix work?" at a fraction of the cost; the FULL render-check is required only once, at the §4d/§6 upload gate.
- `.tsx`-only edit → fast targeted loop, seconds not minutes:
  ```bash
  node .ds-sync/lib/preview-rebuild.mjs --config design-sync.config.json --node-modules <nm> --out ./ds-bundle --components <Name>
  node .ds-sync/storybook/compare.mjs --out ./ds-bundle --storybook-static .design-sync/sb-reference --components <Name>
  ```

### 4b. Solo phase — one, then a few

Do NOT fan out immediately. Global issues must be flushed into config first, or every subagent rediscovers them.

1. **One component.** Pick a simple, well-storied one (Button-like: several stories, no portals). Run the §4a loop until you've graded every story `match` from its images — settle for `close` only when an iteration stops improving it (rubric above). **Every fix becomes a bullet in `.design-sync/NOTES.md`**: symptom → root cause → fix, marked `[GENERAL]` when it isn't component-specific.
2. **Three more, chosen for diversity:** one compound/overlay (Dialog/Tabs), one icon- or asset-heavy, one theme/provider-sensitive — and make sure the set spans one **text-heavy** component (font/typography bugs hide from button-only solos and then invalidate a whole grading wave). Same loop, solo.
3. **Full compare.** If ≥30% of remaining components fail with the *same* reason, that's a global issue you missed — fix it in config and re-run before fanning out. **Batch every skip and pairing fix the listing shows before rebuilding** — each rebuild+compare cycle costs minutes; fixing them one at a time pays that cost per item.

### 4c. Fan-out — parallel subagents

Partition the remaining non-matching components into batches of 5–8. Launch up to 4 subagents per wave (Agent tool, in one message so they run concurrently), each with this prompt — fill every `{…}`, and paste the **current** NOTES.md content in (subagents inherit the solo phase's learnings through it):

```text
Fix design-sync previews so they match the repo's own storybook render.
Repo: {REPO_ROOT}. Your components (yours alone): {COMPONENT_LIST}.

Why this matters: this design system is being synced to claude.ai/design, where
a design agent will build real UIs from this exact compiled bundle. The
storybook render is the proof of how each component is supposed to look; a
preview that matches it proves the component arrived intact, and one that
doesn't means every design the agent builds with it will be wrong the same way.

Artifacts per component (read these first):
- {OUT}/_screenshots/compare/<group>__<Name>.png — the true storybook render (left) vs the true preview render (right), per story. Full-res originals in {OUT}/_screenshots/compare/raw/.
- .design-sync/.cache/compare/<Name>.json — pairing facts + shot paths (no similarity scores — your eyes are the judge).
- The preview source (real JSX importing from '{PKG}'): .design-sync/previews/<Name>.tsx when owned, else the generated .design-sync/.cache/previews/<Name>.tsx. Your fixes are written to .design-sync/previews/<Name>.tsx (step 2).
- {OUT}/.stories-map.json — maps components to story ids; find each story's source file via its id in .design-sync/sb-reference/index.json (`importPath`). The story source is the authority on intended props/composition.
- .ds-sync/storybook/SKILL.md §4 — the grading rubric and fix decision tree.

Per component (max 3 iterations):
1. Read the sheet; judge each story FROM THE TWO IMAGES (raw PNGs when the sheet is too small); diagnose failures via the decision tree.
2. Copy .design-sync/.cache/previews/<Name>.tsx to .design-sync/previews/<Name>.tsx and DELETE its first-line `// @ds-preview generated …` marker (owned files live in previews/, win over the generated twin, and are durable + committed; an in-place cache edit survives rebuilds on this machine but is gitignored and vanishes on a fresh clone). The `@ds-stories/...` imports work unchanged from the new location. Mirror the story's JSX; inline story-local fixture data.
3. node .ds-sync/lib/preview-rebuild.mjs --config design-sync.config.json --node-modules {NM} --out {OUT} --components <Name>
4. node .ds-sync/storybook/compare.mjs --out {OUT} --storybook-static {SB_REF} --components <Name>   (your edit changed the component's contract, so this clears its old grade — that's intended)
5. Re-Read the fresh sheet and Write your verdicts to .design-sync/.cache/compare/<Name>.grade.json ({"stories": {"<story>": {"verdict": "match|close|mismatch", "note": "…"}}}). Done when you grade every story match. A close story is still a fix target — if you can name the delta, try the knob for it; accept close only when an iteration didn't improve it or there's no actionable cause, and the note must say what's off AND what you tried. Blocked after 3 iterations → grade honestly (mismatch/close + note), record the exact blocker, move on.

HARD RULES — violating these corrupts other agents' work:
- Edit ONLY .design-sync/previews/{<your components>}.tsx, your components' .design-sync/.cache/compare/*.grade.json files, and .design-sync/learnings/{BATCH_ID}.md.
- NEVER edit design-sync.config.json, .design-sync/NOTES.md, .ds-sync/, or any other component's files.
- NEVER run package-build.mjs or package-validate.mjs — they rewrite the shared bundle. preview-rebuild.mjs + compare.mjs scoped via --components are your only build commands.
- NEVER write a grade for images you haven't Read in this iteration.
- A story that doesn't render in storybook either (sb-error) needs cfg.overrides.<Name>.skip; likewise [PORTAL?] needs cfg.overrides.<Name>.cardMode "single". Both are config edits you may NOT make — record them in your learnings file and final report; the orchestrator applies them. NEVER "fix" overlay bleed by neutralizing a story's open state in the .tsx — that destroys the fidelity being verified.
- If ≥half your components fail identically (same provider/css/font/token error), STOP — it's global. Write it to your learnings file, report it, do not work around it per-component.

Learnings: append to .design-sync/learnings/{BATCH_ID}.md as you go — one bullet per discovery:
`<Component>: <symptom> → <root cause> → <fix>`, prefixed [GENERAL] if it applies beyond that component.

Known repo gotchas (read before starting):
{CURRENT_NOTES_MD_CONTENT}

Final report: per component — match/close/blocked + one-line reason; then any [GENERAL] learnings verbatim.
```

**Between waves (orchestrator) — the learnings fold is mandatory, not optional:**
1. Read every `.design-sync/learnings/*.md`. Promote `[GENERAL]` bullets into `.design-sync/NOTES.md` (dedup; keep them terse), then delete each learnings file you've folded. Full `compare.mjs` runs print `[LEARNINGS_UNMERGED]` while any learnings file exists — that line is an **upload blocker** (§4d), so an overlooked fold can't silently ship.
2. If any subagent reported a global issue → apply the config fix, full rebuild + validate + full compare. Components that fix repaired drop out of the queue.
3. Next wave gets the updated NOTES.md content and the still-failing components. After the last wave, repeat step 1 for whatever remains and delete `.design-sync/learnings/`.

### 4d. Done criteria + report

- The final `compare.mjs` run exits 0 (no `error`/`unpaired`/`sb-error`). First syncs and full-scope campaigns: a FULL run that does **not** print `[LEARNINGS_UNMERGED]`. Scoped re-syncs (`--components` over the diff worklist): scope = the `.sync-diff.json` `changed`+`added` set — verified-by-upload components are outside the gate, and since scoped runs skip the learnings check and `.compare-report.json` aggregation, run `ls .design-sync/learnings/` yourself (must be empty) before upload. On this final run (after the final rebuild) every in-scope component should print `carried forward` with zero `grade cleared` — that line IS the proof the next sync will be fast. A re-capture or cleared grade on a no-change run means a nondeterministic input (unpinned toolchain, volatile story content); chase it now, because a future run pays for it on every sync.
- Every IN-SCOPE storied component has a current `.grade.json` (compare clears grades whose contract changed, so whatever survives is trustworthy) with every story `match` — or `close` meeting the rubric's acceptance bar (§4) — or skipped via `cfg.overrides.<Name>.skip` with a NOTES.md justification. On full runs `.compare-report.json` joins grades in; components with `"grades": null` or missing stories are not done (verified-by-upload components are exempt — they're not in the report's pending set on scoped runs).
- `package-validate.mjs` still exits 0 after the final rebuild, with no unresolved `[FONT_MISSING]` (§4a — the one warning the compare oracle can't see).
- Call `DesignSync({method: 'report_validate', counts: {total, bad, thin, variantsIdentical, iterations}})` from the final `ds-bundle/.render-check.json` (written by `package-validate.mjs`; `iterations` = full rebuild passes).
- NOTES.md has a current **Re-sync risks** section, written now while you still know them: what can silently go stale (data inlined into config, neutralized story exports, owned previews tied to upstream APIs), what was verified only partially (story caps, accepted `close` rationales), and what the build assumed (toolchain version, CDN-fetched assets). Fixes record what you did; this section tells the next run what to watch.
- Tell the user: N/M components graded match, which are `close` (and why that's acceptable), which were skipped and why.

## 5. When the repo is strange — escape hatches

First runs against unusual repos WILL hit things the defaults don't cover. Every heuristic has a committed override — the rule is: **never hand-patch generated output; put the fix in the file the next run reads.** Map from failure class to knob:

| The repo's strangeness | Knob | Lives in |
|---|---|---|
| Nonstandard build/entry (`module` points at TS source, exotic dist layout) | `cfg.entry`, `cfg.buildCmd` | config |
| CSS built by a separate pipeline / no dist sidecar / CSS-in-JS | `cfg.cssEntry` if there's a file; otherwise rely on `[CSS_FROM_STORYBOOK]` — the converter scrapes the **compiled** CSS out of `sb-reference`, which is the universal catch-all: however weird the pipeline, its output is in the storybook build | config |
| Tokens shipped as a separate package | `cfg.tokensPkg` | config |
| Fonts from a runtime service / proprietary CDN | `cfg.extraFonts`, `cfg.runtimeFontPrefixes` | config |
| Icons or components on subpath exports | `cfg.extraEntries` | config |
| Naming conventions (story titles ≠ export names) | `cfg.titleMap`; story↔cell pairing also falls back to order | config |
| Decorators/providers that won't bundle (vite-only plugins, MDX, aliases) | `cfg.provider` — an explicit chain beats the decorator bundle; `probe.mjs` infers it from the live storybook; or compose providers **inline in the component's own `.tsx`** (an owned preview can import and wrap anything the package exports) | config / previews |
| Stories that can't render statically (MSW, data fetching, interaction tests) | `cfg.overrides.<Name>.skip` + a NOTES.md line saying why. Skip removes the story's cell, but the wrapper still imports the whole story MODULE — if the file crashes at import (module-scope fetch/worker), own the `.tsx` and drop the import instead | config |
| `[PORTAL?]` — overlay/portal stories paint outside their cells in the grid card | `cfg.overrides.<Name>.cardMode: "single"` (+ optional `primaryStory`, `viewport: "WxH"`) — single-story card, fixed-position containment, declared product viewport. Compare still grades every story via `?story=` | config |
| `[EXPORT_COLLISION]` — a sibling package (icons etc.) exports names the main package also exports | the main package wins the global merge, so stories importing the losing name from the sibling render the wrong thing | the log names the fix: `cfg.storyImports.bundle: ["<sibling>"]` |
| `[FILE_OVER_5MB]` — a build output exceeds the upload's per-file cap | usually a dev-only heavyweight bundled into a preview or the decorator bundle (syntax highlighters, icons-as-code) | slim it NOW, before grading — a post-grade slim changes contracts and clears verified grades |
| `[PROVIDER_UNEXPORTED]` — a `cfg.provider` component isn't a bundle export | every preview fails identically ("Element type is invalid") | use the exact exported name (prefixed variants like `unstable_X` are common — check the bundle's exports) |
| A story import resolves the wrong way (shimmed when it should bundle, or vice versa — any import style) | `cfg.storyImports.shim` / `cfg.storyImports.bundle` — substring patterns matched against resolved paths (bare package imports shim by **specifier**, without resolution — pattern-match the specifier for those). Unknown package subpaths (`<pkg>/utils`) bundle by default; if one should ride the global instead, add it to `cfg.extraEntries`. In the package's own source repo a bundled self-import has nothing to resolve to — symlink `node_modules/<pkg>` → the built `dist/` first | config |
| Story files import an asset type the defaults can't load (`.yaml`, `?raw`, svg-as-component) | `cfg.storyImports.loaders` — an esbuild loader map merged over the defaults (e.g. `{".yaml": "text"}`) | config |
| Generated preview has wrong props/composition | copy `.design-sync/.cache/previews/<Name>.tsx` to `.design-sync/previews/<Name>.tsx` minus its marker line (owned forever). `cfg.previewArgs` only affects floor-card render attempts | previews |
| Source/docs discovery misses (unusual repo layout) | `cfg.componentSrcMap`, `cfg.docsMap`, `cfg.dtsPropsFor`, `cfg.srcDir` | config |
| Anything deeper — custom story format, exotic args extraction, CSS transform | fork the adapter: copy the bundled lib module to `.design-sync/overrides/<name>.mjs` and declare it in `cfg.libOverrides` with a one-line reason (the build cross-checks both directions: `[OVERRIDE_UNDECLARED]` / `[OVERRIDE_MISSING]`). Forks are committed, so re-syncs use them automatically. **`emit.mjs` and `bundle.mjs` are app-contract surface — never fork them.** | `.design-sync/overrides/` |

For **story handling** specifically, the fork points by concern: `story-imports.mjs` (ALL import-resolution policy for preview compiles — the seam built for per-repo customization; honored by both the full build and `preview-rebuild.mjs`), `source-storybook.mjs` (index.json discovery, title→component mapping, story-source resolution + export pairing), `preview-gen-storybook.mjs` (the wrapper template / composeStories semantics), `css-fallback.mjs` (CSS/font scraping from the storybook build). Fork the *narrowest* module that owns the breakage, keep its export signature, and record what the repo does differently in NOTES.md — the next sync inherits all of it. A fork loads from `.design-sync/overrides/` while its siblings stay in the staged scripts — repoint the fork's relative imports (`./common.mjs` etc.) at `../../.ds-sync/lib/`. A fork that imports a bare converter dep (`esbuild`) also needs `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` so node can resolve it from the fork's location — once per clone, not once ever: the link is gitignored (`node_modules` rules) while the committed fork that needs it survives the clone, so recreating it is part of the fresh-clone setup.

The ladder's last rung, for repos genuinely outside the converter's envelope: **the upload format is the contract, not the converter** (see the base skill). Generate the layout however the repo allows — but `package-validate.mjs` and the compare/grading gate apply unchanged to whatever you produce. The oracle is never forked.

Everything in that table is a committed file, and §2.3 requires reading the existing config + NOTES.md before doing anything — so run N+1 replays every decision run N made. When you fix something on a strange repo, ask: "which committed file makes this automatic next time?" If the answer is none, that's a NOTES.md entry at minimum — and likely a missing row here worth reporting.

## 6. Upload

Only after §4d. `DesignSync(finalize_plan)` with `localDir: "./ds-bundle"`. **Default — always, both first syncs and re-syncs: write everything** — `writes: ["components/**", "tokens/**", "fonts/**", "_vendor/**", "_preview/**", "guidelines/**", "_ds_bundle.js", "_ds_bundle.css", "styles.css", "README.md", "_ds_sync.json", "_ds_needs_recompile"]`. Re-uploading unchanged files is idempotent and cheap; an under-scoped writes list silently and permanently desyncs the project, so full writes are the correctness-safe default. On re-syncs, `deletes` comes verbatim from `.sync-diff.json`'s `upload.deletePaths` (never hand-derive it, never leave it `[]` when the diff lists paths). Every `package-build.mjs` run wipes `.sync-diff.json` with the rest of `--out` — re-run the §7.2b diff command after the FINAL build of the session, so `deletePaths` and `upload.any` describe the exact bytes you upload. When `upload.any === false`, skip the upload step entirely — the project already matches this build (the handoff audit at the end of this section still applies). **Upload `_ds_sync.json` as the ABSOLUTE FINAL write of the entire upload — after all content writes, after all deletes, and after the sentinel re-arm — in its own `write_files` call** — uploaded early, a mid-plan failure leaves the anchor vouching for files the project doesn't have, and deterministic rebuilds mean no later sync would repair them. **No `_sb/**`** — storybook-static is a local reference only. Dot-prefixed entries (`.stories-map.json`, `.compare-report.json`, `.ds-build-meta.json`, `.sb-static/`, `.sync-diff.json`) and `_screenshots/` stay local. `_vendor/` and `_preview/` DO upload — the preview cards load React and the compiled previews from them.

If `finalize_plan` is denied, **stop** — denial means the session can't approve, not that the arguments were wrong.

As the **first** write after plan approval, `DesignSync(write_files, [{path: "_ds_needs_recompile", localPath: "_ds_needs_recompile"}])` — uploading it first fences the app's manifest/copy machinery against a half-uploaded state. Then upload everything else (chunked into ≤256-file `write_files` calls under the same `planId`). The server also bounds payload BYTES, not just file count — batch binary-heavy dirs (fonts/, images) into smaller chunks, and on a 500 halve the chunk size and retry. **Upload hygiene**: keep file lists/chunk manifests under `.design-sync/` (NEVER bare `/tmp` paths — concurrent or prior syncs of OTHER repos contaminate them, and a stale list uploads the wrong design system), regenerate the list from the live `ds-bundle/` immediately before upload, and sanity-check it (component names belong to THIS design system; the bundle's `window.<globalName>` matches). Then `DesignSync(delete_files)` over every path in `upload.deletePaths` (re-syncs; on a first sync there is nothing to delete — but if `list_files` shows the target project NON-empty before the first upload, deletes can't be derived from any anchor: review that list once for files this build doesn't produce and delete them by hand). The single tail order is: **all writes → all deletes → sentinel re-arm → `_ds_sync.json` last** — the anchor goes after deletes too, or a failed delete leaves remote files the refreshed anchor can no longer see. If `delete_files` rejects paths that don't exist remotely (floor-card components have no `_preview/` files), retry without the rejected entries. That not-found rejection is the ONLY failure you may continue past: any other write/delete failure that retries don't clear means STOP — no sentinel re-arm, no `_ds_sync.json`. An un-anchored project merely re-verifies next sync; a fresh anchor over a half-applied upload is permanent. `DesignSync(list_files)` to confirm the count.

Only after the post-upload `list_files` count verifies, **record `projectId` in `design-sync.config.json`** if absent or different (never earlier — a mid-run death must not leave a committed config pointing at an empty project) — it pins which project anchors future re-syncs. When done, tell the user: the project URL, component count, compare results summary, and that validate exited clean. The durable set — `design-sync.config.json`, `NOTES.md`, `previews/`, `.design-sync/overrides/` — must land in the repo for re-syncs to reuse every fix; verified-state lives with the uploaded `_ds_sync.json`, not in git. The handoff audit below covers the offer to commit.

**Last step — audit the handoff.** A future run is only as fast and correct as what this one leaves behind; verify it, don't assume it:

1. `git status` — the durable set (`design-sync.config.json`, `NOTES.md`, `.design-sync/previews/`, `.design-sync/overrides/`) is the sync's repo footprint; `sb-reference/`, `learnings/`, `.cache/`, `.ds-sync/` are ignored. If this run created or changed any of the durable files, **offer to commit them and open a PR** (one commit, sync state only — no unrelated files). An uncommitted fix is a fix the next sync doesn't have.
2. Re-read NOTES.md as if you were the next agent, knowing nothing from this session: could you skip today's debugging with only what's written? Every owned preview, skip, config knob, and lib fork should trace to a bullet, and the Re-sync risks section should be current (§4d). Write whatever's missing now — it costs a minute today and a re-derivation later.
3. After a re-sync — however much it changed or re-graded — leave NOTES.md and the git state exactly as you found them unless the run produced something the next run needs to know; only hand the user something to commit when it adds value for a future sync.

## 7. Re-syncs — change detection routes the work

The repo carries the sync's inputs (config, owned previews, NOTES.md); the uploaded project carries the verified state. A re-sync is short. Read NOTES.md first, then:

1. Re-run `buildCmd` **and rebuild `.design-sync/sb-reference`** whenever the DS source may have changed — they must move together (the reference is the ground truth for the new code; compare prints `[REFERENCE_STALE?]` if you forget, because grading against an old reference chases the old design). When in doubt, rebuild both: correctness never depends on this answer — deterministic builds mean an unnecessary rebuild produces identical bytes; the only cost is build minutes.
2. Re-copy the staged scripts on EVERY sync (§2.4's `cp -r` line — instant, and the converter evolves with this skill; a stale `.ds-sync/` runs an old converter against these instructions). The dep install + chromium are needed only when `.ds-sync/node_modules` is missing (fresh clone); a fresh clone also needs `.design-sync/sb-reference/` rebuilt (§2.2) and — when the repo carries `.design-sync/overrides/` forks with bare imports — the `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` link recreated (it is gitignored; the committed fork that needs it is not). Committed inputs — config, `previews/`, NOTES.md, any `.design-sync/overrides/` forks — are already in place; verified-state needs nothing local (step 2b derives it).
2b. **Scope from the project, not from git**: fetch the uploaded anchor (`DesignSync(get_file, path: "_ds_sync.json")` → save to `.design-sync/.cache/remote-sync.json`). The diff itself runs mid-step-3 — immediately after `package-build.mjs` produces `./ds-bundle`, run `node .ds-sync/lib/remote-diff.mjs --local ./ds-bundle --remote .design-sync/.cache/remote-sync.json`. The diff has TWO partitions: verification (`unchanged` skip capture+grading; `changed`/`added` are the §4 worklist) and upload (`upload.components`/`upload.deletePaths`/`upload.bundle`/`upload.styling` — sourceHashes-based, so doc/contract edits, regroups, and lockstep bundle changes still ship even when no render contract moved). Never scope uploads by the verification partition. No sidecar in the project → full scope for both.
3. `package-build.mjs` → the 2b diff command → `package-validate.mjs` → `compare.mjs` over the diff worklist (`--components <changed,added>` when the verified-by-upload set is large; full run when most things changed). No `--force` unless §4's state rules call for it. Scoped runs never auto-spot-check, so verified-by-upload trust is otherwise unsampled: **also pass 1–2 components from `unchanged` as `--spot-check-components <A,B>`** — they're re-captured with their grades kept, the same `[SPOT_CHECK]` semantics as §4's sampler. Read the fresh sheets and confirm they still match the recorded grades. (On a fresh clone there are no local grades yet, so the picks are captured under the normal rules instead — grade them from the fresh sheets; either way they double as the confidence sample.) A divergence from what carried forward is systemic (stale upload, build skew), not a component bug.
4. **The compare log is the worklist.** Triage by tag:

   | Log says | Meaning | Your work |
   |---|---|---|
   | `carried forward` | contract unchanged — internals-only changes render in lockstep on both sides | none |
   | `grade cleared` without `[STORY_CHANGED]` | contract changed but not the story code (your `.tsx` edit, or styling) | Read the fresh sheet, re-grade (grade format + rubric: §4) — story-mirroring edits likely unnecessary |
   | `[STORY_CHANGED]` | the story code itself moved | update the OWNED `.tsx` to mirror it (generated previews already re-derived), then §4a loop |
   | `unpaired` | story added/renamed upstream | add the export to the `.tsx` |
   | `extraCells` lists an owned export | story deleted upstream | prune the export (`Preview`/`Variants` grids stay) |
   | `[SPOT_CHECK]` | confidence sample of carried-forward components (random on full runs; your `--spot-check-components` picks on scoped ones) | Read the fresh sheets, confirm they match the recorded grades; divergence ⇒ systemic — stop, diagnose, `--force` after fixing |
   | `[REFERENCE_STALE?]` | bundle moved without a reference rebuild | go back to step 1 |
   | `[LEARNINGS_UNMERGED]` | leftover fan-out scratch | fold into NOTES.md, delete the folder |

5. Components needing work re-enter §4a (fan out per §4c only if there are many). Then §4d done criteria and §6 upload as usual — **full writes by default, `deletes` verbatim from `upload.deletePaths`** (never scope writes by the verification partition: changed/added tracks re-graded renders, not what the project is missing). Re-fetch the remote sidecar right before `finalize_plan`; if it moved (concurrent sync), re-run the diff and fold newly-changed components into the worklist.

