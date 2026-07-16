---
name: cumulus-sweep
description: Recurring health sweep of the Cumulus design system — ratchet the integrity-check baselines toward zero, hunt the drift the lint suite cannot see (doc drift, doctrine drift, convergence debt, adoption problems), verify every finding against the tree, fix what is mechanical, and file the rest. Designed to run unattended on a schedule. Triggers on cumulus sweep, design system sweep, design system audit, cumulus health, design system health, /cumulus-sweep.
---

# Cumulus Sweep

The recurring, scaled-down form of the whole-system audit in
[docs/postmortems/2026-07-06-cumulus-system-audit.md](../../../docs/postmortems/2026-07-06-cumulus-system-audit.md)
and the fix program it produced
([docs/superpowers/specs/2026-07-07-cumulus-system-revisions-design.md](../../../docs/superpowers/specs/2026-07-07-cumulus-system-revisions-design.md)).
Read both before your first sweep — they are the method exemplars: parallel
evidence-gathering passes, hand verification of every load-bearing claim,
then fixes sequenced so the tree is green at every commit.

The write-time rails already exist and hold: the `cumulus/*` ESLint rules
(`eslint.config.js`) and the cross-file integrity tests
(`scripts/cumulus-*.test.mjs` — duplicate literals, orphan tokens, ghost
components, glyph existence, press scale, legacy ratchet, strict APIs,
generated-docs drift). A sweep does **not** re-audit what those catch; new
hard violations fail CI on the commit that introduces them. The sweep exists
for the audit's §6 failure modes, which are invisible to single-commit
checks:

1. **Baseline debt** — the integrity tests and lint config carry named
   allowlists of tolerated offenders; nothing forces them to shrink.
2. **Doc drift** — demos and blurbs written at component birth that
   production has since outgrown.
3. **Doctrine drift** — prose claims ("the ONE X", consumer lists,
   "shared by Y") validated only at write time.
4. **Convergence debt** — forks and hand-mirrored constants that stabilized
   without a promote-or-fold decision; components at one or zero real
   consumers; workhorses with no catalog entry.

This skill is autonomous by design: never ask the user questions mid-sweep.
When a finding is real but the right fix needs a product decision, file it
(step 5) instead of guessing.

## 0. Scope the sweep

- Work in a fresh worktree per repo convention; run `npm install` and
  `scripts/regenerate-assets.sh` first.
- Find the previous sweep report: the newest file in `docs/cumulus-sweeps/`.
  Its header records the commit it audited up to. The sweep range is
  `<that commit>..HEAD`. If the directory is empty, this is the first sweep:
  the range starts at the revisions program's completion and the whole
  system surface is in scope.
- List the range's commits touching the design-system surface:
  `src/cumulus/`, `src/screens/cumulus_adapters/`, `src/cumulus/docs/`,
  `.llms/skills/cumulus*`, `eslint.config.js`, `scripts/cumulus-*`,
  and any product screens built or reworked in the range.
- **Early exit:** if no commits in the range touch that surface *and* every
  baseline in step 1 is already empty, write a one-paragraph report noting
  the clean sweep (so the next sweep has an anchor commit), commit, push,
  and stop.

## 1. Baseline ratchet (mechanical — always runs)

Enumerate every tolerated-offender list and try to empty it:

- `BASELINE` arrays in `scripts/cumulus-duplicate-literals.test.mjs`,
  `scripts/cumulus-ghost-components.test.mjs`,
  `scripts/cumulus-orphan-tokens.test.mjs`.
- The known-files list in `scripts/cumulus-legacy-ratchet.test.mjs`.
- Any per-rule allowlists / `no-restricted-imports` exceptions in
  `eslint.config.js`.
- Components marked `status: "incubating"` in `src/cumulus/docs/` demo
  entries: check the generated adoption count. Incubating with a real
  consumer → remove the flag. Incubating across two consecutive sweeps with
  zero consumers → a ghost; propose deletion (finding, step 4).

