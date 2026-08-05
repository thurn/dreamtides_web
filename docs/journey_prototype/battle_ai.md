# Battle AI Design

This document describes the design for an automated opponent ("Battle AI") for
the journey prototype's playable battle. The AI plays a fixed deck built from the
`rarity = "Starter"` cards, makes decisions with a blend of heuristics, shallow
search, and light Monte Carlo sampling, and is engineered to spend well under
100ms on any single choice.

It is written to be read alongside:

- `docs/battle_rules/battle_rules.md` — the rules the AI plays by.
- `docs/journey_prototype/journey_prototype.md` — the prototype and battle-sandbox
  behavior.
- `docs/journey_prototype/qa_tooling.md` — headless module invocation and browser
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
- [The Approval Loop](#the-approval-loop)
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

- An enemy that proposes its own turns, plays its Starter deck competently, and
  competes for the 25⍟ victory threshold.
- Every AI action is a suggestion the human approves with an explicit click
  before it commits; the AI never mutates shared battle state on its own.
- Decisions driven by heuristics plus a shallow search and a thin Monte Carlo
  layer over opponent responses.
- A hard per-decision time budget of 100ms, with graceful degradation (return
  the best plan found so far) if the budget is ever approached.
- Deep, exact understanding of the AI's *own* ten cards.
- Visible AI reasoning: the player can see what the AI is doing and, in a debug
  surface, why.
- Enabled by a URL parameter (`?ai=1`), and integrated
  through the existing battle controller, command vocabulary, and log surfaces.

**Non-Goals.**

- A full rules engine that simulates every card in `cards.toml`. The AI
  understands its own deck plus general rules and broad *classes* of cards; it
  treats opponent cards abstractly.
- Perfect play or a difficulty-tuned ladder. One competent difficulty is the
  target; difficulty knobs are noted as future work.
- Driving the human player's side, or any autonomous mutation. The human keeps
  the existing controls; the AI only *proposes* the enemy side's actions and the
  combat outcome, which the human approves.
- Networked/remote AI. The AI runs locally on the journey client (see
  [Codebase Integration](#codebase-integration)).

## Battle Architecture

The playable battle (`src/battle/`) implements the Dreamtides rules with
structural automation always enabled; the human resolves the printed effects of
their own cards through the debug rail. Four facts shape this design:

1. **All gameplay is expressed as `BattleDebugEdit` primitives.** Every state
   change — playing a card, moving between zones, repositioning, adjusting
   energy or score, advancing the phase — is one of the `BattleDebugEdit` kinds
   in `src/battle/debug/commands.ts` (`MOVE_CARD_TO_ZONE`,
   `SWAP_BATTLEFIELD_SLOTS`, `ADJUST_CURRENT_ENERGY`, `ADJUST_SCORE`,
   `DRAW_CARD`, `DISCARD_CARD`, `SET_BATTLE_FLOW`, and so on). These are wrapped
   in a `BattleCommand` (`DEBUG_EDIT` / `FORCE_RESULT` / `SKIP_TO_REWARDS`) and
   applied through the reducer in `src/battle/state/reducer.ts`.

2. **Basic Automation handles the deterministic rules.**
   `src/rules/battle/basic-automation.ts` rewrites the gestures it understands
   into the ordered edits the rules require: paying energy on a play (events
   resolve to the void), the energy ramp and draw at the start of a turn, the
   Dawn exhaust-clear, the Challenge resolution via `engine/challenge.ts`, the
   Ending hand-limit discard and end-of-turn banishes, the auto-advancing
   bookend phases, and forcing the result at the score threshold. Character
   rules text is resolved manually, with static Support spark computed from the
   Support registry. Dreamwell effect automation runs through its separate
   registry and prompt queue.

3. **AI scaffolding lives in the type model.** `src/battle/types.ts` defines
   `BattleAiDecisionStage = "character" | "reposition" | "nonCharacter" |
   "endTurn"`, a `BattleAiChoiceTrace` record (including `heuristicScoreBefore`
   and `heuristicScoreAfter`), and an `aiChoices: BattleAiChoiceTrace[]` field on
   every transition that flows through `src/multiplayer/battle-normalize.ts` to
   the log surfaces. The AI fills that scaffolding rather than inventing a
   parallel structure.

The board model is two ranks per side: the **front rank** (zone `frontRank`,
slots `F0`–`F8`, 9 positions) whose characters become challengers and blockers,
and the **back rank** (zone `backRank`, slots `B0`–`B9`, 10 positions).
Characters materialize into the back rank, exhausted. Effective spark comes from
`selectEffectiveSparkForInstance`: a regular character scores `printedSpark +
sparkDelta`, and a figment stack scores the sum of its discrete figment sparks.
Support spark bonuses are computed by the side that needs them (the AI's
forward model applies the support-adjacency map itself).

The screen is wired through `useMultiplayerBattle()` in
`PlayableBattleScreen.tsx`, which exposes the current `reducerState.mutable`
(`BattleMutableState`) and a `dispatch` that takes
`{ type: "APPLY_COMMAND", command }`. `hasAiOpponent` (on `BattleStatusBar`) and
`canPlayerAct` (in `PlayableBattleScreen`) gate the proposal surface while the AI
holds an un-approved action. These are the seams the AI plugs into.

## The AI Deck

The AI's entire world is the ten Starter cards. They form a coherent midrange
deck and, critically, share three properties that make a small, fast AI
tractable.

| Card | Cost | ✦ | Type / Subtype | Text | Role |
| --- | --- | --- | --- | --- | --- |
| Nocturne Strummer | 2● | 1 | Character / Musician | Support – Supported characters have +2✦. | Back-rank anchor; buffs front rank |
| Ringwatcher | 3● | 1 | Character / Visionary | ▸Materialized: Foresee 1. | Filtering body |
| Marked Direwolf | 4● | 4 | Character / Spirit Animal | (vanilla) | Efficient beater |
| Runebound Champion | 5● | 3 | Character / Warrior | ▸Dawn: Gain 1⍟. | Durable body |
| Final Witness | 3● | 2 | Character / Visitor | ▸Dissolved: Draw a card. | Value trader |
| Rusted Colossus | 6● | 6 | Character / Synth | This character has +2✦ for each supporting character. | Finisher / payoff |
| Flashpoint Detonation | 3● | — | Event | Dissolve an enemy with cost 2● or less. | Removal |
| Glimpse of What Was | 1● | — | Event | Draw a card, then foresee 1. | Cantrip / dig |
| Sign of Arrival | 2● | — | Event | Discover a character. | Toolbox / card advantage |
| Worlds Await | 1● | — | Event | Give an ally +3✦. | Proactive pump |

**The three simplifying properties:**

- **All ten cards are standard timing.** None is Fast (❖) or Interrupt (❖❖).
  The AI therefore never needs to act during the player's turn — no responses,
  no priority windows, no stack interaction. The AI acts only in its own Day
  phase.
- **Character text is manual.** Character models cover bodies, costs, and
  Support. Triggered and other static character abilities are resolved by the
  human through the battle controls.
- **The deck is fixed and tiny.** Six distinct characters and four distinct
  events. Every card's behavior can be hand-encoded exactly, and the decision
  space per turn is small enough to search.

Deck composition is the ten cards as a tunable multiset, padded to the
`MIN_BATTLE_DECK_SIZE` of 25 used elsewhere in battle-init. A reasonable default
is three copies of each card (30 cards); the exact counts are a tuning knob (see
[Open Questions](#open-questions)).

The deck's strategic shape, which the evaluation weights should reflect:
cheap bodies and a Support package, one piece of removal, event-based card
selection, and a proactive pump.

## Design Principles

**1. Asymmetric knowledge.** The AI simulates structural character play,
Support, and its events while modeling the opponent abstractly. Concretely, the
AI reads opponent characters only as
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

**5. The AI proposes; the human commits.** This is the cornerstone of the
integration. The AI is a *suggestion engine*: it computes what it wants to do but
mutates nothing directly. Every action — playing a character, playing removal,
declaring challengers, resolving the Challenge phase — is surfaced as a single
proposal that the human approves with an explicit click before it is applied. The
AI's path stops at "here is my next move"; the human's click is what calls
`dispatch`. See [The Approval Loop](#the-approval-loop).

## System Overview

The AI is a new module tree under `src/battle/ai/`, plus a proposal/approval
surface in `src/battle/components/` and a small shared "rules spine" the prototype
needs in order to play a real game at all.

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
    driver.ts          Turns the next planned action into a proposed BattleCommand[]
    use-battle-ai.ts    React hook: watch activeSide, run planner, surface a proposal
    trace.ts           Builds BattleAiChoiceTrace entries for the proposal/log/inspector
  components/
    BattleAiProposalBar.tsx  Approve / Reject / End AI Turn for the current proposal
  engine/
    challenge.ts       Shared Challenge-phase resolver (used by both sides)
    energy.ts          Shared start-of-turn energy ramp
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
  next best action  --driver-->  proposed BattleCommand[]
        |
        v
  BattleAiProposalBar  -->  human clicks Approve (or Reject)
        |
        v (on Approve)
  dispatch({ type: "APPLY_COMMAND", command })  -->  re-plan from live state
        |
        v (loop until the AI proposes End Turn, which the human approves)
  human Dusk/Night windows, then challenge.ts proposes the Challenge outcome,
  the human approves it, and SET_BATTLE_FLOW hands the turn back
```

## The Rules Spine

The AI cannot demonstrate competence in a sandbox where nothing is scored.
Enabling AI mode therefore also turns on a thin, shared rules spine so that a
real game is actually played. This spine is deliberately minimal and is shared
by both sides (the human benefits from it too).

- **Challenge resolver (`engine/challenge.ts`).** At the Challenge phase, for each
  front-rank lane `F0`–`F8`, compare the controller's challenger spark against
  the opposing blocker directly opposite. Apply the rules in
  `battle_rules.md` §Challengers, Blockers, and Scoring: lower spark dissolves,
  ties dissolve both (respecting Preeminence — absent from the Starter pool but
  cheap to support), unpaired challengers score their spark, figment stacks
  resolve top-down using the existing `selectFigmentChallengeLossCount`.
  `resolveChallenge` is a pure function: it reads the state but mutates nothing,
  returning a `ChallengeResolution` with the score deltas and the edits that
  commit them. The resolution describes the outcome lane-by-lane for display, and
  its `BattleDebugEdit[]` —
  an `ADJUST_SCORE` for the points scored plus a `MOVE_CARD_TO_ZONE`-to-void per
  dissolved body — are the edits that commit the outcome (firing `▸Dissolved`,
  e.g. Final Witness) once the human approves. Effective spark here must include
  Support bonuses (see [The Forward Model](#the-forward-model)). The
  resolver produces a *proposal* and defers anything it cannot fully model to a
  manual step; see
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
   human still owns the Dusk window (position blockers opposite the AI's
   challengers; play Fast cards) and a Night Fast window. These are not triggers;
   they are the human's turn to react, and they must be preserved.
2. **Triggers that fire inside resolution.** ▸Night and ▸Challenge fire at the
   start of Night; ▸Dissolved fires after each lane. Lanes resolve `F0`→`F8` in
   order, so a ▸Dissolved — or a Support source dissolving — in an early lane can
   change the spark of later lanes: a supporter dying in `F0` silently drops +✦
   from a challenger in `F2`.
3. **Keywords and statics that bend the comparison.** Vengeful, Preeminence,
   and continuous Support / "+X✦ for each…" each change a lane's
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
  text — Vengeful, Preeminence, and the base spark comparison.

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
`ChallengeResolution` proposal plus the `BattleDebugEdit[]` that commit it,
while a separate per-card `needsManualResolution` capability check
(`engine/capability-check.ts`) flags any in-play card whose text the engine
cannot model so the surrounding flow can pause for a manual step;
`PlayableBattleScreen` surfaces a confirm/resolve step (the prototype already
expects the human to drive their own side); and every committed piece — the
proposed dissolves and score deltas, or a human-entered adjustment — goes through
the existing `DEBUG_EDIT` path, so undo/redo and the battle log keep working. The
auto-resolver is thus a flow guide, a math helper, and a safety interlock, not a
general effect engine.

Under [The Approval Loop](#the-approval-loop) this is strengthened further: every
AI action *and* the Challenge outcome are already gated behind explicit human
approval, so the human is always in the loop by construction. The capability
check's job is then to keep each proposal honest and legible — flagging any
in-play card whose trigger or keyword could change the result so the human can
resolve or adjust it before approving, instead of approving a subtly wrong
outcome.

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
- Derived, recomputed-on-read **effective spark including Support**. The model implements the
  support-adjacency map from `battle_rules.md` (B0→F0; B1→F0,F1; continuing
  through B8→F7,F8; B9→F8, i.e. a back-rank slot → up-to-two front-rank slots)
  so that registered Support bonuses produce correct numbers.

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
`cardNumber` in `ai/cards/index.ts`. Character models cover play legality,
placement, and Support. Event models also cover their automated targeting and
resolution. Illustrative shape:

```ts
interface StarterCardModel {
  cardNumber: number;
  // Can this be played right now given energy, board space, and legal targets?
  canPlay(model: ForwardModel, self: AiCard): boolean;
  // Best target(s) for this card in this state, or null if none worth it.
  chooseTargets(model: ForwardModel, self: AiCard): AiTargetChoice | null;
  // Apply the structural play or resolve an event in the forward model.
  play(model: ForwardModel, self: AiCard, targets: AiTargetChoice | null): void;
  // Support contribution to supported front-rank characters.
  supportSpark?(model: ForwardModel, self: AiCard): number | null;
  // Optional explicit value hint feeding the evaluation function.
  valueHint?(model: ForwardModel, self: AiCard): number;
}
```

Per-card notes that the models encode:

- **Support sources** — `supportSpark` is resolved through the support-adjacency
  map and contributes to both planning evaluation and Challenge resolution.
- **Glimpse of What Was** — draw and Foresee selection keep cards that advance
  the current plan and curve and bin the rest.
- **Sign of Arrival (Discover a character)** — choose the best of three offered by
  role need (a front-rank body, a missing supporter, curve fit). Because Discover
  reveals three from the AI's own Starter deck, the candidate set is known and
  scored with the same evaluation used elsewhere.
- **Flashpoint Detonation (Dissolve enemy, cost ≤ 3●)** — target selection over enemy
  bodies: prefer removing a blocker before the AI's challenge, or the highest
  expected-points threat the filter allows. Opponent cost is read from the
  abstract body when known; unknown-cost bodies are treated conservatively.
- **Worlds Await (+3✦ to an ally)** — standard timing means it cannot be an
  instant combat trick; the AI plays it proactively to push a challenger past a
  likely blocker, grow Rusted Colossus toward lethal, or set up a favorable trade.
- **Marked Direwolf** — vanilla 4✦ body; pure tempo, the cleanest challenger.

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
| Card advantage | AI hand size plus event-based card selection. |
| Tempo / energy waste | Small penalty for unspent energy. |
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
   matters here when a Support source can improve an existing front-rank body.
2. **`reposition`** — arrange the board: which un-exhausted characters to push
   from the back rank to the front rank to become challengers, and how to place
   supporters in the adjacency that benefits front-rank bodies. (Recall a
   character is exhausted the turn it is played and cannot challenge until the
   AI's next turn, so this stage operates mostly on bodies played on prior
   turns.)
3. **`nonCharacter`** — play events (removal, pump, card selection) at the point
   in the plan where they score best.
4. **`endTurn`** — pass. This is itself a proposal the human approves, after
   which the rules spine proposes the Challenge outcome for approval.

The search keeps a **beam** of the top-K partial plans (K ≈ 8–16) ranked by the
evaluation function, expanding each by *every* legal action per round until the
action set is exhausted (no card affordable, no reposition available) or the
`MAX_DEPTH`/deadline guard trips. Crucially the expansion is NOT gated on
"strictly improving": a momentarily neutral-or-worse setup play stays in the
beam so a later step in the same turn can pay it off. Every plan node — the
empty/root plan included — is itself a complete plan (the AI could stop there
and pass), so a node's value is just its model score, and the search returns the
first action of the **highest-scoring node** seen anywhere in the tree. The
root/END_TURN baseline is therefore the floor: a line that goes nowhere loses to
passing, while a setup→payoff line that beats passing is proposed. Beam search
(rather than greedy) is what captures these order-sensitive synergies without
exploding the branching factor. Because the action set per round is tiny and
bounded by finite energy and board space (each play spends energy and a back-rank
slot, each reposition fills a front-rank slot, and draw events only add cards a later
node can play if it can still pay for them), plus a MAX_DEPTH cap, the whole
search visits at most a few hundred states.

The stages are not strictly sequential where ordering matters for value (e.g. a
removal spell that clears a blocker before a reposition); the planner allows a
small, bounded amount of interleaving by letting the `nonCharacter` stage run
both before and after `reposition` and keeping whichever beam entry scores
higher. This stays cheap because the beam width caps total work.

Output is a `TurnPlan` plus, for each action, a `BattleAiChoiceTrace` (stage,
choice kind, card, target, before/after heuristic score) used to render the
proposal and the log.

The planner runs in a **receding-horizon** loop. It plans the whole intended turn
so that look-ahead captures order-sensitive synergies, but only the *first* action
is surfaced as a proposal. After the human approves it (and the command is
applied) or rejects it, the planner re-runs from the live state to produce the
next proposal. Re-planning each step is cheap (well under the budget) and keeps
every proposal honest: it is always computed against the real board, so a rejected
action or an unexpected human play during the turn never leaves the AI executing a
stale plan. A rejection re-plans with that action excluded; an explicit "End AI
Turn" stops the loop. See [The Approval Loop](#the-approval-loop).

## Modeling the Opponent

The one genuine uncertainty is what the human does after the AI commits its
challengers: during the player's Dusk they reposition blockers, and on their own
turn they may remove or block the AI's threats. The AI cannot simulate the
player's specific cards, so it models the response abstractly — this is where the
Monte Carlo / minimax-lite layer lives, kept to roughly 1.5 plies.

`opponent-model.ts` defines a small set of **archetypal responses** to a proposed
AI front rank:

- **No blocking** — challengers score unblocked (best case for the AI).
- **Block biggest** — the opponent puts its largest available body opposite the
  AI's biggest challenger.
- **Trade evenly** — the opponent assigns blockers to dissolve as much AI spark
  as possible.
- **Remove top threat** — the opponent has removal for the AI's most valuable
  challenger (probability scaled by opponent hand size and a deck-wide removal
  prior).

The planner scores a candidate front rank by combining these, two ways that can
be selected by a difficulty setting:

- **Expectiminimax (default):** weight each response by a prior and take the
  expected evaluation. This yields measured, non-paranoid play.
- **Worst-case (cautious):** take the minimum over the response set, producing a
  more block-oriented AI that over-commits less.

"Monte Carlo" here means sampling a handful (≤ ~16) of concrete responses from
those archetypes — including sampling *which* unknown card the opponent might
hold — resolving each directly over the forward-model projection (the abstract
opponent bodies) with the same combat rules, and averaging. The shared
`resolveChallenge` operates on full `BattleMutableState` with real instances, so
it is reserved for the authoritative end-of-turn commit; the opponent model
applies the matching lower-spark-dissolves / unpaired-scores comparison itself
against the projection. With a board this small, sampling is cheap, and the
variance it captures (does the
opponent have the blocker or not?) is exactly the uncertainty the AI faces. The
sample count is a budget-bounded knob.

This layer never inspects real opponent card definitions; it consumes only
abstract bodies and counts, preserving the asymmetric-knowledge principle.

## The Approval Loop

The AI never commits state. It produces proposals, and the human approves each
one with a click before it is applied. This makes the human the authority on every
change to the board, fits the prototype's manual-sandbox philosophy, and removes
any risk of the AI silently committing a wrong result (see
[Auto-Resolution and Manual Steps](#auto-resolution-and-manual-steps)).

The loop, for the AI's turn:

1. The planner computes the AI's next best action from the live state
   (receding-horizon; see [The Planner](#the-planner)).
2. `BattleAiProposalBar` renders it as one proposal: a plain-language description
   ("Play Marked Direwolf to the back rank"; "Dissolve your 3✦ body with
   Flashpoint Detonation"; "Declare Rusted Colossus as a challenger"), the
   referenced card(s), and the AI's short rationale from the
   `BattleAiChoiceTrace`.
3. The human clicks **Approve**, **Reject**, or **End AI Turn**:
   - **Approve** dispatches the action's `DEBUG_EDIT` command(s) through the
     normal controller path, so it lands in history and the log and is undoable.
     The planner then re-plans and proposes the next action.
   - **Reject** discards the proposal; the planner re-plans with that action
     excluded and proposes an alternative.
   - **End AI Turn** stops the loop immediately and moves to the handoff,
     regardless of remaining proposals.
4. When the AI's best action is to pass, it proposes **End Turn**. Approving it
   declares the AI's challengers and yields the human's Dusk/Night windows.
5. The Challenge phase resolves the same way: the Challenge resolver produces a
   previewed outcome (lane-by-lane dissolves and score deltas), rendered as a
   single **Approve outcome** proposal that the human confirms — and can hand-edit
   first if a trigger on their own card should change it. Only on approval do the
   score and dissolves commit.

Because each proposal is a single atomic step the human gates, no artificial
pacing is needed: the human's clicks pace the turn. The proposal carries
everything needed to judge it — what will happen, to which cards, and why — so
approval is an informed decision rather than a rubber stamp. The same surface
covers the rare case where the AI cannot fully model a board interaction: the
proposal flags it ("your Gatebound Warden has a ▸Challenge trigger — resolve it
before approving") and waits.

Approving every action is the default and the design target. An optional
"approve all remaining" affordance — auto-approving the rest of a computed turn —
is noted as a convenience in [Open Questions](#open-questions), kept secondary to
the click-per-action model.

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

The turn is paced by the human's approvals rather than by an artificial delay:
each action waits at the proposal bar until the human clicks (see
[The Approval Loop](#the-approval-loop)), so the player always has time to read
what the AI intends before it happens. The 100ms budget therefore bounds only the
work behind a single proposal, computed when the previous one is resolved.

## A Worked Turn

To make the pieces concrete, here is a representative enemy turn. Suppose it is
the AI's turn 4 (max energy 5 under the default ramp). The AI's hand holds
Marked Direwolf (4●), Nocturne Strummer (2●), Flashpoint Detonation (2●), Worlds
Await (1●). On the board it already has a Rusted Colossus in the back rank
(played last turn, now awakened) and the player has a lone 3✦ body in their front
rank.

1. **Proposal: play Nocturne Strummer (2●).** Internally the planner weighs
   Marked Direwolf (4●) against Nocturne Strummer (2●) and prefers the Strummer
   first, because its Support lifts the Colossus and any front-rank body by +2✦.
   It surfaces "Play Nocturne Strummer to the back rank." You click **Approve**;
   the materialization commits and the planner re-plans.
2. **Proposal: Flashpoint Detonation on your 3✦ body.** With the Strummer down, the
   next-best action is removal — dissolving the player's only blocker raises the
   AI's expected Challenge points. The proposal names the exact target. You click
   **Approve** (or **Reject** if you know it should fizzle — say the body has Veil
   you have not revealed).
3. **Proposal: declare Rusted Colossus as a challenger.** The awakened
   Colossus is pushed to the front rank, with the Strummer placed in a supporting
   back-rank slot. The proposal shows its computed effective spark — 6 base + 2
   from the Strummer's Support. You **Approve**.
4. **Proposal: Worlds Await (+3✦) on the Colossus.** With the blocker gone the
   opponent model expects no block, so the extra spark converts straight to
   points. You **Approve**.
5. **Proposal: End Turn.** Approving it declares challengers and yields your Dusk
   window (position a blocker, play a Fast card). The Challenge resolver then
   proposes the outcome — "Rusted Colossus scores N⍟, no blockers" — which
   you **Approve**. Only then does the score commit; the spine checks the win
   condition, ramps energy, and hands the turn back via `SET_BATTLE_FLOW`.

Each approved step emits a `BattleAiChoiceTrace`, so the log reads as a legible
sequence — "play Nocturne Strummer → dissolve your 3✦ body with Flashpoint Detonation →
push Rusted Colossus to challenge → pump it with Worlds Await → pass" —
and every entry in it was something you clicked to allow.

## Codebase Integration

**1. URL parameter and runtime config.** `RuntimeConfig` in
`src/runtime/runtime-config.ts` carries `aiMode: boolean`, parsed as
`params.get("ai") === "1"` so ordinary battles are manual unless `?ai=1`
enables it. It is threaded through `App.tsx` → journey context/screen router →
`BattleSiteRoute` → `PlayableBattleScreen`. The fast QA path is
`http://localhost:5173/?goto=battle&ai=1` (omit `ai` for a manual
battle).

**2. The AI deck.** `ai/deck.ts` builds the enemy deck from Starter cards:
`Array.from(cardDatabase.values()).filter((c) => c.isStarter)` (the `isStarter`
flag is set from `rarity === "Starter"` in `scripts/setup-assets.mjs`), expanded
to the tuned multiset and mapped through `createBaseBattleDeckCardDefinition`. In
`createBattleInit` (`src/battle/integration/create-battle-init.ts`), when AI mode
is on, use this deck for `enemyDeckDefinition` instead of the idf3-steered pool.
This is a narrow branch at the single existing `createEnemyDeckDefinition` call
site; the surrounding padding/shuffle logic is reused unchanged.

**3. The driver hook and proposal surface.** `ai/use-battle-ai.ts` is a hook
mounted by `PlayableBattleScreen` only when `aiMode` is on. It watches
`reducerState.mutable`, and instead of dispatching directly it holds the AI's
*current proposal* as React state for `BattleAiProposalBar` to render:

```ts
const { proposal, approve, reject, endAiTurn } =
  useBattleAi({ reducerState, dispatch, enabled: aiMode });
// internally:
//   when mutable.activeSide === "enemy" && mutable.result === null:
//     proposal = planNextAction(forwardModelFrom(mutable), deadline)  // one action
//   approve(): dispatch the proposal's command(s), then re-plan -> next proposal
//   reject():  re-plan excluding the rejected action -> alternative proposal
//   endAiTurn(): stop, then propose the Challenge outcome and the handoff
```

Only the human-triggered `approve` (and the approved Challenge outcome) calls
`dispatch({ type: "APPLY_COMMAND", command })` — the same path every human gesture
uses — so there is no second mutation route to keep consistent, and undo/redo and
logging continue to work unchanged. `BattleAiProposalBar` (in
`src/battle/components/`) renders the current proposal with **Approve**,
**Reject**, and **End AI Turn** controls and the AI's rationale.

**4. Input gating.** Wire the existing placeholders. While the AI holds an
un-approved proposal, set `canPlayerAct` (today hardcoded to `true` in
`PlayableBattleScreen.tsx`) to `false` so the player drives the turn only through
the proposal bar's Approve/Reject controls rather than by free editing. During the
human's own Dusk/Night windows the proposal bar steps aside and normal controls
return so the player can position blockers and play Fast cards. Pass
`hasAiOpponent={aiMode}` to `BattleStatusBar` (it already renders
`data-battle-status-meta="has-ai"`).

**5. Multiplayer coexistence.** The battle state is shared through
`useMultiplayerBattle()` / Firebase. The AI is a *local* actor: it must run on
exactly one client. In the single-player journey flow this is the only client, so
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

- **The proposal bar (always on, the primary surface).** Every AI action appears
  in `BattleAiProposalBar` *before* it happens, as a plain-language suggestion
  with the referenced card(s), the AI's rationale from the `BattleAiChoiceTrace`,
  and **Approve** / **Reject** / **End AI Turn** controls. The player therefore
  both sees and gates each move — playing a character, removal, declaring
  challengers, resolving the Challenge phase — and nothing reaches the board
  without a click. A "thinking…" indicator on the enemy side of `BattleStatusBar`
  covers the brief moment a proposal is being computed.

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

Together these satisfy the requirement that the player both *sees and approves*
what the AI does (the proposal bar), keeps a durable record of it (the log), and,
when desired, can *inspect why* (the debug panel) — all built on the `aiChoices`
channel that already exists end to end.

## Testing and Tuning

- **Headless self-play harness.** A `scripts/battle-ai-experiment.mjs` (run via
  `node --experimental-strip-types`, per `qa_tooling.md`) plays the AI against
  baselines — a random-legal mover, a greedy one-ply mover, and a mirror of
  itself — over many seeded games, reporting win rate, average turns to a result,
  and per-decision timing. This both validates competence and provides the
  objective function for tuning the evaluation weights and the energy ramp,
  matching the project norm of answering design questions by simulation rather
  than argument.
- **Unit tests** (Vitest, alongside the modules): event targeting, structural
  character play, the support-adjacency spark computation, the Challenge
  resolver against the worked examples in `battle_rules.md` (including
  figment-stack top-down loss via `selectFigmentChallengeLossCount`); the
  time-budget guard returning a valid best-so-far plan under an artificially
  tiny deadline; deterministic planning under a fixed seed.
- **Browser QA** (`agent-browser` against a non-5173 port per repo QA rules) on
  `?goto=battle&ai=1`: confirm the enemy takes
  a visible, paced turn, the
  player is gated from acting during it, the log shows the AI's choices, scores
  move on Challenge resolution, and the reward flow fires on a real win. Capture
  the error buffer and confirm no render errors or unhandled rejections.

## Phased Implementation Plan

1. **Rules spine.** `engine/challenge.ts` and `engine/energy.ts` plus turn
   handoff, with unit tests against the rules doc.
2. **AI deck + forward model.** `ai/deck.ts`, `ai/forward-model.ts`, and the
   support-adjacency spark computation, with tests.
3. **Per-card models + evaluation.** `ai/cards/*` and `ai/evaluate.ts`.
4. **Planner + opponent model.** `ai/planner.ts`, `ai/opponent-model.ts`, the
   time-budget guard, and the self-play harness for weight tuning.
5. **Driver + approval surface + integration.** `ai/use-battle-ai.ts`,
   `components/BattleAiProposalBar.tsx`, the `?ai` runtime-config plumbing, deck
   injection in `createBattleInit`, and the `canPlayerAct` / `hasAiOpponent`
   wiring (gated to the proposal bar during AI proposals).
6. **Presentation.** `aiChoices` trace population, the proposal bar's
   plain-language descriptions and rationale, the thinking indicator, and the
   debug inspector tab.
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
- **Rejection and convenience.** Approving each action is the default. What
  should **Reject** do — skip the action and let the AI propose its next-best
  alternative (re-plan), or end the AI's turn outright? And should there be an
  optional "approve all remaining" toggle for players who want faster turns, or is
  one click per action always required?
- **Multiplayer coexistence.** Confirm the AI should be disabled in shared
  multiplayer rooms (or owner-gated), so two clients never both drive the enemy.
- **Term alignment.** The code, the rules doc, and the AI modules share the
  front/back rank terminology (zones `frontRank`/`backRank`, slots `F0`–`F8` and
  `B0`–`B9`).

## Appendix: File-by-File Change Summary

| File | Change |
| --- | --- |
| `src/runtime/runtime-config.ts` | `aiMode` parsed from `?ai` (on only for `?ai=1`). |
| `src/App.tsx` / screen router / `BattleSiteRoute` | Thread `aiMode` to the battle screen. |
| `src/battle/integration/create-battle-init.ts` | When `aiMode`, build `enemyDeckDefinition` from the Starter deck. |
| `src/battle/ai/deck.ts` | NEW — Starter-deck builder. |
| `src/battle/ai/forward-model.ts` | NEW — planning projection + support-adjacency spark. |
| `src/battle/ai/cards/*` | NEW — ten `StarterCardModel`s and the registry. |
| `src/battle/ai/evaluate.ts` | NEW — static board evaluation. |
| `src/battle/ai/planner.ts` | NEW — staged beam search; emits `TurnPlan` + traces. |
| `src/battle/ai/opponent-model.ts` | NEW — abstract opponent + response sampling. |
| `src/battle/ai/driver.ts` | NEW — next planned action → proposed `BattleCommand[]` (committed on approval). |
| `src/battle/ai/use-battle-ai.ts` | NEW — hook watching `activeSide`; holds the current proposal, commits on approval, re-plans. |
| `src/battle/ai/trace.ts` | NEW — builds `BattleAiChoiceTrace` entries (proposal + log). |
| `src/battle/components/BattleAiProposalBar.tsx` | NEW — proposal/approval surface (Approve / Reject / End AI Turn + rationale). |
| `src/battle/engine/challenge.ts` | Shared Challenge-phase resolver. |
| `src/battle/engine/energy.ts` | Shared start-of-turn energy ramp. |
| `src/battle/components/PlayableBattleScreen.tsx` | Mount the AI hook + proposal bar; gate `canPlayerAct` to the proposal during AI proposals; pass `hasAiOpponent`. |
| `src/battle/components/BattleInspector.tsx` | Debug-gated AI reasoning tab. |
| `src/battle/components/BattleLogDrawer.tsx` | Render populated `aiChoices`. |
| `scripts/battle-ai-experiment.mjs` | NEW — headless self-play harness for tuning. |
