# Workflow

This page tells the executing session how to do the work. The phase pages say
what the work is.

The rules here combine three sources:

- the Hive executor role (`executor`, `bead`, and `justiciar` skills; see
  `~/hive/skills/`);
- the global `wt` skill (`~/.llms/skills/wt/SKILL.md`);
- this repository's [AGENTS.md](../../AGENTS.md).

Where they differ, the [decisions](decisions.md) win, then AGENTS.md.

## Identity and scope

- **There is one Claude Code session.** Its actor is
  `"${CLAUDE_CODE_SESSION_ID:?}"`, expanded inside the same command as each
  Beads call.
- **Never delegate implementation.** Agent-tool subagents share the parent's ID
  and must never claim or rename. The only subagent use is the cold-review
  fallback.
- **The Hive project is `dreamtides_web`.** Never claim, edit, or close beads
  of another project.
- **Continuous mode is explicitly authorized.** After closing a bead, continue
  with the next eligible bead of the current phase. When the phase gate closes,
  file and start the next phase.

## Beads

Define the routing prefix in every shell command that touches Beads:

```sh
hbd() { env BEADS_DIR=/Users/dthurn/brain/.beads BEADS_DOLT_AUTO_START=0 BD_NON_INTERACTIVE=1 BD_NO_HOOKS=true bd --sandbox --dolt-auto-commit off --actor "${CLAUDE_CODE_SESSION_ID:?}" "$@"; }
```

