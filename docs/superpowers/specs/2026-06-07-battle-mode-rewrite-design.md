# Battle Mode Rewrite — Design Spec

- **Date:** 2026-06-07
- **Status:** Proposed (awaiting review)
- **Owner:** Derek Thurn
- **Authoritative rules:** `docs/battle_rules/battle_rules.md`
- **Card data:** `data/tabula/cards_v2.toml` (519 cards), `data/tabula/dream_avatars_v2.toml`

## 1. Context & Problem

Battle mode (`src/battle/`) is, by design today, a **manual control sandbox**: the
player drives every state change through `BattleDebugEdit` primitives, and a thin
"Basic Automation" layer macro-expands a handful of gestures into bookkeeping
command lists. **No engine reads a card's effect text** — playing a card is just
"move to a slot, subtract energy." The only real game logic is Challenge
resolution.

It has drifted a full generation behind the rules and the card pool:

- **Outdated terminology.** Slots are `reserve R0–R4` / `deployed D0–D3`; the rules
  use back rank `B0–B4` / front rank `F0–F3`. The resolution path is named
  "judgment"; the rules call it the **Challenge** phase. `BattlePhase` still
  carries five legacy names (`startOfTurn`, `draw`, `main`, `judgment`,
  `endOfTurn`).
- **Missing concepts.** No `erode`, no `⧗` counters, no real `exhausted` state
  (only an `enteredPlayTurnNumber` proxy the AI reads), no Dreamwell energy model,
  no engine state for `reclaim` / `offering` / `ephemeral` / `veil`.
- **Broken/dead mechanics.** The Support adjacency map (`engine/support.ts`) is
  correct but **never wired into scoring** — automated Challenge resolution
  silently ignores Support buffs. Two divergent Challenge resolvers exist
  (`engine/judgment.ts`, vestigial; `automation/basic-automation.ts`, live).
- **Figment stacking is faked.** A stack is a single instance with an integer
  `figmentCount` and a uniform base spark; it cannot represent figments of
  different spark, true top-ordering, per-figment Support, or per-figment exhaust.
- **The AI is coupled to the old model** and plays the 10 "Starter" cards
  (`cards_v2.toml` numbers 510–519) through hand-written per-card models whose code
  constants carry stale names; its forward model, planner, evaluator, and defense
  are all keyed on `D/R` slots and the "judgment" path.

### Goal

Rebuild battle mode's **engine semantics and board model** to match the current
rules and card pool, as a **manual sandbox with structural automation** — not an
effect engine. The battle UI is unchanged except the debug rail. The enemy AI is
adapted to the new model with a modest curated deck. Basic Automation defaults ON.

## 2. Principles & Non-Goals

**Guiding principle.** Automation and the engine act **only on game structure and
card fields** — energy cost, spark, card type, subtype, figment type, zone, rank,
phase, status flags, counters. They **never interpret a card's printed effect
prose.** Players remain responsible for resolving card effects, using the debug
rail. (One narrow, explicit exception: a text-scan for the combat keywords
Unstoppable / Vengeful / Preeminence / Awakened during Challenge resolution —
see §3.)

**Non-goals (explicitly out of scope):**

- No ability/effect engine: nothing executes `▸Materialized`, `▸Dawn`,
  activated abilities, static abilities, or modal choices from card text.
- No stack/priority/interrupt **resolution** engine. The stack stays a manual zone;
  Fast/Interrupt timing is a player concern, not engine-enforced.
- No semantic parsing of card text (beyond the combat-keyword exception).
- No UI redesign. The only intended UI change is the debug rail's button set.
- No shared Dreamwell deck or Dreamwell bonus-effect engine (energy track only).

## 3. Locked Decisions

These were confirmed during brainstorming and are not open:

1. **Scope:** modernized sandbox + structural automation; players resolve their own
   card effects. No card-text interpreter.
