# hv-7x4l.9 pre-existing issues

- **A card keeps its exhausted status in a deck or hand.** `relocate` in
  `src/engine/rules/zones.ts` clears `status.exhausted` for every destination
  except a deck and a hand, so a character returned to its owner's hand from
  play stays exhausted there. No rule reads a hand card's exhaustion, and the
  card enters play exhausted again unless it is awakened, but the state then
  differs from the same card drawn fresh. Loop detection sees the first
  return as a new position, so a loop that bounces a character to hand is
  offered only after a second manual repetition
  (`src/engine/loops/loops.test.ts`, "offers and replays a loop of plays").
  Clearing the status on every zone change would match rules § Exhaust and
  Awaken. It needs its own bead, since it changes `src/engine/rules/zones.ts`.