**Never start a Dolt server, initialize a store, or fall back to another
database.** An unavailable server is a blocker; handle it with the
[recovery](#failure-and-recovery) rules.

### Filing a phase

Do this at the start of each phase, before any implementation. Phase 1 was
filed by the planning session; see the [README](README.md#starting-the-run).

1. **Create the epic.** Create it ready, then inspect it.

   ```sh
   hbd create --type epic --priority 1 --title 'Phase 3: Rules engine core' \
     --description 'See docs/plan/phase-3-engine.md. ...' \
     --acceptance '<the phase exit gate, copied from the phase page>' \
     --metadata "{\"hive_project\":\"dreamtides_web\",\"hive_origin_thread\":\"${CLAUDE_CODE_SESSION_ID:?}\"}" --json
   ```

2. **Create one child per task on the phase page,** in order. Give each:
   - `--parent <epic>`;
   - a description that names its phase-page section and its scope;
   - acceptance criteria copied from the phase page;
   - `hive_origin_thread` metadata.

   Omit `hive_project` for now: the child has a prerequisite.

3. **Chain the children.** Each child depends on the previous one:
   `hbd dep add <child-k> <child-k-1>`. The gate task depends on the last
   implementation task. Inspect the edges with `hbd show <id> --json`.

4. **Make the children selectable.** Only after the edges are correct, set
   `--set-metadata hive_project=dreamtides_web` on each child.

5. **File content batches separately.** Phase 5 batches are filed after the
   inventory task closes, because their composition depends on it. Use the
   same pattern.

**Follow-up work gets a new bead, chained into the sequence.** It never gets a
reopen. A newly discovered prerequisite of the current bead gets a new bead
and an edge. Checkpoint the current bead, then work the prerequisite first.

### Claiming and working

- **Claim task beads, never epics.** `hbd ready` also lists each phase's epic.
  Skip it: an epic closes only after its gate task closes.
- **Claim before substantive work:** `hbd update <id> --claim --json`. Proceed
  only on acknowledgement.
- **Retitle the session** with the native title tool: `set_session_title` on
  session `self`, in the Claude desktop app. Use
  `⚒️ [<id>] <short imperative summary>` while working and `✅ [<id>] <same
  summary>` after closing. A failed rename is reported and retried; it never
  blocks.
- **Record transitions** with `hbd update <id> --append-notes '...'`:
  - worktree path and branch;
  - candidate ID and source OID;
  - key measurements;
  - decisions made;
  - blockers and next action.

  Update at meaningful transitions, not every tool call.
- **One unfinished assignment at a time.**

### Closing

After Tollgate reports the candidate promoted, `release` and remote `master`
synchronized, and the worktree cleaned up:

```sh
hbd update <id> --set-metadata hive_resolution=completed --append-notes 'Promoted <tested-oid> via <candidate-id>; evidence: ...'
hbd close <id> --reason '<one-line outcome>'
```

A gate bead closes only after its review is resolved and its phase evidence is
written.

## Delivery

Every bead follows the `wt` skill:

1. Create a fresh Tollgate worktree: `tg --no-launch worktree create wt/<slug>`.
2. In the worktree, run `npm install`. Copy nothing from the primary checkout.
3. Implement. Validate with the [ladder](#validation-ladder). Do browser QA if
   the change affects runtime behavior or presentation.
4. Make one detailed Conventional Commit, with `type(scope): imperative
   summary` and a body for non-trivial changes. Include
   `pre-existing-issues.txt` updates if any.
5. Submit with `tg --no-launch --json candidate HEAD`.
6. Authorize at once with `tg --no-launch approve <candidate-id> --wait`. This
   plan grants promotion authority for in-scope work and in-scope CI repairs.
   **Never pause for approval.**
7. Repair CI failures with the `wt` bounded loop:
   - `tg diagnose`;
   - repair;
   - amend;
   - submit a new candidate;
   - authorize it.
8. Confirm the candidate is promoted, `release` contains the tested OID, remote
   `master` equals `release`, and the worktree is gone. Then close the bead.

**One bead is one commit.** A bead too large for one reviewable commit is
split into several beads at filing time, or as soon as the size becomes
apparent. The target is under ~1,500 changed non-test lines per bead.
Mechanical deletions may be larger.

Remote GitHub `checks.yml` runs after each push. Inspect its result for the
promoted commits **at each phase gate**, not per bead. Repair Linux-only
failures in a dedicated bead.

## Validation ladder

Run the cheapest relevant check first:

1. **While iterating:** `npm test -- <file>` for focused tests. Use
   `npx vitest run <file> -t '<name>'` for one case.
2. **Before committing:** `npm run review`, the diff-aware lint, typecheck, and
   related tests.
3. **Only when the change touches** test infrastructure, repository-wide
   config, or cross-cutting architecture: `npm run review:full` locally.
   Otherwise Tollgate's full gate is the aggregate.
4. **Engine and content beads** also run the fuzz smoke:
   `npm run fuzz:engine -- --games 200`, introduced in Phase 3. Run it before
   committing.

Tests follow AGENTS.md. Never gate on timing, statistics, UI strings, or
mutable production data. **Budgets are monitored, never asserted.** Phase 1
defines them in `docs/plan/evidence/metrics.md`.

## Reviews

The independent review is a fresh `gpt-5.6-sol` reviewer run through the
Codex CLI. It runs:

- for every bead marked **core-review** on the phase pages;
- on every phase gate bead, covering the whole phase diff.

Use the binary path, not the shell alias. The alias adds
`--dangerously-bypass-approvals-and-sandbox`.

```sh
/Users/dthurn/.local/bin/codex exec -m gpt-5.6-sol -s read-only -C "$WORKTREE" \
  -o "$WORKTREE/../review-<bead-id>.md" "$(cat <<'EOF'
Independently review the completed change for the request below. Work read-only.
Inspect the diff of HEAD against <base-oid> in this repository and read enough
surrounding code to validate each claim. Report only actionable correctness or
architecture issues, brittle tests, missing coverage for changed behavior, or
duplication likely to diverge. For each finding cite file and line, explain the
concrete failure mode, and why it belongs to this change. If none, say so.

Request: <bead title + acceptance criteria + relevant docs/plan page section>
Repository instructions: AGENTS.md, docs/plan/README.md, docs/plan/engine-design.md
EOF
)"
```

Then follow the `independent-review` skill's steps 3–6:

- Verify every finding against the code.
- Fix only the confirmed ones.
- Validate.
- Record each disposition (accepted, rejected, or unresolved) in the bead
  notes.

For a phase gate, use the phase's first commit's parent as the base, so the
diff covers the whole phase.

**When Codex is unavailable** (a usage limit or service error), follow this
procedure:

1. Record `review-debt` in the bead notes, with the base and head OIDs.
2. Continue the bead's delivery. A core bead's review debt carries to the next
   bead boundary.
3. Retry once at each subsequent bead boundary. When it succeeds, review the
   debt's exact range. Fix confirmed findings in a new bead.
4. At a phase gate, if debt remains and Codex has failed for over 6 hours, run
   a **fallback cold review**: an Agent-tool subagent with the `warden` skill
   and no inherited context, given the same scope and diff. Label it
   "fallback (not Sol)" in the notes. Never describe a fallback as the
   independent review.

## Browser QA

Use the globally configured Playwright MCP service (`http://localhost:8931/mcp`).
If it is unavailable, run `playwright-mcp-service start` and retry. **Never
launch browsers directly.** The project details (scenes, URL parameters,
assert-before-acting) are in the README's QA section. Before Phase 2.1 merges
them there, they are in `docs/journey_prototype/qa_tooling.md` and
`qa_scenes.md`.

### Servers and contexts

- Run the QA dev server from the worktree on port **5174 or higher**, never
  5173: `npm run dev -- --port 5174`.
- Record the server's PID or process group in the bead notes' runtime ledger.
- Kill only that PID. Never use `pkill -f vite` or other broad patterns.
- Close the MCP browser context before authorizing the candidate.
- Before each screenshot, assert `location.href` and `window.innerWidth`.
- After each interaction, read `window.__caps`. It must be empty.

### Screenshots

Write screenshots to `artifacts/qa/<bead-id>/`. Verify that path is gitignored
before first use; add it to `.gitignore` in Phase 1. Reference each screenshot
by filename only. Never commit images.

The default budget per changed surface is one desktop capture (1440×900), one
mobile capture (390×844), and one changed interaction state. Verify each with
`file <path>`.

### Card QA (Phases 4–7)

**Scripted sweep.** `node scripts/qa/card-sweep.mjs --cards <uuids> | --bead
<id>` drives the Playwright MCP service through `scripts/screenshot-runtime.mjs`.
It is built in Phase 4. For each card and variant, it:

1. opens `?goto=card-lab&card=<uuid>&variant=<v>`;
2. plays the card through the UI;
3. answers prompts with the first legal choice;
4. passes until the stack is empty.

It flags these failures:

- `__caps` errors;
- a human decision pending with no visible, enabled control;
- the card not reaching its expected zone;
- no `Resolved` engine event;
- no visible board or log change.

Results are appended to the QA ledger.

**Judged QA.** Judge cards per [D21](decisions.md#d21-browser-qa-coverage).
For each judged card, check all of these on desktop and mobile:

1. **Playable affordance.** Playability is visible, and unplayable cards look
   disabled.
2. **Prompts.** Prompts name the right thing, with the right count. Optional
   prompts are marked optional. Cancel and back behave correctly.
3. **Targets.** Exactly the legal targets are highlighted and selectable.
4. **Resolution.** The effect is visible on the board (animation, counter,
   status) and appears in the battle log in plain language.
5. **Durations.** "Until end of turn" and similar effects show an indicator
   while active, and the indicator clears on expiry.
6. **Opponent side.** With `&as=enemy`, the AI plays the card and the human can
   follow what happened: reveal dwell, targets shown, log.
7. **Layout.** No clipping or overlap of prompts and controls. `__caps` is
   empty.

**QA ledger.** Write one JSONL line per verdict to
`docs/plan/evidence/qa-ledger.jsonl`:

```json
{"uuid":"7be2e6d7-abff-4c44-a0c3-35460da1693c","variant":"base","mode":"sweep","verdict":"pass","notes":"","bead":"hv-xxx","commit":"<oid>","screens":[]}
{"uuid":"7be2e6d7-abff-4c44-a0c3-35460da1693c","variant":"amplified","mode":"judged","verdict":"fail","notes":"return marker missing on banished card","bead":"hv-xxx","commit":"<oid>","screens":["artifacts/qa/hv-xxx/windcutter-amp.png"]}
```

A `fail` must be fixed in the same bead, or in a new bead filed immediately
and worked next. Then append a new `pass` line.

## Rules ambiguity protocol

Apply the [D10 ladder](decisions.md#d10-rules-ambiguity-ladder). For each
decision:

1. **Amend `docs/rules.md`** with normative, current-state text in the right
   section. Keep its style: symbols, "you control", and so on. Write no
   history.
2. **Append an entry to `docs/plan/evidence/rules-decisions.md`:**

   ```markdown
   ## RD-014: "Until your next turn" durations end at the start of the source controller's next Dreamwell phase
   - Ladder: 4 (MTG analog: "until your next turn" ends as that turn begins)
   - rules.md: § Keywords and Effects → Banish
   - Affects: 7be2e6d7-abff-4c44-a0c3-35460da1693c (amplified), …
   - Why: …
   ```

3. **Encode it once** in the engine. Add a primitive test if the decision
   changes primitive behavior.

The decisions D13–D15 and P1–P6 are written into `docs/rules.md` in Phase 3's
first task.

## Card issues protocol

`docs/plan/evidence/card-issues.md` has one section per UUID:

```markdown
## 0458658d-7e02-4286-9249-93674d16620b
- Problem: text references "Judgment", which the current rules do not define.
- Implemented as: <interpretation> (RD-0xx)
- Suggested fix: <wording or number change for the operator>
```

**Never edit the card's data** ([D11](decisions.md#d11-card-data-is-immutable)).
Intentional infinite combos are not issues.

## Logging

New behavior logs through `src/logging.ts` into `logs/journey-log.jsonl`. Log
enough to reconstruct what happened:

- **Engine.** Each applied action with its validated choices, every trigger
  fired and resolved, every prompt opened and answered, every rules-relevant
  RNG draw (stream and purpose), loop detection and shortcuts, and battle end
  with its reason.
- **AI.** Per decision: the policy, budget used, top-k candidates with scores
  and visit counts, the chosen action, and the determinization count. Keep it
  compact: one line per decision.
- **Journey modifiers.** Each dreamsign journey effect applied, with UUID,
  site, and before/after values.
- **Tournaments** log to `logs/tournaments/<run-id>.jsonl`, which is
  gitignored. Summaries go to `docs/plan/evidence/ai/`.

**UUIDs only, no names.** Every log line carries the game ID.

## Resources

These are the [D17](decisions.md#d17-machine-resources) limits:

- `JOURNEY_TEST_WORKERS=2` locally. The local Tollgate policy
  (`.tollgate/config.toml`, untracked) already sets 2.
- Fuzz soaks and tournaments use at most 4 worker processes, in batches of at
  most 30 minutes.
- Start a batch only when no Tollgate validation of this repository is
  running. Check `tg --no-launch --json status`.
- Watch memory pressure: `memory_pressure`, or `vm_stat` compressed pages. If
  the host is under pressure, finish the current batch and run the next with
  2 processes.

## Failure and recovery

- **CI failure.** Use the `wt` repair loop: at most one unchanged retry per
  stated hypothesis, then 15 minutes of focused diagnosis, then repair or roll
  back.
- **Flaky test.** If Tollgate attributes it `flaky-or-non-hermetic`, fix the
  test's hermeticity in a dedicated bead. Never retry until green.
- **Codex unavailable.** Handle it as review debt; see [Reviews](#reviews).
- **Playwright MCP unavailable.** Run `playwright-mcp-service start` and retry
  once. If it is still down, continue non-QA work in the bead. Record QA debt,
  and clear it before the bead closes, or before the phase gate at the latest.
- **Tollgate or Beads unavailable.**
  1. Wait and retry with backoff: 1 minute, then 5, then 15.
  2. Meanwhile, do read-only preparation for the current bead.
  3. Never bypass Tollgate with raw `git push`.
  4. Never start a Beads server.
- **Before stopping for any reason,** invoke `justiciar` in the same session
  and follow the Hive executor recovery protocol. That means:
  - repair or relax only agent-imposed constraints, and record the change;
  - never pause for approval: none is required anywhere in this plan;
  - never defer a bead without fresh justiciar agreement.

  A genuine external blocker is one that stays unresolved after recovery, such
  as GitHub being unreachable for hours. For one, checkpoint the bead's state
  in its notes and keep working on any independent eligible work. Because of
  strict sequencing, such work exists only within the current bead.

## Re-entry after compaction or restart

Run this sequence on every resume. It is idempotent.

1. **Read the plan.** Read [README](README.md), then this section.
2. **Find your work.** List your unfinished assignments:
   `hbd list --assignee "${CLAUDE_CODE_SESSION_ID:?}" --status in_progress --json`.
   If there are none, list the project's ready queue:
   `hbd ready --metadata-field hive_project=dreamtides_web --json`.
3. **Pick up the bead.** Read its notes. The latest note names its worktree,
   candidate, and next action.
4. **Read only the current phase page.**
5. **Check the candidate.** If the notes name a candidate, run
   `tg --no-launch --json status <candidate-id>` and continue the `wt` workflow
   from its state.
6. **Check the worktree.** If the notes name a worktree that this session
   created, `git -C <worktree> status --short`, then continue. If the bead was
   claimed by a different session ID, do not touch its worktree. The operator
   has released the bead; restart the bead from a fresh worktree based on
   `release`.
7. **Check owned processes.** For each runtime-ledger process in the notes,
   check whether it is alive. Stop it if the current step doesn't need it.
