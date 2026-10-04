# Engine Design

This page specifies the rules engine that Phases 3–7 build. It defines the
contracts and their non-obvious decisions. The agent fills in details through
the [rules ladder](decisions.md#d10-rules-ambiguity-ladder) and keeps this page
consistent when an implementation improves on it.

Read with [battle_rules.md](../battle_rules/battle_rules.md), which is
authoritative for game behavior.

## Goals and constraints

- **Pure and deterministic.** There is no React, DOM, `Date`, or `Math.random`.
  The same initial state plus the same action sequence produces the same state,
  byte for byte.
- **Headless.** It runs in Vite, in Vitest, in Node via `tsx` for the fuzzer
  and tournaments, and in a Web Worker for the AI.
- **Cheap to clone.** State is plain JSON-serializable data. The AI's search
  clones state thousands of times per decision.
- **Complete.** Every rule in battle_rules.md is enforced, and legality is
  computed rather than trusted. The UI and AI only choose among legal options.
- **Fair views.** A per-side view redacts hidden information. It is the only
  thing the UI and the AI read.
- **Explainable.** Every state change emits a semantic event used for
  presentation, logging, and debugging.

## Module layout

Use this layout as a starting point. Rename modules if a clearer structure
emerges, and update this page when you do.

```text
src/engine/
  state/        BattleState, CardInstance, zones, ids, serialization, hashing
  rules/        turn/phase machine, priority, stack, challenge, victory, fatigue
  effects/      effect interpreter, primitives, prompts (resolution-time decisions)
  continuous/   computed characteristics (spark, cost, keywords, types), Support
  triggers/     event bus, trigger matching, queue, delayed/floating triggers
  dsl/          ability types, builders, transfiguration transforms, English renderer
  content/      definitions by UUID: cards/, dreamsigns/, avatars/, dreamwell/, figments/
  loops/        loop signatures, shortcut detection, mandatory-cycle detection
  view/         per-side redaction, knowledge tracking, determinization sampling
  policy/       Policy interface, Random/Greedy (Phase 4), bots (Phase 7)
  testing/      scenario-spec DSL, card-lab setup solver, fuzz harness, invariants
src/engine/index.ts   createBattle, decision, legalActions, playOptions, apply, view
```

`src/rules/battle/` becomes a thin adapter. It turns fold events into engine
actions and engine results into the `BattleFoldState` presentation slice.

## State model

```ts
interface BattleState {
  readonly version: number;            // increments per applied action
  seed: string;                        // from the room seed + battle index
  rng: RngStreams;                     // named streams: shuffle:<side>, dreamwell, random:<purpose>
  config: BattleConfig;                // from data/battle.ron + journey modifiers
  turn: { round: number; active: Side; phase: Phase; challengeLane: number | null };
  sides: Record<Side, SideState>;
  instances: Record<InstanceId, CardInstance>;
  stack: StackItem[];                  // last element is the top
  priority: Side | null;
  pending: Decision | null;            // exactly one pending decision, or none
  triggerQueue: QueuedTrigger[];
  floating: FloatingEffect[];          // durations: "until end of turn", "while X in play"
  delayed: DelayedTrigger[];           // "the next time you play an event this turn…"
  turnLog: TurnCounters;               // cards/events/characters played this turn per side, etc.
  oncePerTurn: string[];               // used ability keys for this turn
  challenge: { challengers: InstanceId[]; blockers: Record<InstanceId, InstanceId> } | null;
  loops: LoopTracker;
  result: { kind: "victory" | "draw"; winner?: Side; reason: EndReason } | null;
}

interface SideState {
  score: number; currentEnergy: number; maxEnergy: number; fatigueCount: number;
  deck: InstanceId[]; hand: InstanceId[]; void: InstanceId[]; banished: InstanceId[];
  backRank: (InstanceId | null)[];     // length 10, B0..B9
  frontRank: (InstanceId | null)[];    // length 9, F0..F8
  avatar: EmblemState;                 // not a character (P4); has `exhausted`
  dreamsigns: EmblemState[];
}

interface CardInstance {
  id: InstanceId;                      // stable across zone changes (targeting by identity)
  source: { kind: "card"; cardId: CardId } | { kind: "figment"; figment: FigmentId }
        | { kind: "copy"; of: InstanceId | CardId; overrides?: CopyOverrides };
  owner: Side; controller: Side;
  variant: Variant;                    // amplified flag + applied transfigurations
  status: {
    exhausted: boolean; reclaimed: boolean; offering: boolean; ephemeral: boolean;
    veil: boolean; gainedSpark: number; counters: number; created: boolean;
    grants: Grant[];                   // keywords/abilities granted with durations
  };
  enteredZoneAt: number;               // timestamp for layer ordering
}
```

A few rules follow from this model:

- **Instance IDs persist across zones.** battle_rules.md § Zone Changes
  requires it. "Ceases to exist" deletes the instance.
- **Gained spark lives on the instance.** It persists across zones. Spark a
  character *has* from a static ability is never stored; it is computed (see
  [continuous effects](#continuous-effects)).
- **Counters reset when a card leaves play.**

## Actions and decisions

The engine is driven by **actions**. Each action is exactly one fold intent.
At any time there is at most one pending **decision**, owned by one side.

```ts
type Action =
  | { kind: "playCard"; card: InstanceId; from: "hand" | "void" | "deckTop"; choices: PlayChoices }
  | { kind: "activate"; source: InstanceId | EmblemRef; ability: number; choices: PlayChoices }
  | { kind: "reposition"; card: InstanceId; to: Slot }        // includes figment merge onto a match
  | { kind: "pass" }                                          // pass priority, or end Day/Dusk/Night
  | { kind: "answer"; decision: DecisionId; answer: PromptAnswer }
  | { kind: "repeatLoop"; loop: LoopId; count: number | "untilVictory" }
  | { kind: "debug"; op: DebugOp };                           // dev builds only (D4)

interface PlayChoices {                 // everything chosen when the card is played
  targets: Record<SelectorKey, InstanceId[] | StackItemId[]>;
  modes?: number[]; x?: number;
  additionalCosts?: CostChoice[];       // which cards to discard/abandon/banish, optional costs paid
}
```

There are two kinds of choices:

- **Play-time choices.** Targets, modes, X, and costs are chosen before the item
  goes on the stack (battle_rules.md § Targeting: "Targets are chosen before
  costs are paid").
  - The UI collects them as local interaction state and submits one
    `playCard` intent.
  - The engine validates them.
  - `playOptions(state, side, card)` returns the choice tree (legal targets per
    selector, mode list, X range, cost options), so the UI and the AI never
    re-derive legality.
- **Resolution-time decisions.** Some choices arise while an effect resolves:
  - "Look at the top 4 cards and draw one";
  - foresee arrangement;
  - discover picks;
  - targets of triggered abilities;
  - "you may";
  - "unless the opponent pays";
  - discarding to the hand limit.

  For these, the engine sets `pending` and stops. The owner answers with an
  `answer` intent.

```ts
type Decision =
  | { kind: "main"; side: Side; phase: "day" | "dusk" | "night" }   // play/activate/reposition/pass
  | { kind: "respond"; side: Side }                                 // priority with a non-empty stack
  | { kind: "prompt"; side: Side; id: DecisionId; prompt: Prompt };

type Prompt =
  | { kind: "chooseTargets"; selector: SelectorSpec; candidates: InstanceId[]; min: number; max: number }
  | { kind: "chooseCards"; zone: ZoneRef; candidates: InstanceId[]; min: number; max: number; purpose: PromptPurpose }
  | { kind: "chooseMode"; options: ModeOption[] }
  | { kind: "confirm"; purpose: PromptPurpose }                    // "you may…", "pay 2● or …"
  | { kind: "arrange"; cards: InstanceId[]; destinations: ArrangeDestinations }  // foresee, "one on top, one on bottom…"
  | { kind: "chooseNumber"; min: number; max: number; purpose: PromptPurpose };
```

**Prompt labels are not strings.** `PromptPurpose` and the selector spec are
structured. The UI renders them through Trox from a template keyed by purpose
and selector description, so prompts are localizable and generic. Never
assemble prompt prose in the engine.

**P1 auto-pass.** When a side would receive a `respond` decision, or a
Dusk/Night window, but has no legal non-pass action, the engine applies `pass`
for it and logs the auto-pass.

## Turn structure and timing

The phase machine is battle_rules.md § Turn Structure, encoded once:

1. **Dreamwell.** Applies from round 2.
2. **Draw.** The player skips it on their first turn, per `skip_player_opening_draw`.
3. **Dawn.** Auto-advances.
4. **Day.** Standard, Fast, and Interrupt windows for the active side;
   repositioning.
5. **Dusk.** The non-active side may reposition and has a Fast window.
6. **Night.** `▸Night` and `▸Challenge` triggers, then a Fast window for the
   active side.
7. **Challenge.** One lane per step, F0→F8. After each lane, fire `▸Dissolved`
   triggers and drain the queue.
8. **Ending.** Hand limit (chosen, P6). Then ephemeral and offering banishes.
   Then "until end of turn" expiry and F3 returns. Then exhaust clears for
   everything, including avatars.

Designations:

- At the end of Day, the active side's front-rank characters are recorded as
  **challengers**.
- At the end of Dusk, the opposing front-rank characters directly opposite
  them, at the same index, become **blockers**.
- Night effects that move characters update the designations by recomputing
  opposite pairs for the recorded challengers.

**Timing categories** come from battle_rules.md § Playing Cards and the Stack:

- **Standard:** active side, Day, empty stack.
- **Fast:** in the controller's Fast windows, with an empty stack.
- **Interrupt:** any time a Fast item could be played, and also as a response
  to an opponent item on the stack.

## Stack and priority

This follows [D13](decisions.md#d13-stack-and-priority):

1. A `playCard` or `activate` action pays its costs. The item goes on the stack.
2. The engine fires "when you play" triggers and drains the queue.
3. `priority` goes to the opponent.
4. The opponent's `pass` resolves **the top item**.
5. After resolution, if the stack is non-empty, priority goes to the resolved
   item's controller.

Further rules:

- Only Interrupts can be played while the stack is non-empty.
- Prevent removes an item from the stack, and the card goes to its owner's
  void. The exceptions are created cards (they cease to exist) and reclaimed
  cards (they are banished).
- Activated abilities are stack items too, with their own source, ability
  index, and locked choices.
- **Copies** follow [D15](decisions.md#d15-copies-of-cards-on-the-stack):
  - `copyStackItem` pushes a created copy above the original.
  - It carries X and the paid additional costs.
  - Its controller may re-choose targets and modes. Model this as a prompt
    when legal alternatives exist.
  - It does not count as played.

## Triggers

This follows [D14](decisions.md#d14-trigger-timing-and-order).

- **The event bus.** Every primitive emits engine events (`Materialized`,
  `Dissolved`, `CardPlayed`, `Drew`, `Discarded`, `Abandoned`,
  `LeftPlay`, `Scored`, `PhaseStarted`, …).
- **Matching.** After an effect completes, the trigger matcher runs over the
  events it emitted. Matching abilities enqueue as `QueuedTrigger`s.
- **Ordering.** Matches enqueue in event order. Simultaneous matches use the
  fixed order: the active side first; within a side, avatar → dreamsigns →
  characters, back rank B0→B9 then front rank F0→F8. Cards in other zones go
  after them, ordered by zone (void, then hand, then deck) and then by
  instance ID.
- **Draining.** The queue drains, FIFO, before any decision is offered. A
  trigger whose resolution needs a choice sets `pending` and resumes after the
  answer.
- **Functional zones.** Abilities function in play by default. Some function
  elsewhere because their text says so:
  - Soulkindler `4edf2d8d-61e4-4c3a-a388-4b52b2ebd005`: "▸Dawn: If this card
    is in your void, erode 3";
  - Graywatch `3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1`: "When you play a card
    from your void, return this character to play";
  - From the Barrow `4752fc43-6696-4bc3-88d0-4d5b97622fa8`: "When you discard
    or erode this card…".

  Such an ability declares `zone: "void" | "hand" | "any"` in the DSL.
- **Intervening conditions.** For "If you control 3 or more warriors, gain 1●",
  check the condition when the trigger matches and again on resolution. This
  is the MTG analog; record it as an RD entry.
- **Once per turn.** Key the used state by instance and ability index. Clear it
  at the start of each turn.
- **Floating triggers.** "Until end of turn, when you play a character, draw a
  card" is a `FloatingEffect` with a trigger and a duration.
- **Delayed triggers.** "The next time you play an event this turn, copy it" is
  a one-shot `DelayedTrigger`.
- **"Trigger the ▸Dawn ability of X."** This enqueues X's Dawn abilities as if
  Dawn had fired, without changing the phase.
- **Disabling.** "Disable the triggered abilities of an enemy while this
  character is in play" is a grant that suppresses matching.

## Continuous effects

Effective characteristics are computed and never stored. Memoize per
`state.version`. The ordering follows the MTG layer analog, with timestamp
order inside a layer:

1. **Copiable values:** printed characteristics, figment catalog values, copy
   overrides (e.g., "0✦ figment copy"), and variant transforms.
2. **Type changes:** "has all character types" and similar.
3. **Ability adds and removes:** granted keywords (vengeful, awakened, veil,
   reclaim), and "disable triggered abilities".
4. **Base-spark setting:** "the base ✦ … becomes 7", and "✦ of each character
   … becomes X". These are characteristic-setting effects with a duration.
5. **Spark modifications:** gained spark (instance), temporary gains,
   static "+1✦" anthems, Support from the supporting back-rank characters, and
   per-figment shares. The result is clamped at 0 for comparisons.
6. **Cost modifications:** increases first, then reductions, applied in
   timestamp order. The result is clamped at 0. "Your next card this turn costs
   2● less" is a delayed modifier consumed on use.

Dynamic values such as "+X✦ where X is the number of characters you control"
are **locked at resolution** unless the text is a static "have" ability. This
is the MTG 608.2h analog; record it as an RD entry.

**Support adjacency.** `B(i)` supports `F(i-1)` and `F(i)`, wherever those
exist.

## Zones and zone changes

There is one primitive, `moveInstance(id, to, cause)`. Every effect and rule
calls it. It applies these replacement rules in order:

1. **Created cards and figments cease to exist** instead of entering the deck,
   hand, void, or banished zone. Dissolved figments fire their `▸Dissolved`
   triggers first.
2. **Reclaimed cards are banished** instead of any other zone change when they
   leave play or the stack (battle_rules.md § Reclaim). They don't fire
   `▸Dissolved`.
3. **Veil.** A dissolve by an effect the opponent controls removes Veil instead.

Other zone rules:

- **Materialize** places the card in the leftmost open back-rank slot, except
  for the UI drop, which uses the chosen slot. The card enters exhausted unless
  awakened.
- **Capacity:**
  - A full back rank makes plays that would materialize illegal.
  - Triggers leave the card in its previous zone.
  - Figments at capacity merge per battle_rules.md § Creating Figments at
    Capacity.
- **Gain control** moves the card to the receiver's leftmost open back slot,
  exhausted through Ending. It fails if the rank is full.
- **Banish-until** effects record their return. F3 governs "until end of turn";
  RD entries govern "until your next turn" and "until next Day".
- **Offering, ephemeral, and reclaimed statuses** travel with the instance.

## Costs

Cost kinds:

- energy: `Fixed(n)`, `Variable` (X), or `FixedAndVariable(n)` (n then X);
- exhaust self (☾): legal only for back-rank characters and avatars;
- discard n matching a predicate;
- abandon matching a predicate, or "this character";
- banish N from your void;
- reveal this card from hand;
- spend counters (⧗, n or X);
- optional additional costs ("You may pay an additional 3●…").

Rules:

- Costs are paid in full before the item goes on the stack.
- Copies don't pay.
- X legality comes from each card's DSL range, defaulting to `min: 1`. The
  definition widens it to 0 only when X=0 does something meaningful
  (battle_rules.md § X costs).

## Ability DSL

Definitions are typed TypeScript data built with small builder functions, one
module per entity group in `src/engine/content/`.

```ts
// src/engine/dsl/types.ts (abridged)
type Definition = (v: VariantParams) => { abilities: Ability[] };   // v.amplified: boolean

type Ability =
  | { kind: "keyword"; keyword: Keyword }                         // awakened, vengeful, veil, offering, ephemeral, phasing, reclaim(cost?)
  | { kind: "triggered"; trigger: Trigger; condition?: Condition; oncePerTurn?: true; zone?: FunctionalZone; effect: Effect }
  | { kind: "activated"; speed?: "fast" | "interrupt"; costs: Cost[]; oncePerTurn?: true; zone?: FunctionalZone; effect: Effect }
  | { kind: "static"; effect: StaticEffect; condition?: Condition; zone?: FunctionalZone }
  | { kind: "support"; grant: StaticEffect }
  | { kind: "event"; effect: Effect; requirement?: Condition; additionalCost?: Cost[]; optionalCost?: OptionalCost };
```

The printed text is the specification. Each definition is registered with the
hash of the RON text it encodes:

```ts
// Windcutter: "▸Challenge: Banish an enemy until end of turn." / amplified: "until your next turn."
card("7be2e6d7-abff-4c44-a0c3-35460da1693c", "<hash>", (v) => ({
  abilities: [
    triggered(onChallenge(), banish(target(enemyCharacter()), v.amplified ? untilYourNextTurn() : untilEndOfTurn())),
  ],
}));

// Kindlehorn: "▸Dawn: Gain 1●." / "4●, ☾: This character gains +1✦." / amplified: "2●."
card("9b9c2743-75b3-499d-b5fb-c3429c92d420", "<hash>", (v) => ({
  abilities: [
    triggered(onDawn(), gainEnergy(1)),
    activated([energy(v.amplified ? 2 : 4), exhaustSelf()], gainSpark(self(), 1)),
  ],
}));

// Dream Sever (Interrupt event): "Prevent a played event unless the opponent pays 2●."
card("6e019832-2e0c-4166-81c3-54f7995425df", "<hash>", () => ({
  abilities: [event(prevent(target(stackItem({ type: "event", controller: "opponent" })), { unlessPays: [energy(2)] }))],
}));

// Echo Architect: "Events cost you 1● more." / "When you play an event, copy it."
card("21965e95-0c8c-470c-a1e1-06d7b87a8d00", "<hash>", () => ({
  abilities: [
    staticAbility(costModifier(cardsYouPlay({ type: "event" }), +1)),
    triggered(whenYouPlay({ type: "event" }), copyStackItem(triggeringItem())),
  ],
}));

// Spirit Bond: "Until end of turn, characters you control have +X✦ where X is the number of characters you control."
card("3cda9dd7-cb81-43c1-9db5-1444d7363e13", "<hash>", () => ({
  abilities: [event(forDuration(untilEndOfTurn(), sparkModifier(charactersYouControl(), lockedAtResolution(count(charactersYouControl())))))],
}));
```

The UUIDs above are real. The `"<hash>"` placeholders stand for the hashes
the registry tool computes.

**Primitive catalog.** Phase 3 starts with the primitives below. Phase 5 adds
primitives as families require them, each with its own primitive tests.

| Group | Primitives |
| --- | --- |
| Resources | `gainEnergy`, `gainMaxEnergy`, `doubleEnergy`, `gainPoints`, `playerGainsPoints`, `store`, `spendCounters` |
| Cards | `draw` (with modifiers: ephemeral, cost 0), `discard` (chosen or random), `foresee`, `discover`, `erode`, `lookAtTop(n, distribute)`, `reveal`, `shuffleInto`, `putOnTop`/`Bottom`, `createInHand(copyOf, modifiers)` |
| Characters | `dissolve`, `banish(duration?)`, `abandon(chooser, predicate)`, `materialize(from, selection)`, `materializeFigment(type, spark, n)`, `materializeFigmentCopy`, `rematerialize`, `returnToHand`, `gainSpark(duration?)`, `setBaseSpark`, `awaken`, `exhaust`, `move(slotRule)`, `gainControl`, `grant(keyword, duration)`, `giveAllTypes`, `triggerAbility(trigger, target)`, `disableTriggers(while)` |
| Stack | `prevent(unless?)`, `copyStackItem(times, overrides)`, `putPreventedInto(zone)` |
| Flow | `sequence`, `choose`, `chooseOne(modes)`, `ifThen(Else)`, `forEach`, `repeat`, `optional`, `eachPlayer`, `forDuration`, `delayed(next…)`, `floating(when…)` |
| Selectors | characters (by controller, subtype, ✦/● bounds, figment or not, exhausted, rank, "another"); cards in a zone by predicate; stack items by type, controller, ●/✦; players |
| Values | constant, X, `count(selector)`, stored counters, turn counters ("cards played this turn"), `lockedAtResolution` |
| Durations | `untilEndOfTurn`, `untilYourNextTurn`, `untilNextDay`, `whileSourceInPlay`, `permanent` |
| Triggers | `onMaterialized`, `onDawn`, `onDusk`, `onNight`, `onChallenge`, `onDissolved`, `whenYouPlay(pred, nth?)`, `whenMaterialize(pred)`, `whenDraw`, `whenDiscard`, `whenAbandon`, `whenLeavesPlay`, `whenScores`, `whenOpponentScores`, `whenLeavesVoid`, `atStartOfTurn`, `atStartOfFirstTurn` |

Dreamsigns and avatars use the same DSL. Their abilities function from their
emblem, which is never a character (P4). Dreamwell cards use event-like
abilities. Figments are catalog definitions, for example Legionnaire's static
"+1✦ for each other Warrior you control".

## Transfigurations

Each transfiguration is a pure transform `Definition → Definition` with an
eligibility predicate. The journey Transfiguration site, the dreamsigns, and
the card-lab all use these functions:

| Transfiguration | Eligibility | Transform |
| --- | --- | --- |
| Empowered | printed cost > 0 | energy cost → `round(cost / 2)`, with halves rounding up (4→2, 3→2, 2→1, 1→0; matches journeys.md) |
| Amplified | `amplified_text` non-blank | `v.amplified = true` |
| Kindled | character | base spark ×2; 0 → 1 |
| Resonant | has `▸Materialized`, `▸Dawn`, or once-per-turn | Materialized also on Dissolved; Dawn also on Materialized; drop `oncePerTurn` |
| Inspired | event | append `draw(1)` to the event effect |
| Enduring | event | add `keyword(reclaim())` |
| Attuned | has an activated ability with an energy cost | that cost −1 (min 0) |
| Perfected | eligible for ≥2 of the above | apply all eligible transforms |

The English renderer renders transformed definitions too. That supplies the
tinted "modified rules text" the journey UI shows. Check it against
`src/transfiguration/` and preserve the current presentation.

## Registry and gates

Phase 3 builds three gates.

**Registry.** `src/engine/content/registry.ts` maps every catalog UUID to a
`Definition`, `vanilla()`, or (only during Phases 3–5) `pending()`. A pending
card plays as its body and keywords only, and the engine logs
`unimplemented_card_played`.

**CI coverage gate.** A test that pins the data↔engine contract.

- The catalog UUIDs of cards, dreamsigns, avatars, Dreamwell, and figments
  equal the registry's keys.
- Each definition's recorded hash equals the hash of the current RON
  `ability_text` and `amplified_text`.
- The pending set is allowed only if it is a subset of the pending list in
  `src/engine/content/pending.ts`. That list must be empty at the Phase 5
  gate.

This deliberately reads production data, exactly like the prototype's
existing `rules-text-hash` gate. It is the sanctioned exception, because it
guards that every printed text has been encoded.

**English-render audit.** `npm run audit:abilities -- --uuids <…>` is a report,
not a test.

1. It renders each definition (and the amplified variant) to canonical English.
2. It normalizes symbols, whitespace, and case, then diffs against the printed
   text.
3. Every mismatch is either fixed or listed in
   `src/engine/content/render-exceptions.ts` with a one-line reason, for
   example "phrasing variant: 'draw two cards' vs 'draw 2 cards'".

A content bead may close only with zero unexplained mismatches.

## Loops

This follows [D12](decisions.md#d12-infinite-combos-are-intentional). Limits
live in RON (P9).

**Optional loops (the shortcut).**

1. At each **checkpoint**, the engine computes a *loop signature*. A checkpoint
   is a `main` decision for the acting side with an empty stack and empty
   trigger queue. The signature is a hash of the state with the monotone
   resources abstracted away:
   - both scores;
   - current and maximum energy;
   - stored counters;
   - gained spark;
   - deck and void sizes, but not their composition, for erode-style loops;
   - turn counters.
2. Suppose the signature at checkpoint *k* equals the one at an earlier
   checkpoint *j* in the same turn. Suppose also that the abstracted delta from
   *j* to *k* is non-negative for the actor, non-positive for the opponent, and
   strictly positive somewhere.

   Then the engine records `LoopCandidate { actions: j..k, delta }` and offers
   `repeatLoop` as a legal action.
3. Executing it replays the recorded actions one by one, validating each. It
   stops early in any of these cases:
   - an action becomes illegal;
   - the battle ends;
   - the opponent would receive a decision with a legal non-pass response,
     which they are then given;
   - the iteration cap is reached (RON; default 10,000 for "until victory").

**Mandatory cycles.** While the trigger queue drains with no decision offered,
the engine hashes the full state after each trigger.

- An exact repeat means an unbreakable cycle. End the battle in a draw with
  reason `mandatory_loop`.
- A non-repeating but unbounded drain hits a resolution cap (RON; default
  100,000 steps). It ends the same way, with reason `resolution_cap`, and is
  logged loudly. A card behaving like this is a card issue unless it is a real
  infinite combo.

Write both rules into battle_rules.md (§ Infinite Loops, new).

## Randomness and replay

- **RNG** is a small seeded generator with **named streams**:
  - `shuffle:<side>`;
  - `dreamwell`;
  - `random:<purpose>`, as in "a random character with cost …".

  Adding a new random effect never perturbs other streams. Every draw logs its
  stream and purpose.
- **Seeds.** The battle seed derives from the room seed and the battle index,
  as the fold does today.
- **Replay.** The fold log is the replay. `scripts/replay` fixtures and the
  fuzz harness re-run action logs and compare the hashes of final states.

## Views and hidden information

- `view(state, side)` returns a `BattleView`. It hides the opponent's hand
  contents (count only, plus cards known to this side) and every deck order
  (counts, plus known cards such as a revealed top card).
- Knowledge tracking: each instance carries `knownTo: Side[]`, updated by these
  actions:
  - reveal;
  - look at the opponent's hand;
  - the card being played;
  - zone moves to public zones.
- **The UI renders only views.** Debug "reveal hidden zones" switches the view
  to omniscient for that side.
- **Determinization** (D22) is `sample(view, decklistOf(opponent), rng) →
  BattleState`. It deals unknown cards consistent with the opponent's
  decklist, minus cards seen in public zones, the cards known to be in hand,
  and the known deck positions. Only the AI uses it.

## Fold and UI integration

- **Intents.** `src/coop/actions.ts` (renamed in Phase 2) gains one intent,
  `battleAction(action)`. The reducer calls `engine.apply`. An illegal action is
  a deterministic bounce with a stable reason, which cannot happen with an
  honest UI.
- **Fold state.** `BattleFoldState` holds the engine state and a bounded
  presentation buffer of recent engine events with sequence numbers. The UI
  animates the buffer, and animation never gates state. Battle init is built
  from the journey via the existing `create-battle-init`. `END_BATTLE` handoff
  semantics stay exactly as they are.
- **Presentation events → visuals.** Every engine event kind maps to an
  existing animation, particle, or log line:
  - dissolve, banish, materialize;
  - spark change;
  - figment create and merge;
  - prevent, copy, control change;
  - trigger fired;
  - points scored;
  - energy change.

  New statuses get Cumulus-consistent indicators on battlefield cards:
  - temporary banish return;
  - granted keyword;
  - disabled triggers;
  - pending cost modifiers;
  - "reclaim until end of turn".
- **AI pacing.** AI plays reuse the existing reveal pacing: the full-card reveal
  at reading size with a 2 s dwell, then travel to its destination. The AI
  submits its next intent only after the previous action's presentation
  finishes. That is client presentation timing; it doesn't gate the fold.

## Policy interface

```ts
interface Policy {
  readonly id: string;                                   // "random", "greedy", "expert", "planner@v7", …
  decide(view: BattleView, decision: Decision, ctx: PolicyContext): Promise<Action> | Action;
}
interface PolicyContext {
  rng: Rng;                                              // policy-private stream; never the battle RNG
  budget: { iterations: number; wallClockMs?: number };  // tournaments: iterations only (D23)
  decklist: { mine: CardId[]; opponent: CardId[] };      // D22
  log: (entry: PolicyTrace) => void;
}
```

- `Random` picks uniformly among legal actions, with random play-time choices
  among the legal ones.
- `Greedy` takes the best action by one-step static evaluation.

Both arrive in Phase 4, so journeys are playable before Phase 7. Phase 7 adds
Expert, Planner, and ISMCTS. In the browser, policies run in a Web Worker
(`src/engine/policy/worker.ts`). In Node, they run in-process or in
`worker_threads`.

## Testing layers

- **Primitive tests:** `src/engine/**/*.test.ts`. Each primitive and rule is
  tested once, with synthetic boards built by the scenario-spec builder.
- **Scenario specs:** `src/engine/content/specs/*.spec.ts`. These are
  declarative per-card behavior specs, written only when needed
  ([D20](decisions.md#d20-card-test-strategy)):

  ```ts
  spec("7be2e6d7-abff-4c44-a0c3-35460da1693c", "challenge trigger banishes the opposing blocker until Ending", {
    board: { me: { F2: card("7be2e6d7-…") }, enemy: { F2: vanilla(3) } },
    at: "endOfDay",
    play: [pass() /* Dusk */, answer(targets(enemy("F2")))],
    expect: (s) => [zoneOf(s, enemy("F2")) === "banished", scoreOf(s, "me") === 1],
  });
  ```

- **Fuzz invariants** (`npm run fuzz:engine`) run seeded games with random
  decks and Random/Greedy policies. After every action, they assert:
  - zone conservation (each live instance is in exactly one zone);
  - rank capacities;
  - non-negative energy and score;
  - exactly one owner for each pending decision, with ≥1 legal answer;
  - view redaction: the opponent's hand cards are absent from the view;
  - serialization round-trip;
  - replay determinism.

  Games must terminate.
- **The card-lab setup solver** is shared by specs, the card-lab scene, and the
  sweep. It reads a definition's selectors and costs and synthesizes a minimal
  legal board:
  - energy;
  - fodder for costs;
  - void contents;
  - legal targets;
  - the correct phase or window.

  Per-card overrides live in `src/engine/testing/lab-overrides.ts`.

## Performance targets

These are monitored in `docs/plan/evidence/metrics.md` and never gated:

- Random-policy full battles: ≥ 20 per second per core in Node.
- `apply`: median < 50 µs on the M5 Max.
- Clone and hash of a mid-game state: < 20 µs.
- The Planner's iteration budget fits 1.5 s on a mid-range laptop. Use 3× the
  M5 Max time as the proxy.
