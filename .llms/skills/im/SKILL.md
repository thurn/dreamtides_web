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
the change inside **device images** — the phone body/bezel frame, via
`--frame`, not a bare browser viewport. Serve the app from the **worktree** on
a non-default port and point the tool at it (`--url`/`--start`, never port
5173).

- **A mobile change is captured on all six phone targets, framed.** Pass every
  phone id with `--frame` in one run:

  ```bash
  node scripts/device-screenshots.mjs --frame \
    -d iphone-16 -d iphone-se-3 -d galaxy-s25-ultra \
    -d galaxy-a16-5g -d razr-plus-2025 -d galaxy-z-flip7 \
    --scene <scene> --url http://localhost:<port> -o "$WORKTREE/screenshots"
  ```

  Six framed phones is the deliverable for a mobile change — one phone is not
  enough, and an unframed viewport is not a device image. Add a desktop
  viewport as well when the change also alters the desktop layout.
- Jump straight to the affected screen with `--scene`/`--route`/`--query` so
  the capture shows the change, not the landing page. If the change is an
  overlay or state only reachable by interaction, add a `?goto=` QA scene for
  it (`src/runtime/qa-scenes.ts`) rather than a one-off URL flag — the tool
  loads a URL and cannot click.
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
