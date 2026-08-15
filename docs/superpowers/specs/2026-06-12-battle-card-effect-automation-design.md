# Battle Card Effect Automation (V1)

**Status:** Approved design — ready for implementation planning
**Date:** 2026-06-12

## Overview

Extend basic automation in playable battle mode so that selected card
effects resolve automatically when basic automation is on, building on the
existing dreamwell effect runner. V1 automates a hand-curated set of cards
whose effects are fully scriptable. Automation-capable cards display a gear
icon, and a stored hash of each card's rules text guards against the script
silently falling out of sync with the card text.

The headline use case is **▸Dawn triggers**, which players currently have to
remember and resolve by hand.

## Scope

### In scope (V1)

Three trigger points:

- **▸Dawn** — fires for the active side when it enters its Dawn phase.
- **▸Materialized** — fires when a character the side controls enters play.
- **Support** — continuous static spark granted by a back-rank Supporter to
  the front-rank allies it supports.

Effect payloads these triggers may carry:

- Gain energy
- Draw cards
- Erode
- Foresee
- Spark changes (one-shot gained spark via `sparkDelta`, and continuous
  static spark via Support)

Cards are added to the registry **one UUID at a time**, only when the effect
(including any condition, e.g. *"With 3 allied warriors, gain 1●"*) can be
fully expressed as a script that reads live board state. Anything we cannot
fully express is left out so the gear icon never overpromises.

### Out of scope (V1)

- **Play-event triggers** (*"When you play an event, foresee 1"*). Deferred.
- Any general rules-text parser. Effects remain hand-authored scripts keyed
  by UUID, exactly like the dreamwell effects table.
- Automating cards whose effects require choices we cannot model as one of the
  existing prompt kinds.

## Architecture

Selected approach: **extract the shared execution core from the dreamwell
runner; keep the timing runners separate** (Approach C from brainstorming).

The dreamwell runner combines two separable concerns:

1. **Timing** — "a dreamwell card was revealed this turn; run its script once."
2. **Execution** — a step queue of deterministic `edits` and interactive
   `prompt` steps, with the prompt overlays.

Dawn and Materialized need *different* timing but *identical* execution. So we
factor out execution and share it; each feature keeps its own thin timing
runner.

### Shared modules (extracted, used by both dreamwell and battle effects)

- **Effect step engine** — the pure step-queue logic currently in
  `dreamwell-runner-core.ts` (`planNextStep`, prompt resolution / queue
  advancement). Generalized to a feature-agnostic core.
- **Effect step types & helpers** — the `EffectStep` / `StepContext` types and
  builder helpers (`drawEdits`, `gainEnergyEdits`, `ERODE`, foresee prompt,
  spark-delta builders) from `dreamwell-effects.ts`.
- **Prompt overlay components** — `BattleCardPickerOverlay`,
  `BattleChoicePromptOverlay`, and the foresee overlay, already generic.

Dreamwell keeps its existing reveal-timing runner
(`use-dreamwell-effect-runner.ts`), now calling the shared engine. Its
`lastRunKeyRef` / serialization behaviour is untouched.

### New module: battle effect runner

`useBattleEffectRunner` (new), wired in `PlayableBattleScreen.tsx` alongside
the dreamwell runner with the same argument shape:

```ts
useBattleEffectRunner({
  enabled: isBasicAutomationEnabled,
  state: reducerState.mutable,
  dispatchEdit: dispatchAutomationEdit, // existing "auto-system" path
});
```

It returns the same `{ activePrompt, activePromptSide, resolvePrompt }` result
shape so the existing overlays render battle-effect prompts identically to
dreamwell prompts.

Only one effect run (dreamwell or battle) is active at a time. Multiple Dawn
triggers on a side are enqueued and resolved serially, mirroring the existing
dreamwell serialization. While a battle-effect run or its prompt is active, the
runner holds back automation's phase auto-advance so Dawn fully resolves before
the turn proceeds.

## Registry & hash safeguard

New table `BATTLE_CARD_EFFECTS` in `src/battle/automation/`, mirroring
`DREAMWELL_EFFECTS`, keyed by card UUID:

```ts
interface BattleCardEffectScript {
  id: CardId;                          // card UUID
  trigger: "dawn" | "materialized" | "support";
  textHash: string;                    // hash of renderedText this script targets
  steps?: EffectStep[];                // for dawn / materialized (shared step type)
  support?: SupportScript;             // for trigger === "support" (see Support section)
}
```

Status lookup parallels `dreamwellAutomationStatus`:

