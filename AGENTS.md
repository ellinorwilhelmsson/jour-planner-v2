## Simplicity

Prefer the simplest solution that fully meets the current requirements. Avoid overengineering, unnecessary abstractions, extra dependencies, and speculative features. Add complexity only when a concrete need justifies it, and favor clear, maintainable solutions.

## GitHub

When creating pull requests, create ready-for-review PRs by default.
Do not create draft PRs unless I explicitly ask for a draft PR.
When creating pull requests, always create the PR from the original feature branch whenever possible.
Never squash merge pull requests. Preserve feature-branch history by using a regular merge commit unless I explicitly request another non-squash strategy.

## Context Safety

If the expected working directory, worktree, or branch from the current session does not exist, stop and ask me which repo or branch to use before continuing.
Do not infer the intended task from nearby worktrees, recent branches, recent pull requests, or similarly named issues unless I explicitly direct you to do so.
When asked to ship, promote, verify, or report on work, first confirm that the branch or PR being used matches the current session's intended work item. If the match is ambiguous, ask before taking action or reporting completion.

## Git Branching

Do not create a new branch without asking me first, except when beginning work on an issue that does not already have a linked feature branch; in that case, automatically create the feature branch.
Feature branches are always branched from `main`, no exceptions unless explicitly requested by the user.
Never merge or rebase to or from a feature branch unless explicitly requested by the user.
Never merge or rebase `dev` into `main`; promote changes to `main` through feature branches or explicit cherry-picks instead.

## Azure Change Control

Never manually update Azure resources directly unless I explicitly ask for it or give permission for that specific change.
Never deploy code binaries directly to Azure App Services, Function Apps, or similar runtime resources unless I explicitly ask for it or give permission for that specific deployment.
Default to using the repository's CI/CD pipelines for deployments and infrastructure changes.

## Authentication

Follow the target repo or tool's documented authentication helper, identifiers, scopes, and cache. Reuse cached credentials and supported silent refresh before interactive sign-in. Never substitute another service's client or audience, discard refresh credentials solely because an API returns 401, or treat network/sandbox failures as a reason to log in again.

Keep credentials out of output, logs, command-line arguments, and Git. Use the documented private cache and owner-only permissions. Leave service-specific OAuth commands, cache formats, and renewal logic in the repo's instructions/helper.

When interaction is required, try the already signed-in browser session. If credentials, MFA, account selection, consent, or another user decision is needed, hand off with the clickable authentication URL and exact user-facing code (or state that none was provided), then wait for `done`. Never request or expose passwords or tokens. Preserve the original pending authentication session through browser assistance and manual fallback; resume it after `done`. Report expiry or terminal errors before starting a replacement session.

For GitHub, verify cached credentials with a read-only API request outside the restricted network sandbox before login or scope refresh (`gh api user --jq .login`). Refresh only for an actual authentication/scope error, requesting the hostname and all required scopes together; Projects uses `gh auth refresh --hostname github.com -s project`. Resume the original command and verify the intended operation before retrying authentication.

## Clarification and Agreement

Before starting implementation, ask three to five important clarification questions when the goal, scope, requirements, or consequential choices are unclear. Focus on questions whose answers affect the work, and ask them together when practical. For simple, clearly specified tasks, ask fewer questions or none. Do not repeat questions already answered in the conversation. Read-only inspection may continue when it helps clarify the task, but do not make changes that depend on unresolved answers.

Before making changes, briefly summarize the agreed goal, scope, key decisions, and any relevant exclusions.

Agreement is established when the user has answered the important clarification questions or explicitly approved a concrete proposal, and no material questions remain unresolved. If the summary only restates what the user has already confirmed, proceed without asking for approval again. If it introduces new assumptions, choices, or scope changes that materially affect the work, ask for confirmation and wait for the answer before making dependent changes. Silence is not agreement.

After completing the work, provide a short summary of what changed, how it was checked, and anything that remains unfinished or needs attention.
