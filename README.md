# ccskills

Installable Claude Code skills generated from Piebald's published system prompts, with sync and PR automation included.

This repository converts Piebald's `system-prompts/skill-*.md` files into installable `SKILL.md` directories under [`./skills`](./skills).

## Usage

Install generated skills with the Skills CLI:

```bash
npx skills add mkusaka/ccskills
npx skills add mkusaka/ccskills@debugging
npx skills add https://github.com/mkusaka/ccskills/tree/main/skills/debugging
```

If you maintain this repo locally, sync from upstream with:

```bash
pnpm sync
pnpm sync --dry-run
pnpm sync:related
pnpm sync Piebald-AI/claude-code-system-prompts
pnpm sync /path/to/local/claude-code-system-prompts
```

## Automation

[`./.github/workflows/sync-piebald-skills.yml`](./.github/workflows/sync-piebald-skills.yml) runs daily at `03:17 UTC` and on `workflow_dispatch`.

The workflow:

- runs `pnpm sync`
- runs `pnpm test`
- uses [`./scripts/sync_skills_pull_request.sh`](./scripts/sync_skills_pull_request.sh) to push `automation/piebald-skill-sync`
- creates or updates a PR with `gh pr create` or `gh pr edit --body-file`
- verifies the rendered PR body with `gh pr view --json body --jq .body`

For local dry-run:

```bash
SYNC_PR_DRY_RUN=1 pnpm sync:pr
```

## Development

```bash
pnpm test
pnpm sync --dry-run
```
