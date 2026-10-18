# Pre-existing issues found in hv-j1n2.1

- **The first dream's challenger dialogues read their own anchor.** Each
  challenger's greeting branches on `anchorBeaten` at the anchor it stands
  at (`challengerDialogue` in
  `src/content/d97/dialogue/3229d6c7-0700-4f37-9b07-921e3dccb8b6.ts`). The
  dream lists those looks as its personas, and a persona placed by act
  assembly at another challenger anchor would test the wrong anchor. A
  "the speaker's own anchor is beaten" condition, or per-placement dialogue,
  belongs to assembly (3.2) or the dialogue conditions bead (3.16).
- **The catalog validators are not part of `npm run review`.**
  `npm run d97:dialogue -- validate` (now with the dream catalog validator)
  and `npm run d97:map -- validate --all` run only when a bead runs them by
  hand, so a catalog dream that breaks a reference reaches the gate
  unflagged. Wiring them into the review's quick stage is a tooling change
  for the workflow to decide.
