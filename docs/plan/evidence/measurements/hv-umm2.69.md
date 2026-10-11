# hv-umm2.69 measurements

Base: `06278f9b5c00fd592386a38efa6f46886858ad9f`.
Dispatch start: 2026-10-11 04:01:00 UTC (rounded from 04:01:01).

## Contracts and content

- `conditionCardCounts` extends `Condition.cardsIn` with an inclusive minimum,
  optional inclusive maximum, and optional typed `CardFilter`. The existing
  variant-aware `cardMatchesFilter` supplies effective type/subtype matching.
  `noCardsIn` and upper-bound-only conditions retain their contracts. The
  inventory's `conditionCardCounts` detector matches the source declaration.
- Entity `fbf32510-0bad-4567-859f-b3db6d7be5d5`: base discards one opponent
  card; amplified selects two at a resolution-time hand count of at least five,
  otherwise one. Both forms use the existing one-card Reclaim discard cost.
  Printed text is unchanged; `verifiedText` is `drt0a4hlej`.
- Four deterministic synthetic contracts in the existing flow test group cover
  0/1/4/5/6-card hands for either controller, responses crossing the threshold
  in both directions, filtered void counts using a deck-modified effective
  event type and a distinct character subtype, inclusive bounds and the
  opponent's empty deck, and Reclaim payment/resolution/banishment order.
- RD-hv-umm2.69-1 records the conditional alternative's pre-discard hand count
  in `docs/rules.md`. No card issue was found. D20 requires no card-specific
  scenario module: the ability is a direct composition of tested primitives.
- The action, prompt/answer, `discarded`, and `resolved` event logs retain the
  instance/UUID identities and order needed to reconstruct the chosen branch.
  The condition creates no new event or presentation kind.

## Validation

| Check | Outcome | Execution measurement | 1-minute host load |
| --- | --- | --- | --- |
| Focused flow + content coverage gates | 2 files, 31 tests pass | 1.3 s test phase; 2.3 s phase sum | 6.61 at completion |
| Final `npm run review` | 161 files, 2,123 tests pass; lint, both typechecks, import cycles pass | 34.6 s phase sum; 26.9 s related-test phase | 7.24 at completion |
| `npm run knip` | pass | 2.0 s knip phase; 3.3 s phase sum | 6.46 at completion |
| Weighted fuzz | 300 games, zero failures | 64.206 s command; 63.4 s game wall / 68.3 s CPU | 6.23 at slot acquisition |

The focused run first exposed an incorrect test-only assumption about the
recorded-answer shape; assertions now observe discard events. The first local
review exposed three unnecessary test assertions; they were corrected before
passing review. The filtered subtype contract was strengthened with a distinct
subtype and an upper bound, then the final review passed.

Fuzz: 151,499 steps, 3,051 prompts, 338 interactive re-runs (0.275 ms each),
no feasibility bounds, and target inclusion/exercise counts 617/513.
Command: `npm run fuzz:engine -- --games 300 --weight-uuids fbf32510-0bad-4567-859f-b3db6d7be5d5`.
All checks use `JOURNEY_TEST_WORKERS=2`. Fuzz and the sweep run under the shared
`lockf -k` heavy slot. Fuzz slot wait: 0.054 s, separate from execution.
No performance comparison is claimed. This extension uses the existing DSL,
interpreter, matcher, test group, and QA infrastructure; local `review:full`
is not required by the validation ladder.

## QA and resources

Sweep: 14 pass, 6 ineligible-variant skips, zero failures or pending verdicts.
Base, amplified, empowered, inspired, enduring, hastened, and perfected each
pass as player and enemy. Kindled, resonant, and attuned are ineligible.
Execution: 91.484 s including server startup/cleanup (86 s sweep report),
heavy-slot wait: 0.053 s, 1-minute host load: 6.89 at slot acquisition.
Port: first free 5174. All passing runs enforce an empty `__caps` buffer,
visible/enabled controls, the expected final zone, a resolved event, and a
visible board change. The ledger contains 20 sweep verdicts.

Judged count: 0. The SHA-256 of the entity UUID starts with `e0` (224), above
the D21 sample cutoff of 26. This condition introduces no new prompt kind,
status indicator, or visual effect. The sweep ledger records every eligible
variant as player and enemy. No screenshot capture is required for this
internal condition extension.

Runtime ledger: fuzz process group 88930 and its main PID 88975 exited;
sweep process group 90974 exited; runner-owned server process group 91018
stopped, and the runner reported port 5174 free. The runner closed its own
MCP browser context with `browser_close` and disconnected its client. A
post-run PID check found all four recorded process IDs absent; the port
listener check was empty. The shared Playwright MCP service stays running.
All local validation processes and QA ledger writers have exited.
Primary-checkout QA files are gitignored under `artifacts/qa/hv-umm2.69/`;
there are no committed images or task-created browser captures.

Test delta: files 0, lines +88, jsdom files 0. The existing flow test file is
346 lines, below D19's approximate 500-line split/cut threshold. No pre-existing
issue was found; no pre-existing file is needed. No other repository was edited.
