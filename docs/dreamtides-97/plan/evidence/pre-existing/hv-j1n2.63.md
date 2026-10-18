# Pre-existing issues found in hv-j1n2.63

- The local Universal LPC Spritesheet Character Generator checkout (commit
  9bf06be) has no CREDITS.csv row for
  `legs/pants/muscular/idle.png`, though it ships the sheet and its
  pre-colored variants. A D97 recipe uses
  `legs/pants/muscular/idle/red.png` (through `legs_widepants`), so
  `scripts/d97/link-characters.ts` reports it as the one used sheet without a
  credits row. Its walk sheet's row (`legs/pants/muscular/walk.png`) credits
  the same part, so the credits screen still names its authors.
- The generator's CREDITS.csv lists `??` as an author of
  `head/heads/human/male_plump/*` ("plump version by ??"); the generated
  credits carry it as written.