```ts
battleCardAutomationStatus(cardId: string): "auto" | "none"
```

### Hash safeguard

`textHash` stores a hash of the exact `renderedText` (from
`public/cards_v2-data.json`) the script was authored against. Use a small
deterministic string hash (FNV-1a; no crypto). Two checks:

- **Runtime:** at battle init, recompute each registered card's hash from the
  live catalog. On any mismatch, `console.warn` listing the drifted cards
  (UUID + name), prompting the author to revisit the script.
- **Test (CI gate):** a unit test over `BATTLE_CARD_EFFECTS` recomputes every
  hash from `cards_v2-data.json` and **fails on any drift**.

This test is deliberately scoped to only the handful of UUIDs explicitly opted
into automation. It asserts "the text behind *this script* changed — re-check
the script," not anything about the broader card pool, so routine TOML design
edits to unregistered cards do not trip it (per the AGENTS.md rule against
tests that break on TOML design-data changes).

When a registered card's text changes, the test fails; the author re-verifies
the script and updates the stored hash to re-arm it.

## Trigger detection

### Dawn

The runner observes `(phase, activeSide, turnNumber)`. `dawn` is a transient
bookend phase (auto-advanced, not in the player-clickable
`PHASE_CONTROL_SEQUENCE`), so the runner must catch the `phase === "dawn"`
state and act before automation advances past it.

On entering Dawn for the active side (gated once per `(side, turnNumber)` via a
ref keyed like the dreamwell `lastRunKeyRef`):

1. Scan the active side's in-play characters (front + back rank).
2. For each whose UUID has a registered `trigger: "dawn"` script, enqueue its
   steps onto the shared engine, in a stable slot order.
3. Run the queued steps serially; hold the phase auto-advance until the queue
   and any prompts are empty.

### Materialized

Entering play is a `MOVE_CARD_TO_ZONE` into a rank slot with no dedicated
event. The runner detects it by diffing the set of battlefield instance IDs
between renders:

1. Keep a ref of instance IDs seen in play.
2. On each render, any newly-present instance whose UUID has a registered
   `trigger: "materialized"` script, controlled by a side, runs its steps once.
3. Dedupe by `battleCardId` so a given materialization fires exactly once.

Materialized scripts run for the controller of the triggering card, consistent
with how the dreamwell runner services the active side.

## Support (continuous static spark)

Support is not a one-shot, so it does not use the step engine. It is currently
**cataloged but unimplemented** (the `support` case in `apply-debug-edit.ts` is
a stub granting no spark). V1 implements it as a continuous recompute layer.

### Core engine changes

- **New field** `staticSparkBonus: number` on `BattleCardInstance`, separate
  from `sparkDelta`. The battle rules classify static-Support spark as a
  distinct category from gained spark: it persists only while the granting
  static ability applies and does **not** carry across zones the way
  `sparkDelta` does.
- **Effective spark** — `selectEffectiveSparkForInstance` adds
  `staticSparkBonus` into the total (alongside `printedSpark`/figment members
  and `sparkDelta`), clamped to ≥ 0.
- **State equality** — add `staticSparkBonus` to
  `areBattleMutableStatesEqual` (per the known battle-state-equality gotcha:
  a new instance field that is omitted there makes edits drop as no-ops).
- **New edit kind** `SET_CARD_STATIC_SPARK_BONUS { battleCardId, value }` in
  `debug/commands.ts` + `apply-debug-edit.ts`, analogous to
  `SET_CARD_SPARK_DELTA`.

### Support registry entry

```ts
interface SupportScript {
  // Given a supporter instance and live state, the static spark it grants
  // to each supported front-rank ally (typically a constant, e.g. +1 / +2).
  bonus: (ctx: StepContext) => number;
  // Optional predicate restricting which allies it applies to (e.g. only
  // spirit animals); defaults to all supported front-rank allies.
  applies?: (ally: BattleCardInstance, ctx: StepContext) => boolean;
}
```

### Recompute pass

While automation is on, after every relevant board change, recompute support
for each side:

1. Start from a fresh per-instance target of `staticSparkBonus = 0`.
2. For each in-play back-rank character with a registered support script,
   determine the front-rank slots it supports (up to two) via a
   `SUPPORT_ADJACENCY: Record<BackRankSlotId, FrontRankSlotId[]>` constant that
   matches the board geometry in `docs/battle_rules/battle_rules.md`.
3. Add the supporter's `bonus` to each occupying supported ally that passes
   `applies`.
4. Emit `SET_CARD_STATIC_SPARK_BONUS` edits only where the target differs from
   the current value (idempotent — no edit when stable, so it does not loop).

