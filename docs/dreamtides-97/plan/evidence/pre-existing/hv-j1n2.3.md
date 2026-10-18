# Pre-existing issues found in hv-j1n2.3

- **Persona dialogue still tests its authored anchor.** Act assembly now
  seats generic challengers at empty challenger anchors with their dream's
  personas, each speaking the persona's dialogue. The first dream's
  challenger dialogues branch on `anchorBeaten` at the anchor their authored
  resident stands at (hv-j1n2.1's note), so a persona placed elsewhere would
  read the wrong anchor. The real catalog fills no empty challenger anchor
  today (every anchor of the first dream is authored), so nothing plays it
  yet; a "the speaker's own anchor" condition belongs to the dialogue
  conditions bead (3.16).
- **`D97QaSurface.dream` describes a missing feature.** Its doc comment in
  `src/d97/overworld/qa-surface.ts` reads "its map, until dreams exist",
  though dreams exist; it returns the map the scene plays.
