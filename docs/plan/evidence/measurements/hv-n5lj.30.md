# hv-n5lj.30 measurements (battle board memo boundaries)

Base `43a89b09e`, run from a detached snapshot outside the repository
(`--cwd`). Captures and raw results are in the primary checkout's gitignored
`artifacts/qa/hv-n5lj.30/`. Every run went through the QA runner
(`node scripts/qa/run-scenario.mjs <scenario> --bead hv-n5lj.30`).

## Render profile (development build, not gated)

`profile.mjs` installs a minimal React DevTools hook and, on every commit,
counts a function component as rendered when its props object is new (a
memoized component that skipped keeps its previous props). It passes the
seed-1 Greedy battle (`?goto=battle&seed=1&ai=greedy`, desktop) through two
AI turns and summarizes the commits made during the far side's turns.
`--arg debug=1` lists each board region's changed props per commit.

| | Base | This bead |
| --- | --- | --- |
| Host load | 3.84 | 5.18 |
| Far-turn commits | 42 | 41 |
| ...rendering a far region (FarHand, enemy SideZones or Rank) | 19 | 11 |
| ...rendering a near region (NearHand, player SideZones or Rank) | 19 | 9 |
| ...rendering a far region but no near region | 0 | 2 |
| Function components rendered | 3273 | 1947 |
| Development render time (`actualDuration` sum) | 643 ms | 379 ms |

In the base every far-turn commit that touched the board re-rendered both
sides, because the screen's interactions object, view, and callbacks were new
on every render. With this bead an enemy play (`FarHand` `cardIds`, enemy
`SideZones` `side`, enemy `Rank` `slots`) re-renders the far regions while
`NearHand` and the player's `SideZones` skip; the player's ranks re-render
only for a prop that changed (the mobile lane window's `mobileStartIndex`).
The near-side commits that remain change the player's interactions: a turn
or phase change moves `canInteract` (whether the human holds a decision),
`activeSide`, `phase`, or `showChallengerChevrons`.

## Long tasks during AI turns (production build)

hv-n5lj.21's `prod-big.mjs`, `--prod` (unminified), unchanged: the smoke walk
from the front door to the seed-1 journey's battle, then three AI turns
under a `longtask` PerformanceObserver.

| Run | Host load | AI-turn long tasks | All long tasks (ms) |
| --- | --- | --- | --- |
| Base 1 | 3.10 | none | 146, 50 |
| Base 2 | 3.57 | none | 138 |
| Base 3 | 3.02 | none | 105 |
| This bead 1 | 3.46 | none | 116, 53 |
| This bead 2 | 3.94 | none | 122 |
| This bead 3 | 4.09 | none | 125 |

No run has a long task inside an AI turn; the remaining task (105–146 ms)
is the battle's opening, outside the AI turns.

## Rendering and interaction checks

- hv-n5lj.24's `battle.mjs` (desktop and mobile, `base-*` and `after-*`):
  the same phases, reveals, Dreamwell cards, and battle log in both runs;
  every capture is pixel-identical except `ai-reveal`, taken mid-animation,
  which differs as much between two runs of one checkout (hv-n5lj.29's
  `base` and `base2`).
- hv-n5lj.8's `tutorial.mjs` (desktop): identical beat checks; the captures
  differ only inside animated surfaces (`30-victory`, `31-journey-start`).
- `interact.mjs` (desktop and mobile): a hand character dragged to the back
  rank, repositioned to the front rank on the next turn, and a hand card
  tapped land in the same slots and zones in base and this bead, with an
  empty `__caps`. The enemy's plays in these longer dev runs vary with the
  policy worker's timeouts (`pre-existing/hv-n5lj.30.md`); on production
  builds the board after `prod-big.mjs`'s AI turns matches.
