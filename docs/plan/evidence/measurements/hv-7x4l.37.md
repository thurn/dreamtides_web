# hv-7x4l.37 measurements: adversarial test validation of the engine core

The `adversarial-test-validation` pass of the Phase 3 gate (3.12 step 2), run
2026-10-09 on base `b20630f26`. Each mutation was one realistic rules
regression, injected alone into production code, checked against the whole
engine suite (`vitest run src/engine`, 27 files), and then reverted with
`git checkout -- <file>`. Every survivor got a regression test, verified to
fail with the mutation applied and to pass without it; the final production
diff is empty.

## Summary

| Area | Injected | Rejected (equivalent) | Valid | Killed initially | Survived → test added |
| --- | --- | --- | --- | --- | --- |
| Step runner and prompt protocol (`steps/`, `prompts/`, `fold/slice.ts`, legality dry run) | 47 | 3 | 44 | 32 | 12 |
| Stack, priority, and timing windows | 11 | 3 | 8 | 7 | 1 |
| Triggers | 10 | 0 | 10 | 9 | 1 |
| Durations and the turn machine | 10 | 0 | 10 | 10 | 0 |
| Continuous effects | 5 | 0 | 5 | 4 | 1 |
| Zones and zone changes | 9 | 0 | 9 | 9 | 0 |
| Loops | 7 | 0 | 7 | 5 | 2 |
| **Total** | **99** | **6** | **93** | **76** | **17** |

- After this bead the engine suite kills all 93 valid mutations, including
  all 44 in the step runner and prompt protocol.
- **No production bug was found.** Every survivor was a missing or weak test
  of behavior the code already gets right.
- **Survivors by area.**
  - Step runner and prompt protocol (12):
    - an answer source's answer is not validated (SR03);
    - `cancellable` set after the commit point (SR04) or on the
      opponent's prompt (SR05);
    - a loop replay asks the source for an unrecorded prompt (SR06);
    - a top-level attempt does not advance the attempt counter, so a failed
      attempt's prompt id matches the next attempt (FP05);
    - four `isLegalAnswer` checks (PA01, PA03, PA04, PA05);
    - three fingerprint fields (PF01–PF03).
  - Stack: the side without priority gets actions (ST08).
  - Triggers: triggers matching the opening-hand draws (TR07).
  - Continuous effects: spark not clamped at 0 (CE02). The existing clamp
    test's sum never went below 0.
  - Loops: a cycle-detection window that never grows (LP01), and a repeat
    count of exactly the cap rejected (LP05).
- **Latent contracts.** SR04 and SR05 cannot be reached by current content:
  every play-time prompt is the actor's, and no play or activate step
  prompts after its commit point. They are tested as engine-design
  contracts, through a synthetic fixture (SR05) and the step context (SR04).
- **Hangs.** SR07 (a forced answer recorded as a choice) and SR15 (no
  mandatory-cycle check) also hang tests in their synchronous trigger
  cycles, which vitest cannot time out. Each is still killed by an ordinary
  failing assertion, named below.
- **Rejected mutations** are equivalent at the engine's public boundary. They
  are listed with their reason and not counted as valid.

## Mutations

Paths are relative to `src/engine/`; tests are named by file, `describe`, and
test name.

