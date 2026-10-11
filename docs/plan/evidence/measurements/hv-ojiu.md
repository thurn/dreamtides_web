# hv-ojiu acceptance and measurements

Base: `718a6833384dae803f87f899f7ff901f9fc3487c`.

## Detector checkpoint

The public event-option detectors were written and run before production source
edits. Root read the failure log, confirmed an empty `prelude.mjs` diff, and
acknowledged the source-edit checkpoint. The retained baseline run exits 1:
13 new cases fail and all 15 existing cases pass in one entrypoint.

The direct `{ kind: "laneResolved", challenger: "i5" }` options return five
unrelated draw/trigger events and advance the cursor to sequence 7, index 2.
Malformed option/match shapes yield unfiltered or empty results, or generic
late errors. The detectors require an event-helper diagnostic before any page
observation. Raw evidence is `/tmp/hv-ojiu-checks/detectors-before.log` and
`/tmp/hv-ojiu-checks/detectors-before.diff`.

## Public contract

`events(cursor, { match, limit })` validates the options and match as non-null,
non-array objects. Record prototypes are unrestricted: null/custom prototypes
and inherited supported option values retain their behavior. Unknown own
top-level keys, including non-enumerable and symbol keys, fail with the helper
name and a direction to put event fields inside `match`. Match fields are
arbitrary; nested values keep the existing value-comparison semantics.

Omitted options, explicit `undefined`, empty options/match and undefined option
fields retain their defaults. Existing contracts cover limit bounds, cursor
continuation, pagination, battle identity, event identity and read-only behavior.
The validation lives inside `createBattleDriver`, which the runner serializes
as a standalone factory. No module-level validator dependency is introduced.

## Validation

All local tests use `JOURNEY_TEST_WORKERS=2`. One existing node entrypoint gains
15 cases and a net 56 lines, reaching 444 lines; test files and jsdom files
have zero delta. The focused helper contracts cover the guard with synthetic
page/probe observations. An actual browser game run supplies no additional
guard coverage, and no game rules or UI flow changes are in scope.

| Check | Exit | Cases / files | Timing |
| --- | ---: | --- | --- |
| Baseline detectors | 1 | 13 failed, 15 passed / 1 | 0.121 s Vitest; 0.4 s test step |
| Focused prelude and lease contracts | 0 | 46 / 2 | 8.06 s wall; 4.37 s user, 1.43 s system |
| Quick review | 0 | 46 / 2 | 21.43 s wall; 38.86 s user, 4.66 s system |
| Knip | 0 | unused-code check | 3.46 s wall |
| Full review | 0 | 3,036 / 216 | 63.67 s wall; 158.41 s user, 13.70 s system |

Full review includes full lint, both typechecks, import cycles, knip, all tests
and the production bundle. It runs under
`lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock`. The full wall time
includes any external heavy-slot wait; that wait was not separately timed.
The review log emits no review-lock waiting line. The full test step is 38.2 s,
lint is 20.5 s and bundle is 2.8 s; independent checks can overlap, so their
durations are not a total execution or queue measurement.

One-minute load samples are 14.44 after focused checks, 17.03 after quick
review, 24.69 after knip, and 26.24 after full review. Quick-review lint exposed
unsafe `Object.create` typing in the prototype fixtures; typed records with
`Reflect.setPrototypeOf` pass focused lint and the final review. The fresh
installation reports about 2 s and its dependency-audit observation is in this
bead's pre-existing file. Raw successful logs are
`/tmp/hv-ojiu-checks/focused.log`, `review.log`, `knip.log` and `full.log`.

## Tested source and writer closure

SHA-256 hashes of the tested source and example:

- `scripts/qa/prelude.mjs`: `0f3d2e24f7252a21fd73aa830e9315ecb4377c7d3f3c352111bade29de46d283`
- `scripts/qa/prelude.test.mjs`: `4ea426298d6080d58a0417d52496ab8bdd61c5e328b9bf870b3649ad1197a019`
- `README.md`: `71ec840860c420824f729a0029df2ff59e61f4fc871b5ed695f41e3d84ea3f6b`

All installation, detector, focused lint, test and check wrappers have exited,
including the heavy-lock child. The final process inventory contains only its
own inventory command. Browser-lease warnings exercise synthetic temporary
fixture roots; their fixture server process groups report stopped and their
ports free. No actual browser, application server, watcher, provider handle or
application/storage writer was started. No QA images were produced. Root owns
native candidate submission, approval and promotion.
