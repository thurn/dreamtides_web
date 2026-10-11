# hv-umm2.72 measurements and acceptance

Base: `d4d4cbcc422ae07d6bae9f56a5a9887fb509f508`. Native entity scope is one card,
`7697da0e-d759-4c75-8c9c-477e9058b035`, with one standard authored ability and no amplified text.
The content recipe introduces `losePoints` and the coupled `scoredAmount`
value form. C14, RD-hv-7x4l.1-17 and RD-hv-7x4l.6-3 apply;
RD-hv-umm2.72-1 records actual-award equivalence and snapshot timing.
There is no card issue or mutable catalog metadata edit.

## Contracts and persistence

Focused checks: **339 cases / 3 entrypoint files**, including 238 primitive
contracts. The final focused run's Vitest duration was 1.24 s; the reported
prepare/test/restore phase sum was 2.6 s. Fresh install took about 2 s.
Quick review: **157 files / 2,326 cases**. Full review: **216 files / 2,965
cases**, including lint, types, import cycles, knip and production bundle.
No test entrypoint was added; two plain contract modules contribute 204
lines and one registered content scenario module contributes 42 lines.
Seven new synthetic contract cases and six catalog scenario cases cover:

- Numeric/dynamic losses, both relative PlayerRefs for both controllers,
  excess-loss flooring, actual negative events, zero-change event absence,
  and deterministic replay without changing the starting state.
- Blocked 3✦ versus 2✦ awarding 1⍟ and unpaired 3✦ awarding 3⍟. Earlier
  queued triggers increase spark by 10 before the loss resolves; the
  captured award still determines the loss. The controller differs from
  ownership for each side's scorer.
- `scores` and `opponentScores` public queued metadata; clone, JSON state
  round trip, structural hashing and trigger replay retain it. A different
  captured amount changes the state hash. `scored` is optional on persisted
  queue/event/view records and defaults to zero outside a scoring trigger;
  state serialization, clone and hashing retain their generic mechanisms.
- Flat gains, fatigue and zero-point lanes fire no scoring trigger.

The existing step transaction and fold contracts in the full suite cover
rollback and suspension. This primitive creates no prompts or new event kind,
status, UI copy or presentation mechanism. Its pointsScored effect event
reports the actual negative delta; triggerQueued records the requested
positive challenge award. Production logs can reconstruct the calculation
with the source UUID and controller.

## Weighted fuzz and UI evidence

Weighted fuzz: **300 games / 151,306 steps / zero failures**. Target included
616 times and exercised 243 times. Policy results: player 152, enemy 147,
draw 1; 2,748 prompts, 286 interactive re-runs. Fuzzer reported 57.1 s wall
and 62.0 s CPU. Only full review and 300-game fuzz took D17's heavy lock;
all tests used two workers.

Sweep: **8 pass / 12 ineligible skip / zero fail**, all eligible variants on
player and enemy. The sweep proves actual card materialization/resolution.
D21 SHA-256 first byte is **252**, so mandatory sample count is zero; there
is no new prompt/status/visual mechanism. Four additional judged runtime
mechanic cases supply actual scoring, rather than inferring it from the sweep.

Final native report `scoring.result.json` SHA-256:
`f202c465f74eb673c2bd829c4511b26bf2b06cc64523f290ca4be54f2f86ba6a`. Desktop 1440×900 and mobile 390×844 both pass:

| Workflow | Physical source / blocker | Award / actual loss | Rendered HUD |
| --- | --- | --- | --- |
| Blocked enemy | i10 / human i1 (synthetic UUID ending0003) | 1 / player−1 | enemy 1 / player 6 |
| Unpaired player | i1 / null | 3 / enemy−3 | player 3 / enemy 4 |

Final game IDs: desktop blocked `g4r9ek`, desktop unpaired `zfdbvw`, mobile
blocked `3dcsny`, mobile unpaired `eoe27t`. Exact source/card UUID attribution
is observed through the public typed event helper, with its batch sequence
and event index cursor. The engine.action log and durable game-event sequence
are distinct namespaces; no sequence join is used.

The blocked fixture declares enemy Agent in F0 and human 2✦ blocker in F0 plus the
native enemy script's challenge action. The human fixture declares Agent in F0
and an empty opposing front rank. Seven ordinary debug score increments
stage the receiving opponent at 7, each confirmed before the next intent.
Normal phase actions then resolve the actual challenge. This is declared
fixture plus live challenge evidence, not an AI casting claim.

Both DOM HUDs explicitly reach the expected counters before capture. Positive
source card geometry, exact lane/blocker/trigger attribution, visible negative
loss log text and empty error buffers pass for all four cases. Every final
capture was inspected and its native CSS dimensions verified:

- `scoring-blocked-desktop.png`
- `scoring-unpaired-desktop.png`
- `scoring-blocked-mobile.png`
- `scoring-unpaired-mobile.png`
- `scoring-loss-log-blocked-desktop.png`
- `scoring-loss-log-unpaired-desktop.png`
- `scoring-loss-log-blocked-mobile.png`
- `scoring-loss-log-unpaired-mobile.png`

