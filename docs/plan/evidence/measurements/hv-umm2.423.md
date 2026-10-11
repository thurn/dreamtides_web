# hv-umm2.423 verification measurements

Base: `262575390f12b77fa703e9dbe2c6b45a76e41513`.

The two production edits affect layer-2 subtype replacement and the
`subtypeChosen` event's visibility. Real synthetic engine effects verify both
all-types/type-setting orders through subtype selectors and anthem spark.
Real fold intents announce hidden hand and deck sources' choices for either
controller; both viewers receive the chosen type and only sources they can
identify. Known and unknown source states are covered. The announcement
published before a Discover prompt remains in the factual prefix when the
later step fails. JSON reload reaches the same prompt and recovers the same
state without publishing that announcement twice.

The unchanged production baseline fails precisely the two accepted defects:
all-types remains true after a later type-setting effect, and the opponent's
hidden-source event projection is null. The strengthened failure/reload case
passes that baseline because the fold implements the documented prefix
contract.

| Command group | Exit | Wall seconds | Starting one-minute load |
| --- | ---: | ---: | ---: |
| baseline | 1 | 3.945710 | 23.199707 |
| focused | 0 | 4.320907 | 23.376465 |
| focused-settled | 0 | 7.005659 | 28.980957 |
| review | 2 | 61.768013 | 33.147461 |
| review-settled | 0 | 45.514133 | 23.647461 |
| knip | 0 | 3.607249 | 20.063965 |

`baseline` runs the chooseSubtype contracts: 2 failed, 11 passed, 604 skipped.
The first `focused` invocation passes 650 cases in three existing entrypoints;
its additional guessed `fold/slice.test.ts` filter matches no file. The settled
focused command uses the seven verified existing contract, continuous, fold
and view entrypoints and passes 676 cases. The first review passes 2,800 cases
in 260 files but fails TypeScript on the new synthetic selector's missing
controller. The settled fixture uses `anyCharacter`, and final review passes
all 2,800 cases, main/node TypeScript, lint and import-cycle checks. Knip exits
0. Preparation and local asset restoration settle with each applicable check.

Tests use two workers. Detailed command arguments, actual process exits, wall
windows and all three load averages are retained in the friction file. These
measurements describe this host's observations and support no performance
comparison.

The existing plain contract module has 317→394 lines (+77 net; 81 added and
4 deleted), two additional cases,
and a strengthened existing failure case. Test entrypoint and jsdom file
counts are unchanged. The repair preserves engine architecture and prompt
routing, so it uses focused contracts and required local review/Knip. Full,
fuzz, card sweep and browser QA are outside this bounded internal/event
projection verification scope. No UI, card content or algorithm policy is
changed; this evidence makes no layout or browser claim.

Implementation time uses the trusted native claim as a dispatch proxy and
includes research, coordination, negative baseline, verification and parent
review. The final preparation window is recorded in the friction file;
successful commit start/end and the small final preparation-to-commit gap
remain in the external handoff for the parent's native notes.
