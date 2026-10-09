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
  Web Worker (the policy host, Phase 4.5).
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
batches then add files instead of editing central switches.

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
  testing/     synthetic cards, board builder, scenario specs, card-lab setup solver,
               fuzz harness, Random policy, invariants, redaction checks
src/content/   typed catalogs (D32) with co-located abilities (D5)
  cards/ dreamsigns/ avatars/ dreamwell/ figments/
  battle.ts, dreamwell-rules.ts, opponents.ts, ai.ts, atlas.ts, apollyon.ts, …   data modules
```

`src/engine/policy/` (the Policy interface, Greedy, the worker host, and the
Phase 7 bots) arrives with Phase 4.5.

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
([below](#fold-integration)). Phase 4.1 wires it into the journey fold.

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
                                       // extraTurns (last element first, C8), challengeLane, beginning
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
  turnLog: TurnLog;                    // cards each side played (with their characteristics) and drew this turn
  nextEffect: number;                  // next effect number to mint (e1, e2, …)
  oncePerTurn: OncePerTurnKey[];       // `<source key>#<ability index>`, cleared as each turn begins
  dreamwell: DreamwellState;           // the prebuilt shared deck, the next index, and its catalog
  challenge: { challengers: InstanceId[]; blockers: Record<InstanceId, InstanceId> } | null;
  automaticSteps: number;              // automatic steps since the last top-level decision
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
            reclaimed: boolean; offering: boolean; ephemeral: boolean;
            x: number | null };        // X paid to play it, kept while in play (variable spark)
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
the loop limits ([Loops](#loops)), `autoAnswerForcedPrompts`, and the
Dreamwell construction rules (`config.dreamwell`). `initialState`
(`state/create.ts`) fills the config once from `src/content/battle.ts`,
`src/content/dreamwell-rules.ts`, and the `BattleInit`'s score target and
starting side, so a serialized state determines its own replay. The
next-battle effects (D39) join `BattleInit` in Phase 4.1.

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
  | { kind: "play"; card: InstanceId; from: "hand" | "void"; slot?: Slot }  // void: by Reclaim
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

function runStep(start, step, source, catalog, options?: { prefix?, dryRun?, automatic?, replay? }): StepResult {
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
  - Clears `inFlight` and advances `attempt`.

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
  fold publishes only new events. With `checkEventPrefix` (development), it
  compares each re-run with the same step's previous answer prefix; a
  mismatch, like any replay failure, becomes an `engine_error` that keeps
  `committed`.
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
- The search is depth first and stops after
  `BattleConfig.feasibilitySearchRuns` runs (`BATTLE.feasibilitySearchRuns`).
  A search that runs out proves nothing: the candidate is left out and
  listed in `LegalMoves.bounded`, which the fold logs as an
  `engine.feasibility` record.

The common case costs one run, as the first path pays. Results are memoized
in the engine's `LegalityMemo`, a `WeakMap` keyed by the state object
(committed states are never mutated, so an entry never goes stale), per side.
The fold shares the engine's memo; it is never persisted.

**A legal play can always be paid along whatever path its player answers.**
A step with a commit point (`hasCommitPoint`: `play`, `activate`) runs with a
guard that narrows each prompt raised before the commit point to the answers
a search proves:

- The guard examines the prompt's answers in `legalAnswers` order, at most
  `feasibilitySearchRuns` of them, searching from each.
- The narrowed prompt states its legal set in its own fields where they can:
  fewer candidates, tighter bounds, a mode marked not legal. Otherwise it
  lists the legal answers in `allowed`. A prompt whose every answer is
  feasible is unchanged, fingerprint included.
- An answer withheld only because its search ran out, or because the guard
  stopped examining, emits a `feasibilityBounded` event (private to the
  answering side, logged as `engine.feasibility`).
- `isLegalAnswer`, `forcedAnswer`, `randomLegalAnswer`, and the fingerprint
  read the narrowed prompt, so a stale or dead-end answer bounces as
  `illegalAnswer`, a recorded one fails replay, and one feasible answer is
  answered automatically.

The guard's searches replay the answers given so far against the prompts as
rules code raised them (`Context.rawAnswers`). The witness path that made the
play legal stays within budget at every prompt, so a narrowed prompt is never
empty for a play legality offered. Narrowing is a deterministic function of
the committed state and the answers, so an inline run, a fold re-run, a
reload, and a loop replay see the same prompts.

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
  | { kind: "chooseMode"; options: { mode: number; legal: boolean }[] }
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
8. **Ending.** The hand-limit prompt (P6). Then ephemeral and offering
   banishes. Then "until end of turn" expiry and F3 returns. Then exhaust
   clears for everything, avatars included.

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
`winTheGame` emits one naming its card as it resolves. Each is logged as
`engine.winCondition`. A suspended step has no check until it completes.

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

- **Prevent** (`preventCard`, `rules/stack.ts`) removes a card from the
  stack, and the card goes to its owner's void, or to the destination the
  effect names: the top of its owner's deck, its owner's hand, or the
  preventer's hand. Created cards cease to exist; reclaimed cards are
  banished. "Unless the opponent pays N●" asks the prevent effect's
  opponent with a `payOrDecline` prompt.
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
  moves. Nothing triggers before the first turn begins or after the battle
  ends.
- **Trigger events.** `TRIGGER_EVENTS` lists the engine event kinds each
  trigger kind can match. A new `Trigger` member fails to type-check until
  it has an entry, the matcher refuses a match on an unlisted event, and
  events no trigger lists skip the matcher.
- **Shape.** A `TriggeredAbility` is `{ trigger, effect, zone, condition?,
  oncePerTurn? }`. A queued trigger records its source, controller, origin
  (card variant, figment, or emblem), ability index, floating-trigger node,
  and `subject`, the card the event concerns, so it resolves even after its
  source moves or ceases to exist. A "when … gains ✦" trigger also records
  `gain`, the matched gain's amount and expiry, which the trigger's effect
  reads as `env.gain`, the view shows, and `triggerQueued` logs.
- **Ordering.** Matches enqueue in event order. Simultaneous matches use the
  fixed order: the active side first; within a side, avatar → dreamsigns →
  characters, B0→B9 then F0→F8. Cards in other zones follow, ordered by zone
  (void, hand, deck) and then by instance number; a card leaving play is
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
  (`OncePerTurnKey`, which covers emblems), and cleared as each turn begins.
- **Floating triggers** (`floating`) are "until end of turn, when…".
  **Delayed triggers** (`delayed`) are one-shot "the next time…" floating
  triggers with `once: true`. Both are `floatingTrigger` nodes, and their
  floating record stores an `EffectRef` (origin, ability, and node index in
  `everyNode`) into the catalog definition, so state stays plain data.
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
   [below](#deck-entry-modifications)) join this layer in Phase 5 (5.7a,
   5.7b).
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

Cost kinds (`dsl/types.ts`, built in `dsl/builders.ts`; paid in
`rules/costs.ts`):

- energy: Fixed, X, or Fixed+X (`energy`, `energyX`);
- ☾ (`exhaustSelf`; back-rank characters and avatars only);
- discard;
- abandon;
- banish from void;
- reveal from hand;
- counters;
- a choice between costs ("A or B", `choiceCost`);
- optional additional costs (`optionalCost`);
- Offering's banish from hand, by the Offering route.

**Cost choices are play-time prompts** before `commitPoint()`: which
alternative to pay, whether to pay the optional cost, which cards to discard,
abandon, reveal, or banish. Payment happens after the commit point, all of it
before the item goes on the stack. Copies don't pay.

**X legality** comes from the definition's range, which defaults to `min: 1`.
Widen it to 0 only when X=0 does something meaningful.

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
primitive, and `resolve`. A primitive holding a character or card reference
declares it with the `characterTarget` or `cardTarget` helper. The registry
finds each definition by that name at call time. `primitives/index.ts` lists one `export *` line
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

**Primitive catalog.** The registered primitives and DSL builders, by group,
with the ones Phase 5 adds as content batches need them, each with tests.

| Group | Registered | Phase 5 |
| --- | --- | --- |
| Resources | `gainEnergy`, `gainMaxEnergy`, `gainPoints` (either player) | `doubleEnergy`, `store`, `spendCounters` |
| Cards | `draw` (ephemeral), `discard`, `discardRandom`, `foresee`, `erode`, `createCopyInHand` (ephemeral) | `draw` at cost 0, `discover`, `lookAtTop(n, distribute)`, `reveal`, `shuffleInto`, `putOnTop`/`Bottom` |
| Characters | `dissolve`, `banish`, `banishUntil(duration)`, `returnToHand`, `materializeFigments(figment, n, spark)`, `materializeFigmentCopy` (C5), `gainSpark(duration)`, `gainAdditionalSpark` (C17), `setBaseSpark`, `sparkModifier`, `awaken`, `exhaust`, `gainControl`, `grant`/`loseKeyword`, `giveAllTypes`, `triggerAbility`, `disableTriggers(while)`, `phase` (Phasing) | `abandon(chooser, predicate)`, `materialize(from, selection)`, `rematerialize`, `move(slotRule)` |
| Costs | `costModifier(player, filter, amount, { next, duration })` | |
| Stack | `prevent(selector, { unlessPays, destination })`, `copyCard` (D15) | copying more than once |
| Flow | `sequence`, `chooseOne(modes)`, `ifThen(Else)`, `repeat`, `optional`, `forDuration`, `floating(when…)`, `delayed(next…)` | `forEach`, `eachPlayer`, `takeExtraTurn` (C8) |
| Selectors | characters (`CharacterSelector`: controller, subtype, ✦ bounds, `costAtMost`, exhausted, rank, "another"); `supported` (C9); stack cards (`stackItem`); card filters (type, subtype); players (`you`, `opponent`) | figment or not |
| Values | constant, `x`, `count(selector)`, hand size, `supporting` (C9), `times`, `lockedAtResolution` | stored counters, turn counters |
| Durations | `permanent`, `untilEndOfTurn`, `untilYourNextTurn`, `untilNextDay`, `whileSourceInPlay`, `untilOpponentPays(cost)` (C7) | |
| Conditions | `controls`, `energyAtLeast`, `costPaid`, `sourceIn`, `cardsIn` (`noCardsIn(zone, player)`) | |
| Victory | `winCondition(condition)` (an ability: "If …, you win the game" on a card in play or emblem), `winTheGame` (a resolving effect) (C15) | |
| Triggers | `onMaterialized`, `onDawn`, `onDusk`, `onNight`, `onChallenge`, `onDissolved`, `whenYouPlay(filter, nth?)`, `whenOpponentPlays`, `whenMaterialize`, `whenDraw`, `whenDiscard`, `whenAbandon`, `whenLeavesPlay`, `whenScores`, `whenOpponentScores`, `whenLeavesVoid`, `whenYouChallengeWith(n, selector)` (C10), `atStartOfTurn`, `atStartOfFirstTurn`, `either` | |

Dreamsigns and avatars use the same DSL as emblem abilities (P4). Dreamwell
cards use event-like abilities; a drawn Dreamwell card applies only its
`energyAdded` until Phase 5 authors its bonus. Figments are catalog entries.

## Transfigurations

Phase 5.7a builds these transforms; the engine `Variant` carries only the
amplified flag until then. Each transfiguration is a pure transform of an
entity's abilities, with an eligibility predicate.

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
Phase 4.1 plumbs each deck entry's full variant and the next-battle effects
into `BattleInit`, and Phase 5.7b applies them; today `Variant` and
`DeckEntry` carry only the amplified flag. The full variant:

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
- **Undeclared targets.** Every play-time target spec a primitive holds is
  declared by its `targets` hook (`undeclaredAbilityTargets`,
  `testing/target-audit.ts`), so play-time choices never miss one.
- **Static references.** No static ability holds a play-time target,
  stack target, or triggering-card (`subject`) reference anywhere in its
  tree: the layer evaluation has no chosen target or triggering event to
  read.
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

- **RNG** (`state/rng.ts`) uses named streams:
  - `shuffle:<side>`;
  - `dreamwell`;
  - `random:<purpose>` (`random:discard`).

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
- **The UI renders only views.** The Phase 4.6 debug reveal switches that
  side's view to omniscient.
- **Determinization** (D22) is `engine.determinize(view, decklists, random)
  → BattleState`. The decklists are `DeckEntry` lists with each entry's
  variant (D39; today the amplified flag). It
  deals the cards the view hides from what each decklist has left after the
  cards the view shows, keeps every known card at its known position, and
  reads nothing but the view, so states that look alike to the viewer give
  the same sample for the same draws. It draws a fresh seed (so later
  shuffles and Dreamwell cycles are sampled too) and starts empty what a view
  does not carry: queued triggers and floating effects from sources the
  viewer cannot see, the opponent's knowledge, loop history, and the
  automatic-step count. Only the AI uses it.

## Presentation

Phase 4.4 builds this. Every engine event kind (`events/kinds/`; each
declares whether it is private to one side) maps to an existing animation,
particle, or log line:

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

Phase 4.5 builds `src/engine/policy/` with this interface, the worker host,
and Greedy; Phase 7 adds the bots. Today the fuzzer's Random policy
(`testing/random-policy.ts`, with the policy-private `PolicyRandom` stream)
plays both sides through `InlineSource` and `engine.apply`.

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
  decklists: Decklists;                        // D22: each side's DeckEntry list, as determinize reads it
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
  definitions from `src/engine/testing/` (`synthetic-cards.ts`, with the
  reserved `5e5e5e5e-` UUID prefix, and the per-area fixture modules:
  `dsl-cards.ts`, `stack-cards.ts`, `trigger-cards.ts`,
  `continuous-cards.ts`, `zone-cards.ts`, `loop-cards.ts`,
  `synthetic-effects.ts`). These are test fixtures, not catalog content.
  `boardState` (`testing/board.ts`) builds a committed state with cards
  placed directly.
- **Prompt properties** (`fold/fold.test.ts`): the core of Phase 3.3.
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
  prompt has no scripted answer or answers are left over. Primitive tests use
  it today; Phase 5 writes one file per content batch,
  `src/content/specs/<batch-slug>.spec.ts`, per D20. Like every engine and
  content test, they run in the `node` environment
  ([D19](decisions.md#d19-test-pruning)):

  ```ts
  const { state, ids } = runScenario(engine, {
    board: { active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
             enemy: { back: [vanilla2.id, vanilla3.id], deck } },
    steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }],
    answers: (ids) => [[ids.enemy.back[1]]],    // the dissolve target
  });
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
  - a loop run or offer only where it belongs;
  - knowledge only of cards in decks and hands, and view redaction;
  - serialization round-trip.

  At every prompt it checks the prompt's redaction (`testing/redaction.ts`).
  Games must terminate. A failing game writes its engine log to
  `logs/fuzz/<run-id>/<game>.jsonl`. Phase 4.5 adds Greedy, and Phase 5 adds
  random transfigurations and deck-entry modifications.
- **The card-lab setup solver** (`testing/lab-solver.ts`) is shared by
  specs, the card-lab scene (Phase 4.6), and the sweep. It synthesizes a
  minimal legal board for an entity from its selectors and costs. Per-entity
  overrides live in `src/engine/testing/lab-overrides.ts`.

## Performance targets

These are monitored in `docs/plan/evidence/metrics.md` and never gated:

- Random-policy full battles: ≥ 20 per second per core in Node.
- A median step: < 50 µs. Clone plus hash: < 20 µs.
- An interactive re-run per answer: < 2 ms for the largest step in fuzz games.
- The Planner's iteration budget fits 1.5 s on a mid-range laptop, using 3×
  the M5 Max time as the proxy.
