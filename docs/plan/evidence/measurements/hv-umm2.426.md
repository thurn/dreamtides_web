# hv-umm2.426: floating-change registration

Base: `1d62fc944a60a33662eb129bd5422d810a6b1d06`.

`FLOATING_CHANGE_VALIDATORS` requires all 13 members of
`FloatingChange["kind"]`. The 12 accepted kinds retain their existing
predicates, including whole nonnegative `cardCost` amounts through `isIndex`.
`reclaimNotBanished` is a static-only continuous change with an explicit
rejecting saved-floating validator. The discriminant is read once and checked
against owned table keys before dispatch. `LAYER` already requires every
`ContinuousChange` kind and is byte-identical to the base.

The workflow Hub areas and Phase 5 recipe name all four additive floating-kind
registration surfaces: saved-state validation, continuous-layer registration,
status/effectStarted copy, and the engineStatuses duration badge.

## Verification

An external probe used the public `parseJourneyBattleFoldState` intake with
synthetic states before and after the refactor. All 28 rows passed in each
run: 13 valid examples covering the 12 accepted kinds, static-only rejection,
unknown and prototype-property names, and malformed cardCost/subtype data.
The retained result logs are byte-identical:
`dc0ea93104e25dff38354a4bcf852aa799c18092d158ff1da94d1584115295be`.
This bounded probe verifies those observable cases; it does not claim an
exhaustive payload proof. Existing CI test sources are unchanged.

Deleting the subtype validator entry and running actual
`node node_modules/typescript/bin/tsc --noEmit --pretty false -p tsconfig.json`
returned exit 2 with TS2741: `Property 'subtype' is missing`. This deliberate
compiler mutant is not a performance comparison. Restoration occurred in
`finally` before focused or required checks. SHA256 of the refactored fold
before and after restoration is
`d320abfcc8dfa940434e4031e9fa937004b596bc527533bd185a5c032e3fde1e`;
the mutant hash is
`389b15455128f5b465d753868ad0a8261a6dce018e41ad620a54756de460cfb5`.

| Check | Result | Command wall seconds |
| --- | --- | ---: |
| Existing load/replay/malformed-save tests and primitive contracts | 637 tests, 4 files, pass | 5.959718 |
| npm run review | 1224 tests, 67 files; main/node typechecks, lint and cycles pass | 19.605045 |
| npm run knip | pass | 3.475139 |

Focused entrypoints were `src/rules/journey/lifecycle-battles.test.ts`,
`src/rules/battle/engine-battle-intents.test.ts`,
`src/rules/battle/engine-battle-replay.test.ts`, and
`src/engine/effects/primitives/contracts.test.ts`. The shared contract entrypoint
includes existing modify-card-cost, play-from-zone and choose-subtype recovery
cases. Commands ran sequentially with two test workers. Command wall includes
workspace preparation and asset restoration where the review runner performs
those steps. Review start 1-minute host load was 26.23046875; detailed samples and
actual command windows are in the friction record. These are observations,
not speed or load-normalized budget claims.

No browser, fuzz, full review, or additional committed test was needed for this
private behavior-preserving dispatch refactor. All seven owned command process
groups were absent at verification. No server, browser provider, or heavy slot
was started. There is no new rules decision, card issue, or detected
pre-existing issue.

Raw commands, diagnostics, source/restoration proofs, and runtime closure are
retained in the session's `/tmp/hv-umm2-426-checks/` directory. The friction
record states its actual final-preparation timing window; actual commit start
and end timestamps are recorded externally at handoff.
