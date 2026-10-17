# Mason audit of D97 Phase 1 (hv-pcce.2)

Scope: everything D97 Phase 1 created or touched, at staging `33a033bec`:
`src/d97/`, `src/rules/d97/`, `src/content/d97/`, the D97 adapters and
screens, `src/session/d97-save.ts` and the D97 session wiring,
`src/battle/integration/d97-battle.ts`, `scripts/d97/`, and the D97 parts of
the shared seams. Inputs: M1's friction lines, the 1.16 review (hv-rtga.16:
finding H, the adapter's growth, was left to this audit) and the
pre-existing-issue files. The audit is static; the two bug claims below were
confirmed by reading the code at that tip.

Each improvement is filed as a `mason` bead under the Phase 2 epic; the bead
IDs are in this bead's notes.

## Ranked improvements

1. **Scope every D97 rule to the run's dream, and keep development fixtures
   out of production.** The shop, travel, encounter and speaker checks resolve
   an anchor across every dream module (`d97DreamByAnchor`, `D97_CHALLENGERS`),
   the development dream included, and never compare it with `run.dreamId`
   (`d97-shop.ts:36`, `d97-travel.ts:22,51`, `d97-encounters.ts:81-83,107`,
   `d97-content-provider.ts:57-60`). A first-dream run can activate the
   development dream's waypoint or open its shop, and the save records it.
   The leniency exists because a failed map load silently plays the
   development dream (`use-d97-dream.ts:99-101`). Development dialogue,
   sprites, the dev map and the knight fallback ship in every build. Proposal:
   dreams registered through the content provider (catalog in production,
   development and synthetic dreams in dev, QA and tests), one
   `runDreamAnchor` helper, per-dream challenger and speaker maps, and an
   explicit "dream unavailable" state instead of the swap. Behavior change.

2. **Give the frozen save its own type.** `D97Snapshot` embeds the live
   `D97State` and battle fold, and decode checks top-level keys then casts
   (`save/snapshot.ts:36-38,86-95`). The first field added to `D97Run` changes
   what the v1 decoder claims to return with no compile error. Proposal: a
   standalone, never-edited `D97SnapshotV1` type with a full structural
   parser, `toSnapshot`/`fromSnapshot` converters, and a compile-time tie
   between the converter and the current schema. Behavior-preserving; the v1
   bytes are unchanged.

3. **Declare each D97 event once, beside its subsystem.** Each D97 event is
   spelled in seven places: three tables in `events.ts`, a reducer case,
   two `actions.ts` entries and the conversation adapter's re-dispatch.
   Those files changed in six to nine D97 commits each, and parallel beads
   collided there on almost every landing (`rebase-shared-seams`). Proposal:
   per-subsystem `d97Event({ phase, parse, fold })` specs spread into one
   `D97_EVENTS` table, from which the payload types, category tables, one
   reducer dispatch line and one `actions.d97(intent)` method derive (about
   200 lines out of the shared files). Behavior-preserving: event strings,
   payloads and intent keys are unchanged.

4. **Make the D97 state a phase union, with each event's phase checked once.**
   `D97State` is `{screen, run: D97Run | null}`, and each case re-checks
   pieces of the phase inconsistently. The mode check lets every D97 event
   fold during a D97 battle (`reducer.ts:339-341`), so the anted copy can be
   sold mid-battle and the loss then finds nothing to take; previews and
   battles start after the slice ends. Proposal: `avatarSelect | overworld |
   sliceEnd` with the run present where it exists, and each event spec
   declaring its phase (`overworld` requiring no battle). The v1 JSON is kept
   through item 2's converters. Behavior change.

