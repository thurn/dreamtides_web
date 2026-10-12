# Engine Design

This page specifies the rules engine that Phases 3–7 build. It defines the
contracts and their non-obvious decisions, and describes the code in
`src/engine/` as it stands; parts a later phase builds are marked with that
phase. The agent fills in details through the
[rules ladder](decisions.md#d10-rules-ambiguity-ladder) and keeps this page
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
  or module-level mutable state in `src/engine/`; the
  `dreamtides/engine-purity` lint rule (`eslint-rules/engine-purity.js`)
  enforces the clock, randomness, and module-state bans. The same start state
  plus the same answers always produces the same state, events, and prompts.
- **Headless.** It runs in Vite, Vitest, Node (`tsx`, `worker_threads`), and a
  Web Worker (the policy host, `src/battle/engine-ai/policy.worker.ts`).
- **Cheap to clone.** State is plain JSON-serializable data. AI search clones
  it thousands of times per decision.
- **Complete.** Every rule is enforced, and legality is computed rather than
  trusted. The UI and AI only choose among legal options.
- **Fair views.** A per-side view redacts hidden information. It is the only
  thing the UI and the AI read.
- **Explainable.** Every state change emits a semantic event used for
  presentation, logging, and debugging.

## Module layout

This is the current layout; update this page when a clearer structure
emerges.

Step kinds, engine event kinds, and DSL primitives are each **registered from
their own module** through typed registries (`steps/kinds/index.ts`,
`events/index.ts`, `effects/primitives/index.ts`). Engine tasks and content
beads then add files instead of editing central switches.

```text
src/engine/
  engine.ts          the Engine facade: createEngine(catalog)
  index.ts           the public API other modules import
  catalog.ts         EngineCatalog, engine card/emblem/figment definitions, printedCard
  content-catalog.ts engine definitions built from the src/content modules
  log.ts             the engine logging schema (EngineLogRecord); hosts write the lines
  state/       BattleState and its types, ids, initial state, clone, hashing and serialization, RNG streams
  steps/       step kinds (kinds/), the step runner, the step context, drivers, answer sources, Suspend and other errors
  prompts/     Prompt/Answer types, fingerprints, structure checks, legal and forced answers
  events/      engine event kinds (kinds/), one module each, with their privacy
  rules/       turn/phase machine, decisions and legal actions, legality, timing, stack, challenge,
               zones, costs, copies, figments, durations, floating effects, payable effects, victory
  effects/     the DSL interpreter, the primitive registry, and the primitives (primitives/)
  continuous/  layer evaluation of characteristics (spark, cost, keywords, types), cost modifiers, Support
  triggers/    the event matcher, queued and floating trigger bodies, trigger resolution
  dsl/         ability and selector types, builders, trigger builders, verified-text hash
  loops/       loop signatures, the loop tracker, loop replay, mandatory-cycle detection
  view/        per-side views, knowledge tracking, determinization
  fold/        the battle slice adapter (BattleSlice, intents, in-flight replay)
  policy/      the Policy interface, Random and Greedy, AI decision requests, the
               worker's catalog manifest and protocol, the policy hosts
  testing/     synthetic cards, board builder, scenario specs, card-lab setup solver,
               fuzz harness, invariants, redaction checks
src/content/   typed catalogs (D32) with co-located abilities (D5)
  cards/ dreamsigns/ avatars/ dreamwell/ figments/
  specs/       per-bead scenario modules, their registry, and the one runner test
  battle.ts, dreamwell-rules.ts, opponents.ts, ai.ts, atlas.ts, apollyon.ts, …   data modules
```

**The engine API** (`engine.ts`) is `createEngine(catalog)`, an `Engine`
with `createBattle(init, source)`, `decision(state)`,
`legalActions(state, side)`, `apply(state, side, action, source)`,
`view(state, side)`, `determinize(view, decklists, random)`, and the
per-engine legality `memo`. `createBattle` and `apply` run to the next
top-level decision or the battle's end (`runToDecision`) with the answer
source they are given, which must never suspend ([Drivers](#drivers)), and
return the state, every event, and every answer.

The battle slice adapter (`fold/slice.ts`, `createFoldAdapter`) turns
intents into engine calls and keeps the in-flight step record
([below](#fold-integration)). The journey fold holds each journey battle's
slice (`src/rules/battle/engine-battle.ts`).

## State model

`state/types.ts` holds the authoritative definitions; this is their shape:

```ts
interface BattleState {
  version: number;                     // increments per committed step
  readonly seed: BattleSeed;           // from the game seed + battle index
  rng: Record<string, number>;         // draws consumed per named stream: shuffle:<side>, dreamwell, random:<purpose>
  nextInstance: number;                // next instance number to mint (i1, i2, …)
  clock: number;                       // zone-entry clock for enteredZoneAt
  readonly config: BattleConfig;       // every engine tunable (below)
  turn: TurnState;                     // round, turnNumber, active, phase, sideTurns, extra, lastNormal,
                                       // extraTurns (last element first, C8), challengeLane, beginning,
                                       // endingCleanup (present only while Ending's cleanup waits)
  sides: Record<Side, SideState>;
  instances: Record<InstanceId, CardInstance>;
  knownTo: Record<Side, InstanceId[]>; // hidden cards each side can identify (view/knowledge.ts)
  stack: StackItem[];                  // last element is the top; card items and activated abilities
  priority: Side | null;               // held exactly while the stack is non-empty
  payable: PayableEffect[];            // "until the opponent pays N●" effects, ended by payToEnd (C7)
  triggerQueue: QueuedTrigger[];       // first in, first out (D14)
  floating: FloatingEffect[];          // changes with a duration: continuous changes (spark, base spark,
                                       // keywords, types, costs), floating and delayed ("the next time…",
                                       // `once: true`) triggers, disabled triggers, banish-until returns,
                                       // temporary figment copies
  turnLog: TurnLog;                    // cards each side played (with their characteristics) and drew, and
                                       // characters it materialized (with their types), this turn
  nextEffect: number;                  // next effect number to mint (e1, e2, …)
  oncePerTurn: OncePerTurnKey[];       // `<source key>#<ability index>`, cleared as each turn begins
  dreamwell: DreamwellState;           // the prebuilt shared deck, the next index, and its catalog
  challenge: { challengers: InstanceId[]; blockers: Record<InstanceId, InstanceId> } | null;
  automaticSteps: number;              // automatic steps since the last top-level decision
  automaticChoices: number;            // automatic steps with a chosen answer since the last top-level action
  loops: LoopTracker;
  result: { kind: "victory"; winner: Side; reason: WinReason } | { kind: "draw"; reason: EndReason } | null;
                                       // WinReason: "score" | "winCondition"
}

interface SideState {
  score: number; currentEnergy: number; maxEnergy: number; fatigueCount: number;
  deck: InstanceId[];                  // top is index 0
  hand: InstanceId[];                  // cards this side holds, including any the opponent owns
  void: InstanceId[]; banished: InstanceId[];
  backRank: (InstanceId | null)[];     // length 10, B0..B9
  frontRank: (InstanceId | null)[];    // length 9,  F0..F8
  avatar: AvatarEmblem | null;         // { id, exhausted }: not a character (P4)
  dreamsigns: DreamsignEmblem[];       // { id }
}

interface CardInstance {
  readonly id: InstanceId;             // stable across zone changes
  readonly printing: { kind: "card"; cardId: CardId }                         // deck card, created card, or copy
          | { kind: "figment"; figment: FigmentId; spark: number }            // "a 2✦ Ethereal figment"
          | { kind: "figmentCopy"; cardId: CardId; spark: number | null };    // C5; 0 for "0✦ figment copy"
  readonly owner: Side;
  controller: Side;                    // in a hand, the side holding it; in a deck, void, or Banished, its owner
  zone: Zone;                          // "deck" | "hand" | "stack" | "play" | "void" | "banished"
  readonly variant: Variant;           // { amplified }; Phases 4.1 and 5 add the rest (D39, below)
  status: { exhausted: boolean; gainedSpark: number; counters: number; created: boolean;
            reclaimed: boolean; playedViaReclaim: boolean; offering: boolean; ephemeral: boolean;
            x: number | null;          // X paid to play it, kept while in play (variable spark)
            gainedAbilities?: { cardId: CardId; variant: Variant }[] };  // mirrors its `abilities` changes
  enteredZoneAt: number;               // timestamp for layer ordering
}
```

`printing` is where layer 1 reads an instance's copiable values
(`printedCard` in `catalog.ts`): the catalog card for its variant, a figment
type from the figment catalog as a 0● character with the spark its text gave
it (C13), or the card a figment copy copied. Every figment is `created`. Veil
is a keyword; losing it is a permanent floating keyword change.

Emblems (an avatar or a dreamsign) are not instances: an `EmblemRef` names
one by side (and dreamsign index), and an `AbilitySource` is an `InstanceId`
or an `EmblemRef`.

**Engine code reads every tunable from `BattleState.config`**, never from a
content module. `BattleConfig` holds the battle rules limits (score to win,
turn limit, hand limit, opening hand sizes, starting side, first-draw skip),
the loop limits ([Loops](#loops)), `autoAnswerForcedPrompts`, the
feasibility budget, the most cards a Discover offers (`discoverOptions`), and
the Dreamwell construction rules (`config.dreamwell`). `initialState`
(`state/create.ts`) fills the config once from `src/content/battle.ts`,
`src/content/dreamwell-rules.ts`, and the `BattleInit`'s score target,
starting side, and next-battle opening-hand changes (D39), so a serialized
state determines its own replay.

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

  `decision(state)` derives it from the state as `{ kind: "main" |
  "respond"; side }`. It is `null` while triggers wait, while a loop
  repetition runs, when the priority holder has no legal response
  (auto-pass, P1), outside Day, Dusk, and Night, and once the battle is
  over. The answer is a top-level `Action`.

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
  - an additional-cost choice;
  - the route of a hand play of an Offering card.

**Step**
: The unit of execution and commitment. A step runs rules code synchronously
  from a committed state to the next committed state. It may raise any number
  of prompts, for either side.

### Top-level actions

`rules/actions.ts`:

```ts
type Action =
  | { kind: "play"; card: InstanceId; from: "hand" | "void"; slot?: Slot }  // void: by a play permission or Reclaim
  | { kind: "activate"; source: AbilitySource; ability: number }           // InstanceId | EmblemRef
  | { kind: "reposition"; card: InstanceId; to: Slot }      // a swap, or a figment merge
  | { kind: "pass" }                                        // pass priority, or end Day/Dusk/Night
  | { kind: "payToEnd"; effect: EffectId }                 // "until the opponent pays N●" (C7)
  | { kind: "repeatLoop"; loop: LoopId; count: number | "untilVictory" };
```

**Actions carry no choices.** Every choice an action needs is a prompt inside
its step: targets, modes, X, costs, the Offering route. The one exception is
presentation: a UI drop may name the open back-rank `slot` a played character
enters. Legal actions never carry a slot, and `allowedBy(legal, action,
state)` accepts that play on any open back-rank position of the player, and
any whole `repeatLoop` count from 1 to the iteration cap.

Phase 4.6 adds engine debug actions behind `?debug=1` in development builds
([D4](decisions.md#d4-debug-tooling)).

### Step kinds

Steps are kept small, so that a suspended step never has many prompts to
replay. Each kind is a module in `steps/kinds/` with a `StepDefinition`: its
`run` and its `canceller`, the side that may cancel it before its commit
point (`null` for every kind but `play` and `activate`).

| Step | Runs |
| --- | --- |
| `beginBattle` | Shuffle both decks, build the Dreamwell, deal opening hands, start turn 1 |
| `play` / `activate` | Play-time prompts (the Offering route, X, modes, targets, cost alternatives, optional costs, cost cards) → `ctx.commitPoint()` → pay costs → push to stack ("when you play" triggers queue) → priority to the opponent |
| `resolveTop` | Resolve the top stack item, then priority to its controller if the stack is still non-empty |
| `resolveTrigger` | Resolve exactly the first queued trigger; one step per trigger |
| `advancePhase` | One phase transition and its rules actions (Dreamwell draw, Draw, designations, Ending cleanup), or the next turn after Ending |
| `challengeLane` | Resolve one lane; `▸Dissolved` triggers are queued |
| `reposition` | One reposition, swap, or figment merge |
| `payToEnd` | Pay to end a payable effect (C7); no stack, no response, priority and phase unchanged |
| `repeatLoop` | Accept the loop on offer: start a repetition, nothing else |
| `loopIteration` | One iteration of an accepted loop shortcut (automatic while a repetition runs) |

`stepForAction` maps a top-level action to its step (a `pass` is
`resolveTop` over a non-empty stack, else `advancePhase`); `actionForStep`
is its inverse.

**The driver composes steps.** After a top-level action's step commits, the
driver keeps running **automatic steps** until it reaches a top-level decision
or a battle result. `nextAutomaticStep` (`steps/driver.ts`) chooses them, in
this order: the iterations of an accepted loop; draining the trigger queue,
one step per trigger; auto-pass (P1), resolving the top of the stack when
its priority holder has no legal response; phases that advance on their own
(Dreamwell, Draw, Dawn, Ending); and challenge lanes.

### The rules-code contract

```ts
interface StepContext {                // steps/types.ts
  readonly state: BattleState;         // the step's private work copy, mutated in place
  readonly catalog: EngineCatalog;
  choose<P extends Prompt>(prompt: PromptSpec<P>): AnswerFor<P>;   // synchronous; fills in `cancellable`
  commitPoint(): void;                 // point of no return: prompts after it are not cancellable
  emit(event: EngineEvent): void;      // records the event and matches triggers against it
  random(stream: string): number;      // a draw from a named stream
  adopt(state: BattleState, events: readonly EngineEvent[]): void;  // a loop iteration's nested steps
}

// Interpreter excerpt (effects/interpreter.ts): plain synchronous code
function chooseTargets(ctx, specs, controller, source, purpose): InstanceId[][] {
  return specs.map((spec) => [...ctx.choose<ChooseTargetsPrompt>({
    kind: "chooseTargets", side: controller, purpose,
    candidates: targetCandidates(ctx.state, ctx.catalog, spec, controller, source),
    ...targetBounds(spec),
  })]);
}

// A primitive (effects/primitives/banish.ts) reads the targets chosen at play time
resolve(ctx, node, env) {
  for (const id of resolveCharacters(ctx, node.subject, env)) banishCharacter(ctx, id);
}
```

Card play preparation passes its chosen energy X directly through modal and
target evaluation and character-cost selectors before the source reaches the
stack. The binding is local to that play: recorded answers reconstruct it on
replay, and cancellation discards the work without writing X to the source
instance. Activated and manual-cost selectors read the source card's stack
or in-play X.

The atomic primitives of rules code are plain functions over the context in
`rules/` (`zones.ts`: `moveInstance`, `dissolve`, `banish`, `materialize`, …;
`resources.ts`: `drawCard`, `discardCard`, `setEnergy`, …). They never call
`choose`. A card or ability on the stack makes its choices at play time and
stores them on the stack item; a triggered ability, which does not use the
stack, makes them as it resolves (`chooseOnResolution`).

These rules make it work:

1. **Call `choose` only between complete mutations.** Primitives are atomic
   and never prompt. Rules code built from primitives and the interpreter
   prompts only at choice points. The queueing in D14 is what makes this hold
   even when triggers fire mid-effect.
2. **Keep everything a step reads inside `BattleState` and its answers.** That
   includes RNG streams. Iteration order must be deterministic: arrays and
   sorted keys.
3. **Make the prompt's legal answer set complete and enumerable.** Bounds and
   candidates are computed by the engine, and `legalAnswers` enumerates every
   legal answer. Answers are validated against the prompt the engine itself
   raised, never against a client's copy. A play-time prompt offers no
   dead-end answer: before the commit point the engine narrows it to the
   answers with a feasible continuation
   ([Legality by search](#legality-by-search)).
4. **Handle empty prompts explicitly.** A prompt with zero legal answers
   can't be raised: `choose` throws `EmptyPrompt` (and `MalformedPrompt` for
   a structurally invalid prompt). Rules code avoids raising one (rules §
   Targeting):
   - At play time, the empty prompt is a dead end of that path of answers.
     The [legality search](#legality-by-search) tries the others, and the
     action is illegal when every path dead-ends.
   - At resolution time, that effect part does nothing and emits
     `noLegalTarget`, without a prompt.
5. **Cancelling** is possible only for the acting player's own `play` and
   `activate` steps, before `commitPoint()`. Cancelling discards the in-flight
   step, and the state is exactly the committed state.

### Drivers

One step runner (`steps/runner.ts`); several answer sources:

```ts
interface AnswerSource { answer(prompt: Prompt, work: BattleState): Answer }   // may throw Suspend

function runStep(start, step, source, catalog, options?: { prefix?, dryRun?, automatic?, replay?, searches? }): StepResult {
  const work = cloneState(start);
  const ctx = new Context(work, catalog, source, { prefix, dryRun, replay, canceller });
  try {
    stepDefinition(step.kind).run(ctx, step);
  } catch (e) {
    if (e instanceof Suspend) return { kind: "suspended", prompt: e.prompt, display: work, events, answers };
    throw e;                     // engine bug: caller aborts the step; committed state is untouched
  }
  // victory check, the automatic-step count and mandatory-cycle checks, loop detection, version + 1
  return { kind: "done", state: work, events, answers };
}
```

**The context answers each prompt in this order,** after a play or
activation's guard narrows a prompt raised before its commit point to the
answers with a feasible continuation ([Legality by search](#legality-by-search)):

1. **Recorded answers.** `options.prefix` holds the answers recorded by
   earlier runs of this step, replayed in order. For each one, the context
   checks that the replayed prompt's **fingerprint** matches the recorded
   one, and throws `ReplayDivergence` if not; a recorded answer the prompt
   does not allow throws `IllegalAnswer`. In a loop replay
   (`options.replay`), a prompt beyond the recording throws
   `UnrecordedPrompt`.
2. **Forced answers.** When `config.autoAnswerForcedPrompts` is on (P9) and
   the prompt has exactly one legal answer (`forcedAnswer`), the context
   answers it and records it with `auto: true`.
3. **The source.** Every other prompt goes to the answer source, and an
   answer the prompt does not allow throws `IllegalAnswer`.

Every answer is recorded with its prompt's fingerprint (`RecordedAnswer`).
The sources (`steps/sources.ts`):

- **`INTERACTIVE`** is used by the fold. It throws `Suspend(prompt)`, so the
  step suspends at the first prompt without a recorded answer.
- **`InlineSource`** is used by AI search, fuzzing, and tournaments. It calls
  the answering side's policy function synchronously, so execution never
  suspends and replay costs nothing.
- **`ScriptedSource`** is used by tests and scenario specs. It answers from a
  list and fails on a prompt with no scripted answer; `assertExhausted()`
  fails on answers left over.
- **`NO_PROMPTS`** fails on any prompt, for runs that must never prompt.

**The fingerprint** (`prompts/fingerprint.ts`) is a hash of the prompt's
identifying fields: kind, side, purpose (which names the source), `privateTo`,
sorted candidates or cards, bounds, mode options, arrangement destinations
with their counts, and an "unless" cost with whether it is payable. It is the
safety net for the whole approach: nondeterministic rules code fails loudly on
the first replay instead of silently corrupting a game.

### Fold integration

The battle slice (`fold/slice.ts`) holds only plain data:

```ts
interface BattleSlice {
  committed: BattleState;                  // last step boundary
  inFlight: null | {
    step: Step;                            // e.g. { kind: "play", card: "i17", from: "hand" }
    automatic: boolean;                    // an automatic step rather than a top-level action
    answers: RecordedAnswer[];             // { fingerprint, value, auto? }
  };
  publishedEvents: number;                 // events of the in-flight step already handed to presentation
  attempt: number;                         // in-flight attempt counter, part of prompt ids
}
```

`createFoldAdapter(engine, { checkEventPrefix?, log? })` returns
`start(init)`, `reduce(slice, intent)`, and `pending(slice)`. `start` builds
the battle and runs its `beginBattle` step. `pending` replays the in-flight
step to the prompt it is suspended on, with its `display` state; it never
throws, and is `null` when nothing is in flight or the record fails to
replay to a prompt.

The intents each name their `side`:

- **`battleAction(action)`**
  - Allowed only when `inFlight === null`, the side owns the pending
    decision, and `allowedBy` accepts the action against
    `legalActions(committed, side)`.
  - Opens `inFlight` for its step.
- **`answer(promptId, value)`**
  - Allowed only when `promptId` equals the currently suspended prompt's ID,
    the side answers that prompt, and `isLegalAnswer(prompt, value)` passes.
  - Appends the answer.
- **`cancel(promptId)`**
  - Allowed only for the answering side of a cancellable prompt.
  - Clears `inFlight` and advances `attempt`, keeping the step's published
    knowledge (below).

An intent that is not allowed bounces with a reason (`battleOver`,
`stepInFlight`, `notYourDecision`, `illegalAction`, `noPendingPrompt`,
`stalePrompt`, `notYourPrompt`, `illegalAnswer`, `notCancellable`) and
changes nothing.

After each applied intent, the reducer **advances**:

1. Run the in-flight step with `INTERACTIVE` and the recorded answers.
2. If it is **suspended:**
   - Record its answers, so forced answers persist, and expose the prompt
     with its id and `display`, the intermediate state.
   - Publish the step's events past `publishedEvents`.
3. If it is **done:**
   - Commit the state and clear `inFlight`.
   - Publish the remaining events.
   - Start the next automatic step, if any, and repeat.
4. If it **threw**, or the record fails to replay (a divergent or illegal
   recorded answer, answers left unused, a failed event-prefix check):
   - Return an `engine_error` record with the step, answers, and message, and
     log `engine.error`, for reproduction.
   - Clear `inFlight` and surface a recoverable error. `committed` keeps
     the gameplay state at the step boundary and the knowledge its published
     events and prompt gave each side (below).

**Published knowledge outlives a discarded step.** A published event or
prompt can show a card in a public zone, in its holder's hand, or in a public
reveal. Recovery retains that card's identity for the side that saw it when
the same physical instance, printing and copiable variant exist in both the
committed state and the last published prompt display, and the side still
tracks it in that display. A subsequent blind shuffle or loss of tracking
within the published prefix ends that knowledge. Created instances absent
from the committed state and instances absent from the display contribute
no recovered identity.

Deck knowledge exposes a card's exact index as well as its identity. A newly
learned card in the committed deck is retained only when its zone,
controller, last zone entry and deck index match the last published display.
Seeing a card drawn or discovered into a hand proves its identity there;
recovery keeps its committed deck position hidden. Existing committed
knowledge remains at the step boundary.

The fold reconstructs only the answer prefix of the last published prompt.
It consumes event snapshots immediately into per-side identity maps, bounded
by the battle's physical instances. The reconstructed suspended result must
match that prompt, answers, events and display state hash before its
intermediate exposures count. A failed or divergent reconstruction retains
only the zone visibility proved by the published final display and the
private disclosures below; recovery preserves the original error.

Presentation retains the actual published event prefix, and the fold logs
`engine.error` for the failed attempt. The events describe what was shown
during the attempt.
For example, a `subtypeChosen` announcement published as the step suspends
at a following Discover prompt remains in that prefix if resolving the
discovery later fails. The announcement reports the choice shown during the
attempt; the recovered gameplay state stays at the step boundary.
Committed zones, resources, counters and RNG remain at the step boundary.
No events emitted by the later failing run are published. Existing action,
prompt-answer and error records reconstruct that factual prefix and the
recovered state through log replay, including after reload.

**Private disclosures outlive a discarded step.** A step shows cards to one
side alone through `ctx.disclose` (a `privateTo` prompt as it opens, a look
at the opponent's hand), and its suspended run records them
(`StepResult.disclosed`). When the fold discards an in-flight step that has
published a prompt (an engine error after an answer, or a cancel), the human
has already seen what that prompt's run disclosed, so `committed` keeps it
(`keepDisclosures`, view/knowledge.ts):

- Only the run that suspended at the published prompt counts. A disclosure
  the failed run made after the answer, or one in a step that failed before
  publishing any prompt, was never shown and is dropped.
- Each disclosed card joins `knownTo` of the side it was shown to, and only
  when that side still knows it in the published `display` state and the
  card sits in `committed` exactly where it sits there (zone, controller,
  last zone entry, and deck position). A disclosure that a later shuffle in
  the same step ended, or of a card the step had moved, is dropped.
- The gameplay state stays at its step boundary, including zones, resources
  and RNG, and retains the other side's committed tracking of the shown deck
  cards. Knowledge lifetime rules then apply as
  usual, so a later shuffle clears it.
- It is a pure function of the slice and the intent, so a reload's replay
  of the log recovers the identical state, and its hash and serialization
  are those of any other state. A record that no longer replays to its
  prompt has no run to read disclosures from and keeps `committed` as is.

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
  fold publishes only new events. With `checkEventPrefix` (development), it
  compares each re-run with the same step's previous answer prefix; a
  mismatch, like any replay failure, becomes an `engine_error` that recovers
  the step-boundary gameplay state and any proven published knowledge.
- **Logging.** The adapter hands its `log` callback the engine log records
  ([Randomness and replay](#randomness-and-replay)) of everything it does:
  the battle's init, each published event's record, every prompt opened,
  answered, and cancelled, each completed action, and each error.
- **Either side can be prompted at any time.** A human card can prompt the AI
  ("each player discards"), and an AI card can prompt the human. The UI and
  the AI host both just watch `pending.side`.

### Legality by search

`legalActions(state, side)` (`rules/decision.ts`) lists `pass`, the legal
plays and activations, and, in a main window, the legal repositions,
`payToEnd` actions, and the loop on offer. `legalMoves` (`rules/legality.ts`)
finds the plays and activations: the quick timing and cost checks
(`canPlay`, `canActivate`) pick the candidates, then a **feasibility search**
(`steps/feasibility.ts`) of each candidate's step filters them.

**A play or activation is legal when some path of answers to its play-time
prompts reaches the commit point with payable costs.** The search runs the
step's own code in dry runs (`runStep`'s context with `dryRun`), so legality
never drifts from execution:

- Each run replays a prefix of answers, answers every later prompt with its
  first legal answer (`legalAnswers` order), and remembers each such prompt
  as a choice point.
- `commitPoint()` throws a `Feasible` sentinel, which proves the path.
- An `EmptyPrompt`, or a cost plan whose energy total the side cannot pay
  (`planCosts` throws `Infeasible`), is a dead end. The search backtracks to
  the deepest choice point with an untried answer and runs again.
- The search is depth first. A search that spends its budget proves
  nothing: the candidate is left out and listed in `LegalMoves.bounded`.

The common case costs one run, as the first path pays. Results are memoized
in the engine's `LegalityMemo` (`createLegalityMemo`), keyed by the state
object (committed states are never mutated, so an entry never goes stale):
the legal moves per side, and each candidate step's search
(`LegalityMemo.searches`), which the step's guard reads back when the step
runs. The fold shares the engine's memo; it is never persisted.

**A legal play can always be paid along whatever path its player answers.**
A step with a commit point (`hasCommitPoint`: `play`, `activate`) runs with a
guard that offers each precommit answer with either a searched continuation
or a universal final-cost proof:

- A final standalone discard or void-banish cost may prove every
  field-legal selection at once, when the official play or activation
  caller proceeds directly to `commitPoint()`. Its shared resource predicate
  checks energy, counters and exhaustion reservations. The cost cannot
  capture a card cost, and its selection changes neither resources nor any
  later cost. Earlier, nested,
  manually continued and captured-cost choices use searched continuations.
  A precommit prompt following such a final proof is a rules-code error; the
  fold reports the failed attempt and retains the committed state.
- For a searched continuation, the path the guard stands on, its **witness**,
  settles the prompt's answers up to the witness's own for free: the
  depth-first search moved past each earlier answer only once every path
  through it had dead-ended, and the witness's answer is proven.
- Each later answer, in `legalAnswers` order, gets a search of its own. The
  searches share the budget left: one run each in order, then one run each
  in turn until each is settled.
- The narrowed prompt states its legal set in its own fields where they can:
  fewer candidates, tighter bounds, a mode marked not legal. Otherwise it
  lists the legal answers in `allowed`. A prompt whose every answer is
  feasible is unchanged, fingerprint included.
- An answer withheld only because the budget ran out emits a
  `feasibilityBounded` event, private to the answering side and logged as
  `engine.feasibility`. It counts the examined answers left unproven
  (`unproven`) and says whether answers were left unexamined (`truncated`).
  Its purpose is as the answering side may see it (`purposeView`), so a play
  still hidden in hand is never named to the opponent.
- `isLegalAnswer`, `forcedAnswer`, `randomLegalAnswer`, and the fingerprint
  read the narrowed prompt, so a stale or dead-end answer bounces as
  `illegalAnswer`, a recorded one fails replay, and one feasible answer is
  answered automatically.

**One budget per step.** `BattleConfig.feasibilitySearchRuns`
(`BATTLE.feasibilitySearchRuns`) bounds every dry run of one step along one
path of answers: legality spends from it first, and each prompt spends only
what the prompts before it left. Every answer offered carries a searched
witness or a universal final-cost proof. The witness's next answer and
universally proven final selections spend no further runs, so a prompt is
never empty for a play legality offered, even with nothing left to spend.

**Replay is free and identical.** The guard's searches replay the answers
given so far against the prompts as rules code raised them
(`Context.rawAnswers`). Its decision at a prompt, with the budget it leaves
and its witnesses or universal proof, is a function of the committed state, the step,
and the answers before the prompt. The step's search memoizes it by those
answers and checks the replayed prompt's fingerprint first
(`ReplayDivergence`), then checks its proof mode as a separate invariant.
A fold re-run makes no dry runs, and an inline run,
a reload, another engine, and a loop replay compute the same prompts.

**Hosts see every bound.** `ApplyResult.bounded` lists the plays and
activations each decision of an `apply` or `createBattle` left out unproven
(`boundedLegality`, `steps/driver.ts`): the responses that decided an
automatic pass, and the options of the decision the run stopped at. Together
with the `feasibilityBounded` events, AI, fuzz, tournament, and worker hosts
log them as `engine.feasibility` records (`legalityLogRecords`,
`eventLogRecords`) as the fold does, and the fuzzer counts both.

### Prompt data

`prompts/types.ts` defines `Prompt` as a union discriminated by `kind`, over
a shared base:

```ts
interface PromptBase {
  side: Side;                          // who answers
  purpose: PromptPurpose;
  cancellable: boolean;                // only before commitPoint of the acting side's own play/activate
  privateTo?: Side;                    // revealed cards visible only to the chooser (e.g. "look at the top 4")
}

interface PromptPurpose {
  source: InstanceId | PromptEmblem | null;  // the card or emblem whose ability asks; null for a rules
                                             // prompt (the hand limit) or, in a view, an unidentified card
  cardId: CardId | null;                     // printed card of a card source; null for a figment, an emblem,
                                             // or no source
  ability: number | null;
  role: PromptRole;                          // "target", "chooseX", "discardToHandLimit", "youMay", …
}
// PromptEmblem: { kind: "avatar"; side; id: AvatarId } | { kind: "dreamsign"; side; index; id: DreamsignId }

type Prompt =
  | { kind: "chooseTargets" | "chooseCards"; candidates: InstanceId[]; min: number; max: number }  // complete legal set
  | { kind: "chooseMode"; options: { mode: number; legal: boolean }[];
      subtypes?: CardSubtype[] }   // a character type choice (role "chooseSubtype"): each mode's type
  | { kind: "chooseNumber"; min: number; max: number }
  | { kind: "arrange"; cards: InstanceId[];
      destinations: { to: "top" | "bottom" | "void" | "hand"; min: number; max: number }[] }
  | { kind: "confirm" }
  | { kind: "payOrDecline"; energy: number; payable: boolean };   // each with PromptBase
// Every kind but chooseMode may carry `allowed`: the complete list of legal
// answers of a narrowed play-time prompt whose other fields cannot state it.
```

A view of a prompt for the side that does not answer it leaves out
`allowed`, which names cards.

Rules code passes a `PromptSpec` (a prompt without `cancellable`) to
`choose`. A prompt has no id inside the engine; the fold adds one
(`PendingPrompt.prompt.id`). Answers are `InstanceId[]`, a number, a boolean,
or an arrangement (`{ card, to }[]`).

The purpose is structured, not prose, and is part of the fingerprint, so a
role's spelling never changes. The UI renders prompt text from English
templates in one UI copy module, keyed by `kind` and `role` ("Choose an enemy
to banish", "Discard a card"), with the source card or emblem shown
alongside. Engine code never builds player-facing strings (D35).

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

1. **Dreamwell.** Current energy resets to maximum; the Dreamwell draw
   applies from round 2 and in every extra turn.
2. **Draw.** The starting side skips it on the battle's first turn
   (`config.skipFirstDraw`).
3. **Dawn.** Auto-advances.
4. **Day.** Standard, Fast, and Interrupt windows for the active side;
   repositioning.
5. **Dusk.** The non-active side may reposition and has a Fast window.
6. **Night.** `▸Night` and `▸Challenge` triggers, then a Fast window for the
   active side.
7. **Challenge.** One `challengeLane` step per lane, F0→F8.
8. **Ending.** "At end of turn" triggers (`atEndOfTurn`) match the
   `phaseChanged` that enters it and resolve first (RD-hv-umm2.86-1): while
   any wait, the optional persisted `turn.endingCleanup: true` holds the
   cleanup for the next automatic `advancePhase`; with none, the cleanup runs
   in the entering step. The cleanup is the hand-limit prompt (P6), then
   ephemeral and offering banishes, then "until end of turn" expiry and F3
   returns, then exhaust clears for everything, avatars included.

A new turn (`beginNextTurn`, `rules/turn.ts`) takes pending extra turns
first, most recent first (C8), and is a draw once more than `turnLimit`
rounds would begin (P11). Its "at the start of your turn" triggers resolve
before its Dreamwell phase (`turn.beginning`).

**Victory check** (`rules/victory.ts`, P5, C15). After every completed step
the runner checks each side for a win:

- its score is at or above `scoreToWin` (reason `score`);
- otherwise, a card in play or emblem it controls has a `winCondition`
  ability whose condition holds now, or a `winTheGame` effect it controlled
  resolved during the step (reason `winCondition`). Cards in any other zone
  never count, and a condition true only partway through a step does not
  win.

One winning side gets the victory. Both winning in the same check is a draw,
with reason `score` when both won by score and `winCondition` otherwise.
The check emits a `winConditionMet` event for each side with a holding win
condition, naming its sources, before `battleEnded`; a resolving
`winTheGame` emits one naming its card as it resolves. A `winConditionMet`
naming a card in a hand or deck (a hidden trigger's `winTheGame`) is private
to that card's holder, like the trigger's own events; `battleEnded` is
always public. Each is logged as `engine.winCondition`. A suspended step has
no check until it completes.

Designations:

- At the end of Day, the active side's front-rank characters are recorded as
  challengers.
- At the end of Dusk, the opposing front-rank characters at the same index
  become blockers.
- Night movement updates the pairs for the recorded challengers. One query,
  `laneRoles` in `rules/challenge.ts`, names a lane's current pair: the
  `challengeLane` step resolves it, and the `challenging` and `blocking`
  selectors read it.

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

- **Prevent** (`preventCard`, `rules/stack.ts`) removes a card from the
  stack, and the card goes to its owner's void, or to the destination the
  effect names: the top of its owner's deck, its owner's hand, or the
  preventer's hand. Created cards cease to exist; reclaimed cards are
  banished. "Unless the opponent pays N●" asks the prevent effect's
  opponent with a `payOrDecline` prompt. "Unless the opponent abandons a
  non-figment character" (`unlessAbandons`) asks them with a `confirm`
  prompt (role `preventUnlessAbandons`), then on acceptance with a
  `chooseCards` prompt (role `abandon`) over the matching characters they
  control; with none it prevents without a prompt.
- **Activated abilities** are stack items too.
- **Copies** follow [D15](decisions.md#d15-copies-of-cards-on-the-stack). A
  copy pushed above its original offers its controller a `chooseTargets` or
  `chooseMode` prompt when legal alternatives exist (`rules/copies.ts`,
  `copyCard`): each choice is a resolution-time prompt, answered
  automatically with one legal answer, and a choice with no legal option keeps
  the original's (RD-hv-7x4l.8-4). `chooseForCopy` keeps choices one at a
  time: a modal node with no legal mode keeps the mode the original chose for
  it, and a target spec with too few candidates keeps the original's targets
  for that spec, while every other choice is made anew. Keeping a choice
  reports nothing; resolution re-checks kept targets like any chosen target
  and reports `noLegalTarget` for a part whose targets are all illegal then.
  The copy keeps the item's `x` and
  `optionalPaid`, emits `cardCopied` instead of `cardPlayed`, and changes no
  priority.

## Triggers

This follows [D14](decisions.md#d14-trigger-timing-and-order).

- **Matching.** Primitives emit engine events, and `Context.emit` runs the
  matcher (`triggers/matcher.ts`) on each event as it happens. Matches only
  join `state.triggerQueue` as `QueuedTrigger`s; they never resolve inline.
  Matching at the moment of the event lets ▸Dissolved see its own dissolve and
  lets "leaves play" and "leaves your void" triggers see the card as it last
  was, through the `leftPlay` and `leftVoid` events emitted just before a card
  moves. A `leftPlay` into a void or nowhere arms the "when … is dissolved"
  abilities that match the character then and records its ability origin,
  gained abilities included; its `dissolved` event reads the dissolved card's
  abilities from that origin (`ArmedDissolve`). Nothing triggers before the first turn begins or after the battle
  ends.
- **Trigger events.** `TRIGGER_EVENTS` lists the engine event kinds each
  trigger kind can match. A new `Trigger` member fails to type-check until
  it has an entry, the matcher refuses a match on an unlisted event, and
  events no trigger lists skip the matcher.
- **Shape.** A `TriggeredAbility` is `{ trigger, effect, zone, condition?,
  oncePerTurn? }`. A queued trigger records its source, controller, origin
  (card variant with the abilities it gained, figment, or emblem), ability index, floating-trigger node,
  and `subject`, the card the event concerns, so it resolves even after its
  source moves or ceases to exist. A "when … gains ✦" trigger also records
  `gain`, the matched gain's amount and expiry, which the trigger's effect
  reads as `env.gain`, the view shows, and `triggerQueued` logs.
- **Ordering.** Matches enqueue in event order. Simultaneous matches use the
  fixed order: the active side first; within a side, avatar → dreamsigns →
  characters, B0→B9 then F0→F8. Cards in other zones follow, ordered by zone
  (void, hand, deck) and then by instance number, then the cards the side
  controls on the stack, bottom first, where only "When you reclaim this
  character" works (RD-hv-umm2.91-1); a card leaving play is
  ordered by the zone it is going to, and one going to no ordered zone comes
  last (RD-hv-7x4l.17-2). Each side's floating and delayed triggers follow
  its cards, in creation order.
- **Draining.** Each queued trigger resolves in its own `resolveTrigger` step,
  so its prompts are cheap to replay. Its modes and targets are chosen as it
  resolves (`chooseOnResolution`).
- **Functional zones.** A triggered ability works in play unless it declares
  `zone: "void" | "hand" | "any"` (`any` is play, void, hand, and deck); an
  emblem's abilities always work. Examples:
  - Soulkindler `4edf2d8d-61e4-4c3a-a388-4b52b2ebd005`: "▸Dawn: If this card
    is in your void, erode 3";
  - Graywatch `3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1`;
  - From the Barrow `4752fc43-6696-4bc3-88d0-4d5b97622fa8`.
- **Intervening "if" conditions** are checked when the trigger matches and
  again on resolution (rules § Ability Types).
- **Once per turn** is keyed by source key and ability index
  (`OncePerTurnKey`, which covers emblems), and cleared as each turn begins;
  the records of a character's gained abilities are also dropped as they end.
- **Floating triggers** (`floating`) are "until end of turn, when…".
  **Delayed triggers** (`delayed`) are one-shot "the next time…" floating
  triggers with `once: true`. Both are `floatingTrigger` nodes, and their
  floating record stores an `EffectRef` (origin, ability, and node index in
  `everyNode`) into the catalog definition, so state stays plain data. One
  created inside a `withMaterialized` binding also stores the binding's
  cards (`captured`), which its queued trigger carries to its resolution.
- **`triggerAbility`** enqueues a named trigger outside its occasion
  (`triggerNamed`).
- **Disabled triggers** (`disableTriggers`, optionally while a condition
  holds) suppress matching.
- **Additional spark** (C17, rules § Spark → Additional spark): `gainSpark`
  emits `sparkGained` with the gain's amount, its expiry (`never` for a
  permanent gain), and `additional: false`. The `gainsSpark` trigger
  (`whenGainsSpark(subject)`) matches each such event with an amount of at
  least 1 whose character matches the subject as the gain happens. Its
  effect `gainAdditionalSpark(it, N)` gives the subject, while it is in
  play, N✦ with the matched gain's own expiry, so both end together: the
  same end of turn, the same "while this is in play" source, or the same
  payable effect. It does nothing when that duration is already over, and
  resolving it in any other ability throws. Its gain emits `sparkGained`
  with `additional: true`, which matches no trigger, so it never retriggers
  and each source adds exactly N. Spark a character has (statics, Support,
  anthems, `forDuration` changes) emits no `sparkGained` and never matches.
- **"When … is dissolved"** (rules § Ability Types → When a character is
  dissolved; RD-hv-umm2.65-1, RD-hv-umm2.65-2): the `dissolve` trigger
  (`whenDissolved(selector, { figment? })`) looks back. As a character's
  `leftPlay` announces it leaving for the void or for nowhere, the matcher
  arms every `dissolve` ability, floating triggers included, that works
  where its card is and whose selector (and `figment` flag) matches the
  character still in play, the departing card's own abilities among them.
  The character's `dissolved` event then matches exactly the armed
  abilities, in the fixed order, wherever their cards now are. Each armed
  ability keeps its listener as armed: it triggers for the side that
  controlled its card as the character left play (RD-hv-umm2.333-1), and an
  armed floating trigger fires even when its duration ended as the
  character left play. A departure
  with no `dissolved` (a banish, a return to hand, a figment ceasing to
  exist undissolved) triggers nothing. The armed abilities wait on the
  step's context (`StepContext.armedDissolves`), never in battle state:
  `leftPlay` and `dissolved` come from one synchronous dissolve with no
  prompt between them. Several characters dissolved by one effect are
  dissolved one at a time, so a card dissolved earlier is not armed for
  later ones.
- **"When … is put into your void"** (rules § Ability Types → When a card is
  put into a void; RD-hv-umm2.77-1): the `putIntoVoid` trigger
  (`whenPutIntoVoid(player, filter)`) does not look back. `relocate` emits
  `enteredVoid { instance, side, from }` once a card is in its owner's void,
  whatever route moved it (dissolve, abandon, discard, erode, foresee, a
  looked-at card's "rest", a prevented or resolved card leaving the stack),
  and the matcher matches it like any other event: the void owner against
  `player`, the filter against the card as it is in the void, and the
  ordinary functional-zone check, so an ability that works in play never
  sees its own card enter a void. Created cards cease to exist and
  reclaimed cards are banished instead, so they never emit it.
  `enteredVoid` is bookkeeping (`none` presentation, no log line): the move
  it pairs with presents and logs the card.

## Continuous effects

Effective characteristics are computed, never stored
(`src/engine/continuous/`). `layers.ts` holds the evaluation; rules code
reads it through `effectiveSpark`, `hasKeyword`, the selectors, the cost
code, and the view. Changes come from two sources:

- **Static abilities** (`staticAbility(effect, { zone })`), on emblems and
  on cards in the zones they work from, read live. They change characters in
  play and, through `grantCardKeyword`, cards in a hand, deck, or void.
- **Floating records** in `state.floating`, made by resolving effects. Their
  characters and values are fixed as they resolve, and each carries its
  `timestamp`.

Both feed the same `ContinuousChange` kinds. The layers follow the MTG
analog:

1. **Copiable values:** printed values for the variant, figment catalog
   values, and figment copies' copied values (`printedCard`). Variant
   transforms (transfigurations, then deck-entry modifications,
   [below](#deck-entry-modifications)) join this layer in Phase 5 (5.7a,
   5.7b).
2. **Type changes:** "has all character types" (`allTypes`) and "this
   character is that character type" (`subtype`). A static ability naming
   its source's chosen type (`CHOSEN_SUBTYPE`) reads the latest `subtype`
   change that source made to itself, and makes no change without one.
3. **Ability adds and removes:** keywords gained and lost (`keyword`), and
   the abilities of another card a character gained (`abilities`, made by
   `gainAbilities`; rules § Keywords and Effects → Gaining abilities). An
   `abilities` change applies that card's keywords here, at its timestamp.
   Its other abilities join the character's ability list:
   `rules/floating.ts` mirrors the character's `abilities` changes, in
   creation order, onto `status.gainedAbilities` as each begins and ends, and
   `instanceOrigin` copies the mirror into the card origin's `gained` list,
   so every reader of an instance's abilities (the trigger matcher,
   activation and legality, static abilities, victory, discover,
   determinization) sees them without the floating list, and stack items and
   queued triggers snapshot them with the origin. `originAbilities` lists a
   card's own abilities first, so their indexes never change. The change
   lasts while the character is in play (`sourceLeavesPlay` on itself,
   RD-hv-umm2.110-2); as it ends, the once-per-turn records of the gained
   positions are dropped. The saved-state check rejects a mirror that
   disagrees with the changes (`rules/battle/fold.ts`).
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
   A `cardCost` change, made by `modifyCardCost` ("Return an enemy to hand.
   It costs 2● more", "Draw a ≤2● cost card. It costs 0●"), names one card
   and applies whoever plays it: the latest `"set"` replaces the card's
   copiable cost, joined to the increases or reductions as the difference,
   each `"increase"` adds to the increases, and each `"reduce"` to the
   reductions (RD-hv-umm2.101-1, RD-hv-umm2.102-2). `modifyCardCost`
   runs its nested instruction and changes the cards it put into a hand
   (RD-hv-umm2.101-2); `changeCardCost` ("reduce its cost by 2●") changes
   the card a trigger names, wherever it is. The view and the `effectStarted` event hide the
   change, like any floating change naming a card, from a side that cannot
   identify that card, such as the opponent of a side that drew it.
   Play permissions (`playFrom`, `continuous/permissions.ts`) share the
   layer: they let a player play cards from the void they own. So do play
   restrictions (`playRestriction`): a `cannotPlay` change stops a player, or
   every player, playing one named card or the cards matching a filter, and
   a `playLimit` stops a player once the turn log holds that many of its
   plays this turn. `rules/timing.ts` `playRestricted` reads both inside
   `canPlay`, so legality, the play step's own check, and every route of
   play agree (RD-hv-umm2.109-2). A change naming a card is hidden like a
   `cardCost` change, and costs, permissions (a gained or lost Reclaim among
   them), and restrictions are kept with a redacted source by the view and
   determinization (`rules/floating.ts` `carriesLegality`), so a Reclaim
   grant from a resolved copy, whose source ceased to exist, still reaches
   every determinization. The static-only
   `reclaimNotBanished` change, read by `banishedAsReclaimed` (below), shares
   the layer too.

Ordering within a layer:

- Changes apply in timestamp order. A static ability's timestamp is its
  source's `enteredZoneAt`, when it entered the zone the ability works from
  (0 for an emblem).
- Ties go to static abilities first, in source order (emblems, player first,
  then cards in any zone by instance number), then floating records in
  creation order (RD-hv-7x4l.7-2).
- A static ability's selectors and values read the characteristics of the
  layers before its own, so no layer depends on itself. The exception is the
  base spark and spark of a card outside play, which its reader
  (`staticReader`) gives final (RD-hv-umm2.464-1): static abilities change
  those only for characters in play (`changes` throws on a static layer-4 or
  layer-5 change naming any other card), so that spark comes from the card's
  copiable values, floating changes, and gained spark alone, and reading it
  expands no static ability, its own included.
- Cost selectors (`costAtMost`) read the copiable cost (C4, C13).

Dynamic values such as "+X✦ where X is…" are **locked at resolution** unless
the ability is a static "have" (MTG 608.2h; RD-hv-7x4l.7-1). A resolving
continuous primitive evaluates its characters and value once and stores one
floating record per character. `lockedAtResolution(value)` marks the intent.

**Continuous primitives** (`setBaseSpark`, `grant`/`loseKeyword`,
`giveAllTypes`, `sparkModifier`, `costModifier`, `playFromZone`,
`playRestriction`, `grantCardKeyword`, `reclaimNotBanished`) each
declare a `continuous` hook: their layer and the changes they make while a
static ability holds them. The hook reads through `StaticEnv`: `characters`
and `value` resolve references and values live, and `read` is the reader of
the layers before its own in the evaluation expanding the ability, never
another evaluation of the state. Except for the static-only
`grantCardKeyword` (**Cards outside play**, below) and
`reclaimNotBanished` ([Zones](#zones-and-zone-changes)), their `resolve` makes
floating records for their own duration, else the enclosing
`forDuration`'s, else permanently.

**Static abilities working outside play.** A `StaticAbility` carries a
`zone: FunctionalZone`, the type triggered abilities use: `"play"` (the
`staticAbility` default), `"void"`, `"hand"`, or `"any"` (play, void, hand,
and deck). `collectStatics` in `layers.ts` gathers each emblem's static
abilities, then each card's in play, a void, a hand, or a deck whose `zone`
covers where the card is, with the card's `controller` (a hand's holder, else
its owner) and `enteredZoneAt` (RD-hv-umm2.53-1). Examples:

- "If this card is in your void, characters you control have +1✦":
  `staticAbility(p.sparkModifier(all(characterYouControl()), 1), { zone:
  "void" })`;
- "This character costs 1● less for each warrior you control": a self-cost
  static with `zone: "any"`, so it applies as the card is played from a hand
  or a void.

Whether an ability works depends only on its card's zone, never on
characteristics, so gathering reads no layer. The catalog's `statics` memo
keeps each card's static abilities by printing and variant, so a card
outside play with none working there costs the evaluation one lookup. The
catalog's `staticsOutsidePlay()` flag, read on first use, says whether any
card's base or amplified variant or any figment has a static ability working
from a zone other than play. While it is false, gathering and
determinization read only the abilities of cards outside play that carry
transfigurations or deck mods, the variants the flag does not cover.
Nothing about a working ability is recorded: it emits no event and adds no
floating record, so a source in a hidden zone is named by no event or view
(RD-hv-umm2.53-2), and a step that fails after moving the source commits
nothing.

**Cards outside play.** `grantCardKeyword(cardsIn(zone, filter, player),
keyword)` is the static "Cards in your hand have Offering" (layer 3): each
card in that player's hand (the hand it holds), deck, or void (the ones it
owns) whose layer-2 type and subtype, and final spark, match the filter has
the keyword while it is there (RD-hv-umm2.52-1, RD-hv-umm2.464-1). It reads
layer 2, and the final spark of cards outside play, through `StaticEnv.read`,
so a fresh evaluation, such as the invariant check's, never consults a
memoized one. It is static only (`staticOnly`): its `resolve` throws, since a
floating record naming a card in a hidden zone would name it in the public
`effectStarted` event, and the content gate rejects it anywhere but as a
static ability's whole effect. A dreamsign's "your deck" (C4) is a separate
reference that `cardsIn` does not express.

**Memoization:** the layer evaluation of a state is cached lazily, per card
and layer, inside a `Layers` object. A step mutates its work copy in place
without changing `version`, so only committed states are memoized. The
engine facade (`decision`, `legalActions`, `apply`, `view`) remembers each
state it is handed in the catalog's `memo`, a `WeakMap` keyed by the state
object and checked against `state.version`. Reads of any other state build
a fresh evaluation. `view` likewise keeps each state's views by side on
the engine, checked against `state.version`, so the screen, the
presentation, the battle log, and the AI host share one immutable view of a
committed state. Caches never enter `BattleState`, and the fuzz
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
   `banishedAsReclaimed` decides it as the card would leave, in `relocate`,
   `dissolve`, and `preventCard`: a reclaimed card in play or on the stack is
   not banished while a layer-6 `reclaimNotBanished` change of its owner's
   applies. The static-only `reclaimNotBanished` primitive ("Cards you
   reclaim are not banished when they leave play") makes that change while
   its source is in play; it starts no floating record and emits no event. A
   reclaimed card that goes where it normally would loses the reclaimed
   status in `relocate`, under the zone-change events naming it, and the view
   shows a covered card in play or on the stack without the status
   (RD-hv-umm2.84-1, -2).
3. **Veil.** A dissolve by an opposing effect removes Veil instead.

Other zone rules:

- **Materialize** (`materialize`, `placement`) places the card in the
  leftmost open back-rank slot, or the open slot a UI drop names (the `play`
  action's optional `slot`, kept on the stack item). The card enters
  exhausted unless awakened.
- **Capacity:**
  - A full back rank makes materializing plays illegal: characters, and cards
    and activated abilities whose effects hold a primitive with
    `entersPlay` (`materialize`, `materializeFigments`, `materializeFigmentCopy`).
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
- **Offering, Reclaim, Ephemeral.** A `play` from `"void"` by Reclaim uses
  Reclaim's costs and marks the card reclaimed; a hand play of an Offering
  card first chooses its route (RD-hv-7x4l.8-3). Ending step 2 banishes Offering cards
  anywhere and Ephemeral cards in hands. The statuses travel with the
  instance; Ephemeral ends as the card leaves a hand.
- **Granted Reclaim** (`grantReclaim`) starts a floating layer-3 `keyword`
  gain of `reclaim` on void cards, optionally carrying `reclaimCosts`
  ("gains reclaim 0●"). `routeCosts` (`rules/timing.ts`) plays a card by
  Reclaim for the costs of its latest costed gain since it last lost
  Reclaim, in layer-3 timestamp order, ahead of a printed or deck-entry
  Reclaim cost; a plain gain only adds the keyword (RD-hv-umm2.78-1).
- **Play permissions** (`playFromZone`) are layer-6 `playFrom` changes:
  from a static ability, a lasting permission naming cards by filter; from a
  resolving effect, a floating one naming its cards or a filter, with `next`
  for one play. `playPermission` (`continuous/permissions.ts`) reads which
  one covers a card in the void its player owns: a lasting one, else the
  earliest `next` one. `playRoutes` then offers the `"permission"` route,
  for the card's normal costs, ahead of `"reclaim"`; a card with both asks
  the `voidRoute` prompt. The play step ends the `next` permission it used
  with its cost modifiers, after the commit point, and only for the
  permission route (RD-hv-umm2.81-1 to -3).
- **Copies** (`rules/copies.ts`): stack copies (D15), figment copies (C5),
  and created copies in a hand, each announced by `cardCreated`.

## Costs

Cost kinds (`dsl/types.ts`, built in `dsl/builders.ts`; paid in
`rules/costs.ts`):

- energy: Fixed, X, or Fixed+X (`energy`, `energyX`);
- ☾ (`exhaustSelf`; back-rank characters and avatars only);
- discard matching hand cards (`discardCostFilter`), with a fixed count, an
  X count (at least its optional least X, `min`), or one card whose copiable
  cost is captured as X; or discard the whole hand (`discardHandCost`,
  `count: "hand"`);
- abandon, with a fixed count, or one character whose copiable cost is
  captured as X (`abandonCostCapture`);
- banish matching void cards (`banishFromVoidCost`), with a fixed count, or
  an X count at least the cost's least X (`banishXCost`, 1 by default);
- reveal from hand;
- counters;
- ⍟ (`pointsCost`), payable only with the payer's full amount and paid as
  a `pointsScored` loss; the card-lab solver gives the playing side the ⍟ a
  top-level ⍟ additional cost needs;
- a choice between costs ("A or B", `choiceCost`);
- optional additional costs (`optionalCost`);
- Offering's banish from hand, by the Offering route.

**Resolving payments** use `p.payTo({ energy: 2, discard: 1 }, effect)`.
Its optional fixed energy and exact discard amounts default to zero. The
controller is offered the existing optional-cost confirmation only when the
whole payment is affordable. Acceptance plans the hand-card choice before
spending energy or discarding, then chooses the child's modes and targets at
resolution. Decline runs no child. This bounded form supports one unfiltered
fixed discard demand, including a resolving source in hand, and retains the
enclosing ability's source, controller, X and optional-cost bindings.

**Cost choices are play-time prompts** before `commitPoint()`: which
alternative to pay, whether to pay the optional cost, which cards to discard,
abandon, reveal, or banish. Payment happens after the commit point, all of it
before the item goes on the stack. Copies don't pay.

Discard candidates use the shared card filter (effective type/subtype and
copiable-cost bounds), excluding the source, targets and prior cost cards.
A variable discard binds X to the chosen count. Without a `min` it admits
zero, which authors use only when zero has a meaningful effect under the
contextual X rule, such as an ability's fixed draw; otherwise they give it
`min: 1`, as "Reclaim – Discard X cards" does (RD-hv-umm2.457-1). Its least X
works like a variable void banish's: affordability needs that many matching
hand cards, the prompt's minimum is that least X, and an X bound earlier
below it is a dead end. Single-card cost capture reads its
copiable cost after variant and deck-entry modifications, with an X energy
part counting as zero, before payment. The captured value travels with the
stack item. All energy-X, count-X and captured-X payments in one plan agree
on a shared binding; a conflicting selection has no feasible continuation.
`plus` adds a fixed offset to a value such as a captured cost. An abandon
cost's single-card capture reads the chosen character the same way before
payment, so a figment that then ceases to exist captures 0● (C13).
A variable void banish binds X to the chosen count the same way, but its
least X defaults to 1 (the energy-X default): a void with fewer matching cards
raises an empty prompt, so the play is illegal. An X bound earlier below that
least value is a dead end.

A whole-hand discard (`discardHandCost`) raises no prompt and binds no X.
`planCosts` fixes its cards as it reaches the cost: every card in the payer's
hand except the source, the excluded cards (the played card and targets) and
cards chosen for earlier costs, none from an empty hand. It is always
payable on its own (RD-hv-umm2.334-1). Taking every remaining hand card, it
leaves a later cost in the same plan no hand card: nested affordability drops
hand cards from the pools of costs listed after it, and a top-level later
hand cost raises an empty prompt. `payCosts` discards exactly the planned
cards, so a card an earlier cost returns to hand stays there. A preceding
card choice keeps its ordinary prompt, cancellation and replay; a step that
fails after payment rolls the discards back with the rest of the attempt. The
card-lab solver stages no hand card for it. Review provenance: the cold review
of hv-umm2.61 (8cafea877) found that a variable-count discard cannot express
this mandatory payment.

**Energy-X legality** comes from the definition's range, which defaults to
`min: 1`. Widen it to 0 only when X=0 does something meaningful.

## Ability DSL and content modules

Each entity lives in a typed content module that holds its catalog data, its
printed text, and its abilities together. Windcutter is `pending: true`
today; authored as Phase 5 will author it, it reads:

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
    triggered(onChallenge(), p.banishUntil(target(enemyCharacter()), v.amplified ? "untilYourNextTurn" : "untilEndOfTurn")),
  ],
  verifiedText: "…",   // expectedVerifiedText(renderedText, amplifiedText) when these abilities were verified
});
```

`p` is the primitive catalog (`import * as p from
"…/engine/effects/primitives"`); the other builders come from
`engine/dsl/builders.ts` and `engine/dsl/triggers.ts`. The authored modules
today are the Ember, Legionnaire, and Wraith figments
(`src/content/figments/`).

An entity is exactly one of `pending: true`, `vanilla: true`, or authored
`abilities` with `verifiedText` (`ContentStatus` in `src/content/define.ts`).
The engine reads catalog entries through `content-catalog.ts`; a pending
entity plays text-less.

**Amplified text is stored expanded.** `amplifiedText` holds the amplified
card's full rules text ("▸Challenge: Banish an enemy until your next
turn."), so no module depends on a replacement algorithm.

**File layout.** Use one file per entity, named `<slug>-<uuid8>.ts`. Names
aren't unique; the UUID prefix disambiguates. Each directory has an explicit
`index.ts`, and a test asserts that the index lists every file. Node tools
can't use `import.meta.glob`.

**More examples** (abilities only):

```ts
// Kindlehorn 9b9c2743-75b3-499d-b5fb-c3429c92d420: "▸Dawn: Gain 1●." / "4●, ☾: This character gains +1✦." / amplified "2●."
(v) => [triggered(onDawn(), p.gainEnergy(1)), activated([energy(v.amplified ? 2 : 4), exhaustSelf()], p.gainSpark(self(), 1))]

// Dream Sever 6e019832-2e0c-4166-81c3-54f7995425df (Interrupt): "Prevent a played event unless the opponent pays 2●."
() => [event(p.prevent(stackItem({ cardType: "event", controller: "opponent" }), { unlessPays: 2 }))]

// Echo Architect 21965e95-0c8c-470c-a1e1-06d7b87a8d00: "Events cost you 1● more." / "When you play an event, copy it."
() => [staticAbility(p.costModifier("you", { cardType: "event" }, 1)), triggered(whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard()))]

// Terminus 6e2188f8-580e-4a66-a3e3-267d509de903 (Event): "If you have no cards in your deck, you win the game."
() => [event(p.ifThen(noCardsIn("deck"), p.winTheGame()))]
// The same text on a character, checked while it is in play:
() => [winCondition(noCardsIn("deck"))]

// Spirit Bond 3cda9dd7-cb81-43c1-9db5-1444d7363e13: "Until end of turn, characters you control have +X✦ where X is the number of characters you control."
() => [event(p.forDuration("untilEndOfTurn", p.sparkModifier(all(characterYouControl()), lockedAtResolution(count(characterYouControl())))))]
```

**Primitive registry.** Each primitive lives in its own module under
`src/engine/effects/primitives/`, exporting its node type, its
`PrimitiveDefinition`, and its builder. The definition, exported as
`<op>Primitive`, holds the op, optional `children`, `modes`, play-time
`targets`, an optional `deferred` hook naming effects that run later and so
are excluded from play-time target collection, `entersPlay` for a primitive
that puts characters into play, a `continuous` hook for a continuous
primitive, `staticOnly` for a primitive only a static ability holds, and
`resolve`. A primitive holding a character or card reference
declares it with the `characterTarget` or `cardTarget` helper. The registry
finds each definition by that name at call time. `primitives/index.ts` lists one `export *` line
per primitive and is the authoritative catalog; `effects/registry.ts` derives
the `Effect` union and the op lookup from it, so adding a primitive touches
only its module, its plain contract module under `primitives/contracts/`,
one index line, and one getter in the registry's op table, which its
`satisfies` clause requires. `primitives/contracts.test.ts` eagerly discovers
`*.contracts.ts` modules through `import.meta.glob`; coherent coupled forms
share a contract module. Flow primitives
resolve children through the `run` callback in their environment. Play-time
choices are collected by walking the effect tree: a modal node (`chooseOne`)
prompts for its mode, a mode whose required targets have no candidates is not
legal, and the walk descends only into the chosen mode, so only its targets
are chosen. The stack item stores the chosen modes and targets, and the node
resolves its stored mode. One target spec object used in several places is
one target. Validation walks `children`, which list every mode. A subtree
selected during resolution reuses enclosing bindings for the same modal node
and target spec objects, including mode zero and an empty target selection.
It prompts for unbound choices, while nested subtrees read their nearest
enclosing bindings. Inherited targets use the ordinary resolution-time
legality checks; an invalid target reports `noLegalTarget` for its effect
part, and trailing effects continue.

**Untargetable cards** (C17) have the `cannotBeTargeted` keyword, printed
or granted through layer 3 (`grant(…, "cannotBeTargeted", duration)`).
Targeted references alone read it, in `effects/interpreter.ts`:
`targetCandidates` leaves such cards out of every play-time, trigger, and
copy target prompt, whoever controls the effect, so a play whose only
targets cannot be targeted is illegal; and a chosen target that cannot be
targeted as the effect resolves is skipped like any target that is no
longer legal, reporting `noLegalTarget` when none remain. Selectors that do
not target (`all`, `supported`, counts, conditions, trigger subjects) and
the cards a cost chooses ("abandon a character") still match it: a cost is
not an effect, and its cards are not targets (rules § Targeting).

**Zone references** (`ZoneCardSpec`, `kind: "inZone"`, in `dsl/types.ts`)
name cards in a player's deck, hand, or void, relative to the effect's
controller: the hand that side holds, the deck or void it owns. They are
card references (`CardRef`), so any primitive holding one resolves them
through `resolveCards` (`resolveZoneCards` in `effects/interpreter.ts`):

- `fromVoid(filter, { player, count, upTo, another, costAtMost })` ("a
  character from your void"): a `ZoneTargetSpec`, a play-time target
  (`PlayTimeTarget`) declared by `cardTarget`. It is chosen with the
  character and stack targets, in a `chooseTargets` prompt with the `target`
  role, at play time or, for a triggered ability, as it resolves;
  `targetCandidates` offers the matching cards of that void that can be
  targeted, in void order. A chosen card counts as the effect resolves while
  it is still in that void, matching and targetable; none left reports
  `noLegalTarget`. The cost planner excludes it like any target
  (RD-hv-umm2.59-1). `costAtMost` ("≤X● cost events in your void") is a
  constant or X (`x()`): the X picked as the card is played, before its
  targets, and otherwise the source card's X; a copy reads the original's X.
  Like a character selector's bound, it is checked against each card's
  copiable cost twice, as the targets are offered and again as the effect
  resolves, when a chosen card then above it is not a legal target
  (`voidTargetMatching`, RD-hv-umm2.495-1). The lab solver stages, for a bound by X, a matching
  void card whose copiable cost some X the play can choose admits; a
  required target then leaves the play only the Xs at least that cost.
- `everyIn(zone, filter, { player, another, costAtMost })`: every matching
  card there, in zone order, chosen by nobody. `costAtMost` ("each ≤X● cost
  character in your void") is a constant or the source's X (`x()`); the
  builder's type admits no other value. Unlike `fromVoid`'s bound, which is
  checked as targets are offered and again on resolution, it is read only
  once, as the effect resolves, before any card
  moves, and keeps only cards whose copiable cost (rules § Costs,
  Requirements, and X) is at most it, so play-cost changes do not widen it
  while deck-entry cost reductions count (RD-hv-umm2.86-2). The lab solver
  stages one matching void card for a constant bound as printed, and for X
  at the least X the play can choose.
- `topOfDeck(count, filter, player)`: those of the top `count` cards that
  match, top first.
- `randomIn(zone, count, filter, { player, costGreaterThan })` ("two random
  ≤2● cost characters from your deck"): a `ZoneRandomSpec`, not a target.
  As it resolves it picks up to `count` different matching cards of the
  zone, uniformly, one draw each from the `random:selection` stream, and
  names them in the order picked; fewer match, fewer are named, and none
  names none and draws nothing. `costGreaterThan`, a value read once as it
  resolves (the captured X of an abandon cost for "with higher cost"), keeps
  only cards whose copiable cost is greater. The deck is not shuffled:
  `resolveNode` resolves a node whose own references pick from a deck at
  random under `StepContext.settlingKnowledge` with
  `randomDeckRemovalSettler` (view/knowledge.ts), which runs before each
  event is observed or matched, before each prompt, and once after the
  node. Each run has each viewer forget the deck places the cards that have
  actually left so far leave open (`forgetDeckPositions` over the decks as
  the node began), so no presented state shows which slots the picks took,
  and knows again a place a later removal determines (RD-hv-umm2.83-1).
- `thisCardIn(zone)`: the source while it is in its controller's zone.

Filters read current characteristics and the copiable cost
(`cardMatchesFilter`; `matchesFilter` in `continuous/characteristics.ts` is
the one predicate every filter user calls, a played card's turn-log record
included). Resolving a
reference changes nothing but a random reference's own RNG stream and
emits nothing but `noLegalTarget`, so a
reference into a hidden hand or deck names no card in any view, event,
prompt, or log; only the primitive acting on the cards can show them
(RD-hv-umm2.59-2). The card-lab solver stages a matching void card for each
void target, a played character's ▸Materialized triggers included, one
matching void card for each "each … in your void" a materialize takes (within
its cost bound at the least X), and a matching opponent hand card for each choice from the opponent's hand
(`discardChosen`, `banishChosen`). The static `grantCardKeyword` keeps its own `cardsIn` set, read
through the layer evaluation.

**Primitive catalog.** The registered primitives and DSL builders, by group,
with the ones Phase 5 primitive beads add, each with tests.

| Group | Registered | Phase 5 |
| --- | --- | --- |
| Resources | `gainEnergy`, `gainMaxEnergy`, `gainPoints` (either player), `storeCounters` (N⧗ on the source while it is in play, announced by `countersChanged`; RD-hv-umm2.94-1) | `doubleEnergy`, `spendCounters` |
| Cards | `draw` (ephemeral), `discard`, `discardRandom`, `foresee`, `erode`, `createCopyInHand` (ephemeral), `discover(filter)`, `grantCardKeyword(cardsIn(zone, filter, player), keyword)` (static only), `takeFromAmong(movedBy(effect) \| opponentHand(), { filter, costAtMost, count, optional })` (`count` cards, all when fewer match; an optional take of several asks its "you may" first, then takes exactly that many), `lookAtTop(n, { draw, ephemeral })`, `shuffleInto(zone refs, { chooseFromHand })` (always shuffles the controller's deck), `banishCards(zone refs | capturedCards())` (each named card to its owner's Banished zone), `banishChosen(filter)` (a private resolution-time choice from the opponent's hand, not a discard), `putInDeck(card refs, top \| bottom)` (each to its owner's deck, unshuffled, grouped by source zone in first-reference order, each in its original zone order), `putFromTop(n, places)` (a private `arrange` of the looked-at cards among top, bottom, hand, and void, each place a count or the rest) | `draw` at cost 0, `reveal` |
| Characters | `abandon(chooser, predicate)` (one own character chosen at resolution, not a target), `dissolve`, `banish`, `banishUntil(duration)`, `returnToHand`, `materialize(from)` (zone-card references or the character a nested Discover moves into hand), `materializeFigments(figment, n, spark)`, `materializeFigmentCopy` (C5), `gainSpark(duration)`, `gainAdditionalSpark` (C17), `setBaseSpark`, `sparkModifier`, `awaken`, `exhaust`, `gainControl`, `grant`/`loseKeyword`, `giveAllTypes`, `triggerAbility`, `disableTriggers(while)`, `phase` (Phasing) | `rematerialize`, `move(slotRule)`, `gainAbilities(banishCards(…))` (the source, while in play, gains every ability of each card the banish moved; layer 3 `abilities`) |
| Costs | `costModifier(player, filter, amount, { next, duration })`, `playFromZone("void", filter, { cards, next, duration, player })` (a play permission; static with no `cards`) | |
| Stack | `prevent(selector, { unlessPays \| unlessAbandons, destination })`, `copyCard` (D15), `banishSelfOnResolve` ("Banish this card": the resolving event goes from the stack to its owner's Banished zone as the instruction resolves, so `resolveTop` does not put it into the void; RD-hv-umm2.475-1) | copying more than once |
| Flow | `sequence`, `chooseOne(modes)`, `ifThen(Else)`, `repeat`, `optional`, `forDuration`, `floating(when…)`, `delayed(next…)`, `eachPlayer` (active player first, each as "you"; no play-time choices), `withMaterialized(materialize, effect)` (binds `capturedCards()`) | `forEach`, `takeExtraTurn` (C8) |
| Selectors | characters (`CharacterSelector`: controller, subtype, ✦ and cost bounds that may read the source's X or a `countCards` zone count, figment or not, exhausted, rank, challenging or blocking now (rules § Holding a role), "another"); `supported` (C9); stack cards (`stackItem`); card filters (type, subtype, constant cost bounds; `costExactly(n)` for both); players (`you`, `opponent`); cards in a deck, hand, or void (`fromVoid` and `everyIn`, each with an optional `costAtMost`, a constant or X: `fromVoid` checks it as its targets are offered and again as the effect resolves (RD-hv-umm2.495-1), `everyIn` reads it once as the effect resolves (RD-hv-umm2.86-2); `topOfDeck`, `randomIn`, `thisCardIn`) | |
| Values | constant, `x`, `count(selector)`, hand size, `countCards(zone, filter, player)` (cards in a deck, hand, or void; a filter only for a void), `supporting` (C9), `times`, `lockedAtResolution`, `costOf(cardsMovedBy(node))` ("that card's cost"), `thisCharacterSpark()` (the source's effective ✦ in a resolving effect, 0 once it has left play) | stored counters, turn counters |
| Durations | `permanent`, `untilEndOfTurn`, `untilYourNextTurn`, `untilNextDay`, `whileSourceInPlay`, `untilOpponentPays(cost)` (C7) | |
| Conditions | `controls` (`controls(selector, atLeast = 1)`, an optional `atMost`; `controlsNone(selector)` for "if you control no …"), `energyAtLeast`, `costPaid`, `sourceWasReclaimed` (the source's latest actual committed play used Reclaim), `sourceIn`, `cardsIn` (`noCardsIn(zone, player)`, `conditionCardCounts(zone, atLeast, { player, filter, atMost })`) | |
| Victory | `winCondition(condition)` (an ability: "If …, you win the game" on a card in play or emblem), `winTheGame` (a resolving effect) (C15) | |
| Triggers | `onMaterialized`, `onDawn`, `onDusk`, `onNight`, `onChallenge`, `onDissolved`, `whenYouPlay(filter, nth?)`, `whenOpponentPlays`, `whenPlayFromVoid(player, filter)` (a play from the void by Reclaim or a permission, by the stack item's `playedFromVoid` record), `whenMaterialize(subject, nth?)` (with `nth` an exact count or `{ atLeast }` of the turn log's matching materializations, the triggering character included), `whenDraw`, `whenDiscard`, `whenDiscardSelf()` (works from the void), `whenErode(player, filter)`, `whenErodeSelf()` (works from the void), `whenReclaim(player, filter)`, `whenReclaimSelf()` (works from the stack), `whenAbandon`, `whenLeavesPlay`, `whenReturn(selector, { toYourHand? })` (a `leftPlay` for a hand, as the character last was in play), `whenDissolved(selector, { figment? })`, `whenScores`, `whenOpponentScores`, `whenLeavesVoid`, `whenPutIntoVoid(player, filter)`, `whenYouChallengeWith(n, selector)` (C10), `atStartOfTurn`, `atStartOfFirstTurn`, `atEndOfTurn(player?)` (as the Ending phase begins), `either` | |

Discover accepts an exact copiable-cost value expression or a strict lower
bound (`costGreaterThan`) alongside its card filter, or a free
resolution-time cost choice. The free choice is a
`chooseNumber` prompt with its own `discoverCost` role (a paid X keeps
`chooseX`) over the public catalog's fixed-cost ceiling plus one, preserving
a canonical no-match choice. The policy manifest
carries that source-catalog ceiling even when its entity list is a subset.
Card content may specify `xMinimum` as authored rules metadata when a paid
X of zero has a meaningful effect; other printed X costs retain minimum one.

**"That card"** in a resolving effect is `cardsMovedBy(node)`, naming the
cards an earlier node of the same effect moved (rules § Zone Changes → Cards
an effect moved); `costOf` reads their copiable cost, totalled, and 0 when the
node moved none. Every node runs through `resolveNode` (`effects/interpreter.ts`),
and the resolution's `MovedCards` record (`EffectEnv.moved`), shared by every
nested environment, tracks only the nodes such a value names: before one
resolves it reads the copiable cost of every card in the battle, and
afterwards keeps those that changed zones or ceased to exist meanwhile,
replacing the node's previous record. A created card that ceased to exist so
keeps its cost. The record lives only as long as the resolution, so a step's
replay rebuilds it from the step's answers. Static abilities read no moved
card. The content gate requires the named node to resolve earlier in the same
resolution than the value that reads it (see Content gates).

**"Them" after a materialize** (rules § Keywords and Effects → Materialize,
RD-hv-umm2.392-1) is `withMaterialized(materialize(from), effect)` with
`capturedCards()` inside `effect`. The node resolves its materialize, then
binds as `EffectEnv.captured` the instance IDs that entered play meanwhile,
in entry order: exactly the characters that materialize put into play, since
a character that stays in its zone keeps its entry time and nothing else
resolves inside the node. `effect` resolves under that binding, and the
nearest enclosing binding applies. A `floatingTrigger` resolved under a
binding copies it into its floating record's `captured`; the matcher copies
that onto the `QueuedTrigger`, and `resolveQueuedTrigger` restores it as the
binding of the trigger's resolution, so the floating effect's controller and
the cards stay plain data through saves. `capturedCards()` names the bound
cards in play as it resolves, under any controller, so a member that left
play and entered again is named (identity persists across zones), and one in
another zone is not. Only `banishCards` accepts it, banishing through the
ordinary zone change; resolving it outside a binding throws. A view shows
each captured card the viewer can identify by its instance ID, and any other
one, now in a hidden hand or deck, by its owner, printing, and variant,
which every side saw as it entered play, and a member number local to the view
(`CapturedCardView`); a card that ceased to exist is left out. The view
numbers hidden members in order of first appearance, floating effects then
queued triggers, each list in order, so every record naming one card shows
the same number, different cards show different numbers, and the numbering
reads nothing the view hides. A determinization assigns each member number
its own dealt hidden card of that owner, preferring that printing and
variant (`standIns`), so a
sampled member that returns to play is banished as the real one is, by
every trigger naming it. The determinization-fidelity check compares
captured cards in the same terms, numbering hidden members across all the
owed floating effects, so it also compares which records name the same
hidden card.
A trigger whose source the viewer cannot see shows none of its captured
cards: its floating record and `effectStarted` event are hidden whole, and
its queued trigger omits them. The `effectStarted` event logs the cohort's
instance IDs, less any a side cannot identify, and each `banished` event the
card it banished.

**Zone counts** (`countCards(zone, filter, player)`, `CardCountValue`) are a
value and a selector bound: the cards in the player's deck, hand, or void, in
a void only those matching the filter (RD-hv-umm2.76-1). `zoneCountWith` in
`dsl/selectors.ts` counts them through a `CharacteristicsReader`: a resolving
effect's value and every selector check read effective characteristics, and a
static ability's value and selectors read the layers before its own, so no
layer depends on itself, with the final spark of each counted card
(RD-hv-umm2.464-1). A bound reads the count each time the selector is
checked, so a chosen target is checked against the count again as the effect
resolves. A hand or deck count takes no filter, since which hidden cards
match is not public; counts read only public information and name no card.
The card-lab solver stages, for an upper ✦ or cost bound by a count, a
character with at least 1✦ or 1● and as many cards in the counted zone:
matching cards in a void, or cards in a hand beside the played card or in a
deck beside its 8. It does not stage a lower bound by a count.

`conditionCardCounts` counts the specified player’s cards in a deck, hand, or
void when the condition is checked. Its optional typed filter reads effective
card type and subtype; its lower and optional upper bounds are inclusive.
The player defaults to the effect’s controller. `noCardsIn` checks an empty
zone with the existing upper bound of zero.

Dreamsigns and avatars use the same DSL as emblem abilities (P4). Dreamwell
cards use event-like abilities; a drawn Dreamwell card applies only its
`energyAdded` until Phase 5 authors its bonus. Figments are catalog entries.

## Transfigurations

Phase 5.7a builds these transforms. Until then the engine `Variant` carries
each deck entry's transfigurations and applies only Amplified, as its
amplified flag. Each transfiguration is a pure transform of an entity's
abilities, with an eligibility predicate.

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
Each engine `DeckEntry` carries its deck entry's full variant, and
`BattleInit.nextBattle` the next-battle effects;
`src/battle/integration/engine-battle-init.ts` builds both from the journey.
Phase 5.7a adds the transfiguration transforms, and Phase 5.7b proves every
modification on real content. The variant (`dsl/types.ts`):

```ts
interface Variant {
  amplified: boolean;
  transfigurations?: TransfigurationType[];   // with deckMods, absent on an unmodified entry
  deckMods?: {
    sparkBonus: number;                // additive, after transfigurations
    costReduction: number;             // energy cost, min 0
    fast: boolean;
    reclaim: number | null;            // granted or overridden Reclaim cost
    typeChange: { cardType: "character" | "event"; subtype: CardSubtype } | null;
  };
}
```

- **Applied in layer 1.** `instanceCard` (`catalog.ts`) is the printed card
  an instance plays as: its card with the deck modifications applied. Costs,
  speed, Reclaim, timing, the view, and the layer evaluation all read it.
- **Order** matches `resolveDeckEntryCard` in `src/card-type-change.ts`:
  transfiguration transforms, then type and keyword changes, then the spark
  bonus. An Event turned into a Character has 0 spark and takes no spark
  bonus, as in the prototype.
- **Abilities are kept.** A type change alters the characteristics that
  selectors and timing read, never the ability list.
- **Granted Reclaim** is the same Reclaim ability that Enduring adds, with
  the modification's cost; it replaces a printed Reclaim in place.
- **Next-battle effects** (`NextBattleEffects`, per side): extra
  opening-hand draws with an optional card-filter predicate
  (NextBattleOpeningHand), starting energy (NextBattleStartingEnergy), and
  a smaller ordinary hand with a cost reduction on every card the side's
  deck starts with (NextBattleSmallerHandAndCostDiscount). Battle setup
  consumes them once: `battleConfig` the hand size, `initialState` the cost
  reduction (`dealtDeck`), and the `beginBattle` step the draws and energy.
  The journey's victory transition then spends the battle modifiers they
  came from.
- **Displayed text** keeps coming from the existing deck-entry text
  transforms, like transfigured text.

## Content gates

**The coverage gate** (`src/engine/content-gates.test.ts`) is the CI test of
the data↔engine contract, over every card, dreamsign, avatar, Dreamwell card,
and figment. Each check names every offending entity:

- **Status.** Every entity has exactly one of `abilities`, `vanilla: true`,
  or (only during Phases 3–5) `pending: true`. The pending set is empty at
  the Phase 5 gate.
- **`verifiedText`.** Every entity with abilities has `verifiedText ===
  expectedVerifiedText(text, amplifiedText)` (`dsl/verified-text.ts`). A text
  edit fails CI until the abilities are re-verified against the new text and
  the hash is updated.
- **Primitive registration.** Every authored entity's abilities build for
  both variants, every node of each effect (every mode included) is a
  registered primitive, and every static ability holds a continuous
  primitive.
- **Static-only primitives.** A primitive marked `staticOnly`
  (`grantCardKeyword`, `reclaimNotBanished`) appears only as a static
  ability's whole effect, never in an event, triggered, or activated ability
  or nested in another node, since resolving it throws.
- **Undeclared targets.** Every play-time target spec a primitive holds is
  declared by its `targets` hook (`undeclaredAbilityTargets`,
  `testing/target-audit.ts`), so play-time choices never miss one.
- **Static references.** No static ability holds a play-time target,
  stack target, or triggering-card (`subject`) reference anywhere in its
  tree: the layer evaluation has no chosen target or triggering event to
  read.
- **Moved-card reads.** Every `cardsMovedBy(node)` a value holds names a
  node that resolves before that value is read, in the same resolution
  (`misplacedMovedCardReads`, `testing/moved-card-audit.ts`): the node is,
  or resolves within, an earlier child of an enclosing `sequence`. Other
  containers order nothing: `chooseOne`, `ifThen`, and `choosePlayer` hold
  alternatives, and `optional`, `repeat`, `eachPlayer`, and `forDuration`
  one effect, so a read inside a branch may name an earlier node of that
  branch or of an enclosing sequence. A floating trigger's effect is a
  resolution of its own and names only its own nodes. A static ability
  holds no moved-card read. Any other reference, to a later node, another
  branch, or an equivalent node outside the effect, would always read 0.
- **Printed energy cost.** Every card's printed energy cost orbs read into
  its engine costs (`engineCardFromContent`).
- **Figment data.** Every figment has a unique UUID and a non-negative
  integer base spark.

The printed text is canonical and the abilities implement it (D5). There is
no ability-to-English renderer. Correctness of an encoding is shown by
primitive tests, scenario specs, the fuzzer, and the card-lab sweep and judged
QA.

**Pending entities** are text-less in battle until authored
([D36](decisions.md#d36-pending-entities-play-text-less)). The `play` step
and the draw rules emit `pendingAbility` for each pending card played or
drawn and each pending Dreamwell card drawn.

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
- turn counters (`turnLog`, RD-hv-7x4l.36-1);
- bookkeeping: the version, minted-id and timestamp counters, random-stream
  positions, each side's knowledge (`knownTo`), the automatic-step count,
  the loop tracker, and absolute zone-entry timestamps (their order stays).

`loops/signature.ts` classifies every field of `BattleState` and `SideState`
as position, resource, or bookkeeping in typed field tables, so a field added
to either interface fails to compile until it is classified.

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
The view shows the loop on offer and the repetition in progress. Only the
side that may repeat the loop also sees its recording: its steps, which are
that side's public actions and automatic steps, and only while every
answered prompt was fully visible to that side when it opened and every card the steps name is one that side can identify.
Each recorded step keeps one visibility flag per answer, covering both the
original prompt and its feasibility-narrowed answer surface. Missing or
incomplete flags in serialized histories conservatively withhold answered
recordings. A prompt fingerprint hashes the prompt's source card, candidates,
and options, which may be hidden from that side (an opponent's forced prompt
from a trigger in hand), so a recording with any prompt the actor did not
fully see is withheld whole and its fingerprints stay private. Determinization puts the loop the view
shows back on offer, with the state's own signature and the repetition in
progress. With the recording, search simulates accepting the loop as the
battle would run it (D12); without it the recording is unknown
(`LoopCandidate.actions` is `null`), repeating the loop there throws
`UnknownLoopRecording`, and search scores accepting it as unknown. The
sample's detection history and mandatory-cycle mark start empty, so both
detect from the sampled state on.

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

- **RNG** (`state/rng.ts`) uses named streams:
  - `shuffle:<side>`;
  - `dreamwell`;
  - `random:<purpose>` (`random:discard`, `random:discover`,
    `random:selection`).

  Each stream is a counter in `state.rng`: draw `n` of stream `s` is a hash
  of the seed, `s`, and `n`, so new random effects never perturb other
  streams. The engine log records the counters each step advanced
  (`engine.rng`, one record per stream).
- **Seeds.** The battle seed derives from the game seed and the battle index.
- **The fold log is the replay:** top-level actions, answers, and cancels.
  Fixtures and the fuzzer re-run logs and compare the hashes of final states
  (`stateHash`, `state/hash.ts`).
- **The engine log** (`log.ts`) is the schema hosts write. The engine stays
  pure and never calls a logger: the fold adapter, the fuzzer, and later the
  worker host and tournament runner build `EngineLogRecord`s from what the
  engine returns. `engine.battleStarted` and the `engine.action` records,
  each with every answer it took, replay the battle from its init; the
  prompt, trigger, loop, rng, win-condition, battle-end, feasibility, and
  error records
  explain what the replay does. An `engine.feasibility` record marks where
  the feasibility search's bound, not the rules, left out a play or withheld
  an answer. Records carry instance IDs and catalog UUIDs, never names.

## Views and hidden information

- **`view(state, side)`** hides the opponent's hand contents and every deck
  order: each is a count plus the cards known to this side at their
  positions (`HiddenZoneView.known`). Every other part of the view omits or
  nulls what names a card the side cannot identify. A queued trigger's
  subject is shown only to a side that could identify it as the ability
  triggered and still can (`seesSubject`): the queue records the sides that
  could not (`QueuedTrigger.subjectHiddenFrom`), so a card drawn into a
  hidden hand and then discarded is never named as the draw trigger's
  subject (rules § Ability Types → Triggered abilities).
- **Historical plays** retain public type, subtype, all-types and copiable
  cost facts in turn order even when their card has ceased or become hidden.
  A record links to its instance only while this viewer identifies it.
  Otherwise its instance field is null. Determinization reserves fresh identities for
  anonymous historical records before dealing hidden cards, without creating
  instances for those records. Stored costs keep authoritative and simulated
  cost-bounded play counts equal. A legacy record missing its cost recovers
  it only from a visible instance in a view; a hidden or ceased legacy cost
  is unknown and matches no cost bound in simulation. Authoritative rules
  can recover a legacy cost from a live instance, so a hidden legacy record
  may have less precise simulated counts. Public type/subtype facts remain
  usable for unbounded filters in both paths.
- **Knowledge** is `state.knownTo[side]`: the cards in decks and hands that
  `side` can identify beyond what their zone shows it (public zones, and its
  own hand). Named helpers in `view/knowledge.ts` make every change to it;
  state creation, cloning and determinization build it whole, and the
  `dreamtides/no-direct-knowledge-writes` lint rule rejects any other
  production write into a state's `knownTo`, through aliases too:
  - a card keeps every side that could see it as it moves, so a public move
    into a hand or deck, or a move from a hand into a deck, stays known to
    whoever watched it;
  - a revealed card becomes known to both sides;
  - a filtered draw (`drawMatching`) delegates positional forgetting to
    `forgetFilteredDrawPositions` in `view/knowledge.ts`. The primitive proves
    whether its identifiable current source/origin and identical literal
    ability filters establish a public criterion. For an unknown selected
    card, anonymous slots before the first known match are possible removals
    when that criterion is public; hidden sources, opaque resolvers and mixed
    filters use the whole deck. Known nonmovers retain tracking exactly when
    every possible removal gives the same preceding-removal count, using the
    same anonymous-removal bounds as ordered placements below. Known selected
    cards and public unrestricted top draws have exact removal positions;
    unknown selected cards' actual positions supply no public evidence;
  - a card put on top of or on the bottom of a deck (`putInDeck`,
    `putFromTop`) stays known, at its new place, to every side that could
    see it go there, while its position remains inferable. An unshuffled
    same-deck relocation keeps known movers: public ordered placement slots
    and counts determine their new positions even among unidentified movers.
    For known nonmovers, original known mover positions bound intervals;
    their public placement slots count anonymous removals within each interval.
    With U such removals and P anonymous original slots before a known
    nonmover and Q after it, its rank is inferable exactly when
    `max(0, U-Q) === min(P, U)`. Unidentified movers' actual original indices
    do not justify positional knowledge. Original decks and viewer knowledge
    are captured before forgetting or moving. Valid deck cards have neither
    created nor reclaimed replacement status: ordinary zone entry makes
    created cards cease and sends reclaimed cards to Banished. Exact
    unfiltered top-prefix moves preserve inferable positions. The placement
    event retains movement visibility independently of final positional memory;
  - shuffling a deck (`shuffleInto`, Discover) drops every card in it out
    of both sides' knowledge (`forgetShuffledDeck`);
  - a `privateTo` prompt shows its cards to its chooser only as it opens,
    and the other side loses track of those still in a deck, whose order the
    chooser may change. A "look at the top 4" prompt reveals those cards only
    to its chooser.
  - a look at the opponent's hand (`takeFromAmong` on `opponentHand`) shows
    the looker every card in it, even when what it may take is restricted
    or nothing qualifies; the prompt offers only the eligible cards.
  - both private kinds go through `ctx.disclose`; their guarded private
    disclosures and identities exposed by published events or prompts
    survive the fold discarding the step
    ([Decisions and prompts](#decisions-and-prompts)).
- **Anonymous persistent records** are optional `state.rememberedCards[side]`,
  in first-observation order. Knowledge boundaries and event/prompt observation
  refresh only identifiable cards; blind records keep their last observed
  printing, variant and raw status, together with observed permanent fixed
  continuous changes. A previously observed fixed change keeps its provenance
  when its source becomes hidden or ceases. When its target returns public, the
  view retains this observed fixed obligation with anonymous source provenance;
  subsequent determinizations retain both its raw effect and the target's observed
  snapshot. Knowing a source alone authorizes none of its later private changes.
  A view groups blind records by owner
  as `hiddenCards`, without physical identities, zones or positions. Local member
  numbers relate captured cohorts and remembered hidden sources using observable
  history. Later private changes supply no facts for this view. Saved battles
  without the optional records have conservative anonymous knowledge.
- **`promptView(prompt, side, display)`** is a pending prompt as `side` sees
  it: its purpose names a source card only when `side` can identify it
  (`purposeView`), even for the side answering, which otherwise sees it
  whole; any other side sees only the cards it can identify.
- **Events** are judged in the state that arrives with them. Each kind's
  `privateTo` shows the whole event to one side or both.
  `eventSeenBy(event, side, state)` is the event as that side sees it:
  `null` when it is private to the other side, else the event after its
  kind's `redact`, which nulls a field naming a card the side cannot
  identify, as the view does, or hides the whole event when the view omits
  what it describes from that side. `eventVisibleTo` is whether
  `eventSeenBy` shows the side anything. The kinds that can name a hidden
  card:
  - a `pendingAbility` for a drawn card and a `cardCreated` in a hand are
    private to the side holding the hand; `feasibilityBounded` is private
    to the answering side;
  - `cardDrawn` is public, and names the card only to the drawing side, so
    the opponent sees each draw as a count and never learns the card from
    it, even when it can identify the card later in the same batch;
  - `cardDiscovered` is public, and names the card only to a side that can
    identify it, so the opponent sees that a card was discovered but not
    which;
  - `foresaw` is public, and names each kept or voided card only to a side
    that can identify it, so the opponent sees how many cards were kept and
    which were voided;
  - `cardTaken` is public, and names the card only to a side that can
    identify it in the taker's hand: both sides can when it came from a
    public zone or from the opponent's hand, which the taker looked at
    through a prompt private to it;
  - `lookedAtTop` is public, and names each looked-at card only to a side
    that can identify it, so the opponent sees how many cards the looker
    looked at; the looker learned them through its prompt private to it;
  - `cardsPlaced` is public, and names each card put on top of or on the
    bottom of a deck, or into a void, only to a side that could identify it
    as it moved (both sides for a card from a void or from play or into a
    void, the looker for a looked-at card), read from the event's own
    `seenBy`, so a later shuffle in the same step does not change it. The UI
    log keeps only an event-authorized physical printing and variant when
    both boundary views hide that card, resolving its name through the same
    UUID and dealt-variant lookup as visible cards. The same bounded identity
    lookup serves authorized `shuffledIntoDeck` IDs;
  - `shuffledIntoDeck` is public, and names each card that entered the
    shuffled deck only to a side that could identify it as it left its
    zone (both sides for a void, the holder for a hand), read from the
    event's own `from` and `seenBy` since after the shuffle neither side
    can place any card in that deck;
  - `triggerQueued`, `triggerResolved`, `winConditionMet`, `effectStarted`,
    `payableEffectRegistered`, and `noLegalTarget` name an ability's
    source (`events/sources.ts`). One whose source is a card in a hand or
    deck is private to the side holding that zone (`sourcePrivacy`). A side
    that may see it sees the source only when it can identify it there, as
    the view shows a queued trigger's or payable effect's source
    (`seesSource`): an avatar or dreamsign always, a card in a public zone
    or its own hand, or a card it has learned. So the holder of a card in
    its deck that it has not learned sees that card's triggers queue and
    resolve, and its win condition met, with the source `null`, and a
    source that has left the battle is `null` to both sides. An
    `effectStarted` whose source, or whose changed card
    (`changedInstance`), a side cannot identify is hidden from it whole, as
    the view omits that floating effect: its change can name the source's
    card (a delayed trigger's `ref.origin`) or a card in a hidden hand;
  - a `triggerQueued` that a side may see shows its subject as the view's
    queued trigger does (`seesSubject`), so the opponent sees a public
    trigger queue without the card it concerns;
  - `ceasedToExist` names the zone the card left (`from`). It is private to
    the side holding that zone when the zone is a hand or deck (rules §
    Zones → Hand);
  - `discarded` is public while the card is in the battle, in the void. It
    is private to the discarding side once a created card ceases to exist
    instead.
- **The UI renders only views.** The Phase 4.6 debug reveal switches that
  side's view to omniscient.
- **Determinization** (D22) is `engine.determinize(view, decklists, random)
  → BattleState`. The decklists are the dealt decks (`dealtDeck`):
  `DeckEntry` lists with each entry's full variant (D39). It
  deals the cards the view hides from what each decklist has left after the
  cards the view shows, keeps every known card at its known position, and
  reads nothing but the view, so states that look alike to the viewer give
  the same sample for the same draws. It draws a fresh seed (so later
  shuffles and Dreamwell cycles are sampled too) and starts empty what a view
  does not carry: queued triggers and unobserved floating effects from sources
  the viewer cannot see, the opponent's knowledge, loop history, and the
  automatic-step count. The loop on offer and the repetition in progress
  are the view's ([Loops](#loops)). Only the AI uses it.
  - Anonymous observed descriptors are assigned once to matching owner,
    printing and variant stand-ins. Status and permanent fixed continuous changes
    travel with those cards through subsequent draws and materializations. Captured
    cohorts prefer their assigned members. Visible sources remain identified,
    remembered hidden sources use their corresponding stand-ins, and an unknown or
    ceased source uses a reserved nonexistent identity whose viewed source is null.
    Descriptor fidelity reads sampled raw cards and effects independently of the
    sample's remembered copies. Observation records are bookkeeping for both
    optional-loop signatures and mandatory-cycle positions.
  - A static ability working from a hand or a deck is observed through the
    characteristics and costs it changes on cards the viewer can identify
    (RD-hv-umm2.53-2). These observations constrain hidden-source sampling,
    so after dealing, determinization
    reconciles the sample with the characteristics the view shows its cards
    having (`characteristicsView`, shared with `view`). Only when a hidden
    card has such an ability does it run: it descends on a distance (type,
    keyword, spark, and cost differences summed over the cards the view
    shows), each move swapping one such card with a hidden card of the same
    owner in its side's other hidden zone, dating it just before or after a
    keyword or base-spark change, or both, and stops at distance 0 or when
    no move brings the sample closer. Matching characteristics match each
    card's cost with X counted as 0, so the viewer's legal actions in a
    sample are those of the state it viewed, unless a cost reduction that a
    cost of 0 absorbs would lower what an X play costs there. A view
    that no deal explains, such as one whose floating effect from a source
    the viewer cannot see was left out, keeps the closest sample found. The
    reconciliation draws nothing, so a deal it leaves unchanged is the deal
    of the same draws without it. Static void-play permissions in
    `staticPlayPermissions` are projected only from sources the viewer can
    identify, with any named target also identifiable to that viewer. Their
    originating source provenance stays internal to `Layers` and is not
    included in the permission projection.

## Presentation

Every engine event kind (`events/kinds/`; each declares whether it is
private to one side and what it redacts, and the presentation reads
`eventSeenBy`) maps to an existing animation, notice, indicator, or log
line. `EVENT_PRESENTATION` in `src/battle/components/presentation-items.ts`
names each kind's presentation, and a missing kind is a type error:

- **travel:** a card changing zone or position (draw, play, discard,
  dissolve, banish, materialize, return, erode, abandon, create, copy,
  control change, prevent, reposition, figment merge, reveal) moves by the
  board's shared-layout travel, held for `BATTLE.presentation.eventDwellMs`;
- **reveal:** the opponent's play shows at reading size for the tutorial's
  reveal pacing (`opponentPlayRevealDwellMs`, which the tutorial's
  opponent plays share) over the board the previous item showed (the
  board before the batch when the play comes first), then travels to its
  destination as the next item shows its own event's board;
- **score:** a lane that scores shows the card-score announcement on its
  challenger;
- **dreamwell:** a side's Dreamwell card shows beside its status display;
- **turn:** the turn announcement;
- **notice:** an automatic answer (`promptAutoAnswered`, private to the
  answering side), a full back rank, and an ability with no legal target
  raise a brief notice;
- **status:** energy, points, spark, exhaustion, counters, durations,
  phase, and result changes show at once in the numbers, badges, and
  indicators the board renders;
- **none:** bookkeeping with no visual by design: the paired zone-exit and
  void-entry events of a move (`leftPlay`, `leftVoid`, `enteredVoid`), a
  trigger joining the queue
  (its resolution is logged), an ability finishing (`abilityResolved`,
  `pendingAbility`), and a bounded feasibility search.

The battle screen reads each applied intent's published events again,
keeps the ones the human may see, and plays their items in order. While
its feed is mounted, it registers a fold observation
(`observeEngineFolds`, `FoldObservation`): the reducer's fold copies a
detached state at each event that becomes an item (`presentedAsItem`) as
the rules emit it, up to `BATTLE.presentation.maxObservedEventStates`
copies per intent, and an event no item shows shares the latest copy, or
the state the intent started from. The copies live beside the shared fold
adapter's re-run memo, never in the slice, so they are never persisted or
hashed and never change a run. The feed reads the same slice and intent
from that adapter, whose memoized runs it reuses without running a step or
legality search again, and takes the observed states with `batchStates`.
A run the adapter memoized while nothing observed (a reload's log replay)
runs once more when an observed fold reaches it, as when a play cancelled
after a reload is retried, and its memoized events keep the states that
run observed, within the same per-intent limit.
Each item shows its own event's board (`eventBoards` in
`presentation-items.ts`), so a batch's board only moves forward in event
order and takes no input while an item plays; the opponent's plays arrive
one at a time even when the AI host has moved on, and the prompt host shows
a prompt only once the queue is idle and no notice is up
(`promptPresentable`), so an automatic answer's notice, which names what it
was chosen for, never sits over the next prompt. On those boards:

- an event before the batch's new turn shows the turn it belongs to
  (`batchTurnAt`, shared with the battle log), including a card banished
  until that turn that returns before the turn is announced;
- a card whose move the rules announce before making it (a resolving card,
  the characters of a lane that scored nothing, a created card discarded,
  dissolved, abandoned, or prevented, and a created card before its
  creator lists it in a hand, rank, or the stack) shows at its destination
  from that event on, so a resolving event card leaves the stack as it
  resolves and its effects follow, and a created hand copy shows in its
  hand at its own item; a card still resolving at a prompt stays on the
  stack until the answer's batch, whose first item shows it gone unless an
  event presented as an item names it (its bookkeeping `enteredVoid` does
  not);
- an event with no observed state (past the per-intent limit, as in a long
  loop, or folded while no feed was registered) shows the batch's final
  state in the turn `batchTurnAt` gives it.

A backlog drops its oldest travels past `maxBacklogMs` and its oldest
opponent reveals past `maxQueuedReveals`, never a turn, score, Dreamwell
card, or the item on screen. Presentation is client timing only:
the fold and the AI host never read it, and a reload shows the settled
board.

Lasting statuses get Cumulus status badges (`BattleStatusBadges`): on a
card, a change with a duration, a granted or lost keyword (a floating
change, or a keyword a static ability grants beyond the card's printed
ones, on any card the viewer can see, hand cards included), every card
status (`CARD_STATUS_BADGES`: Offering, ephemeral, played by Reclaim, and
created, except a figment, whose frame shows it), disabled triggers, and an effect lasting until a player pays; a
hand card's badges sit below its energy cost. Under a side's status
display, a banished card that returns to play, a pending cost change, a
waiting delayed ability, and an exhausted Avatar. Each badge's accessible
name says what it is and how long it lasts.

The battle log (the battle screen's log control) lists one plain-English
line per presented event, grouped by turn, from the UI copy module
(`engineBattleLogText`). Entries keep instance IDs and resolve names only
for display. The opponent's draws log one count-only line each, and a
reveal names whose hand the cards came from, since an effect may reveal
the opponent's hand. Energy an effect gains or loses, current or maximum,
logs one line naming the side and the amount: `energyChanged` carries the
actual changes and its `cause`, and a payment or the turn's refresh
(`payment`, `refresh`) shows on the energy display alone, with a Dreamwell
card's own line naming the energy it adds.

## Policy interface

`src/engine/policy/` holds the interface, the placeholder bots, and the
hosts; Phase 7 adds its bots there. The fuzzer plays both sides with the
Random policy's `randomAction` and the policy-private `PolicyRandom`
stream (`policy/random.ts`) through `InlineSource` and `engine.apply`.

```ts
type PolicyId = "random" | "greedy";
type PolicyDecision =
  | { kind: "topLevel"; decision: Decision; legal: readonly Action[] }
  | { kind: "prompt"; prompt: Prompt };
type PolicyChoice = { kind: "action"; action: Action } | { kind: "answer"; value: Answer };

interface Policy {
  readonly id: PolicyId;
  decide(view: BattleView, d: PolicyDecision, ctx: PolicyContext): { choice: PolicyChoice; trace: PolicyTrace };
}
interface PolicyContext {
  engine: Engine;                              // determinize and simulate; never the battle's state
  side: Side;
  random: PolicyRandom;                        // policy-private stream; never the battle RNG
  budget: { iterations: number; wallClockMs?: number };
  decklists: Decklists;                        // D22: each side's dealt DeckEntry list
  now: () => number;                           // the wall-clock cap's clock
}
```

**A decision is a request** (`policy/decide.ts`). `aiDecision` builds a
`PolicyRequest` from the battle slice for the side that owes the pending
decision: its `view` (of `committed`, or of the suspended step's `display`
with `promptView` of the prompt), the decision, both dealt decklists, the D23
budget (`turnPlanning` for a main decision in the side's own Day, else
`response`), and a seed of the battle seed, the side, and the **decision
key**: the prompt's id, or `<version>:<attempt>:decision`. A decision with
one legal action is `forced` and taken at once. `runPolicy` answers a request
on any engine, so the same request always gets the same answer under an
iteration budget, and no request carries hidden information.

**Random** (`policy/random.ts`) picks `randomAction` and uniformly random
legal answers. **Greedy** (`policy/greedy.ts`) samples determinizations of
its view, applies every legal action to each, resolves the stack with both
sides passing, and keeps the action whose evaluation (`AI.enginePolicy.greedy`:
victory, score difference, board spark, hand cards, energy) has the best
mean. It answers prompts with a heuristic (`policy/prompts.ts`), live and in
simulation: accept a "you may", pay an "unless" cost it can pay, the largest
number, and the cards it wants most (the opponent's most valuable for a
target, its own least valuable for a cost or discard). For a free Discover
cost (`discoverCost`) it names the highest cost at which its deck holds a
matching card (`discoverableCosts`), and the no-match ceiling only when none
does. It reads that deck from a determinization: in simulation the work
state, live one sample of its view and decklists, so the choice uses no
hidden information.

**The optional-chain bound.** Answering a non-forced prompt in an automatic
step counts as a decision, so the resolution cap never ends a
self-retriggering "you may" a policy keeps accepting.
`BattleState.automaticChoices` counts the automatic steps since the last
top-level action in which a player chose an answer; every policy declines
(`declineAnswer`: no, the fewest cards, the lowest number) once it reaches
`AI.enginePolicy.optionalChainCap`. Greedy declines only a prompt whose
role is loopable (`chain` in `policy/prompts.ts`): one where the chooser
decides how much of its own effect happens, such as a "you may" or an
optional payment. A finite role keeps its usual answer past the cap: a
fixed-count choice of which cards, a free Discover cost, or an "unless" cost
such as `preventUnlessAbandons`, whose decline lets the opposing prevent take
the chooser's card rather than ending a chain the chooser drives.

**Search branches on clones.** Phase 7's search branches at top-level
decisions on a clone of `committed`. It branches inside a step by re-running
the step from the clone with a `ScriptedSource` prefix, then falling back to
the policy. ISMCTS tree nodes are decisions of either kind. **Expert,
Planner, and ISMCTS** arrive in Phase 7.

**Live play** runs the policy in a Web Worker
(`src/battle/engine-ai/policy.worker.ts`, protocol `policy/worker-protocol.ts`).
A catalog holds functions, so the worker builds its own from the content
modules plus the battle's `CatalogManifest` (`policy/catalog-manifest.ts`):
plain definitions of every entity the battle init names, played text-less
when the content modules lack them. `createWorkerPolicyHost` boots its worker
when the battle starts, in a handshake: the worker posts `loaded` once its
message handler is installed (a message that reaches a module worker while
its modules evaluate can be lost), the host sends `init`, and the worker
answers `ready` once its engine is built. The host holds each request until
the worker is ready. A request fails when the worker reports it failed,
crashes, fails to boot within `workerBootTimeoutMs`, or leaves it unanswered
past its wall-clock budget plus `workerGraceMs`, counted from when the host
sends it, so a slow boot never times a decision out. After a missed
deadline the host terminates the worker and boots a replacement at once, so
the next decision finds a warm worker; after a crash or failed boot, the
next request starts a fresh one. Each boot logs one `ai.workerBoot` line:
the worker's ordinal, its cause, its outcome, and its milliseconds.

**The AI host** (`src/battle/engine-ai/`) drives the enemy of every journey
battle: `useEngineAi` feeds each fold to an `EngineAiDriver`, which asks the
worker host and submits the answer as a `BATTLE_ACTION` or `BATTLE_ANSWER`
intent with the `ai:` actor and an intent key naming the decision. A failed
request is answered by Random on the main thread; an answer for a decision
the fold has left is discarded; a bounced intent is submitted again only
after the fold changes. Live play submits each answer in a main-thread task
of its own (a waiting submission yields to the update of any newer fold),
so folding and presenting the AI's next intent never shares a task with
presenting the last. The
log holds the AI's intents, so a replay never
runs the AI, and a reload asks again with the same seed. Each decision logs
one `ai.decision` line: the policy, its source (worker, forced, fallback),
the budget and what it used, the round trip, the determinization count, the
top candidates with their scores and visits, and the choice. The policy is
Greedy unless `?ai=random|greedy` selects one.

## Testing layers

- **Primitive and rules tests:** `src/engine/**/*.test.ts`, using synthetic
  definitions from `src/engine/testing/` (`synthetic-cards.ts`, with the
  reserved `5e5e5e5e-` UUID prefix, and the per-area fixture modules:
  `dsl-cards.ts`, `stack-cards.ts`, `trigger-cards.ts`,
  `continuous-cards.ts`, `zone-cards.ts`, `loop-cards.ts`,
  `synthetic-effects.ts`). These are test fixtures, not catalog content.
  `boardState` (`testing/board.ts`) builds a committed state with cards
  placed directly.
- **Prompt properties** (`fold/fold.test.ts`, with empty candidate sets in
  `fold/fold-prompts.test.ts`): the core of Phase 3.3.
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
- **Scenario specs** (`testing/scenario.ts`, `runScenario`): a board, the
  top-level actions in order, and scripted answers to every non-automatic
  prompt, run through `engine.apply` with a `ScriptedSource`. It fails if a
  prompt has no scripted answer or answers are left over. Primitive tests call
  it directly. Phase 5 writes at most one scenario module per content bead, per D20:
  `src/content/specs/<bead-key>.scenarios.ts`, a plain module whose default
  export is a `ScenarioModule`, a slug and its `NamedScenario`s, each a name,
  a spec, and a `check` on the result. `src/content/specs/index.ts` discovers
  every module (`import.meta.glob`, in slug order), so a bead edits no shared
  list, and one test file, `src/content/specs/specs.test.ts`, runs
  each discovered scenario as its own named case through `runNamedScenario`
  (`src/content/specs/runner.ts`), so the whole phase pays one file's module
  import ([D19](decisions.md#d19-test-pruning)). Like every engine and
  content test, it runs in the `node` environment:

  ```ts
  // src/content/specs/<bead-key>.scenarios.ts
  export default {
    slug: "<bead-key>",
    scenarios: [{
      name: `${dissolver.id} dissolves the chosen enemy`,
      spec: {
        board: { active: "player", phase: "day", player: { hand: [dissolver.id], energy: 2, deck },
                 enemy: { back: [vanilla2.id, vanilla3.id], deck } },
        steps: (ids) => [playFromHand(ids, "player")],
        answers: (ids) => [[ids.enemy.back[1]!]],    // the dissolve target
      },
      check: ({ state, ids }) => expect(state.sides.enemy.void).toContain(ids.enemy.back[1]),
    }],
  } satisfies ScenarioModule;
  ```

- **Fuzz invariants** (`npm run fuzz:engine -- --games N [--seed]
  [--first] [--interactive-every 10]`, `testing/fuzz.ts`): seeded games with
  random decks mixing the synthetic fixtures with the production catalog (a
  tenth of the entries amplified), the Random policy on both sides. Every Nth
  game is replayed through the fold, suspending at every prompt, and must
  match the inline game's final state, events, and fingerprints; every game
  is replayed inline to the same final hash. After every step
  (`invariantViolations`, `testing/invariants.ts`), it asserts:
  - zone conservation and agreement between zone lists and instance zones;
  - rank capacities;
  - non-negative energy, score, spark, and effective cost;
  - priority held exactly while the stack is non-empty;
  - no floating effect outliving its cards, payable effect, or source;
  - memoized characteristics equal to a fresh evaluation;
  - every card a step creates, removes, moves, or changes the status of, and
    every effect that begins or ends, named by a published event the right
    sides can see (`testing/announced-changes.ts`);
  - a loop run or offer only where it belongs;
  - knowledge only of cards in decks and hands, and view redaction;
  - serialization round-trip.

  At every prompt it checks the prompt's redaction (`testing/redaction.ts`).
  After every step it also checks event redaction (`EventRedaction`,
  `testing/redaction.ts`): each event a side may see, as that side sees it
  (`eventSeenBy`, with per-viewer field redaction applied), names no
  instance ID or printed card ID that side cannot identify (`identifies`,
  `view/knowledge.ts`) before or after the step, or that it saw earlier in
  the step. A side sees a card that enters its own hand, that it looks at on
  top of its own deck, that enters either void, or that is revealed to both
  sides; the card stays seen for the rest of the step until a shuffle ends
  tracking (a card drawn, eroded or revealed, and then shuffled back into a
  deck, was seen by that side). An instance that has left the battle is
  judged in the last checked state that held it. The
  interactive replay applies the same check to the events a suspended step
  has published, against its display.

  Every 10 steps, at the next top-level decision, it checks
  determinization fidelity (`determinizationDivergences`,
  `testing/determinization-fidelity.ts`): for each side, a seeded
  `determinize(view(state, side), decklists)` must agree with the real
  state on that side's legal actions, in order; on the full record,
  raw status included, of every card on the stack, in play, in a void, or
  banished; on every floating effect that names only cards the side can
  identify (a play permission whatever its source, any other effect only
  from a source the side sees); and on the payable effects, a source the
  side cannot see aside. A failure names the step and the instance IDs,
  effect IDs, and printed UUIDs that differ. The fuzz-only fixture
  `FIDELITY_CARDS` (`testing/fuzz.ts`) grants a play permission and then
  hides its source, a state content rarely reaches. The 12 mid-game samples
  in `view/determinize.test.ts` run the same check and compare whole views
  through its `comparableView`. Games must terminate. A failing game writes its engine log to
  `logs/fuzz/<run-id>/<game>.jsonl`. Phase 4.5 adds Greedy, and Phase 5 adds
  random transfigurations and deck-entry modifications.
- **The card-lab setup solver** (`testing/lab-solver.ts`) is shared by
  specs, the card-lab scene (Phase 4.6), and the sweep. It synthesizes a
  minimal legal board for an entity from its selectors and costs. A staged
  target's ✦ and cost admit an X the play can choose, for an X-valued bound
  on a card with an energy X cost. It places synthetic vanilla cards, then
  pool cards without authored abilities, and an authored card only when no
  other card matches, such as a subtype only authored cards carry. A card
  with a stack target answers an opener: without a declared board, the
  opposing side is active in its Day and the lab plays its synthetic opener
  (a vanilla character or a plain event, by the stack selector) before the
  card, and a Prevent's "unless the opponent abandons" choice gets a matching
  character on the opposing side. Per-entity
  overrides live in `src/engine/testing/lab-overrides.ts`.

## Performance targets

These are monitored in `docs/plan/evidence/metrics.md` and never gated.
`scripts/bench-engine.ts` measures them, and the fuzzer reports games per
second of wall and of CPU time. A change's effect on them is measured
against its base commit with `npm run perf:ab` (`scripts/perf-ab.ts`;
[workflow § Validation ladder](workflow.md#validation-ladder)): interleaved
base and head rounds of either workload, with wall time, CPU time, and load
per round:

- Random-policy full battles: ≥ 20 per second per core in Node.
- A median step: < 50 µs. Clone plus hash: < 20 µs.
- An interactive re-run per answer: < 2 ms for the largest step in fuzz games.
- The Planner's iteration budget fits 1.5 s on a mid-range laptop, using 3×
  the M5 Max time as the proxy.