2. **AI (`?ai=1`):** adapt the existing AI architecture to the new model; the
   "modest curated deck" is the existing Starter cards **510–519** (already in
   `cards_v2.toml`, deliberately simple), with per-card models refreshed to current
   names/text. Keep the proposal-bar approval flow.
3. **Dreamwell / energy:** **energy track only.** Model maximum ● vs current ●
   correctly — current ● resets to max each turn; max ● ramps via a configurable
   per-turn schedule, surfaced as a Dreamwell/Draw automation step. No shared
   Dreamwell deck; the text-y per-card bonus effects are applied by the player via
   the debug rail.
4. **Combat keywords:** **pragmatic text-scan**, limited strictly to Unstoppable /
   Vengeful / Preeminence / Awakened during Challenge resolution (as today).
   Figments derive their keyword from their type. No other card-text scanning.
5. **Figments:** **discrete per-figment instances** — a stack holds individual
   figments each with their own spark.
6. **Basic Automation:** defaults **ON**, with an `automation=0` URL escape hatch
   and the existing gear toggle for a pure-manual sandbox.
7. **"From the ground up" boundary:** keep the model-agnostic shell, rebuild the
   model-bound semantics (see §6).

## 4. Architecture

### 4.1 Model & types (`src/battle/types.ts` and friends)

**Slots & ranks.** Rename `RESERVE_SLOT_IDS` → back rank `B0–B4` and
`DEPLOY_SLOT_IDS` → front rank `F0–F3` (counts already match: 5 back, 4 front).
Keep two rank-keyed records on `BattleSideMutableState` (the staggered geometry
needs the distinction) but with rules-correct names (e.g. `frontRank`/`backRank`).
Relabel `BattleZoneId` / `BattlefieldZone` accordingly. Wire the existing Support
adjacency map (`engine/support.ts`, currently dead for scoring) into resolution.
Enforce the two positional rules that are currently unenforced:

- An **exhausted character cannot be moved to the front rank** (by either player).
- Paying a `☪` cost **auto-retreats** a front-rank character to an open back-rank
  position (and is illegal if none is available).

**New `BattleCardInstance` state the rules require:**

- `isExhausted: boolean` — a real exhausted flag replacing the
  `enteredPlayTurnNumber` proxy. Set on entering play (unless awakened), cleared at
  Dawn.
- `counters: number` — `⧗` count; reset to 0 when the card leaves play.
- Persistent statuses: `reclaimed`, `offering`, `ephemeral`, plus `veil` (as a
  carried value/flag). These travel across zones per the rules.
- Combat-keyword flags for non-figment characters where an effect grants one
  (e.g. a player toggles Unstoppable). The Challenge resolver reads the flag first
  and falls back to the combat-keyword text-scan (decision §3.4).

**Figments — discrete instances.** Replace the single-instance `figmentCount`
integer with a representation that holds **individual figments, each with its own
spark and the stack's shared type**. A stack:

- occupies one position; same-type figments colocate, different types never merge;
- is sorted by spark, highest on top; targeting and single-target effects hit the
  **topmost** figment;
- resolves challenges **top-down** (reuse the correct
  `selectFigmentChallengeLossCount` algorithm, generalized to heterogeneous spark);
- applies a Support `+N✦` **per figment**; takes exhaust/awaken state from its top
  figment.

Encode the **14-type figment catalog** (base spark + implicit keyword) so creating
a figment yields correct defaults instead of free-typed values:

| Type | Base ✦ | Keyword | | Type | Base ✦ | Keyword |
| --- | --- | --- | --- | --- | --- | --- |
| Warrior | 1 | — | | Survivor | 1 | — |
| Ancient | 4 | Unstoppable | | Celestial | 2 | Preeminence |
| Enigma | 0 | — | | Wraith | 0 | Vengeful |
| Shadow | 2 | — | | Ethereal | 1 | — |
| Spirit Animal | 1 | — | | Radiant | 2 | — |
| Synth | 0 | Support +1✦ | | Ember | 1 | Awakened |
| Monstrosity | 4 | — | | Outsider | 1 | — |

