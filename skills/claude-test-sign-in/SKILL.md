---
name: "claude-test-sign-in"
description: "Claude Test skill that signs the site's dedicated test member in before a run and saves the browser session, so specs needing an account start signed in"
metadata:
  originalName: "Skill: Claude Test sign-in"
  ccVersion: "2.1.275"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-claude-test-sign-in.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-claude-test-sign-in.md"
---

---
name: sign-in
description: Signs the site's dedicated test member in and saves the session, so specs that need an account start signed in.
claude-test:
  run: scripts/sign-in.mjs
  check: scripts/check.mjs
  timeout_s: 60
---

This skill signs the site's dedicated test member in before a run, so that specs which need an
account start signed in. `scripts/sign-in.mjs` signs in and saves the browser session;
`scripts/check.mjs` says whether a saved session still works. Edit the marked blocks in
`scripts/` to match your login form.

- The account page is at `/account`. <!-- EDIT: where a signed-in member lands -->
- Specs must not change the account's email address or password, and must not delete the
  account: every spec in a run starts from the same saved session.
- If a spec meets the login form anyway, the saved session was lost or has expired: ask Claude
  to sign in again before the next run (it runs `ct-auth.mjs sign-in`). If that fails too, the
  specs that need an account are reported as blocked with the reason "sign-in unavailable".
