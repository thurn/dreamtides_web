---
name: backlog
description: Convert a loose bullet-point list of 10-30 quest prototype bugs/issues into high-quality, standalone task files written to /tmp/backlog/. Use when the user supplies a backlog dump, asks to "groom the backlog", or asks to turn rough notes into actionable tasks. Triggers on backlog, bug list, issue list, groom, file tasks, write tasks, ticketize.
---

# Backlog Grooming

Turn a rough list of bugs/issues into a set of high-quality, standalone task
files that any future agent can pick up and execute end-to-end without any
additional context from the original conversation.

The input is a bullet-point list of 10-30 short descriptions. The output is one
markdown file per task in `/tmp/backlog/`.

## Required reading

Before doing anything else, load:

- `~/.llms/skills/grill-me/SKILL.md` — the interview pattern you will use to
  clarify each ambiguous description.
- `.llms/skills/qs/SKILL.md` (the `qs` skill) — runtime model, key files, and
  browser QA conventions for the quest prototype. Most tasks will reference
  files and surfaces it indexes.
- `.llms/skills/quest-battle/SKILL.md` if any item touches battle UI.

## Pipeline

Run these phases in order. Do not skip ahead.

### 1. Parse the input list

Read the user's bullet list and produce a numbered working list. Preserve the
user's original wording verbatim alongside your parsed interpretation so
nothing gets quietly rewritten.

If the list is shorter than 10 items or longer than 30, confirm with the user
before proceeding — the skill is sized for that range.

### 2. Lightweight codebase exploration (parallel)

Spawn a small number of `Explore` subagents in parallel to ground the task
descriptions in real file paths and component names. This is **navigational
only** — do not investigate root causes or write fixes.

Group related items and dispatch one `Explore` agent per group. A reasonable
default is 2-4 agents covering, e.g.:

- atlas / dreamscape / site routing
- battle screen + overlays
- multiplayer / room-service / persistence
- draft / dreamcaller / quest-content

Each agent should return, per item it covers:

- the most likely owning file(s) with line numbers
- the nearest user-facing component
- any obviously related test file
- one sentence on how the surface is reached in the running app

Cap the agent prompts: "report under 300 words, file:line references only,
no analysis of correctness."

### 3. Lightweight UI exploration via agent-browser

Boot the app and walk the surfaces that the listed items reference. Goal:
ground each task description in what the user actually sees, with a screenshot
when the surface is non-obvious. **Do not try to reproduce the bugs here.**

Follow the `qs` skill's "Open The App" + "Smoke Path" sections for setup.
Install the `__caps` error hook before clicking anything. For each surface
that a task touches, capture:

- screen name and how to reach it (URL params + click path from the landing
  screen)
- one screenshot saved under `/tmp/backlog/screenshots/<slug>.png`
- the visible labels/buttons that the task description refers to (so the
  written steps use the exact text that appears in the UI)

If a surface is gated behind state that takes many clicks to reach, note the
shortest known path (e.g. `?startInBattle=1`) instead of fully traversing.

### 4. Grill the user

For each item where the parsed interpretation is ambiguous, invoke the
`grill-me` pattern: ask one focused follow-up question at a time, with your
recommended answer, until you have enough to write a standalone task.

Batch related questions across items only when it would clearly save the user
time; otherwise stay one-at-a-time per `grill-me`'s rules. If a question can
be answered by reading the codebase, read the codebase instead of asking.

Common things to clarify:

- which surface/screen the user means when the wording is generic
- expected vs. actual behavior when only one is stated
- scope: cosmetic, functional, blocking
- whether a "fix" is a UX redesign or a literal bug fix
- any prior attempts the user already ruled out

### 5. Write task files

Create `/tmp/backlog/` if it does not exist. Write one file per task as
`/tmp/backlog/NNN-<kebab-slug>.md` where `NNN` is a zero-padded sequence
number matching the original input order.

Use the **task template** below. Every task must be standalone — assume the
implementer has not seen the input list, the user, or this conversation.

The template intentionally omits universal boilerplate (standard acceptance
criteria, the generic going-deeper checklist, QA blocker policy, UX
expectations). That content is appended in phase 6 by a script. The
sections in the template are reserved for **task-specific** extensions of
those universal items — write only what is unique to this bug.

### 6. Append general implementation instructions

After all task files are written, run:

```sh
bash .claude/skills/backlog/append-general-instructions.sh /tmp/backlog/
```

This appends a `# How to Implement This Task` section to each task file
containing the universal acceptance criteria, going-deeper checklist, QA
blocker policy, and UX expectations. The script is idempotent — files that
already contain the section are skipped, so it is safe to re-run.

Do **not** stop without running this script. Implementers rely on the
universal section being present.

After the script completes, print a summary to the user listing each created
file with its title.

## Task template

