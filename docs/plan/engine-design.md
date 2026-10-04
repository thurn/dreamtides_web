# Engine Design

This page specifies the rules engine that Phases 3–7 build. It defines the
contracts and their non-obvious decisions. The agent fills in details through
the [rules ladder](decisions.md#d10-rules-ambiguity-ladder) and keeps this page
consistent when an implementation improves on it.

`docs/rules.md` is authoritative for game behavior. Before Phase 2.1 it lives
at `docs/battle_rules/battle_rules.md`.

**The hardest part of a card-game engine is input prompts.** Any action can
raise a prompt, because triggers and effects fire anywhere. This design
therefore puts [Decisions and prompts](#decisions-and-prompts) at its center.
Every other section is written to fit it.

## Goals and constraints

- **Straight-line rules code.** Engine code reads like a blocking,
  thread-based engine: `const target = ctx.choose(prompt)` returns the answer.
  Nothing else in the engine knows about suspension.
- **Pure and deterministic.** There is no React, DOM, `Date`, `Math.random`,
  or module-level mutable state in `src/engine/`; enforce this with
  `no-restricted-globals` and `no-restricted-syntax` lint rules. The same start
  state plus the same answers always produces the same state, events, and
  prompts.
- **Headless.** It runs in Vite, Vitest, Node (`tsx`, `worker_threads`), and a
  Web Worker.
- **Cheap to clone.** State is plain JSON-serializable data. AI search clones
  it thousands of times per decision.
- **Complete.** Every rule is enforced, and legality is computed rather than
  trusted. The UI and AI only choose among legal options.
- **Fair views.** A per-side view redacts hidden information. It is the only
  thing the UI and the AI read.
- **Explainable.** Every state change emits a semantic event used for
  presentation, logging, and debugging.

## Module layout

This layout is a starting point. Update this page if a clearer structure
emerges.

```text
src/engine/
  state/       BattleState, CardInstance, zones, ids, serialization, hashing
  steps/       step kinds, the step runner, drivers (interactive, inline, scripted), Suspend
  prompts/     Prompt/Answer types, fingerprints, validation, auto-answer rules
  rules/       turn/phase machine, priority, stack, challenge, victory, fatigue
  effects/     DSL interpreter and primitives
  continuous/  computed characteristics (spark, cost, keywords, types), Support
  triggers/    event bus, trigger matching, queue, delayed/floating triggers
  dsl/         ability types, builders, transfiguration transforms, English renderer
  loops/       loop signatures, shortcut detection, mandatory-cycle detection
  view/        per-side redaction, knowledge tracking, determinization sampling
  policy/      Policy interface, Random/Greedy (Phase 4), bots (Phase 7), worker host
  testing/     scenario-spec builder, card-lab setup solver, fuzz harness, invariants
src/content/   typed catalogs (D32) with co-located abilities (D5)
  cards/ dreamsigns/ avatars/ dreamwell/ figments/ apollyon/
  data/        battle, opponents, ai, atlas, dreamscapes, guides, sites, economy, tutorial, …
```

The battle adapter in the fold (today `src/rules/battle/`) turns intents into
engine calls. It also keeps the in-flight step record
([below](#fold-integration)).

## State model

```ts
interface BattleState {
  readonly version: number;            // increments per committed step
  seed: string;                        // from the game seed + battle index
  rng: RngStreams;                     // named streams: shuffle:<side>, dreamwell, random:<purpose>
  config: BattleConfig;                // from src/content/data/battle.ts + journey modifiers
  turn: { round: number; active: Side; phase: Phase; challengeLane: number | null };
  sides: Record<Side, SideState>;
  instances: Record<InstanceId, CardInstance>;
  stack: StackItem[];                  // last element is the top
  priority: Side | null;
  triggerQueue: QueuedTrigger[];
  floating: FloatingEffect[];          // "until end of turn", "while X in play"
  delayed: DelayedTrigger[];           // "the next time you play an event this turn…"
  turnLog: TurnCounters;               // cards/events/characters played this turn per side, etc.
  oncePerTurn: string[];
  challenge: { challengers: InstanceId[]; blockers: Record<InstanceId, InstanceId> } | null;
  loops: LoopTracker;
  result: { kind: "victory" | "draw"; winner?: Side; reason: EndReason } | null;
}

interface SideState {
  score: number; currentEnergy: number; maxEnergy: number; fatigueCount: number;
  deck: InstanceId[]; hand: InstanceId[]; void: InstanceId[]; banished: InstanceId[];
  backRank: (InstanceId | null)[];     // length 10, B0..B9
  frontRank: (InstanceId | null)[];    // length 9,  F0..F8
  avatar: EmblemState;                 // not a character (P4); has `exhausted`
  dreamsigns: EmblemState[];
}

interface CardInstance {
  id: InstanceId;                      // stable across zone changes
  source: { kind: "card"; cardId: CardId } | { kind: "figment"; figment: FigmentId }
        | { kind: "copy"; of: InstanceId | CardId; overrides?: CopyOverrides };
  owner: Side; controller: Side;
  variant: Variant;                    // amplified flag + applied transfigurations
  status: { exhausted: boolean; reclaimed: boolean; offering: boolean; ephemeral: boolean;
            veil: boolean; gainedSpark: number; counters: number; created: boolean; grants: Grant[] };
  knownTo: Side[];                     // hidden-information tracking
  enteredZoneAt: number;               // timestamp for layer ordering
}
```

**`BattleState` never contains a pending prompt.** Prompts exist only while a
step runs. In interactive play they are reconstructed from the in-flight
record ([Fold integration](#fold-integration)). This is what makes state
cheap to clone and the same everywhere.

## Decisions and prompts

### Vocabulary

**Decision**
: The general term for any point at which one side must choose. A decision is
  either a top-level decision or a prompt. At any moment there is at most one
  pending decision, owned by one side.

**Top-level decision**
: A decision between steps:
  - **`main`:** play, activate, reposition, or pass in Day, Dusk, or Night.
  - **`respond`:** priority with a non-empty stack.

  `decision(state)` derives it from the state. The answer is a top-level
  `Action`.

**Prompt**
: A choice raised *inside* a step by `ctx.choose()`:
  - a target;
  - cards from a zone;
  - a mode;
  - X or another number;
  - an arrangement (foresee, "one on top, one on bottom");
  - confirming a "you may";
  - paying an "unless" cost;
  - discarding to the hand limit;
  - an additional-cost choice.

**Step**
: The unit of execution and commitment. A step runs rules code synchronously
  from a committed state to the next committed state. It may raise any number
  of prompts, for either side.

### Top-level actions

```ts
type Action =
  | { kind: "play"; card: InstanceId; from: "hand" | "void" | "deckTop" }
  | { kind: "activate"; source: InstanceId | EmblemRef; ability: number }
  | { kind: "reposition"; card: InstanceId; to: Slot }      // includes figment merges
  | { kind: "pass" }                                        // pass priority, or end Day/Dusk/Night
  | { kind: "repeatLoop"; loop: LoopId; count: number | "untilVictory" }
  | { kind: "debug"; op: DebugOp };                         // dev builds only (D4)
```

**Actions carry no choices.** Every choice an action needs is a prompt inside
its step: targets, modes, X, costs, merge confirmation.

### Step kinds

Steps are kept small, so that a suspended step never has many prompts to
replay.

| Step | Runs |
| --- | --- |
| `play` / `activate` | Play-time prompts (X, modes, targets, additional and optional costs) → `ctx.commitPoint()` → pay costs → push to stack → queue "when you play" triggers |
| `resolveTop` | Resolve the top stack item's effect, then queue its triggers |
| `resolveTrigger` | Pop and resolve exactly one queued trigger; one step per trigger |
| `advancePhase` | One phase transition and its rules actions (Dreamwell draw, Draw, Ending cleanup) |
| `challengeLane` | Resolve one lane; `▸Dissolved` triggers are queued |
| `reposition` | One reposition or merge (includes the Legionnaire confirmation prompt) |
| `loopIteration` | One iteration of an accepted loop shortcut |

**The driver composes steps.** After a top-level action's step commits, the
driver keeps running **automatic steps** until it reaches a top-level decision
or a battle result. Automatic steps are: drain the trigger queue one step at a
time, auto-pass (P1), and advance phases.

### The rules-code contract

```ts
interface StepContext {
  choose<P extends Prompt>(prompt: P): AnswerFor<P>;   // synchronous
  commitPoint(): void;           // point of no return: prompts after it are not cancellable
  emit(event: EngineEvent): void;
  // primitives: draw, dissolve, banish, materialize, … (never call choose internally)
}

// Interpreter excerpt: plain synchronous code
function resolveBanish(ctx: StepContext, spec: BanishSpec, source: InstanceId): void {
  const candidates = legalTargets(ctx.state, spec.target, source);
  if (candidates.length === 0) { ctx.emit({ kind: "noLegalTarget", source }); return; }
  const [target] = ctx.choose(chooseTargets({ candidates, min: 1, max: 1, purpose: purposeOf(source, spec) }));
  ctx.banish(target, spec.duration);
}
```

These rules make it work:

1. **Call `choose` only between complete mutations.** Primitives are atomic
   and never prompt. Rules code built from primitives and the interpreter
   prompts only at choice points. The queueing in D14 is what makes this hold
   even when triggers fire mid-effect.
2. **Keep everything a step reads inside `BattleState` and its answers.** That
   includes RNG streams. Iteration order must be deterministic: arrays and
   sorted keys.
3. **Make the prompt's legal answer set complete and enumerable.** Bounds and
   candidates are computed by the engine. Answers are validated against the
   prompt the engine itself raised, never against a client's copy.
4. **Handle empty prompts explicitly.** A mandatory prompt with zero legal
   answers can't be raised:
   - At play time, the action is illegal. A [dry run](#legality-by-dry-run)
     detects this.
   - At resolution time, that effect part does nothing and emits
     `noLegalTarget`.
   - Record this as an RD entry.
5. **Cancelling** is possible only for the acting player's own `play` and
   `activate` steps, before `commitPoint()`. Cancelling discards the in-flight
   step, and the state is exactly the committed state.

### Drivers

One step runner; three answer sources:

```ts
interface AnswerSource { answer(prompt: Prompt, work: BattleState): Answer }   // may throw Suspend

function runStep(start: BattleState, step: Step, source: AnswerSource): StepResult {
  const work = clone(start);
  const ctx = new Context(work, source);
  try {
    executeStep(ctx, step);
    return { kind: "done", state: work, events: ctx.events };
  } catch (e) {
    if (e instanceof Suspend) return { kind: "suspended", prompt: e.prompt, display: work, events: ctx.events };
    throw e;                     // engine bug: caller aborts the step; committed state is untouched
  }
}
```

**`InteractiveSource`** is used by the fold. It replays the in-flight record's
answers in order. For each one, it checks that the replayed prompt's
**fingerprint** matches the recorded one, and throws `ReplayDivergence` if
not. When the answers run out, it throws `Suspend(prompt)`.

Prompts that the auto-answer rules allow are answered by the source itself and
recorded with `auto: true`. The rules come from data (P9), for example a
single legal target for a mandatory effect.

**`InlineSource`** is used by AI search, fuzzing, and tournaments. It calls
the owning side's policy synchronously, so execution never suspends and replay
costs nothing.

**`ScriptedSource`** is used by tests and scenario specs. It answers from a
list. It fails if a prompt arrives with no scripted answer, or if any answers
are left over.

**The fingerprint** is a hash of the prompt's identifying fields: kind, side,
purpose, sorted candidates, bounds, and source instance. It is the safety net
for the whole approach: nondeterministic rules code fails loudly on the first
replay instead of silently corrupting a game.

### Fold integration

The fold's battle slice holds only plain data:

```ts
interface BattleSlice {
  committed: BattleState;                  // last step boundary
  inFlight: null | {
    step: Step;                            // e.g. { kind: "play", card: "i17" }
    answers: { fingerprint: string; value: Answer; auto?: true }[];
  };
  publishedEvents: number;                 // events of the in-flight step already handed to presentation
}
```

The intents are:

- **`battleAction(action)`**
  - Allowed only when `inFlight === null` and the action is in
    `legalActions(committed, side)`.
  - Opens `inFlight` for its step.
- **`answer(promptId, value)`**
  - Allowed only when `promptId` equals the currently suspended prompt's ID
    and `validate(prompt, value)` passes.
  - Appends the answer.
- **`cancel(promptId)`**
  - Allowed only for a cancellable prompt.
  - Clears `inFlight`.

After each intent, the reducer **advances**:

1. Run the in-flight step with `InteractiveSource`.
2. If it is **suspended:**
   - Expose `pending = prompt` and `display = work`, the intermediate state.
   - Publish the step's events past `publishedEvents`.
3. If it is **done:**
   - Commit the state and clear `inFlight`.
   - Publish the remaining events.
   - Start the next automatic step, if any, and repeat.
4. If it **threw:**
   - Log `engine_error` with the step and answers, for reproduction.
   - Leave `committed` untouched, clear `inFlight`, and surface a recoverable
     error.

Properties that follow:

- **Prompt IDs** are `${committed.version}:${answers.length}`. They are stable
  across reloads and re-runs, so a stale UI answer bounces deterministically.
- **Reload mid-prompt** replays the log and reaches the identical prompt.
  Local selection state in the UI is lost, which is acceptable.
- **Re-run cost** is one step's execution per answer. Steps are small, so this
  is microseconds. A non-persisted memo keyed by
  `(committed.version, answers.length)` avoids redundant re-runs.
- **Events are deterministic,** so re-runs regenerate an identical prefix. The
  fold publishes only new events, and asserts prefix equality in development.
- **Either side can be prompted at any time.** A human card can prompt the AI
  ("each player discards"), and an AI card can prompt the human. The UI and
  the AI host both just watch `pending.side`.

### Legality by dry run

`legalActions(state, side)` enumerates the timing-legal candidates, then
filters them with a **dry run** of each candidate's step on a clone:

- The `InlineSource` answers every prompt with its first legal answer.
- `commitPoint()` throws a `Feasible` sentinel.

Reaching the commit point means every required play-time prompt had a legal
answer and the costs are payable. This replaces a separately maintained "can
play?" predicate, so legality can never drift from execution. Results are
memoized per `state.version`.

### Prompt data

```ts
interface Prompt {
  id: string;                          // assigned by the fold; absent in inline runs
  side: Side;                          // who answers
  kind: "chooseTargets" | "chooseCards" | "chooseMode" | "chooseNumber" | "arrange"
      | "confirm" | "payOrDecline";
  purpose: PromptPurpose;              // { source: InstanceId; cardId: CardId; ability: number; role: PurposeRole }
  candidates?: InstanceId[];           // complete legal set
  min?: number; max?: number;          // bounds
  options?: ModeOption[];              // modes, each with its own legality
  arrangement?: ArrangeSpec;           // cards + destinations ("top", "bottom", "void", "hand")
  cancellable: boolean;                // only before commitPoint of the acting side's own play/activate
  privateTo?: Side;                    // revealed cards visible only to the chooser (e.g. "look at the top 4")
}
```

The purpose is structured, not prose. The UI renders prompt text from English
templates in one UI copy module, keyed by `kind` and `role` ("Choose an enemy
to banish", "Discard a card"), with the source card shown alongside. Engine
code never builds player-facing strings (D35).

### UI contract (implemented in Phase 4)

**One prompt host for every prompt.** A single `PromptHost` renders the
pending prompt for the human side, whatever its source. Each `kind` maps to an
existing Cumulus surface:

| `kind` | Surface |
| --- | --- |
| `chooseTargets` | on-board legal-target highlighting |
| `chooseCards` | the pick-cards surface |
| `chooseMode` | the choice prompt |
| `arrange` | the foresee / card-order editor |
| `confirm`, `payOrDecline` | the choice prompt |
| `chooseNumber` | a number picker |

**Interaction rules:**

- **Local selection** is keyed by `prompt.id` and reset when the ID changes.
- **Submitting** sends one `answer` intent. **Cancel** is shown only when
  `cancellable`.
- **Present, then ask.** The prompt appears only after every event that
  preceded it has been presented. For "draw 2, then discard a card", the draws
  animate into the hand first.
- **Waiting on the AI.** While `pending.side` is the AI, the UI shows the
  existing "opponent is acting" treatment, and the AI host in the worker
  answers.
- **Intermediate state.** The board renders `view(display, human)` while a
  step is suspended, so intermediate states are visible.

### Why not threads, generators, or explicit continuations

See [D31](decisions.md#d31-prompt-architecture-replay-suspended-steps).

- **A truly blocking Web Worker** using `Atomics.wait` is possible on the web.
  But it requires cross-origin isolation, and a parked stack still can't be
  saved or branched by the AI. It needs this same replay design anyway.
- **Generators** color every function on a prompt path.
- **Explicit continuation stacks** are the classic source of prompt-state bugs.

## Turn structure and timing

The phase machine follows rules § Turn Structure, encoded once:

1. **Dreamwell.** Applies from round 2.
2. **Draw.** The player skips it on their first turn.
3. **Dawn.** Auto-advances.
4. **Day.** Standard, Fast, and Interrupt windows for the active side;
   repositioning.
5. **Dusk.** The non-active side may reposition and has a Fast window.
6. **Night.** `▸Night` and `▸Challenge` triggers, then a Fast window for the
   active side.
7. **Challenge.** One `challengeLane` step per lane, F0→F8.
8. **Ending.** The hand-limit prompt (P6). Then ephemeral and offering
   banishes. Then "until end of turn" expiry and F3 returns. Then exhaust
   clears for everything, avatars included.

Designations:

- At the end of Day, the active side's front-rank characters are recorded as
  challengers.
- At the end of Dusk, the opposing front-rank characters at the same index
  become blockers.
- Night movement updates the pairs for the recorded challengers.

Timing categories:

- **Standard:** active side, Day, empty stack.
- **Fast:** the controller's Fast windows, with an empty stack.
- **Interrupt:** any time a Fast item could be played, and also as a response
  to an opponent item on the stack.

## Stack and priority

This follows [D13](decisions.md#d13-stack-and-priority).

1. A `play` or `activate` step commits its item to the stack.
2. Automatic steps drain the triggers.
3. `priority` goes to the opponent.
4. A `pass` resolves the top item, as a `resolveTop` step.
5. After resolution and trigger draining, if the stack is non-empty, priority
   goes to the resolved item's controller.

Further rules:

- **Prevent** removes an item from the stack, and the card goes to its owner's
  void. Created cards cease to exist; reclaimed cards are banished.
- **Activated abilities** are stack items too.
- **Copies** follow [D15](decisions.md#d15-copies-of-cards-on-the-stack). A
  copy pushed above its original offers its controller a `chooseTargets` or
  `chooseMode` prompt when legal alternatives exist.

## Triggers

This follows [D14](decisions.md#d14-trigger-timing-and-order).

- **Matching.** Primitives emit engine events. After each step's effect
  completes, the matcher enqueues matching abilities as `QueuedTrigger`s.
- **Ordering.** Matches enqueue in event order. Simultaneous matches use the
  fixed order: the active side first; within a side, avatar → dreamsigns →
  characters, B0→B9 then F0→F8. Cards in other zones follow, ordered by zone
  (void, hand, deck) and then by instance ID.
- **Draining.** Each queued trigger resolves in its own `resolveTrigger` step,
  so its prompts are cheap to replay.
- **Functional zones.** Abilities that work outside play declare
  `zone: "void" | "hand" | "any"`. Examples:
  - Soulkindler `4edf2d8d-61e4-4c3a-a388-4b52b2ebd005`: "▸Dawn: If this card
    is in your void, erode 3";
  - Graywatch `3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1`;
  - From the Barrow `4752fc43-6696-4bc3-88d0-4d5b97622fa8`.
- **Intervening "if" conditions** are checked when the trigger matches and
  again on resolution. Record this as an RD entry.
- **Once per turn** is keyed by instance and ability index, and cleared at the
  start of each turn.
- **Floating triggers** are "until end of turn, when…". **Delayed triggers**
  are one-shot "the next time…".
- **`triggerAbility`** enqueues a named trigger outside its phase.
- **Disabled triggers** suppress matching.

## Continuous effects

Effective characteristics are computed, never stored, and memoized per
`state.version`. They follow the MTG layer analog, in timestamp order within a
layer:

1. **Copiable values:** printed values, figment catalog values, copy
   overrides, and variant transforms.
2. **Type changes:** "has all character types".
3. **Ability adds and removes:** granted keywords, and disabled triggers.
4. **Base-spark setting:** "base ✦ becomes 7", "✦ … becomes X".
5. **Spark modifications:** gained spark, temporary gains, anthems, Support,
   and per-figment shares. The result is clamped at 0 for comparisons.
6. **Cost modifications:** increases, then reductions, with a minimum of 0.
   "Next card" modifiers are consumed on use.

Dynamic values such as "+X✦ where X is…" are **locked at resolution** unless
the ability is a static "have". This is the MTG 608.2h analog; record it as an
RD entry.

**Support adjacency:** `B(i)` supports `F(i-1)` and `F(i)`.

## Zones and zone changes

There is one primitive, `moveInstance(id, to, cause)`, and every effect and
rule calls it. It applies these replacements in order:

1. **Created cards and figments cease to exist** instead of entering the deck,
   hand, void, or banished zone. Dissolved figments fire `▸Dissolved` first.
2. **Reclaimed cards are banished** instead of any other zone change, without
   `▸Dissolved`.
3. **Veil.** A dissolve by an opposing effect removes Veil instead.

Other zone rules:

- **Materialize** places the card in the leftmost open back-rank slot, or the
  chosen slot for a UI drop. The card enters exhausted unless awakened.
- **Capacity:**
  - A full back rank makes materializing plays illegal (the dry run catches
    this).
  - Triggers leave the card in place.
  - Figments merge per rules § Creating Figments at Capacity.
- **Gain control** moves the card to the receiver's leftmost open back slot,
  exhausted through Ending. It fails if the rank is full.
- **Banish-until** effects record their return (F3, plus RD entries for the
  other variants).
- **Offering, ephemeral, and reclaimed statuses** travel with the instance.

## Costs

Cost kinds:

- energy: Fixed, X, or Fixed+X;
- ☾ (back-rank characters and avatars only);
- discard;
- abandon;
- banish from void;
- reveal from hand;
- counters;
- optional additional costs.

**Cost choices are play-time prompts** before `commitPoint()`: which cards to
discard, whether to pay the optional cost. Payment happens after the commit
point, all of it before the item goes on the stack. Copies don't pay.

**X legality** comes from the definition's range, which defaults to `min: 1`.
Widen it to 0 only when X=0 does something meaningful.

## Ability DSL and content modules

Each entity lives in a typed content module that holds its catalog data, its
printed text, and its abilities together:

```ts
// src/content/cards/windcutter-7be2e6d7.ts
export default card({
  id: "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  name: "Windcutter",
  text: ["▸Challenge: Banish an enemy until end of turn."],
  amplifiedText: "until your next turn.",
  cost: fixed(3),
  kind: character({ subtype: "Warrior", spark: 1 }),
  rarity: "Uncommon",
  art: { image: 454095982, crop: { x: -0.426, y: 1.0, scale: 1.37 } },
  abilities: (v) => [
    triggered(onChallenge(), banish(target(enemyCharacter()), v.amplified ? untilYourNextTurn() : untilEndOfTurn())),
  ],
  verifiedText: "<hash>",   // hash of text + amplifiedText that these abilities were verified against
});
```

**File layout.** Use one file per entity, named `<slug>-<uuid8>.ts`. Names
aren't unique; the UUID prefix disambiguates. Each directory has an explicit
`index.ts`, and a test asserts that the index lists every file. Node tools
can't use `import.meta.glob`.

**More examples** (abilities only):

```ts
// Kindlehorn 9b9c2743-75b3-499d-b5fb-c3429c92d420: "▸Dawn: Gain 1●." / "4●, ☾: This character gains +1✦." / amplified "2●."
(v) => [triggered(onDawn(), gainEnergy(1)), activated([energy(v.amplified ? 2 : 4), exhaustSelf()], gainSpark(self(), 1))]

// Dream Sever 6e019832-2e0c-4166-81c3-54f7995425df (Interrupt): "Prevent a played event unless the opponent pays 2●."
() => [event(prevent(target(stackItem({ type: "event", controller: "opponent" })), { unlessPays: [energy(2)] }))]

// Echo Architect 21965e95-0c8c-470c-a1e1-06d7b87a8d00: "Events cost you 1● more." / "When you play an event, copy it."
() => [staticAbility(costModifier(cardsYouPlay({ type: "event" }), +1)), triggered(whenYouPlay({ type: "event" }), copyStackItem(triggeringItem()))]

// Spirit Bond 3cda9dd7-cb81-43c1-9db5-1444d7363e13: "Until end of turn, characters you control have +X✦ where X is the number of characters you control."
() => [event(forDuration(untilEndOfTurn(), sparkModifier(charactersYouControl(), lockedAtResolution(count(charactersYouControl())))))]
```

**Primitive catalog.** Phase 3 starts with these. Phase 5 extends them, with
tests for each.

| Group | Primitives |
| --- | --- |
| Resources | `gainEnergy`, `gainMaxEnergy`, `doubleEnergy`, `gainPoints`, `playerGainsPoints`, `store`, `spendCounters` |
| Cards | `draw` (modifiers: ephemeral, cost 0), `discard` (chosen or random), `foresee`, `discover`, `erode`, `lookAtTop(n, distribute)`, `reveal`, `shuffleInto`, `putOnTop`/`Bottom`, `createInHand(copyOf, modifiers)` |
| Characters | `dissolve`, `banish(duration?)`, `abandon(chooser, predicate)`, `materialize(from, selection)`, `materializeFigment(type, spark, n)`, `materializeFigmentCopy`, `rematerialize`, `returnToHand`, `gainSpark(duration?)`, `setBaseSpark`, `awaken`, `exhaust`, `move(slotRule)`, `gainControl`, `grant(keyword, duration)`, `giveAllTypes`, `triggerAbility`, `disableTriggers(while)` |
| Stack | `prevent(unless?)`, `copyStackItem(times, overrides)`, `putPreventedInto(zone)` |
| Flow | `sequence`, `choose`, `chooseOne(modes)`, `ifThen(Else)`, `forEach`, `repeat`, `optional`, `eachPlayer`, `forDuration`, `delayed(next…)`, `floating(when…)` |
| Selectors | characters (by controller, subtype, ✦/● bounds, figment or not, exhausted, rank, "another"); cards in a zone; stack items; players |
| Values | constant, X, `count(selector)`, stored counters, turn counters, `lockedAtResolution` |
| Durations | `untilEndOfTurn`, `untilYourNextTurn`, `untilNextDay`, `whileSourceInPlay`, `permanent` |
| Triggers | `onMaterialized`, `onDawn`, `onDusk`, `onNight`, `onChallenge`, `onDissolved`, `whenYouPlay(pred, nth?)`, `whenMaterialize`, `whenDraw`, `whenDiscard`, `whenAbandon`, `whenLeavesPlay`, `whenScores`, `whenOpponentScores`, `whenLeavesVoid`, `atStartOfTurn`, `atStartOfFirstTurn` |

Dreamsigns and avatars use the same DSL as emblem abilities (P4). Dreamwell
cards use event-like abilities. Figments are catalog entries.

## Transfigurations

Each transfiguration is a pure transform of an entity's abilities, with an
eligibility predicate:

| Transfiguration | Eligibility | Transform |
| --- | --- | --- |
| Empowered | printed cost > 0 | cost → `round(cost / 2)`, halves rounding up (4→2, 3→2, 2→1, 1→0) |
| Amplified | `amplifiedText` present | `v.amplified = true` |
| Kindled | character | base spark ×2; 0 → 1 |
| Resonant | has `▸Materialized`, `▸Dawn`, or once-per-turn | Materialized also on Dissolved; Dawn also on Materialized; drop `oncePerTurn` |
| Inspired | event | append `draw(1)` |
| Enduring | event | add `keyword(reclaim())` |
| Attuned | has an activated ability with an energy cost | that cost −1 (min 0) |
| Perfected | eligible for ≥2 of the above | apply all eligible transforms |

The English renderer renders transformed abilities. That supplies the tinted
modified rules text the journey shows. Preserve the current presentation.

## Content gates

**The coverage gate** is a CI test of the data↔engine contract:

- Every catalog entry has `abilities`, `vanilla: true`, or (only during
  Phases 3–5) `pending: true`.
- The pending set is empty at the Phase 5 gate.
- Every entry with abilities has `verifiedText === hash(text, amplifiedText)`.
  A text edit fails CI until the abilities are re-verified and the hash is
  updated.

**The English-render audit** (`npm run audit:abilities -- --uuids <…>`) is a
report, not a test:

1. It renders each entity, and its amplified variant, to canonical English.
2. It normalizes the text and diffs it against the printed text.
3. Every mismatch is either fixed or listed in
   `src/content/render-exceptions.ts` with a one-line reason.

A content bead closes only with zero unexplained mismatches.

## Loops

This follows [D12](decisions.md#d12-infinite-combos-are-intentional). Limits
live in the battle data module.

**Checkpoints.** At each top-level `main` decision with an empty stack and an
empty trigger queue, the engine computes a loop signature. The signature is a
hash of the state with monotone resources abstracted away:

- scores;
- current and maximum energy;
- counters;
- gained spark;
- deck and void sizes;
- turn counters.

**Candidates.** Suppose signature *k* equals an earlier signature *j* in the
same turn. Suppose also that the abstracted delta is non-negative for the
actor, non-positive for the opponent, and positive somewhere. Then the engine
records a `LoopCandidate`. It holds the top-level actions from *j* to *k* and
**every prompt answer with its fingerprint**, and the engine offers
`repeatLoop`.

**Execution.** Each `loopIteration` step replays the recorded actions and
answers. It stops early in any of these cases:

- an action is illegal;
- a replayed prompt's fingerprint differs (a choice now has different options,
  so the player decides);
- the battle ends;
- the opponent gains a decision with a legal non-pass response;
- the iteration cap is reached (data module; default 10,000).

**Mandatory cycles.** While automatic steps run with no decision offered, the
engine hashes the full state after each step.

- An exact repeat ends the battle in a draw (`mandatory_loop`).
- A non-repeating run beyond the resolution cap (default 100,000 steps) also
  ends it in a draw (`resolution_cap`), and is logged loudly.

Write both rules into `docs/rules.md` § Infinite Loops.

## Randomness and replay

- **RNG** uses named streams:
  - `shuffle:<side>`;
  - `dreamwell`;
  - `random:<purpose>`.

  New random effects never perturb other streams. Every draw logs its stream
  and purpose.
- **Seeds.** The battle seed derives from the game seed and the battle index.
- **The fold log is the replay:** top-level actions, answers, and cancels.
  Fixtures and the fuzzer re-run logs and compare the hashes of final states.

## Views and hidden information

- **`view(state, side)`** hides the opponent's hand contents (count only, plus
  cards known to this side) and every deck order (counts, plus known cards).
- **Knowledge** is tracked through `knownTo`, which updates on:
  - reveal;
  - look at a hand;
  - the card being played;
  - public moves;
  - `privateTo` prompts. A "look at the top 4" prompt reveals those cards only
    to its chooser.
- **The UI renders only views.** Debug reveal switches that side's view to
  omniscient.
- **Determinization** (D22) is `sample(view, decklist, rng) → BattleState`. It
  deals unknown cards consistent with the decklist, the cards seen in public
  zones, the cards known to be in hand, and the known deck positions. Only the
  AI uses it.

## Presentation

Every engine event kind maps to an existing animation, particle, or log line:

- dissolve, banish, materialize;
- spark change;
- figment create and merge;
- prevent, copy, control change;
- trigger fired;
- points scored;
- energy change;
- `noLegalTarget`;
- auto-answered prompts.

New statuses get Cumulus-consistent indicators:

- temporary banish return;
- granted keyword;
- disabled triggers;
- pending cost modifiers;
- reclaim until end of turn.

AI plays reuse the reveal pacing: the full card at reading size, a 2 s dwell,
then travel to its destination. The AI host submits its next intent only after
the previous presentation finishes. That is client presentation timing; it
doesn't gate the fold.

## Policy interface

```ts
type PolicyDecision =
  | { kind: "topLevel"; decision: TopLevelDecision; legal: Action[] }
  | { kind: "prompt"; prompt: Prompt };

interface Policy {
  readonly id: string;                         // "random", "greedy", "expert", "planner@v7", …
  decide(view: BattleView, d: PolicyDecision, ctx: PolicyContext): Action | Answer;
}
interface PolicyContext {
  rng: Rng;                                    // policy-private stream; never the battle RNG
  budget: { iterations: number; wallClockMs?: number };
  decklist: { mine: CardId[]; opponent: CardId[] };   // D22
  log: (entry: PolicyTrace) => void;
}
```

**Search branches on clones.** The search branches at top-level decisions on
a clone of `committed`. It branches inside a step by re-running the step from
the clone with a `ScriptedSource` prefix, then falling back to the policy.
ISMCTS tree nodes are decisions of either kind.

**Random and Greedy** arrive in Phase 4. **Expert, Planner, and ISMCTS**
arrive in Phase 7.

**Live play** runs the policy in a Web Worker. The worker receives the view
and the decision and returns an action or answer, which the client submits as
an intent.

## Testing layers

- **Primitive and rules tests:** `src/engine/**/*.test.ts`, using synthetic
  definitions from `src/engine/testing/synthetic-cards.ts`. These are test
  fixtures, not catalog content.
- **Prompt properties:** the core of Phase 3.2.
  - **Equivalence.** For seeded synthetic games, run the game with
    `InlineSource` while recording its answers. Then replay the same answers
    through the fold, suspending and resuming at **every** prompt. Final
    states, event sequences, and prompt fingerprints must be identical.
  - **Divergence.** A deliberately nondeterministic synthetic effect raises
    `ReplayDivergence`.
  - **Reload.** Serializing the fold mid-prompt and reloading it yields the
    same pending prompt ID and fingerprint.
  - **Cancel.** A cancel before the commit point restores the committed state
    exactly. A cancel after it is rejected.
  - **Edge cases:** empty candidate sets, prompts alternating sides within one
    step, and auto-answers recorded and replayed.
- **Scenario specs:** `src/content/specs/*.spec.ts`, written per D20, with
  scripted answers:

  ```ts
  spec("7be2e6d7-abff-4c44-a0c3-35460da1693c", "challenge trigger banishes the opposing blocker until Ending", {
    board: { me: { F2: card("7be2e6d7-abff-4c44-a0c3-35460da1693c") }, enemy: { F2: vanilla(3) } },
    at: "endOfDay",
    play: [pass() /* Dusk */],
    answers: [targets(enemy("F2"))],
    expect: (s) => [zoneOf(s, enemy("F2")) === "banished", scoreOf(s, "me") === 1],
  });
  ```

- **Fuzz invariants** (`npm run fuzz:engine`): seeded games, random decks,
  random transfigurations, Random and Greedy policies. Every Nth game runs in
  interactive replay mode to exercise suspension. After every step, it
  asserts:
  - zone conservation;
  - rank capacities;
  - non-negative energy and score;
  - every prompt has ≥1 legal answer and every legal answer validates;
  - view redaction;
  - serialization round-trip;
  - replay determinism.

  Games must terminate.
- **The card-lab setup solver** is shared by specs, the card-lab scene, and the
  sweep. It synthesizes a minimal legal board for an entity from its selectors
  and costs. Per-entity overrides live in
  `src/engine/testing/lab-overrides.ts`.

## Performance targets

These are monitored in `docs/plan/evidence/metrics.md` and never gated:

- Random-policy full battles: ≥ 20 per second per core in Node.
- A median step: < 50 µs. Clone plus hash: < 20 µs.
- An interactive re-run per answer: < 2 ms for the largest step in fuzz games.
- The Planner's iteration budget fits 1.5 s on a mid-range laptop, using 3×
  the M5 Max time as the proxy.