### Step runner and prompt protocol

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| SR01 | `steps/context.ts:58` | replayed prompt fingerprint not compared with the recording | `fold.test.ts` suspension > detects a nondeterministic step on replay and leaves the committed state untouched (and other tests) |
| SR02 | `steps/context.ts:61` | recorded answer not validated on replay | `fold.test.ts` corrupt in-flight records > reports a reloaded divergent, illegal, complete, or overlong recorded prefix as an engine error |
| SR03 | `steps/context.ts:78` | answer from the source is not validated | SURVIVED → `fold.test.ts` answers from an answer source > rejects an illegal answer from the source and leaves the committed state untouched |
| SR04 | `steps/context.ts:42` | prompt after commit point still cancellable | SURVIVED → `fold.test.ts` answers from an answer source > marks only the cancelling side's prompts before the commit point cancellable |
| SR05 | `steps/context.ts:42` | opponent's prompt inside actor's play is cancellable (side check dropped) | SURVIVED → `fold.test.ts` cancellation > lets only the acting side cancel, never the opponent answering a prompt in its play |
| SR06 | `steps/context.ts:67` | loop replay asks the source for an unrecorded prompt instead of throwing UnrecordedPrompt | SURVIVED → `loops.test.ts` optional loops > stops when a replayed action raises a prompt its recording does not answer, leaving the choice to its player |
| SR07 | `steps/context.ts:75` | forced answers recorded as player choices (auto flag lost) | `fold.test.ts` suspension > answers a forced prompt automatically and records it (and `loops.test.ts` "keeps a cycle mandatory when its only prompt is a forced choice" hangs) |
| SR08 | `steps/context.ts:52` | privateTo cards not revealed to the chooser | `core.test.ts` replay > plays seeded random games with no invariant violation, and replays each to its final hash (and other tests) |
| SR09 | `steps/context.ts:56` | replay reads prefix from wrong index (off by one) | `continuous.test.ts` cost modifications > survive a reload while a discounted play waits at its X prompt, and use the modifier up once (and other tests) |
| SR10 | `steps/runner.ts:60` | suspended step displays the committed state, not the intermediate one | `fold.test.ts` inline and interactive equivalence > reproduces final states, events, and fingerprints when suspending at every prompt |
| SR11 | `steps/runner.ts:77` | resolution cap off by one (>=) | `loops.test.ts` mandatory loops > ends a cycle that never repeats a state in a draw at the resolution cap |
| SR12 | `steps/runner.ts:72` | a player choice no longer resets the automatic-step run | `loops.test.ts` mandatory loops > counts a choice answered through the fold after a suspension, and keeps a late repeat's detection across reloads (and other tests) |
| SR13 | `steps/runner.ts:67` | state-based victory check skipped after a step | `loops.test.ts` optional loops > offers a loop that gains for its player and repeats it until victory (and other tests) |
| SR14 | `steps/runner.ts:83` | version not advanced by a completed step | `fold.test.ts` suspension > alternates prompts between sides within one step |
| SR15 | `steps/runner.ts:75` | mandatory cycle check skipped | `loops.test.ts` mandatory loops > detects a repeat that begins late in a run, before the resolution cap (and the exact-repeat cycle tests hang to the 100,000-step cap) |
| SR16 | `steps/driver.ts:75` | triggers drain before an accepted loop's iterations | REJECTED: equivalent: an accepted loop's iterations drain their own triggers, so the queue is empty whenever a repetition is running |
| SR17 | `steps/driver.ts:81` | auto-pass resolves top before checking for a decision (holder with responses is skipped) | `stack.test.ts` prevent > lets the opponent pay to keep the card, or decline and lose it (and other tests) |
| SR18 | `steps/kinds/play.ts:39` | play step cancellable by the opponent instead of the actor | `flow.test.ts` flow primitives > chooseOne chooses its mode at play time, before the commit point and before targets (and other tests) |
| FP01 | `fold/slice.ts:347` | answer intent with a stale prompt id is accepted | `fold.test.ts` intent bounces and the hand limit > bounces stale, foreign, illegal, and out-of-turn intents (and other tests) |
| FP02 | `fold/slice.ts:348` | the other side may answer a prompt | `fold.test.ts` intent bounces and the hand limit > bounces stale, foreign, illegal, and out-of-turn intents (and other tests) |
| FP03 | `fold/slice.ts:349` | illegal answer is recorded instead of bounced | `fold.test.ts` constrained arrangements > rejects both cards on top for one on top and one on the bottom, and applies a legal split (and other tests) |
| FP04 | `fold/slice.ts:370` | non-cancellable prompt can be cancelled | `fold.test.ts` cancellation > rejects a cancel after the commit point |
| FP05 | `fold/slice.ts:138` | opening an in-flight step does not advance the attempt counter | SURVIVED → `fold.test.ts` prompt ids after a failed attempt > bounces an answer to a failed attempt's prompt after a new attempt from the same state |
| FP06 | `fold/slice.ts:281` | re-run republishes the events already handed to presentation | `fold.test.ts` inline and interactive equivalence > reproduces final states, events, and fingerprints when suspending at every prompt (and other tests) |
| FP07 | `fold/slice.ts:292` | suspended slice forgets how many events were published | `fold.test.ts` constrained arrangements > rejects both cards on top for one on top and one on the bottom, and applies a legal split (and other tests) |
| FP08 | `fold/slice.ts:162` | re-run memo keyed by the step only, ignoring answers | `continuous.test.ts` cost modifications > survive a reload while a discounted play waits at its X prompt, and use the modifier up once (and other tests) |
| FP09 | `fold/slice.ts:335` | battle action accepted from the side without the decision | `fold.test.ts` intent bounces and the hand limit > bounces stale, foreign, illegal, and out-of-turn intents (and other tests) |
| FP10 | `fold/slice.ts:337` | illegal battle action not bounced | `loops.test.ts` optional loops > runs a repetition through the fold, matching the inline result, and bounces a stale offer |
| FP11 | `fold/slice.ts:374` | cancel keeps the in-flight step | `fold.test.ts` cancellation > restores the committed state when cancelled before the commit point (and other tests) |
| FP12 | `fold/slice.ts:120` | prompt id omits the answer count | `fold.test.ts` suspension > alternates prompts between sides within one step |
| FP13 | `fold/slice.ts:130` | engine error keeps the in-flight step instead of clearing it | `fold.test.ts` cancellation > restores the committed state when cancelled before the commit point (and other tests) |
| PA01 | `prompts/answers.ts:43` | duplicate targets accepted | SURVIVED → `answers.test.ts` answer validation > rejects a repeated selection, an illegal mode, a number out of bounds, and paying an unpayable cost |
| PA02 | `prompts/answers.ts:45` | answers outside the candidates accepted | `fold.test.ts` corrupt in-flight records > reports a reloaded divergent, illegal, complete, or overlong recorded prefix as an engine error |
| PA03 | `prompts/answers.ts:52` | illegal mode accepted | SURVIVED → `answers.test.ts` (same answer-validation test) |
| PA04 | `prompts/answers.ts:58` | chooseNumber upper bound not checked | SURVIVED → `answers.test.ts` (same answer-validation test) |
| PA05 | `prompts/answers.ts:66` | paying an unpayable cost accepted | SURVIVED → `answers.test.ts` (same answer-validation test) |
| PA06 | `prompts/answers.ts:109` | up-to-N prompt with exactly N candidates auto-answered with all of them | `characters.test.ts` character primitives > gainSpark until end of turn expires during Ending; permanent spark stays |
| PA07 | `prompts/answers.ts:129` | payOrDecline auto-declined even when payable | `stack.test.ts` prevent > lets the opponent pay to keep the card, or decline and lose it |
| PA08 | `prompts/answers.ts:78` | a prompt needing more candidates than exist counts as answerable | `core.test.ts` replay > plays seeded random games with no invariant violation, and replays each to its final hash (and other tests) |
| PA09 | `prompts/answers.ts:23` | arrangement may name the same card twice | REJECTED: equivalent: equal length plus every prompt card present already rules out a repeated card |
| PA10 | `prompts/answers.ts:113` | chooseMode forced only when a single option exists (legal flag ignored) | `flow.test.ts` flow primitives > a mode whose required target has no candidate is not legal (and other tests) |
| PF01 | `prompts/fingerprint.ts:10` | fingerprint ignores the answering side | SURVIVED → `answers.test.ts` answer validation > fingerprints each identifying field: side, privacy, bounds, options, and payability |
| PF02 | `prompts/fingerprint.ts:14` | fingerprint ignores selection bounds | SURVIVED → `answers.test.ts` (same fingerprint test) |
| PF03 | `prompts/fingerprint.ts:31` | fingerprint ignores payOrDecline payability | SURVIVED → `answers.test.ts` (same fingerprint test) |
| PS01 | `prompts/structure.ts:31` | malformed chooseNumber bounds (min>max) not detected | `fold.test.ts` prompt validation in the step context > treats a malformed prompt, including duplicate candidates a forced answer would accept, as an engine error (and other tests) |
| LG01 | `rules/legality.ts:85` | legality memo ignores the side | REJECTED: equivalent: legal moves are computed for one side per state (the decision holder) |
| LG02 | `rules/legality.ts:48` | dry run treats an empty required prompt as feasible | `core.test.ts` replay > plays seeded random games with no invariant violation, and replays each to its final hash (and other tests) |