Each `/tmp/backlog/NNN-<slug>.md` file must follow this structure:

```markdown
# <Clear, specific title summarizing the problem or desired change>

## Summary

<2-4 sentences: what is broken or missing, and why it matters to the user.
Stand-alone — no references to "the list" or "the conversation".>

## Reproduction

**Environment:** quest prototype (`~/quest_prototype/`), `npm run dev`,
agent-browser. Note any URL params required (`?startInBattle=1`, etc.).

**Steps:**

1. <exact click path from the landing screen, using the labels that appear
   in the UI>
2. ...
3. ...

**Expected:** <what should happen>

**Actual:** <what actually happens>

**Evidence:** <link to screenshot under /tmp/backlog/screenshots/, log
excerpt, or RTDB curl if relevant. If there is no captured evidence yet,
write "Not yet captured — implementer must capture during repro phase.">

## Suspected area

<File paths with line numbers from the codebase exploration. Mark these as
starting points, not verdicts. Example:

- `src/battle/components/PlayableBattleScreen.tsx:312` — owns the reward
  overlay open/close state.
- `src/battle/state/controller.ts` — forced-result plumbing.

If the area is genuinely unknown, say so explicitly.>

## Acceptance criteria

<Only **task-specific** criteria. Do NOT include the standard items (repro
screenshot, post-fix screenshot, typecheck/lint/test, regression test) —
those are appended automatically. Examples of what belongs here:

- [ ] Deck count updates correctly across reload.
- [ ] Trigger arrow stays attached to its keyword at all card widths.

If the task has no extra criteria beyond the standard set, omit this
section.>

## Implementation notes

<Anything the implementer needs that is not derivable from the code:
constraints, related decisions, prior attempts, or design intent. Keep
short. Omit the section if there is nothing to add.>

## Going one level deeper

<Task-specific deeper considerations the implementer should keep in mind
while fixing this bug. Do NOT re-state the universal checklist (adjacent
surfaces, architectural root causes, debug surfaces, follow-up tasks) —
that is appended automatically. Use this section for issue-specific
extensions, e.g. "Check other trigger glyphs (⍏ spark, ↯ fast) for the same
wrapping problem." Omit if there is nothing task-specific to add.>

## QA blocker policy

<Task-specific repro hints, e.g. "narrow the browser via `agent-browser
eval window.resizeTo(900, 700)` before screenshotting" or "this only
reproduces with two clients connected to the same room." Do NOT re-state
the universal fallback ladder (fresh room → RTDB → debug surface → ask) —
it is appended automatically. Omit if the reproduction steps above are
sufficient.>

## UX expectations

<Task-specific UX considerations, e.g. "Sanity-check that other
heavily-wrapped phrases still wrap naturally" or "the orphaned arrow makes
cards look broken — prioritize visual continuity." Do NOT re-state the
generic UX guidance — it is appended automatically. Omit if nothing
task-specific applies.>
```

Sections may be omitted entirely when they have no task-specific content.
The appended `# How to Implement This Task` section will still cover the
universal expectations.

## Conventions

- Filenames: `NNN-<kebab-slug>.md`, zero-padded to 3 digits, slug derived
  from the title (lowercase, hyphen-separated, trim stop-words).
- Screenshots: `/tmp/backlog/screenshots/<same-slug>.png`. Reuse the slug so
  the screenshot is trivially co-located with the task.
- Do not include a global index file unless the user asks for one; the
  filenames are the index.
- Do not delete or overwrite existing files in `/tmp/backlog/` without
  confirming with the user — they may be in flight.
- Keep each task self-contained. Do not write "see task 004 for context" —
  duplicate the context instead.

## Anti-patterns

- Writing tasks straight from the bullet list without grilling. Ambiguous
  tasks produce wasted implementation work.
- Investigating root causes in this skill. That is the implementer's job.
  Stay navigational.
- Writing tasks that assume the implementer remembers the user's intent.
  Every file must read cleanly to a stranger.
- Skipping the agent-browser pass because "the description is clear." The
  point of the UI pass is to lock in real labels and click paths so the
  task steps work the first time.
- Creating one giant aggregate task for related items. Prefer one file per
  discrete issue; the implementer can batch if they choose.
- Using "no longer" / "removed" phrasing in task descriptions (per
  `AGENTS.md`). Describe the desired current state directly.
- Re-stating the universal acceptance-criteria / going-deeper / QA-blocker
  / UX-expectations boilerplate inside a task. The script appends it; you
  only write task-specific extensions.
- Forgetting to run `append-general-instructions.sh` before stopping.
  Implementers expect the universal section to be present.

## Output

When done, print:

- the count of tasks created
- a one-line table of `NNN — title` for each file
- confirmation that `append-general-instructions.sh` ran successfully
- the path to `/tmp/backlog/` so the user can browse

Then stop. Do not start implementing tasks unless the user asks.