## Attempt dispositions and timing

The initial primitive fixture mistakenly supplied explicit player/enemy
strings to PlayerRef (which is you/opponent), then was corrected. The initial
snapshot replay fixture used the wrong StepResult discriminator, corrected to
`done`. The first full check found three authored-test lint issues; the final
full check passed. These are test-authoring failures, not product failures.

Raw retained runtime reports record:

1. Unsupported `:has-text` in the native CSS click helper (selector error).
2. A narrow score predicate ran beyond the first challenge when the expected
   blocked fixture diverged.
3. An incorrect event-helper top-level filter stopped on challenger
   designation. Corrected to its documented nested `match` argument;
   parent-owned `hv-ojiu` adds argument validation.
4. The correctly scoped lane showed the AI had moved blocker i10 to F6,
   leaving the player Agent unpaired: scored 3 and enemy 7→4 were correct.
   This is fixture behavior, not a scoring defect.
5. The controlled fixture proved desktop blocked/unpaired and mobile
   blocked losses, then the known debug opener covered the mobile log-close
   button. The next run navigated between fixtures after capture.
6. Accepted state/log captures preceded some presentation playback. The
   final run waits on rendered HUD data-points before capture and proves the
   visible counters agree with committed state.

All failed reports are retained separately: `scoring-harness-selector.result.json`,
`scoring-harness-blocked.result.json`, `scoring-bounded.result.json`,
`scoring-correct-api.result.json`, `scoring-controlled.result.json`, and
`scoring-accepted-state-and-log.result.json`.

| Check/attempt | Exit | Whole command execution s | Heavy wait s | Ending 1-minute load |
| --- | ---: | ---: | ---: | ---: |
| full | 1 | 18.989 | 0.023 | 5.56 |
| full-final | 0 | 53.044 | 0.020 | 4.19 |
| fuzz | 0 | 57.886 | 40.653 | 11.31 |
| sweep | 0 | 115.716 | 0.000 | 28.05 |
| scoring | 1 | 10.221 | 0.000 | 21.97 |
| scoring-final | 1 | 70.454 | 0.000 | 8.25 |
| scoring-bounded | 1 | 18.876 | 0.000 | 6.75 |
| scoring-correct-api | 1 | 12.917 | 0.000 | 5.54 |
| scoring-controlled | 1 | 78.094 | 0.000 | 20.61 |
| scoring-accepted | 0 | 51.156 | 0.000 | 7.59 |
| scoring-settled | 0 | 58.486 | 0.000 | 3.83 |
| review | 0 | 29.066 | 0.000 | 8.29 |
| knip | 0 | 2.046 | 0.000 | 5.99 |

The final runner separately reports browser lease wait **0.042 s**, server
startup **0.944 s**, scenario **52.192 s**, total **53.199 s**; its wrapper
includes process draining/exit. The sweep reports 111 s execution (115.716 s
whole wrapper). Light wrappers take no heavy lock. Raw check logs/timings are
under `/tmp/hv72-checks`; focused logs are `/tmp/hv72-focused-final.log`.
Root's recorded native scope-authority wait was 11 minutes.

## Frozen source and runtime closure

The following source hashes match the full/fuzz-tested tree and every runtime
attempt; subsequent changes are evidence and ignored QA scripts only:

- `src/engine/dsl/types.ts`: `ba44c0231f6f8dcdf66d7d0fec0036c3e2d3ceed9e78406ec55fc94c09e8574b`
- `src/engine/dsl/values.ts`: `40e72d32e7163bb388ed382072b8e3c2994c72cef7cefd02de46a2a995c4bffc`
- `src/engine/effects/interpreter.ts`: `2e2feeaaa1c63306e12ee7ccad17d6a80d592823a58921b9a7482f3cda74cfec`
- `src/engine/triggers/matcher.ts`: `0ad3dddf48bdb3e0d5f57c22edf81c3d797d570493ea397aedd997071a566328`
- `src/engine/triggers/resolve.ts`: `6da629808d98124db69f1eb1c8cd28b6ffb89d35e9c0cc055af6b878a09bf399`
- `src/content/cards/shatterpoint-agent-7697da0e.ts`: `754f983b9628d32d5d71cc29e37950a087dc4675cbe1cc47db0003d81c08e76f`

All owned runtime groups **40067, 52628, 55319, 61863, 62426, 69567, 79157,
81409** were stopped by their native runners, each reporting port 5174 free.
Root's independent fresh process inventory found no member of those groups.
Native cleanup closed browser contexts, settled RPC/provider responses and
SDK transports, and released the browser lease. No direct browser launch,
application/storage writer, watcher, server or provider handle remains.
Check wrappers and heavy-lock children have exited. Parent owns independent
other-family review, candidate submission, approval and promotion.

Gross claim-to-commit interval measured immediately before commit: 32.98 minutes, including the recorded 11-minute scope-authority wait. Final scoped process check found no member of any owned runtime group.