### Stack, priority, and timing windows

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| ST01 | `rules/timing.ts:90` | interrupt may respond to its own side's item | `stack.test.ts` timing windows > 'active' side in 'day' with 'ownTop' stack may use [] (and other tests) |
| ST02 | `rules/timing.ts:79` | standard speed allowed in the active side's Night | `stack.test.ts` timing windows > 'active' side in 'night' with 'empty' stack may use [ 'fast', 'interrupt' ] (and other tests) |
| ST03 | `rules/timing.ts:68` | non-active side gets a Fast window in the active side's Night | REJECTED: equivalent at the API: `legalActions` and the fold gate on the main-window side first |
| ST04 | `steps/kinds/resolve-top.ts:88` | after resolution, priority goes to the opponent of the resolved item's controller | `stack.test.ts` D13 priority > follows the worked example: each pass resolves the top item and hands priority to its controller (and other tests) |
| ST05 | `steps/kinds/play.ts:93` | after a play the actor keeps priority | `stack.test.ts` prevent > lets the opponent pay to keep the card, or decline and lose it (and other tests) |
| ST06 | `rules/decision.ts:30` | non-active side may reposition during the active side's Day | REJECTED: equivalent at the API: `legalActions` gates repositions on the main-window side first |
| ST07 | `rules/decision.ts:60` | an exhausted character may move to the front rank | `turn.test.ts` playing cards, the stack, and capacity > swaps characters on reposition and never moves an exhausted character to the front rank |
| ST08 | `rules/decision.ts:100` | side without priority gets responses on a non-empty stack | SURVIVED → `stack.test.ts` timing windows (table) > new assertion: the side without priority has no legal actions on a non-empty stack |
| ST09 | `rules/stack.ts:36` | prevented reclaimed card goes to the named destination instead of being banished | REJECTED: equivalent for state: `relocate` already banishes a reclaimed card; only the `prevented` event's `to` differs |
| ST10 | `rules/stack.ts:55` | 'your hand' prevent puts the card in its owner's hand | `stack.test.ts` prevent > puts a prevented card into the preventing player's hand, who may play it while its owner stays its owner |
| ST11 | `rules/timing.ts:145` | character playable with a full back rank (capacity off by one) | `figments.test.ts` creating figments > is not created with no open position; a figment exists only in play and ceases to exist when it leaves (and other tests) |

