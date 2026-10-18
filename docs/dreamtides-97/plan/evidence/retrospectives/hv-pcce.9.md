# Retrospective of D97 Phases 1 and 2 (hv-pcce.9)

A read-only `sage` pass, per
[P30](../../decisions.md#p30-phase-end-introspection), over Phases 1
(`hv-rtga`) and 2 (`hv-pcce`) at staging `e48d73b92`. Inputs:

- the close notes and friction lines of the 26 Phase 1 and 31 closed Phase 2
  beads;
- Tollgate history (its retained window, 2026-10-17 23:43 to 2026-10-18
  03:05, covers most of Phase 2's landings);
- the gate and release times in that history;
- the dispositions of every `review-qa` bead;
- the open `playtest` beads (`hv-j1n2.65` to `.70`).

## What worked

- **Two sessions, one queue.** Two executor sessions landed 26 Phase 1 beads
  in about 11 hours (1.1 closed 14:21, the gate at 01:21) and 31 Phase 2 beads
  in about 6 hours. Serialization edges let the work run side by side.
  Conflicts concentrated on the D97 hub seams; peers resolved them with
  `tg --no-launch update`.
- **The gate is fast.** The gate runs in the history took 32 s to 3 min 50 s.
  Only one failed: the interaction resolver, after the phase-union rebase,
  failed on a test fixture. It was repaired in the same worktree.
- **Reviews found real defects early.** The M1 review (`hv-rtga.16`) found
  four save, catalog and economy defects (A to D) and the adapter's growth
  (H). Fixes and four follow-ups (`hv-rtga.23` to `.26`) landed before the
  Phase 1 gate. In Phase 2, three of nine `review-qa` beads found something:
  - the tileset span fix (`hv-pcce.4`);
  - the cross-map anchor defect (`hv-pcce.7`), already fixed by
    `hv-pcce.33`;
  - two story-bible fixes (`hv-pcce.13`).

  The other six confirmed no defects. Mason beads, reviewed by the other
  session, held up.
- **The friction-recurrence rule worked where tags were recorded.** Tags that
  reached three beads had a structural fix filed and landed:
  - `rebase-shared-seams`: one event spec per subsystem (`hv-pcce.19`) and the
    phase union (`hv-pcce.20`);
  - `qa-long-walks`: `qa.d97.teleport` (`hv-pcce.30`);
  - `plan-gap-dream-loading`: dream modules (`hv-rtga.21`).

## What did not

1. **Review empties a running worktree's D97 maps.** `review-removes-maps`
   (`hv-rtga.16`) recurred as `qa-vs-review-assets` (`hv-pcce.8`), after
   `hv-pcce.29` stopped the art pass pruning generated directories. The
   cause is upstream of the art pass:
   - review prepares the workspace with `DREAMTIDES_LOCAL_ASSET_HOME` pointed
     at an empty cache (`scripts/review.mjs`, `runStep`);
   - the map compiler then finds no library and skips every map;
   - its cleanup removes every file it did not write
     (`scripts/d97/compile-maps.ts`);
   - `linkCharacters` removes the character sheets before it checks for the
     generator (`scripts/d97/link-characters.ts`);
   - the closing restore step reruns only `setup-assets.ts`.

   A dev server in that worktree serves no D97 maps until the next prepare.
   Filed as **`hv-pcce.34`**.
2. **The QA scenario API still costs time.** `qa-scenario-api` appears in
   three beads (`hv-rtga.8`, `hv-rtga.12`, `hv-pcce.28`), the last after the
   prelude gained `qa.d97`. Two causes remain:
   - the runner serializes the scenario's export, so module-level helpers
     silently vanish, and the README does not say so;
   - every dialogue walkthrough re-implements the "continue until choices"
     loop.

   Filed as **`hv-pcce.35`**.
3. **Close notes often omit the friction block.** 17 of 45 closed beads ended
   without one, mostly mason, review-qa and gate beads, so recurrence counts
   undercount. The workflow requires the block, but states it only in its
   introspection section and the close step's cross-reference. P15 also still
   describes recipes that name colour variants, but the shipped runtime
   recolours palettes at load (`ulpc-palette-recolor`, `hv-rtga.6`, and the
   input from `hv-pcce.1`). Both plan-text fixes are filed as **`hv-pcce.36`**.
4. **The release stage trails staging.** Each `review:full` release run took
   20 to 24 minutes, while candidates landed roughly every 10 to 15 minutes. So
   release runs were superseded (9 in the window) and `release` trailed
   `staging` by up to five commits for an hour. Nothing failed. The lag only
   matters at a phase gate, which waits for `release` to contain the phase.
   No bead is filed: the gate's wait is the intended cost of certified
   promotion. Gate beads should start their release wait early.
5. **The plan's map scale was wrong.** The operator's M1 playtest reports
   that the 110×110 first dream is too large to read and too slow to cross.
   It is already filed as `hv-j1n2.65` to `.70`: compact size classes, a town
   at each arrival and wide paths. P13's size table came from the visual
   guide, not from play. The lesson: tunables that shape authored content
   (map size, crossing time) need an early playtest before catalog dreams are
   built on them. The playtest revisions run ahead of Phase 3's dream beads,
   which already applies that lesson.

## Lower-frequency friction, recorded only

Each of these appeared once or twice, and has a fix or a workaround in place:

- `related-tests-slow`: about 80 s for test-related runs, Phase 1 only.
- `worktree-no-install` and `audit-node-modules`: AGENTS.md already says to
  run `npm install` first.
- `qa-transport-loss`: the controlled service restart is documented in the
  README.
- `shared-component-limits`: Cumulus journey components, handled per bead.
- `kit-sheets-need-manual-rects` and `stamp-mask-review-iterations`: one-time
  stamp catalog cost in `hv-pcce.3`.
- `filing-volume`: 61 Phase 3 beads, created by script.

Tollgate's history also shows a dirty primary checkout twice, from two
untracked UUID-named entries between 23:46 and 02:18. They had gone by the
time of this pass, and their source is unknown. If they recur, record them in
that session's pre-existing-issues file.

## Filed

| Bead | Purpose | Blocks |
| --- | --- | --- |
| `hv-pcce.34` | Keep compiled maps and character sheets when a prepare pass has no LPC library | `hv-pcce.10` |
| `hv-pcce.35` | Document scenario serialization and add a dialogue-advance helper | `hv-pcce.10` |
| `hv-pcce.36` | Correct P15 and require a friction block in every close note | `hv-pcce.10` |

All three are Phase 2 children that the Phase 2 gate review (2.8) waits for,
so they land within the phase.
