*Always* commit changes with detailed description, then `git push` immediately.

When making a *minor* revision to a commit which has not been pushed to remote, it's fine to amend instead of making a new commit.

Do not print a summary of changes.

# Verification

Run the core checks after code changes:

```bash
npm run lint
npm run typecheck
npm test
```

Run the commands from the repository root. In a fresh worktree, run
`npm install` before these checks because `node_modules` is not committed.

For quest prototype UI work, run browser QA with `/opt/homebrew/bin/agent-browser`
against a local Vite server. `npx agent-browser` is an acceptable fallback when
the Homebrew-installed binary is unavailable. Start the QA Vite server on a port
other than `http://localhost:5173` (for example `npm run dev -- --port 5174`) so
QA does not kill the developer's own server already running on the default port. Validate the feature through the
normal player workflow, inspect the captured error buffer for render errors,
unhandled rejections, and console errors, and check the UI state directly in
the browser. Confirm controls are usable, expected state changes occur, text
and controls are fully visible, layout spacing is stable, elements are free of
clipping or overlap, and the resulting screen is visually coherent at the
tested viewport sizes.

# Documentation style

Do not describe what the system *no longer* does. Documentation should describe
the current system as it exists, not contrast it against removed behaviour.
Phrasings like "X no longer exists", "there is no longer a Y", "this is no
longer used", "we removed Z", or "unlike before" are not acceptable in
documentation. Write the current state directly.
