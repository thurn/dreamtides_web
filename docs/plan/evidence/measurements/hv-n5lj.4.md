# hv-n5lj.4 measurements (top-level action UI on the engine)

Browser QA of the journey battle on the engine against the Random bot
(`?goto=battle&seed=1&ai=random`), dev server on port 5174, host load
2.6–3.9. The production bundle could not be measured: it crashes at load at
the base commit too (`pre-existing/hv-n5lj.4.md`).

## Long tasks (`PerformanceObserver('longtask')`, dev build)

| Moment | Long tasks (ms) |
| --- | --- |
| Before the card-face memo, per pass with an AI turn | 223, 63, 75, 137, 88, 80, 86, 241, 59 |
| After it, per pass with an AI turn | 58–171, typically one or two per pass |
| Battle mount (Begin Battle) | 167–316, once |
| Hand drag (pointer moves, drop, AI response) | 51–146 |
| First play into a target prompt, and its cancel | 126–787 (card remounts in the targeting stage) |

The React Profiler (`actualDuration` of `MobileBattleScreen`, dev build,
temporary instrumentation) put one re-render per log commit at 25–45 ms
after the change. CDP sampling attributes most of the remaining long-task
time to the React JSX dev runtime (`jsxDEV` self time 240–336 ms over a
three-pass sample); engine work in the fold was 1–21 ms per sample.

What changed the per-event cost:

- The engine view, decision, legal actions, and screen model are memoized on
  the engine slice, which changes only when an engine intent applies.
- Card models are cached by everything they show, and `BattlefieldCard` and
  `CardPile` memoize the card face, so an unchanged card skips its face
  (`GameCardSurface` fell from 232 ms to 47 ms inclusive over comparable
  samples).
- The screen's state resets run only when there is something to reset, so a
  log commit renders the board once.
