# Judged card QA: hv-umm2.313

- Card UUID: `eae700c9-5005-4627-b8d6-a5c2c273e61a`, base variant.
- Base commit: `49085653661e40342fedf8ef7e41e35a27fd9ab4`.
- Checkouts, application code, and dependencies: the session's assigned worktree only; no application edits.
- Browser: global Playwright MCP, scenario runner's isolated context, first free port 5174. Every browser run used the shared heavy lock.

## Player setup and judgment

Open `?goto=card-lab&card=eae700c9-5005-4627-b8d6-a5c2c273e61a&variant=base&as=player&seed=1&debug=1`. Stage two enemy-hand instances of UUID `470bbf9d-a73c-4e00-bc66-cb0fa767c8de` (`i18`, `i19`) and one of `a28ad36d-fa74-4190-a463-7efd3a6233d0` (`i20`) through `qa.labAddCard`. The original source instance is `i1`. The hand is unknown to the player before play.

The source has a playable outline. Playing it opens a modal gallery with exactly the three legal instance IDs; the repeated printing stays two independent choices. The private prompt is owned by the player, role `chooseFromOpponentHand`, min/max 1/1, required, and not cancellable. Submit is disabled at 0/1. There are no Skip, Cancel, or Back actions. Escape keeps the required prompt. Reload restores its prompt ID and candidates. Selecting `i18`, then `i19`, replaces the one-card selection and enables Submit at 1/1.

Submitting takes exactly `i19`: its zone is hand, controller player, owner enemy. `i18` and `i20` stay in the enemy hand and remain known to the player. Source `i1` reaches the void, the stack and prompt clear, and a `cardTaken` event identifies `i19`. The battle log displays the transfer from the opponent's hand into the player's hand in plain language. This effect is an instantaneous zone transfer; a timed indicator is not applicable.

The final run retains `cardPlayed(i1)` and `resolved(i1)` before the prompt reload, plus `cardTaken(i19)` afterward. It waits for the transferred `i19` to render in the near-hand row face up. Its rendered card box is (705.484, 732, 128.906, 180.469) on desktop and (120.133, 664.109, 149.734, 209.625) on mobile. These are the fanned hand's card boxes, whose lower edges extend past the viewport; the card's visible region was observed at effective opacity ≥0.5. The full picker card boxes below are wholly within the viewport.

| Viewport | Candidate boxes (x, y, width, height), CSS px | Submit box | Judgment |
| --- | --- | --- | --- |
| Desktop 1440×900 | `i20` (204, 275.25, 240, 336); `i19` (452, 275.25, 240, 336); `i18` (700, 275.25, 240, 336) | (527.328, 681.25, 89.328, 42) | All three candidate centers hit their own card; control fits; selected Submit hits its own control. |
| Mobile 390×844 | `i20` (17, 82.5, 176, 246.391); `i19` (197, 82.5, 176, 246.391); `i18` (17, 352.891, 176, 246.391) | (150.328, 794, 89.328, 42) | All three candidate centers hit their own card; control fits; selected Submit hits its own control. |

The 8 px desktop card gap and 4 px mobile column gap were measured from the candidate rectangles. Candidate cards, prompt heading, counts, and submission are legible in `minds-door-prompt-desktop.png`, `minds-door-prompt-mobile.png`, and `minds-door-selected-desktop.png`.

The table uses the final run's DOM measurements immediately before the retained captures. The initial and selected states have identical bounds; the repeated completed runs agree. The engine debug rail is closed in these states.

## Enemy setup and judgment

Open the same route with `as=enemy`. The initial fixture has source `i10` on the stack, an engine decision `{kind:respond, side:player}`, no pending prompt, and no intent in flight. It parks on the human's synthetic Interrupt response. Before passing, stage two player-hand instances of UUID `470bbf9d-a73c-4e00-bc66-cb0fa767c8de` (`i19`, `i20`) and one `a28ad36d-fa74-4190-a463-7efd3a6233d0` (`i21`). The human hand also contains its Interrupt. The bot resolves `i10`, privately chooses from this nonempty human hand, and takes `i21`; its owner remains player and its controller becomes enemy. The AI then plays the taken card. Both viewports show a plain-language transfer and play in `minds-door-enemy-log-desktop.png` and `minds-door-enemy-log-mobile.png`. The engine observation contains `resolved(i10)` and `cardTaken(i21)`.