This naturally handles supporters entering/leaving, allies moving in/out of
supported slots, and figment stacks (the Support benefit applies per the
existing figment spark model).

## Gear icon

A white-filled gear with a black outline, roughly the size of the energy icon,
rendered **underneath** the `.c-cost` energy pip.

- **Where:** battlefield (in-play characters), hand tray, and the dreamwell
  display. On the dreamwell card the gear is shown **in addition to** the
  existing Auto/Manual text badge.
- **When:** only while basic automation is enabled. (It marks effects that will
  actually auto-run, matching "when basic automation is on.")

### Implementation

- Inline SVG gear (white fill, black stroke) in `BattleCardView.tsx`, gated by
  a prop (e.g. `showAutomationGear: boolean`).
- Parents pass `isBasicAutomationEnabled && status === "auto"`:
  - battle cards → `battleCardAutomationStatus(cardId)`
  - dreamwell card → existing `dreamwellAutomationStatus(cardId)` ("auto" or
    "manual" both show the gear; the text badge still distinguishes them)
- New CSS class `.c-automation-gear` positioned absolutely below `.c-cost`,
  sized to match the energy pip. Verify no clipping/overlap with `.c-spark`,
  `.c-exhausted`, or `.c-figment-count` across tested viewports.

## Logging

Per the project logging standard ("could I reconstruct what this algorithm did
in a given production game?"), the battle effect runner logs to
`logs/journey-log.jsonl` — **one entry per automation action, never per render or
per step**:

- **Effect resolved** — one entry when a single card's Dawn or Materialized
  script finishes: card UUID + name, trigger type, side, the aggregated edits it
  produced, and any prompt choice(s). No separate started/per-step entries.
- **Support changed** — one entry **only when a recompute actually changes a
  bonus** (non-empty edit set): the changed `{ battleCardId, value }` set. No-op
  recompute passes are not logged.
- **Hash mismatch** — at battle init, each drifted card (UUID + name, expected
  vs actual hash).

## Testing

- **Registry hash drift** — recompute every `BATTLE_CARD_EFFECTS` hash from
  `cards_v2-data.json`; fail on any mismatch.
- **Dawn scripts** — representative registered cards emit the expected edits
  (e.g. gain energy; a conditional Dawn that reads board state both ways).
- **Materialized scripts** — e.g. an erode-on-materialize card emits the erode
  edit exactly once per materialization; dedupe by `battleCardId` holds.
- **Foresee / prompt resolution** — a foresee prompt resolves through the
  shared engine to the right edits.
- **Trigger dedupe** — Dawn fires at most once per `(side, turnNumber)`;
  materialized fires once per instance.
- **Support recompute** — supporter enters → supported allies gain the bonus;
  supporter leaves → bonus cleared; ally moves out of a supported slot →
  cleared; recompute is idempotent (no edit emitted when stable).
- **Effective spark** — `staticSparkBonus` contributes to effective spark and
  is included in `areBattleMutableStatesEqual`.
- **Browser QA** — gear renders in hand, battlefield, and dreamwell views only
  when automation is on; toggling automation shows/hides it; a Dawn trigger
  auto-resolves through to its edits; layout stays coherent (no clipping /
  overlap) at tested viewports.

## Edge cases & notes

- Automation off → nothing runs and the gear is hidden everywhere.
- Only one effect run (dreamwell or battle) is active at a time; Dawn triggers
  queue serially and hold the phase auto-advance until resolved.
- Hash collisions are negligible for this small registry; FNV-1a is sufficient.
- The shared-engine extraction must preserve the dreamwell runner's existing
  serialization and dedupe behaviour exactly (it was recently stabilized).

## File touch list (anticipated)

- `src/battle/automation/` — new `battle-card-effects-table.ts`,
  `use-battle-effect-runner.ts`; extract shared engine/types from
  `dreamwell-runner-core.ts` / `dreamwell-effects.ts`.
- `src/battle/components/PlayableBattleScreen.tsx` — wire the new runner and
  its prompt overlays.
- `src/battle/components/BattleCardView.tsx` + battle CSS — gear icon.
- `src/battle/types.ts` — `staticSparkBonus` on `BattleCardInstance`.
- `src/battle/state/figments.ts` — effective-spark inclusion.
- `src/battle/state/apply-debug-edit.ts` + `src/battle/debug/commands.ts` —
  `SET_CARD_STATIC_SPARK_BONUS`.
- `src/battle/state/history.ts` — `areBattleMutableStatesEqual` update.
- Logging + tests as above.
