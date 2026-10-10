# hv-n5lj.5 measurements (PromptHost)

Validation at base `58dcc7110`, host load 5.4–6.5 (1-minute `vm.loadavg`).

| Check | Wall time | Result |
| --- | --- | --- |
| `npm run review` | 46 s | 157 related files, 1837 tests pass |
| `npm run review:full` | 46 s | 213 test files, 2411 tests pass |
| `npm run fuzz:engine -- --games 200` | 42 s | 102219 steps, 1533 prompts, 0 failures |
| Production bundle (`vite build`, served on 5175) | 5 s build | loads the Avatar selection with no page errors |

Test files: 214 → 213 (jsdom unchanged).

## Present, then ask

`?goto=prompt-lab-draw-discard`, desktop: the hand grows by the two draws
112 ms after the tap; the discard prompt appears at 1677 ms, after the queue
presents the play and both draws (`BATTLE.presentation.eventDwellMs` 450 ms
each). Mobile: no picker right after the tap; the prompt at about 2.1 s.

## Banner geometry

The prompt banner ends at y = 79.5 on both viewports; the far status display
starts at y = 89.1 (1440×900) and y = 99.6 (390×844). Checked for the board
target, play route, pay-or-decline, response window, and loop banners.
