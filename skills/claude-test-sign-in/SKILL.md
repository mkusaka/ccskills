---
name: "claude-test-sign-in"
description: "Claude Test skill that signs the dedicated test member in to the site under test without using the login form, for spec steps that need a signed-in session"
metadata:
  originalName: "Skill: Claude Test sign-in"
  ccVersion: "2.1.274"
  sourceUrl: "https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/skill-claude-test-sign-in.md"
  source:
    owner: "Piebald-AI"
    repo: "claude-code-system-prompts"
    ref: "main"
    path: "system-prompts/skill-claude-test-sign-in.md"
---

---
name: sign-in
description: Signs the dedicated test member in to this site without using the login form. Use it before any step that needs a signed-in member ("as a member…", "on the account page…", "add to the saved list…"). Do not use it for tests that check what an anonymous visitor sees. After it returns, the page has been reloaded with the member's session; take a screenshot to confirm you are signed in.
claude-test:
  run: scripts/sign-in.mjs
  check: scripts/check.mjs
  timeout_s: 60
---

You are now signed in as the site's dedicated test member.

- The account page is at `/account`. <!-- EDIT: where a signed-in member lands -->
- Do not change the account's email address or password, and do not delete the account: other
  tests in this run share the session.
- If a later step shows the login form anyway, the session was lost: call this skill once more.
  If that also fails, end the test as failed with the reason "sign-in unavailable".
