---
name: backlog-execute
description: Sequentially work through task files in /tmp/backlog/ by dispatching one implementer subagent per task, then a reviewer subagent, then committing. Lightweight variant of subagent-driven development scoped to the quest prototype backlog. Use when the user says "work the backlog", "execute the backlog", "run backlog-execute", or asks to start grinding through /tmp/backlog/.
---

# Backlog Execute

Drain `/tmp/backlog/` one task at a time. For each task: implementer subagent
→ reviewer subagent → fix loop until approved → commit + push → archive the
task file. Continue without checking in with the user between tasks.

This is a deliberately lightweight variant of
`super-subagent-driven-development`. One implementer, one reviewer, one
commit per task.

## When to use

- The user has run the `backlog` skill (or otherwise produced standalone
  task files in `/tmp/backlog/`) and now wants them executed.
- Tasks are independent enough to be done sequentially without a shared
  branch strategy.

If `/tmp/backlog/` is empty or missing, stop and tell the user.

## The loop

```
1. List /tmp/backlog/*.md (sorted) — these are the remaining tasks.
2. Pick the lowest-numbered task. Read its full contents.
3. Dispatch IMPLEMENTER subagent with the task text inline (template below).
4. If implementer returns BLOCKED / NEEDS_CONTEXT, handle per
   super-subagent-driven-development guidance and re-dispatch.
5. Dispatch REVIEWER subagent (template below).
6. If reviewer flags issues, re-dispatch implementer with the issue list.
   Loop steps 5-6 until reviewer approves. Cap at 3 review rounds — if
   still failing, stop and surface to the user.
7. Once approved, the implementer's commit is the canonical commit. Verify
   it landed and was pushed (per AGENTS.md, every commit is pushed
   immediately).
8. Move the task file to /tmp/backlog/done/<same-filename> so it disappears
   from the active list. Move its screenshot too if present.
9. Goto 1.
```

Stop conditions: list empty, hard blocker the user must resolve, or three
failed review rounds on a single task.

## Subagent dispatch

Use `general-purpose` agents for both roles. Run them in the foreground —
the loop is sequential and you need each result before continuing. Do not
parallelize implementers across tasks; later commits depend on earlier ones
landing.

The implementer makes its own commits and pushes. Do not commit from the
controller.

## Implementer prompt template

Paste this verbatim, filling in `{{TASK_PATH}}` and `{{TASK_BODY}}`. Do
**not** ask the implementer to read the task file itself — give them the
full text inline so context is explicit.

```
You are executing one task from the quest prototype backlog at
`{{TASK_PATH}}`.

Working directory: /Users/dthurn/quest_prototype
Branch: whatever is currently checked out — do not switch branches.

## Required reading

Before starting, load the project skills you will need:

- `.llms/skills/qs/SKILL.md` — runtime model, key files, commands,
  agent-browser QA conventions. Mandatory.
- `.llms/skills/quest-battle/SKILL.md` — load only if the task touches
  `src/battle/`.
- `~/.llms/skills/super-systematic-debugging/SKILL.md` — load if the bug
  resists initial reproduction.
- `~/.llms/skills/super-test-driven-development/SKILL.md` — load if the
  task asks for new behavior or regression tests.

Honor `AGENTS.md` (the project's root agent rules): commit changes with a
detailed description and `git push` immediately. Minor revisions to an
unpushed commit may be amended; otherwise create a new commit. Do not
print a summary of changes after the commit.

## Task

{{TASK_BODY}}

## Execution rules

1. **Reproduce first.** The task acceptance criteria require a pre-fix
   reproduction in agent-browser with a screenshot saved under
   `/tmp/backlog/screenshots/`. Do this before changing any code. If you
   cannot reproduce the issue, follow the task's "QA blocker policy"
   section — build a debug surface if needed. Inability to reproduce is
   a hard blocker, not a reason to skip.

2. **Stay in scope.** Fix what the task describes. If you discover
   adjacent issues that warrant their own work, **file new task files in
   `/tmp/backlog/` using the `backlog` skill template** rather than
   bundling unrelated fixes into this commit.

3. **Go one level deeper where it makes sense.** Per the task's "going
   one level deeper" section, look for related occurrences, architectural
   root causes, and logging/debug-surface improvements that would prevent
   recurrence. Bundle the deeper fix into this commit when it's clearly
   the same root cause; file a follow-up task otherwise.

4. **Verify after.** Re-run the agent-browser scenario with a post-fix
   screenshot. Run `npm run typecheck`, `npm run lint`, and `npm test`.
   Add or update a regression test where it would have caught this bug.

5. **Commit and push.** Use a detailed commit message that explains the
   problem, the fix, and any deeper work. Push immediately.

## When you're stuck

It is always OK to stop and report BLOCKED. Bad work is worse than no
work. Escalate when:
- The task requires architectural decisions with multiple valid
  approaches.
- You cannot reproduce the issue even after building a debug surface.
- The fix would require restructuring code outside the task's scope in
  ways the task didn't anticipate.

## Self-review

Before reporting DONE, re-read your diff with fresh eyes:
- Did I fix what the task actually asked for?
- Did I add anything not requested? Remove it.
- Are tests verifying behavior, not just calling code?
- Does the post-fix screenshot actually show the expected state?
- Did I follow `AGENTS.md` doc style (no "no longer" phrasing in any
  text I wrote)?
- Did I push?

## Report format

Reply with:

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- **Commit SHA(s):** the hashes you pushed
- **Files changed:** short list
- **Reproduction:** path to pre-fix screenshot, brief description of how
  you reproduced
- **Verification:** path to post-fix screenshot, output of typecheck /
  lint / test (pass/fail counts)
- **Deeper work:** anything you fixed beyond the literal bug, or
  follow-up tasks you filed in `/tmp/backlog/`
- **Concerns:** anything you're uncertain about
```