### Triggers

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| TR01 | `triggers/matcher.ts:366` | simultaneous triggers: non-active side first | `triggers.test.ts` trigger order (D14) > queues one event's matches with enemy first: avatar, dreamsigns, B0→B9, F0→F8, then void, hand, deck (and other tests) |
| TR02 | `triggers/matcher.ts:303` | once-per-turn trigger fires again | `triggers.test.ts` when patterns > triggers a once-per-turn ability once each turn |
| TR03 | `triggers/matcher.ts:305` | intervening if not checked when the trigger matches | `triggers.test.ts` functional zones and intervening conditions > checks an intervening 'if' when the ability triggers and again as it resolves |
| TR04 | `triggers/resolve.ts:23` | intervening if not rechecked on resolution | `triggers.test.ts` functional zones and intervening conditions > checks an intervening 'if' when the ability triggers and again as it resolves |
| TR05 | `triggers/matcher.ts:193` | Dissolved trigger requires its ability's zone (misses from the void) | `triggers.test.ts` prompts raised by triggers > does nothing when a trigger's required target has no candidates (and other tests) |
| TR06 | `triggers/matcher.ts:340` | delayed one-shot trigger not ended after it fires | `durations.test.ts` duration boundaries > keeps a permanent delayed trigger across turns until it fires (and other tests) |
| TR07 | `triggers/matcher.ts:364` | triggers match before the first turn begins | SURVIVED → `triggers.test.ts` when patterns > does not fire on the opening-hand draws, before the first turn begins |
| TR08 | `steps/kinds/resolve-trigger.ts:16` | trigger queue drains last-in first-out | `triggers.test.ts` functional zones and intervening conditions > checks an intervening 'if' when the ability triggers and again as it resolves (and other tests) |
| TR09 | `rules/turn.ts:137` | once-per-turn uses not cleared at turn start | `activation.test.ts` activated abilities on the stack > allows a once-per-turn ability once each turn (and other tests) |
| TR10 | `triggers/matcher.ts:115` | other-zone listeners ordered by descending instance number | `triggers.test.ts` trigger order (D14) > queues one event's matches with enemy first: avatar, dreamsigns, B0→B9, F0→F8, then void, hand, deck (and other tests) |