**Phases.** Drop the five legacy names; model the rules' eight phases —
**Dreamwell, Draw, Dawn, Day, Dusk, Night, Challenge, Ending**. The bookend phases
(Dreamwell, Draw, Dawn, Ending) advance automatically — they need no player
action — while Day/Dusk/Night end on an explicit player pass.

**Energy.** Keep `currentEnergy` / `maxEnergy`. A **Dreamwell/Draw** step raises
max ● via a configurable per-turn ramp schedule (default: +1 max ● per turn up to
`maxEnergyCap`, with a configurable opening value — preserving today's effective
curve), resets current ● to the new max, and draws one card (skipping the first
turn). This replaces the ad-hoc `min(turnNumber+1, cap)` ramp.

### 4.2 Structural automation — "Basic Automation" v2

Retain the **interception architecture** (`planBasicAutomationCommands` expands one
UI gesture into an ordered `DEBUG_EDIT` command list dispatched through the normal
path, so every automated step stays in history and is **undoable**). This is the
right fit for *structural* automation precisely because we are not building an
ability engine. Default it ON at `PlayableBattleScreen.tsx:170`
(`useState(false)` → `useState(true)`); add an `automation=0` runtime-config flag
mirroring `aiMode`; keep the gear toggle.

**Automated (deterministic, board-derivable):**

- Playing a card spends its energy cost; events route to the void.
- Phase auto-advance for the bookend phases.
- Dreamwell/Draw: ramp max ●, reset current ●, draw (skip turn 1).
- **Dawn:** clear the active side's `isExhausted`.
- **Challenge:** the unified resolver (§4.3), now **including Support / static
  spark**.
- **Ending:** discard to the hand limit (10); banish `ephemeral` / `offering`
  cards.
- **Fatigue:** drawing or eroding from an empty deck awards the doubling
  `1⍟, 2⍟, 4⍟…` to the opponent.
- Victory threshold detection (`scoreToWin`, default 25).

