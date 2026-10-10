# hv-n5lj.6 measurements (Phase 4.4 presentation and indicators)

Base `20a249125`. Captures are in the primary checkout's gitignored
`artifacts/qa/hv-n5lj.6/`, with the bead-local scenarios `present.mjs`,
`battle.mjs`, and `prod-longtasks.mjs` beside them
(`node scripts/qa/run-scenario.mjs <path> --bead hv-n5lj.6 [--prod]`).

## Validation

| Check | Wall time | Host load | Result |
| --- | --- | --- | --- |
| `npm run review` | 36 s | 2.9 | 160 related files, 1877 tests pass |
| `npm run review:full` | 41 s | 4.1 | 214 test files, 2437 tests pass |
| `present.mjs` (dev, both viewports) | 294 s | 3.0 | PASS, every `__caps` empty |
| `battle.mjs` (dev, before and after) | 44 s / 63 s | 3.1 / 4.6 | PASS, every `__caps` empty |
| `prod-longtasks.mjs --prod` | 80 s | 3.6 | PASS, `__caps` empty |

Test files 214 → 214, jsdom files unchanged.

## Judged presentation pass

`present.mjs` drives the presentation fixtures (`?goto=prompt-lab-present-*`
plus `auto-target`, `draw-discard`, `capacity`, `reclaim`, `prevent`, and
`loop`) through the UI at 1440×900 and 390×844, sampling the transient
visuals (reveal, score, notice, Dreamwell card, turn announcement, result)
and the status badges after each action. `battle.mjs` covers the Dreamwell
reveal and an AI reveal in the seed-1 journey battle. One verdict per event
kind and viewport is in `qa-ledger/hv-n5lj.6.jsonl` (subject
`event:<kind>`, `uuid` null). `promptLabPresentation` (tooling test) proves
the fixtures publish every kind except `dreamwellDrawn` (journey battle
only) and `feasibilityBounded`.

## Before and after (seed-1 journey battle, Greedy bot)

The same `battle.mjs` ran on a `git archive` snapshot of the base
(`before-*`) and on this bead (`after-*`). Pixel differences (threshold 24):

| State | Desktop | Mobile |
| --- | --- | --- |
| Battle Start preview | none | none |
| Battle start | top-left 86×96 only: the battle log control | top-left 86×90 only |
| The player's turn-5 Day | top-left only | the log control, and the seven-card hand: its leftmost card (Final Witness) shows instead of sitting off screen |

Intended changes: the battle log control, the crowded mobile hand fan
(added scope), and the presentation visuals (AI reveal, Dreamwell reveal,
score announcement, badges), which the base never draws. Against the 4.0
baseline (`artifacts/qa/hv-n5lj.1/`) the board, piles, status displays, and
hand keep their geometry; the prototype inspector rail and prompts there
predate Phases 4.2 and 4.3.

## Mobile fixes (added scope)

- **Crowded hand:** a hand of six or more cards fans over 62% of the row
  centered at 55%. Seven cards at 390×844: the leftmost card's uncovered
  strip is 40–46 px against 46–50 px for the others (it was 0–5 px).
- **Front lanes:** with back-rank characters at `B0`, `B4`, and `B6`, the
  mobile window shows `F0`–`F6`, so `B6` can move to `F6`.

## Long tasks during AI turns (production build)

`prod-longtasks.mjs --prod`: the smoke walk to Battle Start, then passes
through five AI turns of the seed-1 battle with a `longtask`
PerformanceObserver.

| Build | AI turns sampled | Long tasks inside AI turns (ms) | Other |
| --- | --- | --- | --- |
| This bead | 5 | 60, 54, 145, 63, 87, 75, 205 | battle mount 175 |
| Base | 1 | 58 | battle mount 169 |

The production build has long tasks during AI turns (seven over five turns,
the longest 205 ms), so 4.5's "no long main-thread tasks" does not hold in
production either; it was measured only in development before. Each applied
intent now also builds two engine views (presentation and the battle log)
on the main thread.