### Durations and the turn machine

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| DU01 | `rules/turn.ts:174` | 'until your next turn' expires at the other side's turn start | `durations.test.ts` duration boundaries > counts extra turns as their player's turns for 'until your next turn' (C8) (and other tests) |
| DU02 | `rules/turn.ts:39` | 'until next Day' expires at Dawn | `durations.test.ts` duration boundaries > ends 'until the next Day phase' as the next Day phase begins, whoever's it is |
| DU03 | `rules/turn.ts:119` | end-of-turn effects begun during Ending survive into the next turn | `durations.test.ts` duration boundaries > ends an 'until end of turn' effect that began during Ending as the turn ends |
| DU04 | `rules/durations.ts:41` | 'while this is in play' starts even when the source already left play | `durations.test.ts` duration boundaries > makes no change when 'while this is in play' resolves with its source out of play |
| DU05 | `rules/floating.ts:61` | turn-start boundary ignores the side | `durations.test.ts` duration boundaries > counts extra turns as their player's turns for 'until your next turn' (C8) (and other tests) |
| DU06 | `rules/turn.ts:152` | pending extra turns taken oldest first | `turn.test.ts` battle start and the phase machine > takes pending extra turns most recent first, outside the round count, with a Dreamwell draw |
| DU07 | `rules/turn.ts:31` | first-turn draw skipped for both sides | `turn.test.ts` battle start and the phase machine > lets the second side draw on its first turn and starts the Dreamwell in round 2 |
| DU08 | `rules/turn.ts:160` | turn limit off by one | `turn.test.ts` battle start and the phase machine > counts a round when the second side's turn ends and draws at the turn limit |
| DU09 | `rules/turn.ts:62` | hand limit leaves one card too many | `fold.test.ts` intent bounces and the hand limit > has the active side choose its discards down to the hand limit during Ending (and other tests) |
| DU10 | `rules/turn.ts:49` | exhaustion not cleared at Ending | `activation.test.ts` avatars and dreamsigns > exhausts the avatar to pay ☾ until Ending clears it (and other tests) |

### Continuous effects

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| CE01 | `continuous/layers.ts:123` | layer changes apply newest first | `continuous.test.ts` layer order > applies keyword gains and losses in timestamp order, the latest deciding (and other tests) |
| CE02 | `continuous/layers.ts:280` | spark not clamped at 0 | SURVIVED → `continuous.test.ts` layer order > clamps spark at 0 for comparisons (strengthened: checks a sum below 0) |
| CE03 | `continuous/layers.ts:124` | timestamp ties: floating effects before static abilities | `continuous.test.ts` layer order > breaks timestamp ties with static abilities first, then floating effects |
| CE04 | `continuous/layers.ts:278` | permanently gained spark ignored by the layers | `continuous.test.ts` layer order > sets base spark before every spark modification, whatever their timestamps (and other tests) |
| CE05 | `continuous/layers.ts:185` | static ability reads characteristics through all layers (own layer included) - use layer 1 instead | `continuous.test.ts` layer order > changes types before an anthem reads them |

