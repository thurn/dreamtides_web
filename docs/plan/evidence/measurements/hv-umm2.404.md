# hv-umm2.404 measurements

Base `3721853869f4265f66dd4174067efab7fd7adab0` (staging with hv-umm2.412).
Vitest uses two workers. Heavy runs held the machine-wide heavy lock. Load is
`sysctl -n vm.loadavg`'s 1-minute value.

## Fuzz step cost (`npm run perf:ab -- 372185386 --workload fuzz --rounds 5 --args "--games 200"`)

The release-config fuzz step: 200 games, interactive replay every 10th game.
B checks determinization fidelity at the first decision after every 10 steps
and adds the `FIDELITY_CARDS` fixture to the synthetic deck pool, so B's decks
differ from A's (A 101,130 steps, B 99,228 steps).

| Side | CPU median (range) | Wall median (range) | Load median |
| --- | --- | --- | --- |
| A, base | 46.37 s (45.95–55.34) | 41.75 s (41.32–50.36) | 3.66 |
| B, head | 50.49 s (49.41–59.33) | 45.43 s (44.44–53.59) | 3.52 |

B vs A: CPU +8.9%, wall +8.8%. Round 5 of both ran at load 16–20; the
medians come from rounds at load 3.3–3.8. The fuzz step stays under 60 s.

## Fuzz results

| Run | Load at start | Result |
| --- | --- | --- |
| `fuzz:engine -- --games 200` (release config) | 4.38 | 200 games, 99,228 steps, 2,212 prompts, 224 interactive re-runs, 46.3 s wall, 51.3 s CPU, 0 failures |
| `fuzz:engine -- --games 300 --weight-uuids` 9adbe3db-d872-4b75-92b5-d7f2798c22ce, 738a5af0-f848-4d48-bceb-9a43c9b11066, fa036c27-2234-4f76-8857-c242530627ce, 6f1833a0-30f5-4718-9a3e-7620beb72bfc, cd3d8e4a-618e-4c2f-be60-0363b81887f1 | 5.13 | 300 games, 147,730 steps, 2,767 prompts, 300 interactive re-runs, 68.3 s wall, 74.9 s CPU, 0 failures; every target included 611–618 times and exercised 195–254 times |

## Negative probe

`src/engine/view/view.ts` was edited in place and restored from a copy; its
SHA-1 `6658d015ac31ea818de1b32f47c519ac0b09fde3` matched after each probe.

- hv-umm2.384 raw-status retention reverted (`status` masks `reclaimed` with
  `banishedAsReclaimed`): the weighted 100-game fuzz on 9adbe3db… and
  738a5af0… fails 10 games, first fuzz-10 before action #134 (after step
  #417): public card i46 (5e5e5e5e-0000-4000-8000-00000000000a) status
  `reclaimed` false for true, for both sides.
- hv-umm2.379 permission retention reverted (`floatingVisible` requires a
  visible source for a play permission): the release-config 200-game fuzz
  fails 3 games: fuzz-46 before action #196 (after step #623), fuzz-102
  before action #117 (after step #328), and fuzz-185 before action #58
  (after step #151), each with floating effect `e1`/`e4` (a `playFrom`
  permission from the hidden `FIDELITY_CARDS` source) missing for both sides.
- Both reverted: the release-config 200-game fuzz fails 6 games (fuzz-46,
  48, 57, 91, 102, 185); fuzz-48 fails before action #131 (after step #386)
  on public card i4 (5e5e5e5e-0000-4000-8000-000000000002) status.

Before the fixture, 300 release-config games reached 59 decision states holding a permission, and
none with a hidden source, and the hv-umm2.379 probe passed a weighted
100-game run. With it, 200 games reach 377 such decision states in 7 games.

## Validation

| Command | Wall | Load at start | Result |
| --- | --- | --- | --- |
| `npx vitest run src/engine/view/determinize.test.ts` | 1.3 s | 27 | 24 pass |
| `npm run review` | 12.3 s | 27.5 | typecheck, lint, cycles, 13 related files / 136 tests pass |
| `npm run knip` | 3.9 s | 27 | clean |
| `npm run review:full` (heavy lock) | 75.7 s | 29.0 | 329 files / 3,502 tests, lint, knip, bundle pass |
