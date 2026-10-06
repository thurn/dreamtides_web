# Engine Design

This page specifies the rules engine that Phases 3–7 build. It defines the
contracts and their non-obvious decisions. The agent fills in details through
the [rules ladder](decisions.md#d10-rules-ambiguity-ladder) and keeps this page
consistent when an implementation improves on it.

`docs/rules.md` is authoritative for game behavior.

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

Step kinds, engine event kinds, and DSL primitives are each **registered from
their own module** through typed registries (Phase 3.2 and 3.4). Parallel
lanes and content batches then add files instead of editing central switches.

```text
src/engine/
  state/       BattleState, CardInstance, zones, ids, serialization, hashing
  steps/       step kinds, the step runner, drivers (interactive, inline, scripted), Suspend
  prompts/     Prompt/Answer types, fingerprints, validation, auto-answer rules
  rules/       turn/phase machine, priority, stack, challenge, victory, fatigue
  effects/     DSL interpreter and primitives
  continuous/  computed characteristics (spark, cost, keywords, types), Support
  triggers/    event bus, trigger matching, queue, delayed/floating triggers
  dsl/         ability types, builders, transfiguration transforms
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
  config: BattleConfig;                // every engine tunable: src/content/battle.ts, src/content/
                                       // dreamwell-rules.ts, + BattleInit journey inputs (D39)
  turn: { round: number; active: Side; phase: Phase; challengeLane: number | null;
          extraTurns: Side[];        // pending extra turns, last-in first-out (C8)
          sideTurns: Record<Side, number> };  // turns each side has begun, for "your first turn"
  sides: Record<Side, SideState>;
  instances: Record<InstanceId, CardInstance>;
  knownTo: Record<Side, InstanceId[]>; // hidden cards each side can identify (view/knowledge.ts)
  stack: StackItem[];                  // last element is the top
  priority: Side | null;
  triggerQueue: QueuedTrigger[];
  floating: FloatingEffect[];          // continuous changes with a duration (spark, base spark,
                                       // keywords, types, costs), floating and delayed
                                       // ("the next time…", `once: true`) triggers, disabled triggers
  turnLog: TurnCounters;               // cards/events/characters played this turn per side, etc.
  oncePerTurn: string[];
  challenge: { challengers: InstanceId[]; blockers: Record<InstanceId, InstanceId> } | null;
  loops: LoopTracker;
  result: { kind: "victory"; winner: Side; reason: "score" } | { kind: "draw"; reason: EndReason } | null;
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
  printing: { kind: "card"; cardId: CardId }                         // deck card, created card, or copy
          | { kind: "figment"; figment: FigmentId; spark: number }   // "a 2✦ Ethereal figment"
          | { kind: "figmentCopy"; cardId: CardId; spark: number | null };  // C5; 0 for "0✦ figment copy"
  owner: Side; controller: Side;
  variant: Variant;                    // amplified flag + transfigurations + deck-entry mods (D39)
  status: { exhausted: boolean; reclaimed: boolean; offering: boolean; ephemeral: boolean;
            gainedSpark: number; counters: number; created: boolean;
            x: number | null };                // X paid to play it, kept while in play (variable spark)
  knownTo: Side[];                     // hidden-information tracking
  enteredZoneAt: number;               // timestamp for layer ordering
}
```

`printing` is where layer 1 reads an instance's copiable values
(`printedCard` in `catalog.ts`): the catalog card for its variant, a figment
type from the figment catalog as a 0● character with the spark its text gave
it (C13), or the card a figment copy copied. Every figment is `created`. Veil
is a keyword; losing it is a permanent floating keyword change.

**Engine code reads every tunable from `BattleState.config`**, never from a
content module: the battle rules limits, `autoAnswerForcedPrompts`, and the
Dreamwell construction rules (`config.dreamwell`). `initialState` fills the
config from the data modules once, so a serialized state determines its own
replay.

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
  | { kind: "payToEnd"; effect: EffectId }                 // "until the opponent pays N●" (C7)
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
| `repeatLoop` | Accept the loop on offer: start a repetition, nothing else |
| `loopIteration` | One iteration of an accepted loop shortcut (automatic while a repetition runs) |

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

- **Prompt IDs** are `${committed.version}:${attempt}:${answers.length}`, where
  `attempt` is a persisted counter on the slice that every new in-flight step
  and every cancel advance. They are stable across reloads and re-runs and
  differ between attempts, so a stale UI answer bounces deterministically.
- **Reload mid-prompt** replays the log and reaches the identical prompt.
  Local selection state in the UI is lost, which is acceptable.
- **Re-run cost** is one step's execution per answer. Steps are small, so this
  is microseconds. A non-persisted memo keyed by the committed state and the
  in-flight record avoids redundant re-runs.
- **Events are deterministic,** so re-runs regenerate an identical prefix. The
  fold publishes only new events, and in development compares each re-run with
  the same step's previous answer prefix; a mismatch, like any replay failure,
  becomes an `engine_error` that keeps `committed`.
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
  cards?: InstanceId[]; destinations?: { to: "top" | "bottom" | "void" | "hand"; min: number; max: number }[];  // arrange
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
  `chooseMode` prompt when legal alternatives exist (`rules/copies.ts`,
  `copyCard`): each choice is a resolution-time prompt, answered
  automatically with one legal answer, and a choice with no legal option keeps
  the original's (RD-hv-7x4l.8-4). The copy keeps the item's `x` and
  `optionalPaid`, emits `cardCopied` instead of `cardPlayed`, and changes no
  priority.

## Triggers

This follows [D14](decisions.md#d14-trigger-timing-and-order).

- **Matching.** Primitives emit engine events, and `Context.emit` runs the
  matcher on each event as it happens. Matches only join
  `state.triggerQueue` as `QueuedTrigger`s; they never resolve inline.
  Matching at the moment of the event lets ▸Dissolved see its own dissolve and
  lets "leaves play" and "leaves your void" triggers see the card as it last
  was, through the `leftPlay` and `leftVoid` events emitted just before a card
  moves.
- **Shape.** A `TriggeredAbility` is `{ trigger, effect, zone, condition?,
  oncePerTurn? }`. A queued trigger records its origin (card variant or
  emblem), ability index, floating-trigger node, and the card the event
  concerns, so it resolves even after its source moves or ceases to exist.
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
  are one-shot "the next time…" floating triggers with `once: true`. Both
  store a reference to their effect node in the catalog definition, so state
  stays plain data.
- **`triggerAbility`** enqueues a named trigger outside its phase.
- **Disabled triggers** suppress matching.

## Continuous effects

Effective characteristics are computed, never stored
(`src/engine/continuous/`). `layers.ts` holds the evaluation; rules code
reads it through `effectiveSpark`, `hasKeyword`, the selectors, the cost
code, and the view. Changes come from two sources:

- **Static abilities** (`staticAbility(effect)`), on cards in play and on
  emblems, read live.
- **Floating records** in `state.floating`, made by resolving effects. Their
  characters and values are fixed as they resolve, and each carries its
  `timestamp`.

Both feed the same `ContinuousChange` kinds. The layers follow the MTG
analog:

1. **Copiable values:** printed values for the variant, figment catalog
   values, and figment copies' copied values (`printedCard`). Variant
   transforms (transfigurations, then deck-entry modifications,
   [below](#deck-entry-modifications)) join this layer when Phase 4 adds them.
2. **Type changes:** "has all character types" (`allTypes`).
3. **Ability adds and removes:** keywords gained and lost (`keyword`).
   Disabled triggers are floating records that the trigger matcher reads.
4. **Base-spark setting:** "base ✦ becomes 7" (`baseSpark`).
5. **Spark modifications:** permanent gained spark (`status.gainedSpark`),
   spark with a duration, anthems, Support, and per-figment shares (`spark`).
   The result is clamped at 0; the modifications themselves are not.
6. **Cost modifications** (`continuous/costs.ts`): increases, then
   reductions, with a minimum of 0, applied to the total chosen energy cost
   when a player plays a card: the fixed energy, X, and the energy of a chosen
   alternative or paid optional cost. A "next card" modifier (`next: true`)
   ends as the card it applied to is paid for, after the commit point.

Ordering within a layer:

- Changes apply in timestamp order. A static ability's timestamp is its
  source's `enteredZoneAt` (0 for an emblem).
- Ties go to static abilities first, in source order (emblems, player first,
  then cards by instance number), then floating records in creation order
  (RD-hv-7x4l.7-2).
- A static ability's selectors and values read the characteristics of the
  layers before its own, so no layer depends on itself.
- Cost selectors (`costAtMost`) read the copiable cost (C4, C13).

Dynamic values such as "+X✦ where X is…" are **locked at resolution** unless
the ability is a static "have" (MTG 608.2h; RD-hv-7x4l.7-1). A resolving
continuous primitive evaluates its characters and value once and stores one
floating record per character. `lockedAtResolution(value)` marks the intent.

**Continuous primitives** (`setBaseSpark`, `grant`/`loseKeyword`,
`giveAllTypes`, `sparkModifier`, `costModifier`) each declare a
`continuous` hook: their layer and the changes they make while a static
ability holds them. Their `resolve` makes floating records for their own
duration, else the enclosing `forDuration`'s, else permanently.

**Memoization:** the layer evaluation of a state is cached lazily, per card
and layer, inside a `Layers` object. A step mutates its work copy in place
without changing `version`, so only committed states are memoized. The
engine facade (`decision`, `legalActions`, `apply`, `view`) remembers each
state it is handed in the catalog's `memo`, a `WeakMap` keyed by the state
object and checked against `state.version`. Reads of any other state build
a fresh evaluation. Caches never enter `BattleState`, and the fuzz
invariants compare the memoized evaluation with a fresh one.

**Support adjacency** (`continuous/support.ts`): `B(i)` supports `F(i-1)` and
`F(i)`. `supported(filter)` is the `CharacterRef` for "supported
characters". `supporting()` counts the characters behind a front-rank
character (C9).

## Zones and zone changes

`rules/zones.ts` owns every zone change. `moveInstance(ctx, id, to)` (and
`moveToHand`) move a card to a non-play zone and return where it went, or
`null` when it ceased to exist; `dissolve(ctx, id, by)` names the side whose
effect dissolves it (`null` for a challenge or an abandon). The replacements
apply in order, each to the change as the earlier ones left it
(RD-hv-7x4l.8-1):

1. **Created cards and figments cease to exist** instead of entering the deck,
   hand, void, or banished zone. Dissolved figments fire `▸Dissolved` first:
   `leftPlay` (to `null`), `dissolved`, then `ceasedToExist`, while queued
   triggers keep their origin.
2. **Reclaimed cards are banished** instead of any other zone change, without
   `▸Dissolved`; a reclaimed card never leaves the Banished zone.
3. **Veil.** A dissolve by an opposing effect removes Veil instead.

Other zone rules:

- **Materialize** (`materialize`, `placement`) places the card in the
  leftmost open back-rank slot, or the open slot a UI drop names (the `play`
  action's optional `slot`, kept on the stack item). The card enters
  exhausted unless awakened.
- **Capacity:**
  - A full back rank makes materializing plays illegal: characters, and cards
    and activated abilities whose effects hold a primitive with
    `entersPlay` (`materializeFigments`, `materializeFigmentCopy`).
  - Triggers leave the card in place and emit `capacityReached`.
  - Figments merge per rules § Creating Figments at Capacity
    (`rules/figments.ts`, `createFigments`).
- **Merging** is a `reposition` onto a figment of the same identity (figment
  UUID, or copied card UUID for figment copies): the source ceases to exist
  silently and its base spark plus gained spark joins the destination's
  gained spark (`figmentsMerged`).
- **Gain control** moves the card to the receiver's leftmost open back slot,
  exhausted through Ending (`controlChanged`). It fails if the rank is full.
- **Banish-until** (`banishUntil`) records its return as a floating
  `banishedUntil` record with the duration's expiry; as it ends,
  `floatingEnded` materializes the card under its prior controller (F3,
  RD-hv-7x4l.8-2). A temporary figment copy's `temporary` record makes it
  cease to exist the same way.
- **Offering, Reclaim, Ephemeral.** A `play` from `"void"` uses Reclaim's
  costs and marks the card reclaimed; a hand play of an Offering card first
  chooses its route (RD-hv-7x4l.8-3). Ending step 2 banishes Offering cards
  anywhere and Ephemeral cards in hands. The statuses travel with the
  instance; Ephemeral ends as the card leaves a hand.
- **Copies** (`rules/copies.ts`): stack copies (D15), figment copies (C5),
  and created copies in a hand, each announced by `cardCreated`.

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
// src/content/cards/windcutter-7be2e6d7.ts (catalog fields abbreviated)
export default card({
  name: "Windcutter",
  id: "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  renderedText: "▸Challenge: Banish an enemy until end of turn.",
  amplifiedText: "▸Challenge: Banish an enemy until your next turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  spark: 1,
  // …rarity, art, and the other catalog fields…
  abilities: (v) => [
    triggered(onChallenge(), p.banish(target(enemyCharacter()), v.amplified ? untilYourNextTurn() : untilEndOfTurn())),
  ],
  verifiedText: "…",   // expectedVerifiedText(renderedText, amplifiedText) when these abilities were verified
});
```

An entity is exactly one of `pending: true`, `vanilla: true`, or authored
`abilities` with `verifiedText` (`src/content/define.ts`). The engine reads
catalog entries through `content-catalog.ts`; a pending card plays text-less.

**Amplified text is stored expanded.** The RON catalogs author
`amplified_text` as a compact fuzzy replacement ("until your next turn."),
which the Rust compiler expands into the full rules text. The content modules
store the **expanded** text from the generated runtime JSON (Phase 2.3
parity), so no module depends on the replacement algorithm.

**File layout.** Use one file per entity, named `<slug>-<uuid8>.ts`. Names
aren't unique; the UUID prefix disambiguates. Each directory has an explicit
`index.ts`, and a test asserts that the index lists every file. Node tools
can't use `import.meta.glob`.

**More examples** (abilities only):

```ts
// Kindlehorn 9b9c2743-75b3-499d-b5fb-c3429c92d420: "▸Dawn: Gain 1●." / "4●, ☾: This character gains +1✦." / amplified "2●."
(v) => [triggered(onDawn(), gainEnergy(1)), activated([energy(v.amplified ? 2 : 4), exhaustSelf()], gainSpark(self(), 1))]

// Dream Sever 6e019832-2e0c-4166-81c3-54f7995425df (Interrupt): "Prevent a played event unless the opponent pays 2●."
() => [event(prevent(stackItem({ cardType: "event", controller: "opponent" }), { unlessPays: 2 }))]

// Echo Architect 21965e95-0c8c-470c-a1e1-06d7b87a8d00: "Events cost you 1● more." / "When you play an event, copy it."
() => [staticAbility(costModifier("you", { cardType: "event" }, 1)), triggered(whenYouPlay({ cardType: "event" }), copyStackItem(triggeringItem()))]

// Spirit Bond 3cda9dd7-cb81-43c1-9db5-1444d7363e13: "Until end of turn, characters you control have +X✦ where X is the number of characters you control."
() => [event(forDuration("untilEndOfTurn", sparkModifier(all(characterYouControl()), lockedAtResolution(count(characterYouControl())))))]
```

**Primitive registry.** Each primitive lives in its own module under
`src/engine/effects/primitives/`, exporting its node type, its
`PrimitiveDefinition` (op, optional children, modes, play-time targets, an
optional `deferred` hook naming effects that run later and so are excluded
from play-time target collection, and `resolve`), and its builder, exported as
`<op>Primitive`. The registry finds each definition by that name at call
time. `primitives/index.ts` lists one `export *` line
per primitive and is the authoritative catalog; `effects/registry.ts` derives
the `Effect` union and the op lookup from it, so adding a primitive touches
only its module, its group's test file, and one index line. Flow primitives
resolve children through the `run` callback in their environment. Play-time
choices are collected by walking the effect tree: a modal node (`chooseOne`)
prompts for its mode, a mode whose required targets have no candidates is not
legal, and the walk descends only into the chosen mode, so only its targets
are chosen. The stack item stores the chosen modes and targets, and the node
resolves its stored mode. One target spec object used in several places is
one target. Validation walks `children`, which list every mode.

**Primitive catalog.** Phase 3 starts with a subset of these. Phase 5 extends
them, with tests for each.

| Group | Primitives |
| --- | --- |
| Resources | `gainEnergy`, `gainMaxEnergy`, `doubleEnergy`, `gainPoints`, `playerGainsPoints`, `store`, `spendCounters` |
| Cards | `draw` (modifiers: ephemeral, cost 0), `discard` (chosen or random), `foresee`, `discover`, `erode`, `lookAtTop(n, distribute)`, `reveal`, `shuffleInto`, `putOnTop`/`Bottom`, `createInHand(copyOf, modifiers)` |
| Characters | `dissolve`, `banish(duration?)`, `abandon(chooser, predicate)`, `materialize(from, selection)`, `materializeFigment(type, spark, n)`, `materializeFigmentCopy` (C5), `rematerialize`, `returnToHand`, `gainSpark(duration?)`, `setBaseSpark`, `sparkModifier`, `awaken`, `exhaust`, `move(slotRule)`, `gainControl`, `grant(keyword, duration)`, `loseKeyword`, `giveAllTypes`, `triggerAbility`, `disableTriggers(while)` |
| Costs | `costModifier(player, filter, amount, { next, duration })` |
| Stack | `prevent(unless?)`, `copyStackItem(times, overrides)`, `putPreventedInto(zone)` |
| Flow | `sequence`, `choose`, `chooseOne(modes)`, `ifThen(Else)`, `forEach`, `repeat`, `optional`, `eachPlayer`, `forDuration`, `delayed(next…)`, `floating(when…)`, `takeExtraTurn` (C8) |
| Selectors | characters (by controller, subtype, ✦/● bounds, figment or not, exhausted, rank, "another"); cards in a zone; stack items; players |
| Values | constant, X, `count(selector)`, `supporting` (C9), `times`, stored counters, turn counters, `lockedAtResolution` |
| Durations | `untilEndOfTurn`, `untilYourNextTurn`, `untilNextDay`, `whileSourceInPlay`, `untilOpponentPays(cost)` (C7), `permanent` |
| Triggers | `onMaterialized`, `onDawn`, `onDusk`, `onNight`, `onChallenge`, `onDissolved`, `whenYouPlay(pred, nth?)`, `whenMaterialize`, `whenDraw`, `whenDiscard`, `whenAbandon`, `whenLeavesPlay`, `whenScores`, `whenOpponentScores`, `whenLeavesVoid`, `whenYouChallengeWith(n, pred)` (C10), `atStartOfTurn`, `atStartOfFirstTurn` |

Dreamsigns and avatars use the same DSL as emblem abilities (P4). Dreamwell
cards use event-like abilities. Figments are catalog entries.

## Transfigurations

Each transfiguration is a pure transform of an entity's abilities, with an
eligibility predicate:

There are nine ([F6](decisions.md#established-facts)):

| Transfiguration | Eligibility | Transform |
| --- | --- | --- |
| Empowered | printed cost > 0 | cost → `floor(cost / 2)` (4→2, 3→1, 2→1, 1→0; [F5](decisions.md#established-facts)) |
| Amplified | `amplifiedText` present | `v.amplified = true` |
| Kindled | character | base spark ×2; 0 → 1 |
| Resonant | has `▸Materialized`, `▸Dawn`, or once-per-turn | Materialized also on Dissolved; Dawn also on Materialized; drop `oncePerTurn` |
| Inspired | event | append `draw(1)` |
| Enduring | event | add `keyword(reclaim())` |
| Hastened | event that is not Fast | speed → Fast |
| Attuned | has an activated ability with an energy cost | that cost −1 (min 0) |
| Perfected | eligible for ≥2 of the above | apply all eligible transforms |

**Displayed text is not derived from abilities.** The tinted, modified rules
text the journey shows keeps coming from the existing text transforms in
`src/transfiguration/transfiguration-logic.ts`, with the current presentation.
The ability transforms here and those text transforms describe the same
change; a contract test per transfiguration keeps the eligibility predicates
of the two in agreement.

## Deck-entry modifications

This follows [D39](decisions.md#d39-deck-entry-modifications-and-next-battle-effects).

```ts
interface Variant {
  amplified: boolean;
  transfigurations: TransfigurationType[];
  deckMods: {
    sparkBonus: number;                // additive, after transfigurations
    costReduction: number;             // energy cost, min 0
    fast: boolean;
    reclaim: number | null;            // granted or overridden Reclaim cost
    typeChange: { cardType: CardType; subtype: CardSubtype } | null;
  };
}
```

- **Order** matches `resolveDeckEntryCard` in `src/card-type-change.ts`:
  transfiguration transforms, then type and keyword changes, then the spark
  bonus.
- **Abilities are kept.** A type change alters the characteristics that
  selectors and timing read, never the ability list.
- **Granted Reclaim** is the same keyword that Enduring adds, with the
  modification's cost.
- **Next-battle effects** are `BattleInit` fields: extra opening-hand cards
  (with an optional predicate), starting energy, and the smaller-hand cost
  discount. Battle setup consumes them once.
- **Displayed text** keeps coming from the existing deck-entry text
  transforms, like transfigured text.

## Content gates

**The coverage gate** is a CI test of the data↔engine contract:

- Every catalog entry has `abilities`, `vanilla: true`, or (only during
  Phases 3–5) `pending: true`.
- The pending set is empty at the Phase 5 gate.
- Every entry with abilities has `verifiedText === hash(text, amplifiedText)`.
  A text edit fails CI until the abilities are re-verified against the new
  text and the hash is updated.

The printed text is canonical and the abilities implement it (D5). There is
no ability-to-English renderer. Correctness of an encoding is shown by
primitive tests, scenario specs, the fuzzer, and the card-lab sweep and judged
QA.

**Pending entities** are text-less in battle until authored
([D36](decisions.md#d36-pending-entities-play-text-less)). The interpreter
emits `pendingAbility` for each pending play or draw.

## Loops

This follows [D12](decisions.md#d12-infinite-combos-are-intentional). Limits
live in the battle data module (`loopIterationCap`, `loopHistoryActions`,
`mandatoryLoopCheckFrom`, `mandatoryLoopWindow`, `resolutionCap`) and reach
the engine through
`BattleConfig`. The code is in `src/engine/loops/`; the runner calls it after
every committed step, and `BattleState.loops` holds everything it remembers,
so a reload between any two steps loses nothing.

**Checkpoints.** A checkpoint is a `main` decision with an empty stack and an
empty trigger queue. At each one the engine computes a loop signature: a hash
of the state with monotone resources abstracted away:

- scores;
- current and maximum energy;
- counters;
- gained spark;
- deck and void contents;
- turn counters;
- bookkeeping: the version, minted-id and timestamp counters, random-stream
  positions, and absolute zone-entry timestamps (their order stays).

**History.** The tracker keeps one history per scope: one acting side's main
window in one turn. It holds each checkpoint (signature, resources, and the
number of actions before it) and each top-level action with every step it ran
up to the next decision, each step with its recorded answers and their
fingerprints. The runner identifies the action from its step
(`actionForStep`, the inverse of `stepForAction`). The history restarts when
the scope changes, when the opponent takes an action, or when a step contains
an answer the opponent chose that was not forced. It keeps at most
`loopHistoryActions` actions, dropping the oldest checkpoints first.

**Candidates.** Suppose checkpoint *k*'s signature equals an earlier
checkpoint *j*'s in the same history, and the resource delta from *j* to *k*
gains for the actor: none of the actor's resources fell, none of the
opponent's rose, and one changed (resources and their orientation:
RD-hv-7x4l.9-1). The latest such *j* wins. The engine then records a
`LoopCandidate` holding the actions from *j* to *k*, and `legalActions` offers
`{ kind: "repeatLoop", loop, count: "untilVictory" }`; any whole `count` from 1
to the iteration cap is allowed too. Every other step withdraws the offer.
The view shows the loop on offer and the repetition in progress, never the
recorded answers.

**Execution.** The `repeatLoop` step starts a `LoopRun`. While it runs, nobody
has a decision and `nextAutomaticStep` returns `loopIteration`. Each
iteration runs the recorded steps again with `runStep`, each from the
previous one's committed result, in replay mode: every prompt must be answered
from the recording (`UnrecordedPrompt` otherwise) and loop detection is
skipped. The step then adopts the final state and the nested steps' events
(`StepContext.adopt`). It stops early, keeping the last step boundary
reached, in any of these cases (`loopEnded.reason`):

- `illegalAction`: an action is illegal;
- `changedChoice`: a replayed prompt's fingerprint differs, or a prompt is
  added or dropped. That step is discarded: a top-level action is left to its
  player, and an automatic step runs on through the ordinary driver, so its
  player answers the changed prompt;
- `battleEnded`: the battle ends;
- `opponentDecision`: the opponent gains a decision with a legal non-pass
  response;
- `diverged`: a different automatic step comes next, or the iteration ends
  away from the loop's checkpoint.

The repetition also ends after its count (`completed`) or at the iteration
cap (`iterationCap`, default 10,000), and the loop stays on offer then. The
`loopStarted` and `loopEnded` events log each repetition.

**Mandatory cycles.** While automatic steps run with no decision offered, the
engine checks for an exact repeat with Brent's cycle detection: from the
`mandatoryLoopCheckFrom`th consecutive automatic step on (default 64), it
hashes the full state after each step, ignoring bookkeeping, and compares the
hash with one saved mark (`LoopTracker.cycle`). The first checked state is
the first mark. The mark moves to the current state 1, 2, 4, … steps after the
previous move, the gap doubling up to `mandatoryLoopWindow` (default 4,096)
and staying there. A cycle of at most that many steps is therefore found
within about twice the window of the run entering it, however late in the
run; a longer one ends at the resolution cap. Memory is constant, and short
runs cost nothing (RD-hv-7x4l.9-2, RD-hv-7x4l.20-2).

- An exact repeat ends the battle in a draw (`mandatoryLoop`).
- A non-repeating run beyond the resolution cap (default 100,000 steps) also
  ends it in a draw (`resolutionCap`).
- A step in which a player gave an answer that was not forced resets the
  count of consecutive automatic steps and the mark, so a sequence a player
  keeps choosing to continue never ends in either draw; forced answers leave
  the run going (RD-hv-7x4l.20-1).
- A loop iteration replays its player's decisions: it resets the count of
  consecutive automatic steps, so repeating an optional loop never ends in
  either draw.

`docs/rules.md` § Infinite Loops states both rules.

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

- **`view(state, side)`** hides the opponent's hand contents and every deck
  order: each is a count plus the cards known to this side at their
  positions (`HiddenZoneView.known`). Every other part of the view omits or
  nulls what names a card the side cannot identify.
- **Knowledge** is `state.knownTo[side]`: the cards in decks and hands that
  `side` can identify beyond what their zone shows it (public zones, and its
  own hand). `view/knowledge.ts` updates it:
  - a card keeps every side that could see it as it moves, so a public move
    into a hand or deck, or a move from a hand into a deck, stays known to
    whoever watched it;
  - a revealed card becomes known to both sides;
  - a `privateTo` prompt shows its cards to its chooser only as it opens,
    and the other side loses track of those still in a deck, whose order the
    chooser may change. A "look at the top 4" prompt reveals those cards only
    to its chooser.
- **`promptView(prompt, side, display)`** is a pending prompt as `side` sees
  it: whole for the side answering, and otherwise with only the cards and
  purpose source `side` can identify.
- **The UI renders only views.** Debug reveal switches that side's view to
  omniscient.
- **Determinization** (D22) is `engine.determinize(view, decklists, random)
  → BattleState`. The decklists include each entry's variant (D39). It
  deals the cards the view hides from what each decklist has left after the
  cards the view shows, keeps every known card at its known position, and
  reads nothing but the view, so states that look alike to the viewer give
  the same sample for the same draws. It draws a fresh seed (so later
  shuffles and Dreamwell cycles are sampled too) and starts empty what a view
  does not carry: queued triggers and floating effects from sources the
  viewer cannot see, the opponent's knowledge, loop history, and the
  automatic-step count. Only the AI uses it.

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
- **Prompt properties:** the core of Phase 3.3.
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
- **Scenario specs:** one file per content batch,
  `src/content/specs/<batch-slug>.spec.ts`, written per D20, with scripted
  answers. Like every engine and content test, they run in the `node`
  environment ([D19](decisions.md#d19-test-pruning)):

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
  random transfigurations, random deck-entry modifications, Random and Greedy
  policies. Every Nth game runs in
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