The lab's scripted initial stack has no ordinary play-reveal surface after staging. A separate real-play scenario covers that presentation: use `as=enemy`, keep the initial `i10` response boundary, add another source printing to the enemy hand (`i19`), and add human targets `470bbf9d-a73c-4e00-bc66-cb0fa767c8de` (`i20`) and `a28ad36d-fa74-4190-a463-7efd3a6233d0` (`i21`). Enemy energy is 8 after the scripted opening play. Passing lets the bot resolve `i10`, take/play `i21`, then regularly play `i19`. The reveal identifies that exact added instance and displays its full rules text. It grows, dwells, and departs. `cardPlayed(i19)`, `resolved(i19)`, and a second `cardTaken(i20)` are observed; `i20` ends in enemy hand with player ownership.

| Viewport | Real source reveal bounds, CSS px | Observed remaining dwell after grown-card sample | Capture |
| --- | --- | --- | --- |
| Desktop | (600.091, 281.556, 239.818, 335.745) | 1716 ms | `minds-door-enemy-reveal-desktop.png` |
| Mobile | (107.25, 299.156, 175.5, 245.688) | 1685.6 ms | `minds-door-enemy-reveal-mobile.png` |

These are observations of this run, not timing thresholds. The source text and card frame fit the viewport and were visually inspected. Captures beyond the usual three-image picker budget cover distinct opponent play-reveal and opponent log risks.

## Disabled affordance

In a separate fresh player lab, use the debug Energy stepper to reduce the human's energy from 10 to 1 through logged debug intents. The cost-2 source loses `data-battle-card-playable=true`. Tapping it leaves it in hand and creates no stack entry. Its card surface opacity stays 1; the available-play outline carries the visible legality distinction. This was exercised at both viewports before the separate enemy real-play scenario.

## Reports and runtime

| Run | Result | Scenario / total wall time | Host load | Server process group / port |
| --- | --- | --- | --- | --- |
| First harness attempt | Scenario assertion failure | 13.1 s / 15.6 s | 5.15 | 51798 / 5174 |
| Corrected four-case run | Pass; `__caps=[]` | 32.548 s / 33.827 s | 5.921 | 54861 / 5174 |
| Normal enemy reveal + disabled source | Pass; `__caps=[]` | 29.370 s / 30.340 s | 4.198 | 56099 / 5174 |
| Final four-case measurement run | Pass; `__caps=[]` | 32.084 s / 33.973 s | 8.955 | 70366 / 5174 |

The first harness attempt asserted that the transferred card also remained in the player's `knownTo` array after entering the player's own hand. The array tracks externally disclosed cards, and zone transfer clears the moved card's entry; own-hand visibility is intrinsic. The corrected assertion checks only the cards still held by the opponent. This was a scenario correction, not a product failure. Its report is preserved as `first-attempt.result.json`; the first completed four-case pass is also preserved as `four-case-first-pass.result.json`.

The runner closes each owned MCP context and stops only its own server process group. For 51798, 54861, 56099, and 70366, each runner reported `stopped; port free`; a separate PID check confirmed those groups' leaders stopped. The final lock waiter was process group 57194 and exited with its runner. Runtime artifacts are bead-local. All seven retained PNGs were checked with `file` and visually inspected at their expected desktop/mobile sizes. Scenario sources are ignored bead-local artifacts, excluded from the commit.

The measured debug-only mobile log-close overlap is recorded separately in `pre-existing/hv-umm2.313.md`. It concerns developer chrome with `debug=1`; it does not obstruct the private card gallery or its Submit. The mobile normal-play reveal's source bounds are reported above. Its image also shows the lower-right phase chrome adjacent to the source frame; that separate chrome was not independently measured during the reveal, so this QA does not assign it an additional geometry verdict.
