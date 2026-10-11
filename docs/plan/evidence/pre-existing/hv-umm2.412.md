# hv-umm2.412: Pre-existing issues

- Greedy (`src/engine/policy/greedy.ts`) simulates each candidate with one
  unbounded `engine.apply`, and checks its iteration and wall-clock budget
  only between simulations. Legal actions offer a loop only as
  `count: "untilVictory"`, so simulating the acceptance of a loop whose
  iterations never end the battle (an energy-only loop, say) runs the whole
  repetition to the battle data module's `loopIterationCap` of 10,000
  iterations inside one simulation: about 0.7 s on a two-card synthetic
  board (`LOOP.freeChoice` answered with energy), per determinization.
  Determinizations that keep the loop on offer make that path reachable;
  live-play think time can overrun its D23 wall-clock cap whenever such a
  loop is on offer. A bounded simulation of `repeatLoop` belongs to Greedy.
