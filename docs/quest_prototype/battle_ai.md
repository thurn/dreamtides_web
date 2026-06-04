# Battle AI Design

This document describes the design for an automated opponent ("Battle AI") for
the quest prototype's playable battle. The AI plays a fixed deck built from the
`rarity = "Starter"` cards, makes decisions with a blend of heuristics, shallow
search, and light Monte Carlo sampling, and is engineered to spend well under
100ms on any single choice.

It is written to be read alongside:

- `docs/battle_rules/battle_rules.md` — the rules the AI plays by.
- `docs/quest_prototype/quest_prototype.md` — the prototype and battle-sandbox
  behavior.
- `docs/quest_prototype/qa_tooling.md` — headless module invocation and browser
  QA.

## Table of Contents

- [Goals and Non-Goals](#goals-and-non-goals)
- [Current Battle Architecture](#current-battle-architecture)
- [The AI Deck](#the-ai-deck)
- [Design Principles](#design-principles)
- [System Overview](#system-overview)
- [The Rules Spine](#the-rules-spine)
- [Auto-Resolution and Manual Steps](#auto-resolution-and-manual-steps)
- [The Forward Model](#the-forward-model)
- [Per-Card Knowledge](#per-card-knowledge)
- [The Evaluation Function](#the-evaluation-function)
- [The Planner](#the-planner)
- [Modeling the Opponent](#modeling-the-opponent)
- [Time Budget and Performance](#time-budget-and-performance)
- [A Worked Turn](#a-worked-turn)
- [Codebase Integration](#codebase-integration)
- [Communicating AI State to the Player](#communicating-ai-state-to-the-player)
- [Testing and Tuning](#testing-and-tuning)
- [Phased Implementation Plan](#phased-implementation-plan)
- [Open Questions](#open-questions)
- [Appendix: File-by-File Change Summary](#appendix-file-by-file-change-summary)

## Goals and Non-Goals

**Goals.**

- An enemy that takes its own turns, plays its Starter deck competently, and
  competes for the 25⍟ victory threshold.
- Decisions driven by heuristics plus a shallow search and a thin Monte Carlo
  layer over opponent responses.
- A hard per-decision time budget of 100ms, with graceful degradation (return
  the best plan found so far) if the budget is ever approached.
- Deep, exact understanding of the AI's *own* ten cards.
- Visible AI reasoning: the player can see what the AI is doing and, in a debug
  surface, why.
- Enabled by a URL parameter and integrated through the existing battle
  controller, command vocabulary, and log surfaces.

**Non-Goals.**

- A full rules engine that simulates every card in `cards_v2.toml`. The AI
  understands its own deck plus general rules and broad *classes* of cards; it
  treats opponent cards abstractly.
- Perfect play or a difficulty-tuned ladder. One competent difficulty is the
  target; difficulty knobs are noted as future work.
- Driving the human player's side. The human keeps the existing controls; the AI
  drives only the enemy side and shared combat resolution.
- Networked/remote AI. The AI runs locally on the quest client (see
  [Codebase Integration](#codebase-integration)).

## Current Battle Architecture

The playable battle (`src/battle/`) is today a manual control sandbox. Three
facts shape this design:

1. **All gameplay is expressed as `BattleDebugEdit` primitives.** Every state
   change — playing a card, moving between zones, repositioning, adjusting
   energy or score, advancing the phase — is one of the `BattleDebugEdit` kinds
   in `src/battle/debug/commands.ts` (`MOVE_CARD_TO_ZONE`,
   `SWAP_BATTLEFIELD_SLOTS`, `ADJUST_CURRENT_ENERGY`, `ADJUST_SCORE`,
   `DRAW_CARD`, `DISCARD_CARD`, `SET_BATTLE_FLOW`, and so on). These are wrapped
   in a `BattleCommand` (`DEBUG_EDIT` / `FORCE_RESULT` / `SKIP_TO_REWARDS`) and
   applied through the reducer in `src/battle/state/reducer.ts`.

2. **The engine performs no automatic resolution.** Challenge/judgment, energy
   progression, turn handoff, and win detection are all manual. The type model
   already reserves slots for these — `BattleJudgmentResolution`,
   `BattleEnergyChange`, `BattleScoreChange` on `BattleTransitionData` — but they
   are currently always empty (see `createEmptyTransitionData` in
   `src/battle/engine/result.ts`).

3. **AI scaffolding already exists in the type model.** `src/battle/types.ts`
   defines `BattleAiDecisionStage = "character" | "reposition" | "nonCharacter" |
   "endTurn"`, a `BattleAiChoiceTrace` record (including `heuristicScoreBefore`
   and `heuristicScoreAfter`), and an `aiChoices: BattleAiChoiceTrace[]` field on
   every transition that already flows through `src/multiplayer/battle-normalize.ts`
   to the log surfaces. This design fills that scaffolding in rather than
   inventing a parallel structure.

The board model is two ranks per side. In code, `deployed` (slots `D0`–`D3`, 4
positions) is the **front rank** whose characters become challengers and
defenders, and `reserve` (slots `R0`–`R4`, 5 positions) is the **back rank**.
Characters materialize into `reserve`, exhausted (`selectDefaultCharacterPlaySlot`
fills reserve first). Effective spark is `printedSpark * figmentCount +
sparkDelta` via `selectEffectiveSparkForInstance`; note that Support and static
spark bonuses are **not** auto-applied by the engine, so the AI computes them
itself.

The screen is wired through `useMultiplayerBattle()` in
`PlayableBattleScreen.tsx`, which exposes the current `reducerState.mutable`
(`BattleMutableState`) and a `dispatch` that takes
`{ type: "APPLY_COMMAND", command }`. There is no automatic enemy actor today;
`hasAiOpponent` (on `BattleStatusBar`) and `canPlayerAct` (in
`PlayableBattleScreen`) are present but hardcoded. These are the seams the AI
plugs into.

## The AI Deck

The AI's entire world is the ten Starter cards. They form a coherent midrange
deck and, critically, share three properties that make a small, fast AI
tractable.

| Card | Cost | ✦ | Type / Subtype | Text | Role |
| --- | --- | --- | --- | --- | --- |
| Twilight Minstrel | 2● | 1 | Character / Musician | Support – Supported characters have +2✦. | Back-rank anchor; buffs front rank |
| Circlewatch Seer | 3● | 1 | Character / Visionary | ▸Materialized: Foresee 1. | Filtering body |
| Branded Direwolf | 4● | 4 | Character / Spirit Animal | (vanilla) | Efficient beater |
| Sigilsworn Champion | 5● | 3 | Character / Warrior | ▸Dawn: Gain 1⍟. | Inevitability engine |
| Last Witness | 3● | 2 | Character / Visitor | ▸Dissolved: Draw a card. | Value trader |
| Meadowforged Colossus | 6● | 6 | Character / Synth | This character has +2✦ for each supporting ally. | Finisher / payoff |
| Flashpoint Blast | 2● | — | Event | Dissolve an enemy with cost 3● or less. | Removal |
| Glimpse of the Past | 1● | — | Event | Draw a card, then foresee 1. | Cantrip / dig |
| Herald's Sign | 2● | — | Event | Discover a character. | Toolbox / card advantage |
| Distant Worlds | 1● | — | Event | Give an ally +3✦. | Proactive pump |

**The three simplifying properties:**

- **All ten cards are standard timing.** None is Fast (❖) or Interrupt (❖❖).
  The AI therefore never needs to act during the player's turn — no responses,
  no priority windows, no stack interaction. The AI acts only in its own Day
  phase.
- **Zero activated abilities.** Nothing in the pool is a "Cost: Effect" ability
  the AI must consider activating. The only abilities are two static/support
  effects (Twilight Minstrel, Meadowforged Colossus) and three triggers
  (`▸Materialized`, `▸Dawn`, `▸Dissolved`).
- **The deck is fixed and tiny.** Six distinct characters and four distinct
  events. Every card's behavior can be hand-encoded exactly, and the decision
  space per turn is small enough to search.

Deck composition is the ten cards as a tunable multiset, padded to the
`MIN_BATTLE_DECK_SIZE` of 25 used elsewhere in battle-init. A reasonable default
is three copies of each card (30 cards); the exact counts are a tuning knob (see
[Open Questions](#open-questions)).

The deck's strategic shape, which the evaluation weights should reflect:
cheap bodies and a Support package (Twilight Minstrel behind Meadowforged
Colossus or any front-line body), one piece of removal (Flashpoint Blast), card
selection (Glimpse, Circlewatch, Herald's Sign), a proactive pump (Distant
Worlds), and a slow inevitability source (Sigilsworn Champion's ▸Dawn points).

## Design Principles

**1. Asymmetric knowledge.** The AI simulates its own cards exactly and models
the opponent abstractly. Concretely, the AI reads opponent characters only as
"a body with effective spark `S` at front/back position `P`," reads the
opponent's hand only as a *count* of unknown cards, and reasons about the
opponent's deck only through broad priors ("an unknown hand of N cards may
contain removal or a blocker"). The AI never needs a definition table for cards
it does not own. This is the single most important commitment: it bounds the
implementation to ten cards plus general rules.

**2. A small world enables real search.** Because the action space per turn is
small and there are no instant-speed interactions, the AI can afford a beam
search over turn-plans plus a thin sampling layer over opponent responses, and
still stay far under budget.

**3. Reuse the existing spine.** Decisions are emitted as the same
`BattleDebugEdit` commands a human would generate, dispatched through the same
controller. AI reasoning is surfaced through the `aiChoices` trace the type model
already carries. The AI does not fork the state model.

**4. Heuristics first, search second.** A strong static evaluation function does
most of the work. Search exists to order plays, choose targets, and avoid
walking challengers into bad combat — not to look many plies ahead.

## System Overview

The AI is a new module tree under `src/battle/ai/`. It has five parts plus a
small shared "rules spine" that the prototype needs in order to play a real game
at all.

```text
src/battle/
  ai/
    deck.ts            Starter-deck builder (the AI's fixed deck)
    forward-model.ts   Lightweight mutable copy of battle state the AI plans on
    cards/             Per-card knowledge: effect, targeting, triggers, eval hooks
      index.ts         cardNumber -> StarterCardModel registry
    evaluate.ts        Static board evaluation (returns a scalar, AI's POV)
    planner.ts         Staged beam search that produces a turn plan
    opponent-model.ts  Abstract opponent + response sampling (Monte Carlo)
    driver.ts          Turns a plan into BattleCommand[] and the turn handoff
    use-battle-ai.ts    React hook: watch activeSide, run planner, dispatch
    trace.ts           Builds BattleAiChoiceTrace entries for the log/inspector
  engine/
    judgment.ts        NEW shared Challenge-phase resolver (used by both sides)
    energy.ts          NEW shared start-of-turn energy ramp
```

Data flow on the enemy turn:

```text
activeSide === "enemy"  (watched by use-battle-ai.ts)
        |
        v
  forward-model  <-- snapshot of BattleMutableState (enemy POV)
        |
        v
  planner  --uses-->  evaluate + opponent-model + per-card models
        |
        v
  TurnPlan (ordered Ai actions)  --driver-->  BattleCommand[]
        |
        v
  dispatch({ type: "APPLY_COMMAND", command })  (one per action, paced)
        |
        v
  human Dusk/Night windows, then judgment.ts proposes + the human confirms
  the Challenge outcome; SET_BATTLE_FLOW hands the turn back
```

## The Rules Spine

The AI cannot demonstrate competence in a sandbox where nothing is scored.
Enabling AI mode therefore also turns on a thin, shared rules spine so that a
real game is actually played. This spine is deliberately minimal and is shared
by both sides (the human benefits from it too).

- **Judgment resolver (`engine/judgment.ts`).** At the Challenge phase, for each
  front-rank lane `D0`–`D3`, compare the controller's challenger spark against
  the opposing defender directly opposite. Apply the rules in
  `battle_rules.md` §Challengers, Defenders, and Scoring: lower spark dissolves,
  ties dissolve both (respecting Preeminence — absent from the Starter pool but
  cheap to support), unpaired challengers score their spark, figment stacks
  resolve top-down using the existing `selectFigmentChallengeLossCount`. This
  fills the currently-empty `BattleJudgmentResolution` on the transition and
  applies dissolves (firing `▸Dissolved`, e.g. Last Witness) and score deltas.
  Effective spark here must include Support/static bonuses (see
  [The Forward Model](#the-forward-model)). The resolver produces a *proposal*
  and defers anything it cannot fully model to a manual step; see
  [Auto-Resolution and Manual Steps](#auto-resolution-and-manual-steps).

- **Energy ramp (`engine/energy.ts`).** At the start of each turn, raise max
  energy by one toward `maxEnergyCap` (10) and reset current energy to max. This
  stands in for the Dreamwell, which the prototype does not model. The exact
  curve is a tuning knob (see [Open Questions](#open-questions)); the default
  proposal is `maxEnergy = min(turnNumber + 1, 10)` so that turn 1 has 2● (the
  existing `OPENING_ENERGY`).

- **Turn handoff.** After the active side passes and the Challenge phase
  resolves, advance `activeSide`/`turnNumber`/`phase` via `SET_BATTLE_FLOW`
  (reusing the turn-pair helpers already in `PlayableBattleScreen.tsx`), apply
  the next side's draw and energy ramp, and check the win condition (`score >=
  scoreToWin`, or `turnNumber > turnLimit` → draw), surfaced through the existing
  `result` field and reward flow.

The spine touches only mechanics that are already typed for. It does not attempt
to resolve arbitrary card effects — only combat, energy, draw, and turn flow.
Card effects are resolved by the side that plays the card: the AI resolves its
own via the per-card models, and the human resolves theirs the way they do today
(manually, in the sandbox), or via a future player-side affordance layer.

## Auto-Resolution and Manual Steps

Auto-resolving the end of turn is safe only for the parts the engine can prove it
understands. The hazard is that resolution can hinge on steps the engine cannot
model — and the human plays the full card pool, not the ten Starter cards, so the
resolver must never assume it understands the human's board. Three kinds of step
can change a turn's outcome:

1. **The opponent's interaction windows.** When the AI is the active player, the
   human still owns the Dusk window (position defenders opposite the AI's
   challengers; play Fast cards) and a Night Fast window. These are not triggers;
   they are the human's turn to react, and they must be preserved.
2. **Triggers that fire inside resolution.** ▸Night and ▸Challenge fire at the
   start of Night; ▸Dissolved fires after each lane. Lanes resolve `D0`→`D3` in
   order, so a ▸Dissolved — or a Support source dissolving — in an early lane can
   change the spark of later lanes: a supporter dying in `D0` silently drops +✦
   from a challenger in `D2`.
3. **Keywords and statics that bend the comparison.** Unstoppable, Vengeful,
   Preeminence, and continuous Support / "+X✦ for each…" each change a lane's
   result.

The design handles this by separating two concerns that are easy to conflate:

- **The AI's internal forward model may be approximate about the opponent.** A
  wrong guess about a human trigger costs at most a suboptimal AI move, never an
  illegal state, so this path stays cheap.
- **The authoritative resolver is conservative.** It auto-resolves only what it
  can fully model and **pauses for a manual step everywhere else.** Pausing
  unnecessarily is acceptable; committing past a real trigger is not, so the
  default is to pause.

**Resolve the end of turn as explicit windows, not one atomic computation.** The
window structure is pure rules and needs no card knowledge: declare challengers →
Dusk window (hand to the human) → Night window (▸Night/▸Challenge fire; human Fast
window) → per-lane Challenge, each followed by a ▸Dissolved window. The engine
always walks every window, so no firing point is ever skipped; the only decision
per window is auto versus manual.

At each window the engine resolves automatically only:

- effects from cards it fully models (the AI's ten Starter cards), and
- a small allowlist of *general* keywords that are rules rather than card-specific
  text — Unstoppable, Vengeful, Preeminence, and the base spark comparison.

For anything else in play, a conservative **capability check** decides whether to
pause. It is a lightweight scan of the in-play card's `renderedText`, keywords,
and `tags` for the markers the rules already standardize — a `▸` trigger, a `–`
keyword, the resolution keywords above, or static `+X✦` text — during a relevant
window. It does not interpret the effect; it only detects that one exists, which
is enough to stop and hand the step to the human. The AI's own cards are
whitelisted, so the AI side never pauses spuriously.

Even the pure-arithmetic lane resolution is presented as a **preview the human
confirms** and can hand-edit before commit, since the human is the authority on
their own cards. The flow is therefore *auto-propose, human-in-the-loop* rather
than *auto-resolve*.

This maps cleanly onto the existing code. The resolver returns a
`BattleJudgmentResolution` proposal plus a list of pending manual windows;
`PlayableBattleScreen` surfaces a confirm/resolve step (the prototype already
expects the human to drive their own side); and every committed piece — the
proposed dissolves and score deltas, or a human-entered adjustment — goes through
the existing `DEBUG_EDIT` path, so undo/redo and the battle log keep working. The
auto-resolver is thus a flow guide, a math helper, and a safety interlock, not a
general effect engine.

## The Forward Model

The planner needs to ask "what does the board look like if I do X?" hundreds of
times per turn. `forward-model.ts` provides a cheap, mutable projection of
`BattleMutableState` restricted to what the AI reasons about:

- Both sides' energy and score.
- The AI's hand, deck (as an ordered list for draw/foresee), void, and board
  (the two ranks with exact card identities).
- The opponent's board as abstract bodies (`{ effectiveSpark, rank, slot,
  isFigment }`), the opponent's hand as a count, and the opponent's void as a
  count.
- Derived, recomputed-on-read **effective spark including Support and static
  bonuses**, because the engine does not apply these. The model implements the
  support-adjacency map from `battle_rules.md` (B0→F0; B1→F0,F1; B2→F1,F2;
  B3→F2,F3; B4→F3, i.e. `reserve` slot → up-to-two `deployed` slots) so that
  Twilight Minstrel's "+2✦ to supported" and Meadowforged Colossus's "+2✦ per
  supporting ally" produce correct numbers.

The forward model is a plain data structure with pure mutators, deliberately
*not* the real reducer: it is allowed to be approximate about anything outside
the AI's deck. Cloning it is a shallow structural copy (the state is tiny: ≤ 9
characters per side, ≤ ~10 hand cards), which keeps beam-search branching cheap.

Two distinct uses:

1. **Planning** — the planner applies candidate AI actions to a cloned model and
   evaluates the result.
2. **Execution** — the chosen plan is replayed against the *real* state by
   `driver.ts` as `BattleDebugEdit` commands, so the authoritative state and the
   AI's intent never diverge.

## Per-Card Knowledge

Each of the ten cards is encoded once as a `StarterCardModel`, registered by
`cardNumber` in `ai/cards/index.ts`. This is the "deep understanding of its own
deck." Illustrative shape:

```ts
interface StarterCardModel {
  cardNumber: number;
  // Can this be played right now given energy, board space, and legal targets?
  canPlay(model: ForwardModel, self: AiCard): boolean;
  // Best target(s) for this card in this state, or null if none worth it.
  chooseTargets(model: ForwardModel, self: AiCard): AiTargetChoice | null;
  // Apply the play to the forward model (materialize, resolve event, pay cost).
  play(model: ForwardModel, self: AiCard, targets: AiTargetChoice | null): void;
  // Trigger hooks the planner/judgment fire at the right time.
  onMaterialized?(model: ForwardModel, self: AiCard): void;   // Circlewatch
  onDawn?(model: ForwardModel, self: AiCard): void;           // Sigilsworn
  onDissolved?(model: ForwardModel, self: AiCard): void;      // Last Witness
  // Static contribution to a board the planner is evaluating.
  staticSparkContribution?(model: ForwardModel, self: AiCard): SparkEdit[];
  // Optional explicit value hint feeding the evaluation function.
  valueHint?(model: ForwardModel, self: AiCard): number;
}
```

Per-card notes that the models encode:

- **Twilight Minstrel / Meadowforged Colossus** — static spark via
  `staticSparkContribution`, resolved through the support-adjacency map. The
  Colossus wants supporters behind its front-rank slot; the planner's reposition
  stage accounts for that adjacency.
- **Circlewatch Seer / Glimpse of the Past** — Foresee/draw selection: keep cards
  that advance the current plan and curve, bin the rest. Modeled as a deck
  reorder on the forward model; the real command is `REORDER_DECK` (plus
  `DRAW_CARD` for Glimpse).
- **Herald's Sign (Discover a character)** — choose the best of three offered by
  role need (a front-rank body, a missing supporter, curve fit). Because Discover
  reveals three from the AI's own Starter deck, the candidate set is known and
  scored with the same evaluation used elsewhere.
- **Flashpoint Blast (Dissolve enemy, cost ≤ 3●)** — target selection over enemy
  bodies: prefer removing a blocker before the AI's challenge, or the highest
  expected-points threat the filter allows. Opponent cost is read from the
  abstract body when known; unknown-cost bodies are treated conservatively.
- **Distant Worlds (+3✦ to an ally)** — standard timing means it cannot be an
  instant combat trick; the AI plays it proactively to push a challenger past a
  likely blocker, grow Meadowforged toward lethal, or set up a favorable trade.
- **Sigilsworn Champion (▸Dawn: gain 1⍟)** — a per-turn point source; its value
  rises the longer the AI expects the game to run, so the evaluation rewards
  keeping it alive in the back rank.
- **Last Witness (▸Dissolved: draw)** — trades up; the evaluation discounts the
  downside of losing it in combat because the trade replaces it with a card.
- **Branded Direwolf** — vanilla 4✦ body; pure tempo, the cleanest challenger.

This registry is the only place card-specific logic lives. Adding a card to the
AI deck later means adding one `StarterCardModel`.

## The Evaluation Function

`evaluate.ts` maps a forward-model state to a single scalar from the AI's point
of view (higher is better). It is a weighted sum of interpretable terms:

| Term | Intuition |
| --- | --- |
| Score differential | `aiScore - playerScore`, weighted heavily; 25 wins. |
| Board spark | Effective spark of AI bodies minus opponent bodies, with front-rank/un-exhausted spark weighted above back-rank. |
| Expected next-Challenge points | Estimated spark that will score unblocked given the committed front rank and the opponent-response model. |
| Card advantage | AI hand size, plus "virtual" cards from active engines (Last Witness, Glimpse, Herald's Sign, Circlewatch). |
| Tempo / energy waste | Small penalty for unspent energy. |
| Inevitability | Bonus for live recurring sources (Sigilsworn ▸Dawn) scaled by expected remaining turns. |
| Risk exposure | Penalty for over-committing fragile bodies into likely removal/blocks (informed by the opponent model). |
| Terminal | `+∞` when AI reaches `scoreToWin`; `-∞` when the opponent does. |

Weights are constants tuned by self-play (see
[Testing and Tuning](#testing-and-tuning)). The function is pure and O(board
size), so it can be called freely inside the search. Each call that the planner
keeps is recorded as `heuristicScoreBefore`/`heuristicScoreAfter` on the
corresponding `BattleAiChoiceTrace`, which is exactly what those fields exist
for.

## The Planner

`planner.ts` produces a `TurnPlan`: an ordered list of AI actions to execute
during the enemy turn. It is structured as a **staged beam search** whose stages
map one-to-one onto the existing `BattleAiDecisionStage` enum:

1. **`character`** — choose which characters to play from hand (materialize into
   the back rank, exhausted), in cost order, paying energy. Synergy ordering
   matters here (e.g. play Twilight Minstrel before Meadowforged so the Colossus
   evaluates with its supporter present).
2. **`reposition`** — arrange the board: which un-exhausted characters to push
   from `reserve` to `deployed` to become challengers, and how to place
   supporters in the adjacency that benefits front-rank bodies. (Recall a
   character is exhausted the turn it is played and cannot challenge until the
   AI's next turn, so this stage operates mostly on bodies played on prior
   turns.)
3. **`nonCharacter`** — play events (removal, pump, card selection) at the point
   in the plan where they score best.
4. **`endTurn`** — pass; the rules spine then resolves the Challenge phase.

The search keeps a **beam** of the top-K partial plans (K ≈ 8–16) ranked by the
evaluation function, expanding each by one legal action per stage until no
positive-value action remains or energy/space is exhausted. Beam search (rather
than greedy) is what captures order-sensitive synergies without exploding the
branching factor. Because the action set per stage is tiny, the whole search
visits at most a few hundred states.

The stages are not strictly sequential where ordering matters for value (e.g. a
removal spell that clears a blocker before a reposition); the planner allows a
small, bounded amount of interleaving by letting the `nonCharacter` stage run
both before and after `reposition` and keeping whichever beam entry scores
higher. This stays cheap because the beam width caps total work.

Output is a `TurnPlan` plus, for each chosen action, a `BattleAiChoiceTrace`
(stage, choice kind, card, target, before/after heuristic score) for display.

## Modeling the Opponent

The one genuine uncertainty is what the human does after the AI commits its
challengers: during the player's Dusk they reposition defenders, and on their own
turn they may remove or block the AI's threats. The AI cannot simulate the
player's specific cards, so it models the response abstractly — this is where the
Monte Carlo / minimax-lite layer lives, kept to roughly 1.5 plies.

`opponent-model.ts` defines a small set of **archetypal responses** to a proposed
AI front rank:

- **No defense** — challengers score unblocked (best case for the AI).
- **Block biggest** — the opponent puts its largest available body opposite the
  AI's biggest challenger.
- **Trade evenly** — the opponent assigns defenders to dissolve as much AI spark
  as possible.
- **Remove top threat** — the opponent has removal for the AI's most valuable
  challenger (probability scaled by opponent hand size and a deck-wide removal
  prior).

The planner scores a candidate front rank by combining these, two ways that can
be selected by a difficulty setting:

- **Expectiminimax (default):** weight each response by a prior and take the
  expected evaluation. This yields measured, non-paranoid play.
- **Worst-case (cautious):** take the minimum over the response set, producing a
  more defensive AI that over-commits less.

"Monte Carlo" here means sampling a handful (≤ ~16) of concrete responses from
those archetypes — including sampling *which* unknown card the opponent might
hold — resolving each with the shared judgment resolver, and averaging. With a
board this small, sampling is cheap, and the variance it captures (does the
opponent have the blocker or not?) is exactly the uncertainty the AI faces. The
sample count is a budget-bounded knob.

This layer never inspects real opponent card definitions; it consumes only
abstract bodies and counts, preserving the asymmetric-knowledge principle.

## Time Budget and Performance

The state is tiny and every component is linear in board size, so the realistic
cost is comfortably sub-millisecond to low-single-digit-milliseconds. The design
still treats 100ms as a hard ceiling, enforced structurally:

- A `deadline` timestamp is threaded into the planner. Beam expansion checks it
  between stages and returns the best complete plan found so far if approached.
- Search breadth (beam width K) and Monte Carlo sample count are explicit
  constants, so worst-case work is bounded by construction rather than by hoping
  the search terminates.
- The evaluation function is pure and cheap; partial results are memoized within
  a single planning pass keyed by a structural hash of the forward model.
- Single, isolated choices (a Foresee ordering, a Discover pick presented
  mid-turn) are resolved by a direct heuristic with no search and are effectively
  instant.

For legibility the *executed* plan is intentionally paced — the driver inserts a
short delay (a few hundred ms, configurable) between dispatched commands so the
human can watch the AI act. This pacing is presentation, not thinking time, and
is separate from the 100ms decision budget.

## A Worked Turn

To make the pieces concrete, here is a representative enemy turn. Suppose it is
the AI's turn 4 (max energy 5 under the default ramp). The AI's hand holds
Branded Direwolf (4●), Twilight Minstrel (2●), Flashpoint Blast (2●), Distant
Worlds (1●). On the board it already has a Meadowforged Colossus in `reserve`
(played last turn, now awakened) and the player has a lone 3✦ body in their front
rank.

1. **`character` stage.** The planner considers playing Branded Direwolf (4●) and
   Twilight Minstrel (2●). Energy is 5, so it cannot do both plus an event. Beam
   entries explore: {Direwolf}, {Minstrel}, {Minstrel + then a 1-3● event}. The
   Minstrel-first lines evaluate higher because Twilight Minstrel's Support lifts
   the Colossus and any front-rank body by +2✦.
2. **`nonCharacter` (pre-reposition).** Flashpoint Blast can dissolve the
   player's 3✦ body (cost ≤ 3● permitting). Removing it clears the only defender,
   raising expected Challenge points. The beam keeps a line that casts it.
3. **`reposition` stage.** The Colossus (awakened) is pushed to `deployed`. With
   Twilight Minstrel placed in a supporting `reserve` slot, the Colossus's
   effective spark is its 6 base + 2 per supporting ally + 2 from Minstrel's
   Support — the forward model computes the exact number via the adjacency map.
4. **`nonCharacter` (post-reposition).** Distant Worlds (+3✦) is evaluated on the
   committed challenger. Against the opponent model — now "no defense" is likely
   since their body was removed — the extra spark converts directly to points, so
   the AI casts it on the Colossus.
5. **`endTurn`.** The AI passes, declaring the Colossus as its challenger.
   Control returns to the human for their Dusk window (position a defender, play
   a Fast card); the judgment resolver then previews the lane outcome — the
   unblocked Colossus scoring for the AI — which the human confirms before the
   score commits. The spine checks the win condition, ramps energy, and hands the
   turn back via `SET_BATTLE_FLOW`.

Each step emits a `BattleAiChoiceTrace`, so the log reads as a legible sequence:
"play Twilight Minstrel → dissolve your 3✦ body with Flashpoint Blast → push
Meadowforged Colossus to challenge → pump it with Distant Worlds → pass."

## Codebase Integration

**1. URL parameter and runtime config.** Add `aiMode: boolean` to `RuntimeConfig`
in `src/runtime/runtime-config.ts`, parsed as `params.get("ai") === "1"` (mirror
the existing `startInBattle` parsing). Thread it the way `startInBattle` is
already threaded: `App.tsx` → quest context/screen router → `BattleSiteRoute` →
`PlayableBattleScreen`. The fast QA path becomes
`http://localhost:5173/?startInBattle=1&ai=1`.

**2. The AI deck.** `ai/deck.ts` builds the enemy deck from Starter cards:
`Array.from(cardDatabase.values()).filter((c) => c.isStarter)` (the `isStarter`
flag is set from `rarity === "Starter"` in `scripts/setup-assets.mjs`), expanded
to the tuned multiset and mapped through `createBaseBattleDeckCardDefinition`. In
`createBattleInit` (`src/battle/integration/create-battle-init.ts`), when AI mode
is on, use this deck for `enemyDeckDefinition` instead of the idf3-steered pool.
This is a narrow branch at the single existing `createEnemyDeckDefinition` call
site; the surrounding padding/shuffle logic is reused unchanged.

**3. The driver hook.** `ai/use-battle-ai.ts` is a hook mounted by
`PlayableBattleScreen` only when `aiMode` is on. It watches
`reducerState.mutable`:

```ts
useBattleAi({ reducerState, dispatch, enabled: aiMode });
// internally:
//   when mutable.activeSide === "enemy" && mutable.result === null
//   and no AI turn is already in flight:
//     plan = runPlanner(forwardModelFrom(mutable), deadline)
//     for (const action of plan.actions) {
//       dispatch({ type: "APPLY_COMMAND", command: toCommand(action) });
//       await pace();   // presentation delay
//     }
//     resolveChallengeAndHandoff(dispatch, mutable);
```

It reuses the same `dispatch({ type: "APPLY_COMMAND", command })` path every
human gesture uses, so there is no second mutation route to keep consistent, and
undo/redo and logging continue to work unchanged.

**4. Input gating.** Wire the existing placeholders: set `canPlayerAct` (today
hardcoded to `true` in `PlayableBattleScreen.tsx`) to `false` while
`activeSide === "enemy"` under AI mode, so the player cannot edit state mid-AI
turn, and pass `hasAiOpponent={aiMode}` to `BattleStatusBar` (it already renders
`data-battle-status-meta="has-ai"`).

**5. Multiplayer coexistence.** The battle state is shared through
`useMultiplayerBattle()` / Firebase. The AI is a *local* actor: it must run on
exactly one client. In the single-player quest flow this is the only client, so
the simplest rule is to enable the driver only outside a shared multiplayer room
(or gate it to the room owner). The `aiChoices` trace already round-trips through
`battle-normalize.ts`, so AI reasoning is preserved across the sync boundary for
display. This interaction is flagged in [Open Questions](#open-questions).

The AI introduces no new command types: it emits the existing `DEBUG_EDIT`
edits (`MOVE_CARD_TO_ZONE` to materialize and reposition, `SWAP_BATTLEFIELD_SLOTS`
to rearrange ranks, `ADJUST_CURRENT_ENERGY` to pay costs, `ADJUST_SCORE` for
point gains, `DRAW_CARD`/`REORDER_DECK` for selection, `SET_BATTLE_FLOW` for
handoff) and `FORCE_RESULT` only via the normal win-detection path.

## Communicating AI State to the Player

The AI's reasoning is surfaced through three layers, reusing existing surfaces.

- **Action narration and pacing (always on).** Because the driver paces its
  dispatched commands, the player watches the AI act one step at a time. Each
  step shows a transient caption derived from its `BattleAiChoiceTrace` —
  "AI plays Branded Direwolf," "AI pushes Meadowforged Colossus to challenge,"
  "AI dissolves your body with Flashpoint Blast." A "thinking…" indicator on the
  enemy side of `BattleStatusBar` covers the brief planning moment.

- **The battle log (always on).** Every AI action already produces a transition;
  populating its `aiChoices` makes the AI's turn render as a readable list in
  `BattleLogDrawer`, grouped under the turn like every other action. This is the
  durable, scrollable record of what the AI did and — via `heuristicScoreBefore`
  / `heuristicScoreAfter` — how much it thought each move helped.

- **The AI inspector panel (debug only).** The `BattleInspector` already has a
  tabbed layout. A new debug-gated tab shows the planner's internals for the most
  recent decision: the evaluation breakdown for the current board, the top
  candidate plans with their scores, the chosen plan, the opponent-response
  distribution it assumed, and per-target reasoning. This is for development and
  tuning and stays out of the normal player flow, consistent with how the
  prototype keeps package internals behind debug surfaces.

Together these satisfy the requirement that the player can both *see* what the AI
does (narration + log) and, when desired, *inspect why* (the debug panel), all
without inventing new state plumbing — the `aiChoices` channel already exists end
to end.

## Testing and Tuning

- **Headless self-play harness.** A `scripts/battle-ai-experiment.mjs` (run via
  `node --experimental-strip-types`, per `qa_tooling.md`) plays the AI against
  baselines — a random-legal mover, a greedy one-ply mover, and a mirror of
  itself — over many seeded games, reporting win rate, average turns to a result,
  and per-decision timing. This both validates competence and provides the
  objective function for tuning the evaluation weights and the energy ramp,
  matching the project norm of answering design questions by simulation rather
  than argument.
- **Unit tests** (Vitest, alongside the modules): per-card `StarterCardModel`
  effects and targeting; the support-adjacency spark computation; the judgment
  resolver against the worked examples in `battle_rules.md` (including
  figment-stack top-down loss via `selectFigmentChallengeLossCount`); the
  time-budget guard returning a valid best-so-far plan under an artificially
  tiny deadline; deterministic planning under a fixed seed.
- **Browser QA** (`agent-browser` against a non-5173 port per repo QA rules) on
  `?startInBattle=1&ai=1`: confirm the enemy takes a visible, paced turn, the
  player is gated from acting during it, the log shows the AI's choices, scores
  move on Challenge resolution, and the reward flow fires on a real win. Capture
  the error buffer and confirm no render errors or unhandled rejections.

## Phased Implementation Plan

1. **Rules spine.** `engine/judgment.ts` and `engine/energy.ts` plus turn
   handoff, with unit tests against the rules doc. Gated behind AI mode so the
   manual sandbox is unaffected when off.
2. **AI deck + forward model.** `ai/deck.ts`, `ai/forward-model.ts`, and the
   support-adjacency spark computation, with tests.
3. **Per-card models + evaluation.** `ai/cards/*` and `ai/evaluate.ts`.
4. **Planner + opponent model.** `ai/planner.ts`, `ai/opponent-model.ts`, the
   time-budget guard, and the self-play harness for weight tuning.
5. **Driver + integration.** `ai/use-battle-ai.ts`, the `?ai=1` runtime-config
   plumbing, deck injection in `createBattleInit`, and `canPlayerAct` /
   `hasAiOpponent` wiring.
6. **Presentation.** `aiChoices` trace population, action narration/pacing, the
   thinking indicator, and the debug inspector tab.
7. **Hardening.** Browser QA, multiplayer-coexistence gating, and difficulty
   knobs (beam width, expectiminimax vs. worst-case, sample count).

Each phase is independently testable; phases 1–4 need no UI and are exercised
entirely through the headless harness.

## Open Questions

- **Energy / Dreamwell model.** The prototype has no Dreamwell, so the energy
  ramp is a stand-in. Is `maxEnergy = min(turnNumber + 1, 10)` acceptable, or
  should the AI follow a specific curve? This affects both sides' tempo.
- **Manual-step granularity.** End-of-turn resolution pauses for the human's
  interaction windows and for any in-play card it cannot fully model (see
  [Auto-Resolution and Manual Steps](#auto-resolution-and-manual-steps)). How
  aggressive should the capability check be — pause on any `▸`/keyword card for
  safety, or keep an allowlist of full-pool cards known to be
  challenge-irrelevant to cut down on confirm prompts?
- **Deck multiset.** Default is 3× each Starter card (30, padded context of 25).
  Confirm the counts, or specify a curve-tuned distribution.
- **Difficulty.** Ship one competent difficulty first; expose beam width,
  expectiminimax-vs-worst-case, and Monte Carlo sample count as the difficulty
  axes later. Is a single difficulty acceptable for v1?
- **Multiplayer coexistence.** Confirm the AI should be disabled in shared
  multiplayer rooms (or owner-gated), so two clients never both drive the enemy.
- **Doc/term alignment.** The code uses `deployed`/`reserve`; the rules doc uses
  front/back rank. The AI modules will use the code terms with rules-doc
  references in comments. Confirm that is the preferred convention.

## Appendix: File-by-File Change Summary

| File | Change |
| --- | --- |
| `src/runtime/runtime-config.ts` | Add `aiMode` parsed from `?ai=1`. |
| `src/App.tsx` / screen router / `BattleSiteRoute` | Thread `aiMode` to the battle screen (mirror `startInBattle`). |
| `src/battle/integration/create-battle-init.ts` | When `aiMode`, build `enemyDeckDefinition` from the Starter deck. |
| `src/battle/ai/deck.ts` | NEW — Starter-deck builder. |
| `src/battle/ai/forward-model.ts` | NEW — planning projection + support-adjacency spark. |
| `src/battle/ai/cards/*` | NEW — ten `StarterCardModel`s and the registry. |
| `src/battle/ai/evaluate.ts` | NEW — static board evaluation. |
| `src/battle/ai/planner.ts` | NEW — staged beam search; emits `TurnPlan` + traces. |
| `src/battle/ai/opponent-model.ts` | NEW — abstract opponent + response sampling. |
| `src/battle/ai/driver.ts` | NEW — plan → `BattleCommand[]` + handoff. |
| `src/battle/ai/use-battle-ai.ts` | NEW — hook watching `activeSide`, dispatching. |
| `src/battle/ai/trace.ts` | NEW — builds `BattleAiChoiceTrace` entries. |
| `src/battle/engine/judgment.ts` | NEW — shared Challenge-phase resolver. |
| `src/battle/engine/energy.ts` | NEW — shared start-of-turn energy ramp. |
| `src/battle/components/PlayableBattleScreen.tsx` | Mount the AI hook; gate `canPlayerAct`; pass `hasAiOpponent`. |
| `src/battle/components/BattleInspector.tsx` | Debug-gated AI reasoning tab. |
| `src/battle/components/BattleLogDrawer.tsx` | Render populated `aiChoices`. |
| `scripts/battle-ai-experiment.mjs` | NEW — headless self-play harness for tuning. |
