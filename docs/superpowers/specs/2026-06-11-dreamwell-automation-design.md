# Dreamwell Effect Automation — Design

**Date:** 2026-06-11
**Status:** Approved
**Area:** Journey prototype battle UI — basic automation

## Summary

Extend the battle UI's existing "basic automation" so that, in addition to
applying a revealed Dreamwell card's energy, it also resolves the card's bonus
ability. Effects that need player input (pick a target, pick a discard, "choose
one", "you may…", Foresee) prompt the operator with an interactive modal. A small
set of effects that need subsystems not yet present (Discover, Rematerialize,
Reclaim grant) are excluded from v1 and remain manual.

This rides on the existing `basicAutomationEnabled` toggle — there is no new
automation switch. When basic automation is off, Dreamwell ability text is
displayed for manual resolution as it is today.

## Context

The battle UI already has a pure, UI-layer automation planner,
`planBasicAutomationCommands` (`src/battle/automation/basic-automation.ts`). It
expands a user command into the ordered list of commands to dispatch in its
place, covering card-play energy cost, event-to-void routing, Challenge
resolution, bookend phases, and — for Dreamwell — `planDreamwellReveal`, which
raises maximum ● by the revealed card's `energyAdded` and refills current ●.

The gap: a Dreamwell card's bonus ability (`rendered-text`) is displayed but
never executed. Every primitive needed to execute those abilities already exists
as a `BattleDebugEdit` (draw, discard, erode, adjust energy, adjust score, create
figment, set visibility, set spark delta, move card to zone, abandon, etc.).

Two facts shape the design:

1. **`rendered-text` is display-only.** There is no structured effect data, and
   the TOML is subject to change. Per the project's "identify by UUID" rule, the
   automatable meaning of each card is defined in a **per-UUID effect table** in
   code, decoupled from the rendered wording.
2. **Command dispatch is synchronous today.** `planBasicAutomationCommands`
   returns a flat `BattleCommand[]` applied in one tight loop. Interactive prompts
   need a pause/resume mechanism. The chosen architecture keeps that orchestration
   in the **UI layer** (a runner hook), leaving `BattleMutableState` unchanged.

## Decisions

- **Choice handling:** Build interactive prompts (not auto-picked defaults).
- **Effect mapping:** Per-UUID effect table in code, decoupled from `rendered-text`.
- **Architecture:** UI-layer effect runner (Approach A). No `BattleMutableState`
  schema change; each resolved step is a normal, undoable command.
- **Exclusions (v1, remain manual):** Discover (Forest Trailhead, Sunlit
  Archive); Rematerialize (Echo Cascade); Reclaim grant (Firmament Mirror).
- **Included (v1):** All deterministic effects, all single-prompt effects, plus
  "play character into play" (Ruin Tree, Celestial Gateway). A card moved into
  play does **not** auto-resolve its own triggered ability — consistent with how
  playing any card already works under basic automation.

## Architecture

### Effect script model

New module `src/battle/automation/dreamwell-effects.ts` exports a table keyed by
Dreamwell card UUID:

```ts
interface StepContext {
  side: BattleSide;                 // the revealing side
  state: BattleMutableState;        // live state at step-execution time
  // plus the selectors the builders need (hand, void, ranks, drawn card, …)
}

type DreamwellEffectStep =
  | { kind: "edits"; build: (ctx: StepContext) => BattleDebugEdit[] }
  | { kind: "prompt"; prompt: DreamwellPrompt };

interface DreamwellEffectScript {
  id: string;                       // Dreamwell card UUID
  steps: DreamwellEffectStep[];
}

const DREAMWELL_EFFECTS: Record<string, DreamwellEffectScript>;
```

- `build` is a function over current state, so conditional/iterative effects
  ("draw until 3 in hand", "each ally +1✦", "if it's a character gain 1●",
  "random character from each void") compute their edits at execution time.
- A UUID **absent** from the table has no automated ability. This covers the
  "(no ability)" cards and the excluded cards. Energy is still applied by the
  existing `planDreamwellReveal`.
- Each table entry carries a comment quoting the current `rendered-text` for the
  reader; code and tests key on the UUID and the produced edits, never the text.

### Prompt taxonomy

Four prompt kinds cover every included card:

```ts
type DreamwellPrompt =
  | { kind: "pick-cards"; label: string; count: number; optional: boolean;
      candidates: (ctx: StepContext) => string[];
      resolve: (chosen: string[], ctx: StepContext) => BattleDebugEdit[] }
  | { kind: "choice";
      options: { label: string; build: (ctx: StepContext) => BattleDebugEdit[] }[] }
  | { kind: "confirm"; label: string; onYes: DreamwellEffectStep[] }
  | { kind: "foresee"; count: number };
```

- **pick-cards** — choose `count` cards from a precomputed candidate list (a
  filtered subset of a zone). Covers discards, void returns, banish-an-enemy,
  abandon, put-on-top, play-from-void, and Shining Beacon's "pick 1 of top 2".
- **choice** — N labeled buttons (The Crossroads: draw / gain 2●).
- **confirm** — yes/no gate for "you may…"; on yes, runs nested steps that may
  themselves prompt.
- **foresee** — peek top N, keep-on-top or send-to-bottom (Skypath: Foresee 1).

### Prompt UI components (reuse-first)

- **`BattleCardPickerOverlay`** (new, thin) — renders a candidate card grid with
  click-to-select, a count/confirm affordance, and a "Skip" button when
  `optional`. Built on the same card-grid/preview primitives `BattleZoneBrowser`
  uses, but takes a precomputed candidate list instead of the browser's full
  search/sort/filter chrome.
- **`BattleChoicePromptOverlay`** (new, small) — a titled modal with N buttons;
  also serves the `confirm` kind (Yes / Skip).
- **Foresee** — reuse the existing `BattleForeseeOverlay` in a "resolve" mode
  (peek top N, keep-on-top or send-to-bottom, confirm).

All three follow the existing overlay conventions (scrim, `role="dialog"`,
`aria-modal`, window-level Escape handling) established by `BattleForeseeOverlay`
and `BattleZoneBrowser`.

### The runner

A hook, `useDreamwellEffectRunner`, owns orchestration in the UI layer:

- **Trigger:** when `handleCommand` (in `PlayableBattleScreen`) processes a
  `DRAW_DREAMWELL_CARD` with automation enabled, it dispatches reveal + energy as
  today, then the runner looks up the revealed card's UUID in `DREAMWELL_EFFECTS`
  and begins walking its steps.
- **Walk:** an `edits` step dispatches immediately through the normal command path
  (`sourceSurface: "dreamwell-automation"`). A `prompt` step sets runner React
  state to the active prompt and pauses; `PlayableBattleScreen` renders the
  matching overlay. The player's selection produces that step's edits, dispatches
  them, and advances to the next step. Completion clears runner state.
- **Safety:** Escape on an optional prompt skips that step; a required prompt
  whose candidate set is empty resolves as a no-op so the Dreamwell phase can
  never wedge. The runner only ever drives one Dreamwell card at a time.

Runner state (current card UUID, step index, active prompt) lives in React state.
`BattleMutableState` is unchanged. Each step is a normal, undoable command flowing
through the existing reducer/history path.

### Excluded cards + manual indicator

Discover (Forest Trailhead, Sunlit Archive), Echo Cascade (Rematerialize), and
Firmament Mirror (Reclaim grant) have no script entry: energy is auto-applied and
the ability text is displayed for manual resolution. `BattleDreamwellDisplay`
gains a small **"Manual"** badge for these and an **"Auto"** badge for scripted
cards so the operator knows whether to resolve by hand. "(no ability)" cards get
no badge.

## Per-card mapping (29 included cards)

### Deterministic (no prompt)

| Card | UUID | Effect → edits |
| --- | --- | --- |
| Meteor Meadow | 5ec17498-9028-4a01-80a0-67c91b03d505 | Draw a card |
| Autumn Glade | 02e8ea92-1218-413c-9f0b-4c865a3921d3 | +2⍟ (score) |
| Twilight Radiance | de98477c-e216-4618-bff1-0e24bd982fdb | +1● (current energy) |
| Prismatic Pastures | d585b78a-dfe3-4e12-95ac-432c3c880540 | +3● |
| The Voltsurge | 7171ff89-ebe4-42d0-8863-9b4b0531cad2 | Each side draws 2 |
| Shadow Passage | 03e4e701-4720-4278-8198-9b7e0514d4cf | Erode 3 |
| The Brimming Well | a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf | Opponent +1 max ● |
| Glimmering Horizon | cf0f0a05-2a94-407c-8c22-e41b925f9c03 | If <2 in hand, draw until 2 |
| Wellspring Commons | 06e62e45-53f9-4264-9aa6-2575b445332a | Each side draws until ≥3 in hand |
| Stillwater Mirror | eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a | Reveal enemy hand (visibility) |
| Foxfire Thicket | 51caf26d-83bf-45a9-bc80-010d353277db | Create a 1✦ ethereal figment |
| Eternal Horizon | a57f1276-3fb6-4527-b538-953fbace35cf | Each ally +1✦ (spark delta per occupant) |
| Twin Moons | 120ec4c2-aa7b-48f4-be9f-f39820e565ca | Draw a card; if it is a character, +1● |
| Celestial Gateway | a3033051-8eb7-4fbf-93d6-f947ed68974d | Random character from each void → play (logged RNG) |

### Single prompt

| Card | UUID | Prompt → edits |
| --- | --- | --- |
| Astral Interface | ee1ef770-29ea-4a63-a1f9-7e97b5b8870d | Draw, then pick 1 hand card to discard |
| Emberwake Flats | 91deefd2-0400-4c78-ab9f-f6db864ff7e2 | +2●, then pick 1 hand card to discard |
| Sunset's Last Gaze | fa8704fe-759f-408d-992d-d8f9d5ffd760 | Confirm → pick 2 to discard → draw 2 |
| Leaf Light Canopy | 2b23a60c-209c-4c75-b63c-b7f73b2e1a56 | Pick 1 void card → return to hand |
| Verdant Hollow | a0fbcbd9-96ee-4392-add7-e1d436f99553 | Pick 1 event in void → return to hand |
| Silent Winter | 9954cede-8a16-4053-b6e9-da745f4540f5 | Pick 1 enemy character → banish till EOT |
| Shining Beacon | 3a4293da-55a1-4094-898a-df402ffa1c92 | Reveal top 2 → pick 1 to hand, other to bottom |
| Luminous Enigma | 556057bb-b134-497e-86c2-c6f30049e9e3 | Confirm → pick 1 void card → put on top of deck |
| The Bastion | 20be0fdd-d691-40a9-b4f8-15689ea7ebaa | Confirm → pick 1 own character → abandon → draw 2 |
| The Crossroads | af2ef62f-d31b-4544-a2b0-f5aab03c2d7c | Choice: draw a card / gain 2● |
| Fortune's Wheel | 446095b1-ec4d-40d7-8eed-a8221d339ea2 | Confirm → discard hand → draw that many |
| Skypath | f9b479cf-02cb-40e1-bb64-70b29977bf15 | Foresee 1 (peek top, keep or bottom) |
| Ruin Tree | fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5 | Confirm → pick 1 ≤2● character in void → play |

### Excluded (manual, energy only)

| Card | UUID | Reason |
| --- | --- | --- |
| Forest Trailhead | f61431f3-33bd-42ff-a229-b4013582e86e | Discover — no candidate-pool subsystem |
| Sunlit Archive | 8f5f2e26-44b5-447b-90d0-eaf22ab29fed | Discover — no candidate-pool subsystem |
| Echo Cascade | 2ad68489-044a-40d1-9be6-e62497a4e1fd | Rematerialize trigger handling absent |
| Firmament Mirror | 14dec460-3ec6-40c1-978f-67e70cb0b227 | Reclaim grant trigger handling absent |

### No ability (energy only, no badge)

Dawning Horizon, Sunrise Cavern, Summer Blossom.

## Logging

Per `AGENTS.md`, each automated Dreamwell resolution appends a structured entry to
`logs/journey-log.jsonl`:

- `event: "dreamwell_effect_resolved"`
- card UUID, revealing side, turn number
- the ordered steps executed
- for each prompt: kind, candidate set (card UUIDs), and the operator's choice
- the resulting `BattleDebugEdit`s
- Celestial Gateway's random void picks recorded explicitly (chosen card UUIDs)

Goal: a production game's Dreamwell automation can be fully reconstructed from the
log — what was offered, what was chosen, and what changed.

## Testing

- **Pure-logic tests** over each per-UUID script: construct a `BattleMutableState`,
  run deterministic steps and each prompt's `resolve(chosenIds, ctx)`, and assert
  the produced `BattleDebugEdit[]`. No DOM needed for the logic layer.
- Tests key on **UUIDs and effect semantics**, never on `rendered-text` wording,
  per the TOML-stability rule.
- **Edge cases:** empty candidate sets (no-op), optional prompts skipped, hand
  limits, conditional branches (Twin Moons character vs not), "draw until N" when
  already at/over N.
- **Browser QA:** drive a Dreamwell turn through each prompt overlay on a QA Vite
  server (a non-5173 port), verifying overlays render, are usable, dispatch the
  right edits, and close cleanly; inspect the captured error buffer.

## Out of scope (v1)

- Discover candidate-pool generation and its pick-from-generated-set overlay.
- Auto-resolving triggered abilities of cards put into play by a Dreamwell effect.
- Rematerialize / Reclaim trigger handling.
- Persisting an in-progress prompt across reload (acceptable: a Dreamwell effect
  is a short atomic interaction during one phase).
