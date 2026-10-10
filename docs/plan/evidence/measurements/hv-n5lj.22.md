# hv-n5lj.22 measurements (card text fit once; production log POSTs)

Base `fd3208051`, run from a detached snapshot outside the repository
(`--cwd`), interleaved with this bead's checkout. Scenarios and raw results
are in the primary checkout's gitignored `artifacts/qa/hv-n5lj.22/`. Every
long-task number comes from a `vite build` served by `vite preview` through
the QA runner:

```sh
node scripts/qa/run-scenario.mjs artifacts/qa/hv-n5lj.22/prod-fitonce.mjs \
  --bead hv-n5lj.22 --prod --arg turns=5 [--cwd <base snapshot>] [--arg count=1]
```

`prod-fitonce.mjs` is hv-n5lj.6's `prod-longtasks.mjs` (the smoke walk to
Battle Start of the seed-1 journey, then six AI turns under a `longtask`
PerformanceObserver; a task is an AI-turn task when it starts between the far
side's turn start and the near side's) plus a count of `/api/log` requests
over the whole run (Playwright `request` events) and, with `count=1`, of
text-fit probes: every `Element.scrollHeight` read, with its card, element,
and zone. Each fit reads `scrollHeight` once per candidate size.

## Text fits

| Build | Probes over six AI turns | Probes per revealed card | Fits per revealed card (rules, energy, spark) |
| --- | --- | --- | --- |
| Base | 2385 | 93 | 3, 3, 3 |
| This bead | 845 | 31 | 1, 1, 1 |

The base fitted each card at the default width in its first layout pass,
again at its measured width (a passive effect), and once more in the
`document.fonts.ready` microtask, which runs in the same task when the fonts
have already loaded. This bead measures the width in a layout effect before
any fit runs, and re-fits on `fonts.ready` only when a font is still loading
after the fit. Every remaining fit in the AI turns is one per mount: each
revealed card, the stack card that follows it, and the card drawn at the
near side's turn start.

## Long tasks during AI turns

Interleaved rounds, six AI turns each; ms of each AI-turn long task.

| Run | Host load | Wall | AI-turn long tasks (ms) |
| --- | --- | --- | --- |
| Base 1 | 2.95 | 99 s | 53, 70, 66, **153**, 53, 50, **152**, 60, 58 |
| This bead 1 | 5.26 | 97 s | **199**, 53, 52 |
| Base 2 | 4.16 | 97 s | 50, 53, 52, 58, 60 |
| This bead 2 | 3.43 | 97 s | **153** |
| Base 3 | 4.12 | 96 s | 55, 56, **147**, 52, 64, 62 |
| This bead 3 | 3.48 | 97 s | **200**, 58 |

Bold tasks are compositor tasks (over 100 ms, see below).

| | JavaScript long tasks | Over 50 ms | Median | Max | Sum | Compositor tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 17 | 15 | 56 ms | 70 ms | 972 ms | 3 (147–153 ms) |
| This bead | 3 | 3 | 53 ms | 58 ms | 163 ms | 3 (153–200 ms) |

The probe runs (`count=1`, instrumented, loads 5.03 and 4.02) agree: base
87, 53, 50, 56, 56, 66 and one 144 ms compositor task; this bead 76, 50, 51,
51.

## Remaining long tasks, attributed

Two traces of this bead (`prod-trace.mjs` from hv-n5lj.21, loads 2.99 and
4.01) attribute every AI-turn task of 40 ms or more. Tracing adds about
10–15% to each task.

- **The near side's turn start (52–53 ms untraced, 51–66 ms traced),**
  200–330 ms before the AI turn ends: the `TimerFire` presentation step that
  hands the turn back folds the end of the AI's turn, re-renders the battle
  screen, and mounts the drawn hand card. The card fits once (rules text and
  two stat digits: 31 forced layouts); in the trace, `fits` is 11–16 ms self
  and the width measurement's forced layout (`offsetWidth`) 6–9 ms. The digit
  fits are 30 of the 31 layouts: see the pre-existing issues.
- **About 6 s into an AI turn, about 2.1 s after a reveal (58 ms untraced;
  44–62 ms traced):** the compositor tasks' follow-ups. In the trace the
  tasks at that point are `Commit` with no JavaScript on the stack, right
  after a 196 ms `PrePaint` task, as in hv-n5lj.21's compositor stalls.
- **Compositor tasks (153–200 ms)**, at most one per run, at the same point
  of the turn in both builds: `PrePaint` or `Commit`, all `(program)`.
  Recorded by hv-n5lj.21; unchanged here.

## Production log requests

| Build | `/api/log` requests over the smoke walk and six AI turns |
| --- | --- |
| Base (3 runs) | 317, 315, 315 |
| This bead (3 runs) | 0, 0, 0 |

A `vite build --minify false` of this bead holds no `/api/log` string and no
`postLogRecordToDevServer`; `deliverJourneyLogRecord` keeps only the
journey-log capture.

## Visual comparison

Dev server, base and this bead, at 1440×900 and 390×844 (`cards-visual.mjs`
with reduced motion, `reveal-visual.mjs` without). For every visible card
it compares the rect, text scale, and computed rules and digit font sizes,
and the pixels of each card's clip:

- the playable battle's near hand (five cards per viewport) and the desktop
  hover reading preview (three card surfaces);
- the card-lab's longest-text card in hand and on the AI's stack;
- the AI's played-card reveal (`BattlePlayReveal`) in the seed-1 journey
  battle, 1 s in.

All metrics are equal and all 19 clips and four full-page captures are
pixel-identical (`cmp/base-*.png` against `cmp/after-*.png`;
`{base,after}-{desktop,mobile}-hand.png`, `-desktop-reveal.png`,
`-desktop-hover.png`).

## Validation

| Check | Wall time | Host load | Result |
| --- | --- | --- | --- |
| Focused tests (`card-components`, `logging`) | 1.4 s | 3.2 | pass |
| `npm run review` | 30 s | 3.68 | pass, 1093 related tests |
| `prod-fitonce.mjs --prod`, 3 + 3 runs, 2 + 2 probe runs | 101–104 s each | 2.95–5.26 | PASS, `__caps` empty |
| `prod-trace.mjs --prod`, 2 runs | 101–104 s | 2.99–4.01 | PASS |
| `cards-visual.mjs`, `reveal-visual.mjs` (dev), base and this bead | 43–70 s each | 2.81–5.18 | PASS, identical |