For each entry, fix the underlying debt and delete the entry (the "no stale
baseline entry" tests enforce the delete). An entry whose fix is too large
for a sweep stays, but gets a finding explaining what it is waiting on.

## 2. Evidence passes (parallel subagents)

Dispatch the passes in parallel, one subagent each. Every pass returns
findings as **claim + file:line evidence**, in the audit's format. Pass
prompts must demand evidence, not conclusions.

- **Adoption & catalog honesty.** Regenerate docs (`npm run cumulus-metadata
  && npm run cumulus-docs`), then read the generated "Real consumers" counts.
  Flag: documented components at 0–1 consumers (delete, or find why screens
  avoid them); undocumented modules with high consumer counts — the
  workhorse inventory (grep import counts for modules under
  `src/cumulus/components/` and `src/cumulus/primitives/` absent from the docs
  registry); blurbs whose claims a grep contradicts (a blurb saying "every X
  routes through it" is a checkable claim — check it).
- **Doctrine re-grep.** Find doctrine comments in `src/cumulus/` — "the ONE",
  enumerated consumer lists, "shared by/with", "never a second" — and verify
  each claim against the current tree by grep. A stale list or falsified
  claim is a finding even when the code is fine.
- **Screen deltas.** One sub-pass per screen area touched in the range. Look
  for what a screen hand-rolled that the catalog should offer: repeated
  scaffolding approaching rule-of-three across screens, hand-mirrored
  constants ("keep in sync with" comments, re-typed sizes), components
  pressed into service outside their role, magic numbers where an exported
  constant exists, dead branches (states production can never reach — check
  what callers actually pass, the SiteNode-visited lesson).
- **Token & demo drift.** Near-orphan tokens (one reader — is it load-bearing
  or vestigial?); token/literal mixes inside `src/cumulus/**/*.css`; demo
  fixtures re-typing values that exist as exported production constants;
  demos showing states production forbids or omitting the states that
  dominate it; demos mounting a bare component where production always
  renders it through an integration surface (demos must mount the
  production surface — the site-node demo is the standard).

## 3. Verify every finding

Before any finding drives a fix or gets filed, hand-verify it at current
HEAD — grep/read the cited lines yourself, exactly as the audit's method
section describes. Subagent findings are leads, not facts. Drop what does
not reproduce; correct counts and line references. Only verified findings
appear in the report.

## 4. Triage

Split verified findings in two:

**Fix in this sweep** — mechanical, low-risk, no product decision needed:

- deletions of dead code, dead states, dead tokens, dead props
- folding hand-mirrored constants onto one exported source
- doc, demo, blurb, and doctrine-comment repairs; workhorse docs pages
- baseline-entry cleanups (step 1)
- moving misfiled modules to the right directory

**File** — anything needing a new component, a migration, an API change, or
a judgment call about what the system should offer:

- append to `pre-existing-issues.txt` per AGENTS.md, with the evidence
- a cluster of related findings big enough to be a program gets a spec
  proposal in the report's "recommended program" section instead, following
  the audit → revisions-spec pattern; do not start the program inside the
  sweep

When in doubt, file. A sweep that fixes five small things and files two big
ones is a success; a sweep that half-lands a component suite is not.

## 5. Execute fixes

Sequence so the tree is green at every commit: deletions first, then
dedup/constant-sharing, then doc and demo repairs. Group into a few
coherent commits (per category, not per finding), each passing:

```bash
npm run lint
npm run typecheck
npm test
```

- Touched a component, demo entry, or the token stylesheet → run
  `npm run cumulus-metadata && npm run cumulus-docs` / `npm run cumulus-tokens`
  and commit the regenerated artifacts (the drift test enforces this).
- Any visually observable change → browser QA per AGENTS.md
  ("Verification"): isolated `agent-browser` session, non-default port,
  relevant `?goto=` scenes and responsive branches, DOM measurements for
  objective layout claims, and screenshots only for the changed visual states.
  Use the routine screenshot budget from `qa_tooling.md`; expand it only when a
  distinct viewport or state carries a distinct risk.
- Commit with detailed descriptions and `git push` immediately, per
  AGENTS.md.

## 6. Write the sweep report

Create `docs/cumulus-sweeps/YYYY-MM-DD.md` (today's date). It is both the
record and the next sweep's anchor. Contents:

- **Header:** date; audited range as explicit hashes (`<from>..<to>` where
  `<to>` is the HEAD the sweep ran against — the next sweep starts here).
- **Baseline delta:** each baseline's entry count before → after.
- **Findings:** every verified finding with evidence and disposition
  (fixed in commit `<hash>` / filed in pre-existing-issues / recommended
  program). Dropped leads are not listed.
- **Recommended program**, if any cluster warranted one (step 4).
- Write in current-state language per the documentation style rules — no
  "no longer" phrasing.

Commit the report and push. Do not print a summary of changes.

## Notes

- Identify cards by UUID, never by name — and treat any name-keyed map or
  name-equality comparison you encounter during a sweep as a finding.
- The sweep never disables a lint rule or weakens an integrity test to get
  green; baselines only shrink. If a check is genuinely wrong, that is a
  filed finding with evidence, not an in-sweep edit.
- Pre-existing problems outside the design-system surface go to
  `pre-existing-issues.txt` as usual; do not expand sweep scope to fix them.