5. **Replace the mutable interaction registry with one pure resolver.** Three
   effects register handlers into a mutable map that silently replaces and
   silently misses (`chest` has none), and rule checks are copied into React
   (door and guardian, waypoint, minimum deck, sellability and sale quote).
   Two M1 bugs came from that copying, and the adapter is 267 lines against
   the 120-line rule (hv-rtga.16 H). Proposal: an exhaustive per-kind
   `resolveInteraction(ctx, anchor)` returning intents, a panel or a refusal,
   with refusals from the event specs' predicates; the adapter keeps one
   dispatcher and a panel reducer. UI paths change: paired QA.

6. **Make acquiring a card one run operation.** Five call sites update the
   collection and the reward bag by hand and disagree (run start skips cards
   the bag lacks, quests take or record, the shop logs no bag record). The
   P29 rule that every acquisition counts against the bag holds by
   convention. Proposal: `acquireForRun(run, …)` as the only way to add a
   copy, with the collection and bag primitives private. Behavior-preserving
   except one added log record.

7. **Close the overworld runtime gaps.** Hidden quest objects still block
   movement: the movement grid is built once and `setHiddenAnchors` only
   toggles visibility; the QA surface freezes its own grid. A character layer
   without an idle sheet is dropped whole, so props and the child body
   vanish. Proposal: rebuild movement on visibility changes and expose the
   scene's grid to QA; idle falls back to the walk sheet's first frame.
   Behavior change.

8. **Pick an Avatar resident's look, lines and deck together.** A battle
   resident has one character and dialogue but a list of Avatar decks, and the
   encounter fights as the first Avatar the player isn't playing while it
   keeps the single look. The first dream's guardian looks and talks like one
   Avatar and fights as another. Proposal: incarnations of
   `{avatarId, characterId, dialogueId?}` resolved by one `incarnationFor`.
   Behavior change.

9. **Stop the review's asset restore from deleting compiled D97 output.** The
   restore step reruns only `setup-assets`, which prunes `public/d97` and with
   it the compiled maps and character manifest (hv-rtga.16
   `review-removes-maps`), which then triggers item 1's silent dream swap.
   Proposal: the restore runs the whole workspace preparation. Tooling.

10. **D97 helpers in the QA prelude.** No D97 support in the prelude; every
    bead re-implements walking and waiting against `window.__d97`, the battle
    driver cannot win a D97 battle (`qa-battle-driver`), and there is no
    long-press helper (`qa-touch-gestures`). Proposal: `qa.d97` helpers,
    `qa.battle.win()` through the existing score debug action,
    `qa.touch.longPress`, and a tracked, stepped D97 slice scenario. Tooling.

## Considered and rejected

- Splitting `map/compile.ts`, `tiled.ts` and `preview.ts`: cohesive, and 2.3
  reshapes the recipe operations; it should add an operation registry there.
- Splitting `overworld-scene.ts`: items 5 and 7 remove its coupling; no further
  evidence.
- A journey-or-D97 `FoldState` union: touches every journey reducer.
- Removing display names from `D97BattleInit`: the shared journey
  `BattleDisplayInit` pattern, and a save migration; revisit when D97's battle
  display diverges.
- A shared shop-pricing core: D97 pricing is a different formula; opponent
  decks and battle setup already reuse the journey builders.
- Gate test cost: no heavy fixture found; the real cost is coupling to
  production content, which item 1 removes. No UI-string assertions found.

## Invariant enforcement

| Invariant | Enforcement |
| --- | --- |
| UUID identity, branded types | Branded ids and the lint rule; the save decoder's cast bypasses them (item 2) |
| Logs carry UUIDs | Convention only; spot checks clean |
| Tunables in catalogs | Catalogs; the head-start literal is hv-pcce.14's |
| Copy only in UI | Holds for rules; the battle init persists names (rejected above) |
| State is a fold of the log | The dream swap (item 1) and React-side rule copies (item 5) break it |
| Intents only | Holds; phase and dream scoping are missing (items 1, 4) |
| P5 versioned saves | Runner and golden hash test; the frozen type is convention (item 2) |
| P6 shared code | Holds |
