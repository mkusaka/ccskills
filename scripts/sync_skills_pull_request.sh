#!/usr/bin/env bash
set -euo pipefail

base_branch="${SYNC_BASE_BRANCH:-main}"
sync_branch="${SYNC_BRANCH:-automation/piebald-skill-sync}"
commit_message="${SYNC_COMMIT_MESSAGE:-Sync Piebald skills}"
pr_title="${SYNC_PR_TITLE:-Sync Piebald skills from Piebald upstream}"
pr_body_file="${SYNC_PR_BODY_FILE:-/tmp/ccskills-sync-pr.md}"
sync_source="${SYNC_SOURCE_URL:-https://github.com/Piebald-AI/claude-code-system-prompts/tree/main/system-prompts}"
dry_run="${SYNC_PR_DRY_RUN:-0}"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

ensure_changes_exist() {
  if [[ -z "$(git status --short)" ]]; then
    echo "No changes detected. Skipping PR automation."
    exit 0
  fi
}

collect_changed_skills() {
  local skill_list
  skill_list="$(
    {
      git diff --name-only -- skills ':(exclude)skills/.ccskills-sync.json'
      git ls-files --others --exclude-standard -- skills
    } | sed -n 's#^skills/\([^/][^/]*\)/SKILL\.md$#\1#p' | sort -u
  )"

  if [[ -z "$skill_list" ]]; then
    echo "- \`skills/.ccskills-sync.json\` only"
    return
  fi

  while IFS= read -r skill_name; do
    [[ -z "$skill_name" ]] && continue
    echo "- \`$skill_name\`"
  done <<<"$skill_list"
}

write_pr_body() {
  local changed_skill_lines
  changed_skill_lines="$(collect_changed_skills)"

  cat > "$pr_body_file" <<EOF
## Summary

Sync generated Claude Code skills from the latest Piebald prompts snapshot.

## Changes

- Update generated skills under \`skills/\`
- Refresh \`skills/.ccskills-sync.json\`

## Why

Keep this repository aligned with the latest built-in Claude Code skill prompts published upstream.

## Notes

- This PR was created automatically by \`.github/workflows/sync-piebald-skills.yml\`.
- Source: \`$sync_source\`
- Changed skills:
$changed_skill_lines

## Testing

- \`pnpm sync\`
- \`pnpm test\`
EOF
}

create_commit() {
  git config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
  git config user.email "${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"

  git checkout -B "$sync_branch"
  git add skills

  if git diff --cached --quiet --exit-code; then
    echo "No generated skill changes to commit after staging."
    exit 0
  fi

  git commit -m "$commit_message"
}

create_or_update_pr() {
  local pr_number
  local rendered_body
  local summary_line
  local changes_line
  local why_line
  local notes_line
  local testing_line

  git push --force-with-lease origin "HEAD:$sync_branch"

  pr_number="$(
    gh pr list --base "$base_branch" --head "$sync_branch" --state open --json number --jq '.[0].number // empty'
  )"

  if [[ -n "$pr_number" ]]; then
    gh pr edit "$pr_number" --title "$pr_title" --body-file "$pr_body_file"
  else
    gh pr create --title "$pr_title" --body-file "$pr_body_file" --base "$base_branch" --head "$sync_branch"
    pr_number="$(
      gh pr list --base "$base_branch" --head "$sync_branch" --state open --json number --jq '.[0].number // empty'
    )"
  fi

  if [[ -z "$pr_number" ]]; then
    echo "Failed to determine PR number after create/edit." >&2
    exit 1
  fi

  rendered_body="$(gh pr view "$pr_number" --json body --jq .body)"
  printf '%s\n' "$rendered_body"

  if grep -Fq '\\n' <<<"$rendered_body"; then
    echo "PR body contains literal \\n sequences." >&2
    exit 1
  fi

  summary_line="$(printf '%s\n' "$rendered_body" | grep -n '^## Summary$' | cut -d: -f1)"
  changes_line="$(printf '%s\n' "$rendered_body" | grep -n '^## Changes$' | cut -d: -f1)"
  why_line="$(printf '%s\n' "$rendered_body" | grep -n '^## Why$' | cut -d: -f1)"
  notes_line="$(printf '%s\n' "$rendered_body" | grep -n '^## Notes$' | cut -d: -f1)"
  testing_line="$(printf '%s\n' "$rendered_body" | grep -n '^## Testing$' | cut -d: -f1)"

  if [[ -z "$summary_line" || -z "$changes_line" || -z "$why_line" || -z "$notes_line" || -z "$testing_line" ]]; then
    echo "PR body is missing one or more required sections." >&2
    exit 1
  fi

  if ! [[ "$summary_line" -lt "$changes_line" && "$changes_line" -lt "$why_line" && "$why_line" -lt "$notes_line" && "$notes_line" -lt "$testing_line" ]]; then
    echo "PR body sections are out of order." >&2
    exit 1
  fi

  if ! printf '%s\n' "$rendered_body" | awk '
    BEGIN { in_changes = 0; bullet_found = 0 }
    /^## Changes$/ { in_changes = 1; next }
    /^## / && in_changes == 1 { exit bullet_found ? 0 : 1 }
    in_changes == 1 && /^- / { bullet_found = 1 }
    END { exit bullet_found ? 0 : 1 }
  '; then
    echo "PR body Changes section does not contain '-' bullets." >&2
    exit 1
  fi

  if [[ "${SYNC_OPEN_WEB:-0}" == "1" && "${CI:-}" != "true" ]]; then
    gh pr view "$pr_number" --web
  fi
}

main() {
  require_command git
  ensure_changes_exist
  write_pr_body

  if [[ "$dry_run" == "1" ]]; then
    echo "Dry run enabled. Wrote PR body to $pr_body_file"
    cat "$pr_body_file"
    exit 0
  fi

  require_command gh
  create_commit
  create_or_update_pr
}

main "$@"
