---
name: im
description: Implement a change in an isolated worktree, screenshot it on devices, and post the result to Discord. Use when asked to build/change something and share a preview — the implement-preview-share loop. Triggers on /im, implement and preview, implement and share, build it and post to discord, implement and screenshot.
---

# Implement → Preview → Share

Do the work in a worktree, capture how it looks on real device targets, and
post those captures to Discord. This skill only sequences three existing
skills — follow each linked skill for its actual mechanics; nothing here is
duplicated.

## 1. Implement in a worktree

Run the whole implementation under the **`/wt`** skill
(`~/.llms/skills/wt/SKILL.md`): invoke it via the Skill tool with the task
description, and do all analysis and edits in the worktree it creates, never
the primary tree. Follow the repo's verification steps (lint, typecheck,
tests) and commit as `/wt` directs.

Stop before `/wt`'s "prompt before promoting" step (its step 3) — the
screenshots you gather next are exactly what that prompt wants to show. Come
back and finish the promote/clean-up cycle after Discord (step 4 below).

## 2. Screenshot the change on devices

Use the [device-screenshots](../device-screenshots/SKILL.md) skill to render
the change on the relevant targets. Serve the app from the **worktree** on a
non-default port and point the tool at it (`--url`/`--start`, never port 5173).

- Pick targets that matter for the change: a phone (e.g. `iphone-16`) plus a
  desktop viewport for most UI work; add more only when the change behaves
  differently across form factors.
- Jump straight to the affected screen with `--scene`/`--route`/`--query` so
  the capture shows the change, not the landing page.
- Write captures somewhere stable under the worktree (e.g.
  `$WORKTREE/screenshots/`) so they survive until Discord and are removed with
  the worktree on clean-up.

## 3. Send the captures to Discord

Use the [send-images](../send-images/SKILL.md) skill to post the PNGs from
step 2, with a `--message` that names what changed. Confirm delivery (the
script reports a message ID) before moving on.

## 4. Finish the worktree cycle

Return to `/wt` step 3: present the local screenshot paths as bare plain text
and ask the user whether to promote the commits onto `master`, then
promote/clean-up per `/wt` on approval. Follow-up tweaks start a fresh `/im`
(new worktree), same as any `/wt` follow-up.
