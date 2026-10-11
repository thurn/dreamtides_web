# hv-umm2.400 measurements

Dispatch: 2026-10-11T19:43:34.027444Z. Elapsed implementation time includes research, coordination, verification and queue waits through final commit preparation.

## Baseline and regression evidence

The unmodified card-lab implementation SHA-256 was `a1b231ea330e9bfc62fd6cb2335e139222ddfc2855648c3ac62c2490b3d0f261`.

- Fresh dependency installation: exit 0, 2.480 s, PID 97524; observed starting one-minute load 14.73.
- Existing focused contract suite: exit 0, 20 tests, 2.974 s, PID 99797.
- Synthetic activation resolves an abandonment of its own physical source, then the next scripted activation references that source in the void. Against the unchanged implementation, the normal enemy AI request throws at `card-lab.ts:218` with the existing illegal/stale error: exit 1, 2.801 s, PID 941.

Exact command output and timestamps are retained in the parent-owned implementation scratch as `install`, `focused-baseline` and `focused-negative` JSON/log files.

## Current validation

- Focused setup and script contracts: exit 0, 21 tests in two files, 3.128 s.
- First review: exit 1, 12.610 s. Both TypeScript projects, import-cycle checks and 254 related tests passed; the engine-purity rule rejected the module-level diagnostic WeakMap. The diagnostic cache was replaced with an emission on each observed failure, keeping decisions history-derived.
- Corrected review: exit 0, 9.812 s; lint, both TypeScript projects, cycles and 254 tests in 16 files passed. The observed review-start one-minute host load was 15.58.
- Knip: exit 0, 3.304 s, sequentially after review.
- Friction CLI: exit 0, 0.267 s, including the own-bead numeric record.
- Source logic churn: 39 lines, 31 added and 8 deleted. Test delta: one additional entrypoint, 63 net lines and one added contract case; zero jsdom files. Setup and script modules have 284 and 266 lines respectively.

## Browser workflow

The native scenario runner used port 5175, with port 5174 occupied by a peer. The declared enemy activation used catalog UUID `a9b5afaa-e149-4bf4-9007-077e8e9f12e6`, physical source `i11`, followed by an advance of that initial physical reference. Its accepted target was the player's physical `i1`. A normal human response pass allowed resolution. The source entered the void, the target entered the player's hand, the stable script failure identified step 1/history boundary 2, and normal enemy pass intents returned the battle to the human Day. No scripted reposition of `i11` was committed.

The initial successful observation (`jzwino`, scenario 10.157 s, total 11.477 s) retains its original report and capture as `stale-script-initial.result.json` and `stale-script-initial-desktop.png`. The final observation strengthens evidence with the actual `dissolved` publication: sequence 2/index 6, enemy `i11`, matched printing UUID; the `abilityActivated` publication names the same physical source and ability 0.

Final game: `kgq54y`. Scenario 9.875 s, total 11.504 s, browser-lease wait 0.043 s, serve 1.559 s; command including cleanup 16.797 s. The actual response control measured 120 by 42 CSS pixels, was hit-testable at its center and lay inside 1440 by 900. Every `__caps` buffer was empty. The final capture is `stale-script-normal-policy-desktop.png` at 1440 by 900 CSS pixels. Cold inspection confirms a usable human Day surface.

The 45 per-game persisted records were read before context close and exported as `stale-script-game.jsonl`. The report `stale-script.result.json` includes the stable failure payload, normal intent history, the full observed final state and UUID-bearing engine publications. Twelve source, test, policy, fold, debug, logger, runner, prelude and token-mirror hashes match before and after both browser runs. These ignored QA artifacts are referenced by filename and are not committed.

## Failure and recovery contracts

- A synthetic activation resolves abandonment of its own source before a later scripted activation. Its normal AI request matches the request with ordinary battle initialization.
- Real fold Reclaim restores that same physical instance and makes its activation legal again; the historical failure keeps the script stopped. Cloned initialization and slice data reproduce that stop. Undo to history zero restores the original scripted activation. Repeated reads preserve the selected action and cursor.
- Existing script contracts retain activation/play prompt cancellation, stale and wrong-side answers, response passes, reload and undo behavior. A faulted resolving step stays suspended until history recovery.
- Strict save metadata, malformed declarations and missing initial physical references remain hard errors before a usable scripted fixture is published. There is no additional persisted write or actor protocol; script status is derived from successful persisted intents. Diagnostic emissions do not decide game flow.

## Resources and scope

Both native runners report closed browser resources and stopped server process groups 38937 and 40796. Port 5175 is free. All 50 observed command and descendant PIDs are absent; every tool session is terminal. Focused baseline commands recorded their parent command PIDs but did not sample every transient descendant; subsequent review, Knip and browser commands retained their observed descendant inventories.

The authorized paths are the card-lab module, its setup and script contract modules, the bounded declared-script paragraph in README, and this bead's three evidence files. The QA prelude, policy implementation, core state and engine event types are unchanged. No full review, fuzz, UI redesign, rules decision or card issue is required for this bounded development-only workflow.

Final diff inspection trimmed one trailing blank line in the setup test module after QA. This whitespace-only edit does not affect the served application or tested contract bodies.

## Final elapsed-time observation

After the parent session's commit acknowledgment, final commit preparation was sampled at 2026-10-11T20:00:51.003888+00:00. Dispatch-to-preparation elapsed wall time was 17.282941 minutes, including research, coordination, parent evidence review, verification and all waits. The earlier pre-acknowledgment observation (2026-10-11T19:55:12.719333+00:00, 11.644865 minutes) is retained in the friction record. The following operation stages only these two temporal evidence files and immediately creates the single local commit.
