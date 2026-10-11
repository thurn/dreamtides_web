# hv-umm2.391 measurements

Declared staging uses the supplied scenario-call execution budget as one
absolute deadline. The runner supplies its existing call budget, capped at
its existing call limit. An explicit staging timeout shares that limit.
Navigation carries the same optional deadline through viewport setup,
departing caps capture, native navigation, state observation and accepted
error-buffer reset. Direct helper callers without a supplied budget retain
the existing 15-second fallback. No new timeout tuning constant is added.

Card-sweep retains each attempt's complete report and ledger verdict. Only
a normal settled report with explicit timeout-only failure kinds, no report
error, empty error buffers and a runnable session permits one fresh retry.
Semantic postchecks remain active; mixed failures, stalls, unknown or
malformed results and transport exceptions retain a failing effective
verdict. Both attempts remain visible. Effective cell counts and exit
status use the final attempt; raw attempt counts are separate.

Each sweep invocation owns a unique artifact directory. Reports and optional
captures are distinct for each cell and attempt, with ledger references to
the exact relative report path. Artifact allocation and report writes are
inside the existing resource cleanup boundary. Summaries retain total wall
time, browser lease wait and execution excluding that wait, in both JSON
and the human-readable output.

## Validation

| Check | Exit | Wrapper seconds |
| --- | --- | --- |
| focused | 0 | 2.051 |
| review | 2 | 12.756 |
| focused-final | 0 | 3.554 |
| review-final | 1 | 12.858 |
| review-settled | 0 | 12.749 |
| knip-settled | 0 | 3.159 |
| review-cleanup | 0 | 11.732 |
| knip-cleanup | 0 | 2.167 |
| focused-budget | 0 | 2.995 |
| review-budget | 0 | 13.116 |
| knip-budget | 0 | 2.631 |
| full | 0 | 70.811 |

Final focused: 38 cases in 3 files. Final related review: 54 cases in
4 files. Full: 3314 cases in 326 files, Vitest 45.69 s,
including production module exclusion. Full ran once under the shared
heavy lock. All preparation and asset restoration settled before either
real browser command.

Test delta: two Node test files, 155 lines, eight cases, zero jsdom files.
Synthetic fake-clock observations cover loading beyond the helper fallback,
explicit shorter timeouts, shared cumulative budgets and navigation work
consuming that deadline. Injected outcomes establish one timeout retry,
both retained attempts, final versus raw counts, terminal second timeout,
and rejection of mixed/unknown/malformed/error-buffer/report/transport
failures. Explicit option parsing uses synthetic card UUIDs. No test gates
on host load, real timing thresholds, production content or UI strings.

Initial light reviews caught new test-fixture JSDoc/type errors and async
lint corrections, then an unbound counter callback. Those fixture corrections
settled before full validation and browser startup. Parent cold review also
required invocation-unique artifacts, protected allocation and propagation
of the optional navigation deadline across prior work; each refinement is
covered by settled final checks. Individual corrections cost less than the
friction reporting threshold.

## Actual browser verification

The existing tracked card-lab-stage declared=1 scenario exercised labStage
on desktop and mobile with source printing UUID
e83014d3-9d35-4e80-a1b3-9b25360ad2af. Its report SHA256 is
598a06ff334c747578b49572a5e2139d0c9cd739045f2fe89e9b8ec2bb214d92. Both viewports returned
distinct initial physical IDs, selected enemy i16 for the declared advance
and Challenge, and played enemy i18 from hand. Existing F1/B1/B2 and F2
geometry had positive 89.5-pixel desktop or 53.859375-pixel mobile boxes,
with centre hits. The actual human spell paid energy from 7 to 5, and
persisted Engine.action records carried the physical identities. The source
printing UUID was verified in the declared initial metadata and request.
Both caps assertions
passed and the report's error-document list is empty.

Captures: card-lab-declared-desktop.png,
card-lab-declared-mobile.png, card-lab-declared-spell-desktop.png.
The board and controls are visible; hand cards are partially cropped and
presentation can be in motion. These are state and interaction observations,
without a settled-hand visual claim. Parent and helper viewed all three.

The tiny actual vanilla sweep exercised base player and enemy cells, with
two effective passes and two raw pass attempts. It did not inject a live
timeout: timeout retry behavior is established by deterministic synthetic
outcomes. Both complete raw reports have empty caps and null error.
Invocation directory: sweep-3Yy6yo. Its summary records
14458.687375 ms total,
41 ms browser lease wait,
14417.687375 ms execution,
13227.748916 ms scenario and
225.03241700000035 ms cleanup.
Host load 9.84716796875.
The stage report records {"browserLeaseWait": 41, "serve": 1254, "scenario": 26661, "total": 27982},
host load 11.13232421875.
Outer command times: [{"label": "qa-stage", "exit": 0, "seconds": 33.234}, {"label": "qa-sweep", "exit": 0, "seconds": 19.483}].

Raw sweep reports:

- sweep-3Yy6yo/sweep-e83014d3-9d35-4e80-a1b3-9b25360ad2af-base-player-attempt-1.result.json: SHA256 5b8efbdded47148f7c568daa9e6a880869dd8a00b7873fcfa497442d20820054
- sweep-3Yy6yo/sweep-e83014d3-9d35-4e80-a1b3-9b25360ad2af-base-enemy-attempt-1.result.json: SHA256 4be5a10e4687f60735b5a002e4b97f7250d308d67ccd87ebe70d2d390f7de862

Both commands used port 5174. Owned server process groups 93935 and 94464
were stopped and freshly verified absent; the port was free. Both contexts,
RPC calls, provider executions and SDK transports drained before releasing
the browser lease; the exact owner record was absent. No peer resources
were touched. All six changed executable/test hashes matched after cleanup.
No executable edit, check or preparation ran during browser serving.

- scripts/qa/card-sweep.test.mjs: SHA256 3def50dcdf6a969a8e29c7408ac6fbbca0757376bbc12daffebb971ac63040da
- scripts/qa/prelude-lab-stage.test.mjs: SHA256 58e544946e9e6cc05d6c47947f7c2294f8a51f52f04e5e74f2d1044d8b7a5076
- scripts/qa/card-sweep.mjs: SHA256 26322ba41d73ff9b8f6418b4b057f6580a8492db20fa7188d39dede4fae18818
- scripts/qa/prelude.mjs: SHA256 da9a7674920ac9b1a0fa9bb7c80aa135b199048d80175df5130a925415532d6d
- scripts/qa/run-scenario.mjs: SHA256 647524f3e1a1128f1c6ab3d5c887e134f81afb6aa99a8cdae79fc0019afb281c
- scripts/qa/scenarios/card-lab-play.mjs: SHA256 b050d166d8e1470d3156aa474bfb957a130f82ec18ff9bf31467f5db38635fb3