### Zones and zone changes

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| ZN01 | `rules/zones.ts:94` | leaving play does not end 'while in play' effects | `durations.test.ts` duration boundaries > ends 'while this is in play' as the source leaves play, and keeps it across turns until then (and other tests) |
| ZN02 | `rules/zones.ts:161` | reclaimed card leaving goes to its destination instead of Banished | `zones.test.ts` Offering, Reclaim, and Ephemeral > plays a Reclaim card from its owner's void for its reclaim cost; it is banished instead of leaving (and other tests) |
| ZN03 | `rules/zones.ts:157` | created card goes to a zone instead of ceasing to exist | `core.test.ts` replay > plays seeded random games with no invariant violation, and replays each to its final hash (and other tests) |
| ZN04 | `rules/zones.ts:177` | counters kept on leaving play | `costs.test.ts` activated ability costs > takes an optional cost on an ability, and leaving play clears the abandoned card's ⧗ (and other tests) |
| ZN05 | `rules/zones.ts:133` | Ephemeral kept after leaving hand | `zones.test.ts` Offering, Reclaim, and Ephemeral > banishes Ephemeral cards still in hand during Ending, not those played |
| ZN06 | `rules/zones.ts:268` | character enters play ready | `continuous.test.ts` static abilities > apply Awakened to a character as it enters play, from another source or its own (and other tests) |
| ZN07 | `rules/zones.ts:162` | a card given to another side's hand goes to its owner's hand | `stack.test.ts` prevent > puts a prevented card into the preventing player's hand, who may play it while its owner stays its owner |
| ZN08 | `rules/zones.ts:274` | dropped back-rank slot ignored; always leftmost | `zones.test.ts` materialize placement and capacity > enters the leftmost open back-rank position, or the open position a UI drop names |
| ZN09 | `rules/zones.ts:180` | x kept on a card leaving play | `characters.test.ts` character primitives > a variable-spark character enters play with the X paid for it and loses it when it leaves play |

### Loops

| Id | File:line | Mutation | Killed by, or SURVIVED → regression test |
| --- | --- | --- | --- |
| LP01 | `loops/tracker.ts:194` | mandatory-cycle window never grows | SURVIVED → `loops.test.ts` mandatory loops > detects a cycle that repeats a state only every second step |
| LP02 | `loops/tracker.ts:101` | loop offered without a gain for its player | `loops.test.ts` optional loops > does not offer a sequence without a gain, or one the opponent had a decision in (and other tests) |
| LP03 | `loops/tracker.ts:88` | opponent's real choice does not disqualify a loop | `loops.test.ts` optional loops > does not offer a sequence in which the opponent made a choice |
| LP04 | `steps/kinds/loop-iteration.ts:33` | iteration cap off by one | `loops.test.ts` mandatory loops > does not end an optional loop in a draw when its iterations stop changing the battle (and other tests) |
| LP05 | `steps/kinds/repeat-loop.ts:24` | count equal to the cap rejected | SURVIVED → `loops.test.ts` optional loops > stops at the iteration cap (extended: a count of exactly the cap completes) |
| LP06 | `loops/replay.ts:67` | opponent gaining a response mid-loop is reported as divergence | `loops.test.ts` optional loops > stops when the opponent gains a legal response, handing them the decision |
| LP07 | `steps/kinds/loop-iteration.ts:38` | loop that stops early stays on offer | `loops.test.ts` optional loops > offers a loop that gains for its player and repeats it until victory (and other tests) |

## Validation

| Command | Wall time | Host load (1-minute) |
| --- | --- | --- |
| `vitest run src/engine` per mutation (baseline) | ~5 s | 4.5–7 |
| `vitest run src/engine` (final, 355 tests) | 4.6 s | 4.5 |
| `npm run fuzz:engine -- --games 200` | 35.8 s (200 games, 0 failures) | 4.5 |

A 10,000-game fuzz soak (2 processes) ran on the host throughout.