**Pause-for-player (choice/targeted):** anything needing a target or decision —
most `▸` triggers, Discover, Erode targeting, modal choices, activated abilities —
is **not guessed**; automation stops and leaves the resolution to the player via
the debug rail. (Generalizes the existing `capability-check` "needs manual
resolution" detector into an explicit pause, rather than reading text to act.)

### 4.3 Challenge resolution (unified)

Collapse to **one** authoritative resolver (evolved from
`basic-automation.ts:resolveChallenge`); `engine/judgment.ts` becomes a thin shim
over it and is removed once the AI no longer imports it (Phase 5). The resolver
must:

- pair front-rank lanes `F0–F3`; compute effective spark **including Support and
  static contributions** (fixing the current silent omission);
- resolve defended (lower/tied dissolves; ties dissolve both) and unpaired
  (scores ⍟ = spark) cases;
- apply combat keywords: Preeminence breaks ties, Vengeful drags the winner down,
  Unstoppable scores on a surviving defended character (keyword via status flag,
  then the narrow text-scan, then figment-type);
- resolve **figment stacks top-down** over discrete figments;
- snapshot challenger/defender **designations** (challengers at end of Day,
  defenders at end of Dusk) so Night repositioning can change them per the rules;
- emit a **▸Dissolved pause** after each lane (the player resolves any
  ▸Dissolved effects) rather than auto-applying effects.

### 4.4 Debug rail (the only intended UI change)

Update the debug action set so players can enact every mechanic the engine won't.
Concretely: relabel Reserve/Deployed → Back/Front rank and Judgment → Challenge;
and add/repair tools for **Erode N**, store/spend **⧗**, create-any-of-14-figment-
types (with correct base spark/keyword), status toggles (reclaim / offering /
ephemeral / veil / exhaust / awaken / combat keywords), **Abandon** (fires
▸Dissolved), dissolve / return-to-hand / banish (with variants), **Rematerialize**,
gain-control, Dreamwell-draw, Foresee-with-send-to-void, and a manual Discover
pick. The §5 coverage map is the authoritative checklist for this surface.

### 4.5 AI adaptation (`?ai=1`)

Re-point the AI at the new model while preserving its **shape** (proposal/approval
hook, bounded beam search, asymmetric knowledge). Affected:
`forward-model.ts`, `planner.ts`, `evaluate.ts`, `opponent-model.ts`,
`defense.ts`, `support-contribution.ts`, and the per-card models in `ai/cards/*`.
Changes: B/F slot ids and adjacency; new phase names; the discrete-figment
representation (the AI's own deck has no figments, which limits blast radius); the
unified resolver (so `opponent-model.ts` and `evaluate.ts` stop re-implementing the
old lane math). Refresh the Starter per-card models (510–519) to current
names/text. Keep the deck as Starter 510–519. With Basic Automation now ON by
default, **verify the AI-on + automation-on turn-handoff boundary** — currently the
untested cross-product where both sides self-resolve (risk of double-resolution; an
`isAiEnemyHandoff` guard already exists at `PlayableBattleScreen.tsx:1140` and must
be re-validated).

## 5. Mechanics coverage map

Every mechanic in the pool is owned by exactly one of: **AUTO** (structural
automation resolves it), **RAIL** (a debug-rail tool the player drives), or
**MANUAL** (player resolves with existing primitives). The full card-by-card
inventory is **Appendix B** (committed as
`docs/superpowers/specs/2026-06-07-battle-mode-card-mechanics-checklist.md`); it is
the implementation checklist for §4.4 and the acceptance coverage for "all described
mechanics are supported." A condensed map:

- **AUTO:** energy spend, event→void, phase bookends, Dreamwell/Draw ramp, Dawn
  exhaust-clear, Challenge resolution (+Support, combat keywords, figment stacks),
  hand limit, Ephemeral/Offering banish, Fatigue, victory.
- **RAIL:** Erode N, ⧗ store/spend, figment creation (14 types), status toggles,
  Abandon, Dissolve/Return/Banish, Rematerialize, Gain control, Foresee→void,
  Discover, Dreamwell bonus effects, Copy.
- **MANUAL:** arbitrary `▸`/activated/static effects, modal choices, X-cost
  targeting, "you win the game", extra turns, hand/deck reshuffles — resolved by
  the player using rail tools + free zone moves.

## 6. Keep vs. Rebuild

**Keep as-is (model-agnostic infrastructure):**

- Controller / history / **undo-redo** (snapshot-based), `state/history.ts`,
  `state/controller.ts`, `state/transition.ts`.
- The `BattleCommand` / `DEBUG_EDIT` envelope, metadata, and reducer dispatch
  (`debug/commands.ts`, `debug/apply-command.ts`, `state/reducer.ts`).
- Logging (deferred-log-event pattern) and tracing.
- Card provenance / notes / markers scaffolding.
- React components (`components/*`) — relabel slot ids / zone labels / phase names,
  no structural rebuild.
- The figment top-down challenge algorithm (`selectFigmentChallengeLossCount`) and
  the Support adjacency map (`engine/support.ts`) — correct, just need
  generalizing/wiring.

**Rebuild (embodies the outdated model):**

- Slot/zone identifiers and everything keyed on them.
- `BattlePhase` union (drop legacy names; add Dreamwell) + auto-advance bookends.
- The Challenge resolver — unify the two divergent impls into one correct path.
- Energy/turn ramp → configurable schedule + Dreamwell/Draw step.
- Figment representation → discrete instances.
- Add `BattleCardInstance` status fields (exhausted, counters, reclaimed, offering,
  ephemeral, veil, combat-keyword flags).
- Automation breadth (§4.2) and default-on flip.
- AI coupling (§4.5).
- Debug rail button set (§4.4).

## 7. Work breakdown (phased)

Each phase ends with `npm run lint && npm run typecheck && npm test`, and browser QA
(via `agent-browser` on a non-5173 port) for UI-touching phases. TDD the pure
engine/automation modules.

- **Phase 0 — Worktree & scaffolding.** Fresh git worktree (done) with this spec +
  Appendix B checklist landed; add the Phasing definition (§8) to
  `docs/battle_rules/battle_rules.md`; inventory the exact rename surface.
- **Phase 1 — Model & types.** Slot/zone/phase renames; status fields; discrete
  figments + 14-type catalog; positional rules (exhaust-can't-advance, ☪
  auto-retreat). Engine unit tests.
- **Phase 2 — Energy & automation v2.** Energy track + Dreamwell/Draw step; phase
  auto-advance; Dawn exhaust-clear; Ending banish; Fatigue. Automation unit tests.
- **Phase 3 — Unified Challenge resolver.** One authoritative resolver with Support
  + combat keywords + figment stacks + designations + ▸Dissolved pause. Keep
  `engine/judgment.ts` as a thin shim delegating to it until the AI is re-pointed
  (avoids an inter-phase build break). Resolver unit tests incl. the rules' worked
  figment examples.
- **Phase 4 — Debug rail.** New/repaired tools (§4.4); component + screen tests;
  browser QA.
- **Phase 5 — AI re-point.** Adapt forward-model/planner/evaluate/opponent-model/
  defense/per-card models; refresh Starter models; switch the AI to the unified
  resolver and remove the `engine/judgment.ts` shim; AI tests.
- **Phase 6 — Default-on & integration.** Flip automation default; update the two
  `PlayableBattleScreen.test.tsx` expectations; QA the AI-on + automation-on
  cross-product; update `docs/journey_prototype/journey_prototype.md`,
  `docs/journey_prototype/battle_ai.md`, and `docs/journey_prototype/url_parameters.md`.

## 8. Risks & mitigations

- **AI rework is the largest blast radius.** Mitigation: phase it last (Phase 5),
  keep the proposal-bar shape, keep the simple Starter deck, lean on the unified
  resolver so the AI stops re-implementing lane math.
- **Automation-on double-resolution at handoff** (AI + automation both self-resolve)
  — explicit cross-product test in Phase 6; re-validate the `isAiEnemyHandoff`
  guard.
- **Discrete figments add model/UI complexity** — contain in the figments module
  with thorough tests against the rules' worked examples; the AI deck has no
  figments, limiting AI exposure.
- **Support-omission bug** silently mis-scores Challenges today — fixed centrally in
  Phase 3 before the default-on flip (which would otherwise make wrong scores live).
- **Component relabeling churn** — mechanical and test-guarded; no behavior change.
- **Phasing — newly defined, not yet in the rules doc.** ~6 cards (*Headtaker
  Wurm*, *Thronebound Arbiter*, …) print "Phasing", which `battle_rules.md` does not
  yet document. Definition: **▸Materialized: Return another ally to hand, then move
  this character to that ally's position.** It is therefore an ordinary ▸Materialized
  trigger resolved with existing rail tools (return-to-hand + reposition) — no new
  engine concept. Action: add this definition to `battle_rules.md` (Phase 0).

## 9. Verification

- TDD pure modules (engine, automation, figments); golden tests for the rules'
  figment-challenge examples and Fatigue doubling.
- Update React tests that assume automation-off
  (`PlayableBattleScreen.test.tsx:339–359, 361–388`).
- Browser QA per `journey-battle` skill: launch on a non-5173 port, capture PID,
  validate via the player workflow, inspect the error buffer, and tear down only
  the QA server.
- Acceptance: the §5 / Appendix B coverage map is fully addressed — every mechanic
  is AUTO, RAIL, or cleanly MANUAL.

## 10. Out of scope / future

A full ability/effect engine; stack/priority/interrupt resolution; a shared
Dreamwell deck with bonus-effect execution; multiplayer-specific automation;
generalized card-text parsing.

## Appendix A — Terminology mapping (old → new)

| Old | New |
| --- | --- |
| `reserve` / `RESERVE_SLOT_IDS` `R0–R4` | back rank / `B0–B4` |
| `deployed` / `DEPLOY_SLOT_IDS` `D0–D3` | front rank / `F0–F3` |
| `judgment` phase / `resolveJudgment` | **Challenge** / unified resolver |
| `startOfTurn` / `draw` | Dreamwell / Draw / Dawn bookends |
| `main` | Day |
| `endOfTurn` | Ending |
| energy ramp `min(turnNumber+1, cap)` | configurable max-● schedule + Dreamwell/Draw step |
| `figmentCount` integer | discrete figment instances |
| `enteredPlayTurnNumber` proxy | real `isExhausted` flag |

## Appendix B — Card mechanics checklist

The full categorized inventory is committed alongside this spec as
`docs/superpowers/specs/2026-06-07-battle-mode-card-mechanics-checklist.md`
(generated by the card-walk subagent over all 519 cards in `cards_v2.toml` plus the
32 `dream_avatars_v2.toml` identities). It is the coverage map for §4.4 and the
acceptance checklist for §9.

**Condensed summary.** 18 categories — Card Types & Timing · Keywords · Named
Triggers (▸) · Descriptive Triggers · Activated-Ability Cost Types · Static
Abilities · Counters · Victory Points · Energy · Figments & Stacking · Targeting
Predicates · Modal & Mass Effects · Zone Interactions · Card Selection ·
Exhaust/Awaken/Reposition · Win Conditions/Special · Tribal Subtypes · Dream Avatar
Ongoing Abilities. 149 distinct mechanic line-items, split **108 [DET]** (structural
automation can own) vs **66 [CHOICE]** (player-driven via the debug rail).

**Highest-frequency mechanics:** Materialize / figment creation (177) · Draw (98) ·
allied/ally references (95) · Abandon (87) · Discard (84) · Dissolve (83) ·
▸Materialized (81, largest trigger) · in/from your void (81) · Reclaim (73) · Gain
N● (67); then ≤N● cost predicate (59), ☪ exhaust costs (65), ▸Dawn (41),
Discover (31).

**Hardest / unusual (mostly MANUAL or special RAIL tools):** extra turn
(*Moment Rewound*, needs turn-loop support) · "you win the game" (*Terminus*) · Copy
(full-identity clone) · Gain control (cross-side ownership) · X-cost mass dissolve
(*Ordained Collapse*, *Desolation's Edge*) · modal "Choose one" (5 cards) ·
hand+void-into-deck resets.

**Coverage notes:** (a) **Phasing** (~6 cards) is now defined — a ▸Materialized
return-and-reposition — and must be documented in `battle_rules.md` (see §8). (b) Preeminence and the figment types
Ancient / Enigma / Synth / Celestial are never produced by card text but still need
engine support (figment catalog / subtypes). (c) **▸Dusk** has zero card instances
today, but the trigger slot must still exist.

## Appendix C — Key file pointers

- Automation default to flip: `src/battle/components/PlayableBattleScreen.tsx:170`.
- AI default (`ai !== "0"`): `src/runtime/runtime-config.ts:41`.
- Live resolver: `src/battle/automation/basic-automation.ts:238` (`resolveChallenge`).
- Vestigial resolver to delete: `src/battle/engine/judgment.ts`.
- Support adjacency (dead for scoring): `src/battle/engine/support.ts`.
- Starter cards (AI deck): `data/tabula/cards_v2.toml:9264–9433` (numbers 510–519).
- Tests asserting automation-off: `src/battle/components/PlayableBattleScreen.test.tsx:339–359, 361–388`.