## Reviewer prompt template

Paste verbatim, filling `{{TASK_PATH}}`, `{{TASK_BODY}}`,
`{{IMPLEMENTER_REPORT}}`, `{{BASE_SHA}}`, and `{{HEAD_SHA}}`.

```
You are reviewing one backlog task in the quest prototype.

Working directory: /Users/dthurn/quest_prototype

## Task that was assigned

{{TASK_BODY}}

(Original task file: `{{TASK_PATH}}`)

## What the implementer reported

{{IMPLEMENTER_REPORT}}

## Commits to review

`git diff {{BASE_SHA}}..{{HEAD_SHA}}` — review every commit in this
range, not just the latest.

## Do not trust the report

Verify everything by reading the actual diff and the actual artifacts.

## Checklist

**Spec compliance**
- Does the diff implement what the task asked for?
- Did the implementer add scope that wasn't requested? (Bundling a
  legitimate deeper-root-cause fix is fine; sneaking in unrelated
  refactors is not.)
- Did they skip any acceptance criteria?

**QA evidence**
- Does a pre-fix screenshot exist under `/tmp/backlog/screenshots/`?
  Open it and confirm it shows the broken state described in the task.
- Does a post-fix screenshot exist? Open it and confirm it shows the
  expected state. If both screenshots look identical, that is a fail.
- Did `npm run typecheck`, `npm run lint`, and `npm test` actually pass
  in the implementer's report? Re-run them yourself if there's any
  doubt.

**Code quality**
- Each touched file has a clear responsibility.
- Names are accurate.
- No dead code, no commented-out blocks, no debug `console.log`s left
  behind, no "no longer" / "removed" phrasing in docs (per `AGENTS.md`).
- Tests verify behavior, not just structure.
- Regression test would have caught the original bug.

**Quest prototype hazards**
- If the change touches `src/types/quest.ts` adding a `null` / `[]` /
  `{}` field, did they also update `createDefaultState()` and
  `normalizeQuestState`? (See `qs` skill, "Multiplayer Persistence".)
- If the change touches `src/multiplayer/room-service.ts`, is there a
  test covering the RTDB-stripped snapshot case?
- If the change touches battle UI, was `PlayableBattleScreen.test.tsx`
  updated where appropriate?

**Commit hygiene**
- Was the commit pushed?
- Is the commit message detailed enough to explain the problem and the
  fix without reading the diff?

## Report format

Reply with one of:

- **APPROVED** — short note on what was good.
- **CHANGES REQUESTED** — bulleted list of specific issues with
  file:line references. Each item must be actionable.
```

## Re-dispatch on issues

If the reviewer requests changes, dispatch a follow-up implementer with:

```
You are continuing work on `{{TASK_PATH}}`.

A reviewer flagged the following issues with your previous commit
({{HEAD_SHA}}):

{{REVIEWER_ISSUES}}

Address each issue. Per `AGENTS.md`, since the previous commit has
already been pushed, create a NEW commit (do not amend). Push
immediately. Then report back in the same format as before.
```

If the reviewer requests changes a second time, the third implementer
dispatch should explicitly include both prior reviewer reports so the
implementer can see the full chain. If a third round still fails, stop
and surface to the user — something structural is wrong with the task or
the approach.

## Archiving completed tasks

After approval, move the task file out of the active queue:

```bash
mkdir -p /tmp/backlog/done
mv /tmp/backlog/NNN-<slug>.md /tmp/backlog/done/
# also move its screenshot if present
[ -f /tmp/backlog/screenshots/NNN-<slug>.png ] && \
  mkdir -p /tmp/backlog/done/screenshots && \
  mv /tmp/backlog/screenshots/NNN-<slug>.png /tmp/backlog/done/screenshots/
```

## Final summary

When `/tmp/backlog/*.md` is empty (or you stopped on a blocker), print:

- count of tasks completed this session
- one-line table of `NNN — title — commit-sha`
- any tasks left in `/tmp/backlog/` and why
- any new follow-up tasks the implementers filed

Then stop.

## Anti-patterns

- Pausing between tasks to ask "should I continue?" — execute the queue.
- Parallel implementer subagents — later tasks may depend on earlier
  commits and the working tree only has one state.
- Controller-side commits — the implementer commits its own work.
- Skipping the reviewer because "the task was small."
- Skipping the agent-browser pre/post screenshots because "the test
  passes." The task template requires both; the reviewer enforces both.
- Treating "could not reproduce" as task complete. Per the task
  template, reproduction is a hard blocker.
- Bundling unrelated fixes into the same commit. File a new task
  instead.
