---
name: "plugin-authoring"
description: "Guides writing Claude Code mods as hot-reloading function-hook plugins: where the plugin files and state contract go, where this build's generated type declarations live, how per-session hot-reload consent works, the hooks module shape, request-to-API mapping with examples, and validation and error reporting"
metadata:
  originalName: "Skill: Plugin authoring"
  ccVersion: "2.1.283"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-plugin-authoring.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-plugin-authoring.md"
---

---
name: plugin-authoring
description: "Make a mod: a live pane, band, status line, toast or hook inside Claude Code (terminal or desktop Code tab), written as a plugin of function hooks that hot-reloads in this session. Load before writing or debugging a hooks module."
---

WHERE TO WRITE IT. Write each mod in its own child folder of `${CLAUDE_DEV_MODS_DIR}`: `${CLAUDE_DEV_MODS_DIR}/<mod-name>/`, three files written directly:

- `.claude-plugin/plugin.json`: `{ "name": "<mod-name>", "version": "0.1.0", "description": "<one line>" }`
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`, one path, relative to that file
- `hooks/register.tsx` (or `.ts`): the hooks module, exporting `register(on, options)`

A mod that keeps values in `$.state` has a fourth file, `types/index.d.ts`: its type contract, declaring each value in `interface PluginState` under the mod's name, named in `plugin.json` as `"types": "./types/index.d.ts"`. The module imports its value types from `'../types'`, and `claude plugin validate` holds every `$.state` key the module names to that contract.

WHERE THE TYPES ARE. `${CLAUDE_SKILL_DIR}/types/claude-code.d.ts` is this build's declaration of the whole API, written by the engine as this skill loaded, so it matches the running engine exactly. The folder is this process's own: after a restart (a resume, an app relaunch) the next load of this skill writes and names a new one. It carries every event's input and result, every noun and method on `$` with its doc comment and an example, and every element's props for each surface. It is about 14,000 lines: grep it for the name at hand (`'tool.call'`, `open: (`, `Pane: {`, `export type ToolCallResult`) and read the declaration the match lands on. The header of that file carries a `tsconfig.json` that fits a hooks module; its include takes `.claude/types`, where `/plugin-types` writes this core file and, beside it, the enabled plugins' contracts, so an editor and `tsc` type the mod. `/plugin-types [dir]` writes them into another directory.

WHAT HAPPENS WHEN THE TURN ENDS. Loading this skill through the Skill tool or its slash command starts the engine's watch on `${CLAUDE_DEV_MODS_DIR}`. The first file written there makes the engine ask the person, once, right then, while the turn goes on: "Enable mod hot-reloading for this session?", with `Not now` and `Enable for this session`. The question holds nothing up: the turn keeps writing, the person answers when they like, and a question still open when the turn ends simply stays up. That question is the switch, and the person alone answers it: no permission mode, rule or hook does. On `Enable for this session` the folder joins the session's plugin folders and the mod loads when the turn ends, whole (at once when the turn has already ended; a pane it opens appears then), and each later edit reloads it when the turn that made the edit ends. The answer reaches you as a notice at the start of your next turn, one of: enabled, with what the load came to; declined (the mods are written, and `claude --plugin-dir <folder>` loads them); still open (a new prompt from the person takes the question down, and the engine asks again when that turn ends); or off, with the reason (nobody could be asked, as under `claude -p`; an organization's policy; an untrusted workspace). A process that restarted (an app relaunch, a resume) loads an enabled folder again by itself; otherwise its watch starts the next time this skill loads, and a manifest already in the folder raises the question when that turn ends.

A reload is a fresh load of the module: `register` runs again and `session.start` fires again. Values in `$.state` (the session's) and `$.store` (across sessions) are the host's and stay; the module's own variables start over.

## A mod in one paragraph

A hooks module exports `register(on, options)`. `on(event, matcher?, hook)` adds a hook, and every hook is `($, e, next)`: `$` is the engine interface, each call spelled noun then method, as `$.ui.open(...)` is; `e` is the event's input, a plain frozen value; `next(e)` runs the plugins beneath and then the engine's own behaviour, resolving to the event's result. A hook that returns without `next` answers for itself; `next({ ...e, x })` rewrites what the rest sees. The module runs in an environment of its own, with no DOM and no Node: `$` reaches everything outside it. JSX compiles against the global `h`, and the elements come from the drawing surface's own table, `const { Box, Text, Button } = $.ui.resolve(e)`, where `e.surface` is `terminal`, `desktop`, `vscode` or `mobile`.

## From the ask to the shape

Each example is one complete hooks module, an excerpt of a shipped mod cut to the smallest whole thing; with the two JSON files above, and its contract where it has one, it is a mod that loads, validates and type-checks on this build.

| The person asks for | What it is | Shown in |
| --- | --- | --- |
| a pane, panel, sidebar, live view | `$.ui.open({ id, title })`, drawn by a `ui.render` hook on `{ component: 'Pane', requestId: id }`; opened by something the person did (a command they typed, a Button they pressed) it seats at any width; opened unasked (from `session.start`, a timer) it seats from 144 terminal columns and waits below that | `${CLAUDE_SKILL_DIR}/examples/pane.tsx`, its contract `${CLAUDE_SKILL_DIR}/examples/pane-state.d.ts` |
| a band or row above the prompt | a `ui.render` hook on `{ component: 'AbovePrompt' }` returning a tree, or `next(e)` with nothing to show | `${CLAUDE_SKILL_DIR}/examples/band.tsx`, its contract `${CLAUDE_SKILL_DIR}/examples/band-state.d.ts` |
| a status line entry | `$.ui.status(text)` from any hook; `undefined` clears it | `${CLAUDE_SKILL_DIR}/examples/tool-call.ts` |
| a toast | `$.ui.toast(text)` from any hook | `${CLAUDE_SKILL_DIR}/examples/band.tsx` |
| block, rewrite or react to a tool call | `on('tool.call', { tool }, hook)`: return `{ deny }`, call `next({ ...e, ... })`, or `await next(e)` and act on the result | `${CLAUDE_SKILL_DIR}/examples/tool-call.ts` |
| change or react to a prompt | `on('prompt.submit', hook)`: `next({ ...e, text })` | `${CLAUDE_SKILL_DIR}/examples/band.tsx` |
| a slash command | `$.command.register({ name, description })` in `session.start`, answered by a `command.run` hook returning `{ text }` | `${CLAUDE_SKILL_DIR}/examples/pane.tsx` |
| values a drawing reads | `atom(ref, initial)`, `read($, atom)` while drawing, `update($, atom, fn)` from a handler or another event; the write redraws the readers; each value declared in the contract | `${CLAUDE_SKILL_DIR}/examples/pane-state.d.ts` |
| work on a timer, a tool the model calls, a subagent type, model calls, files, processes | `$.clock`, `$.tool`, `$.agent`, `$.model`, `$.fs`, `$.process` | `${CLAUDE_SKILL_DIR}/reference.md` |

## Checking it and reading what the engine refused

`claude plugin validate <mod folder>` reads the manifest and the module's source the way the engine will, and reports what the module hooks and calls and everything the engine would refuse, before any session loads it.

The engine reports in three places. The notice above carries the outcome of the hot-reloading question and of the load. The transcript carries one dim line naming the plugin, the event and the reason when a hook fails (the hook is skipped and the chain continues) or a module does not load. The debug log (`claude --debug`) carries a line for every occurrence and every result the engine refused; a drawing that silently falls back to the engine's own has a line there beginning `ui.render (<Component>): a hook returned a tree that does not validate`, followed by the reason.

`${CLAUDE_SKILL_DIR}/reference.md` is the long form, read on demand: the full event list and streaming events, `ui.render` in depth (viewport, focus, hotkeys, hover, `Raster`, `Image`, `Markdown`), `$.state` contracts, timers and background work, `$.model`, `$.fs`, `$.process`, tools and agent types, `--plugin-dir` and `CLAUDE_CODE_PLUGIN_DIRS`, `userConfig` options, and `claude plugin test`.
