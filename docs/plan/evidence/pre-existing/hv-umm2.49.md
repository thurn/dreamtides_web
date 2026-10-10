# hv-umm2.49 pre-existing issues

Seen at staging `d701c4973` while adding the `discover` primitive.

- **The Discover glossary and tutorial copy contradict the rules.**
  `src/content/glossary.ts` (term `5bda4696-32f9-4df2-a784-80120d76578b`) and
  the matching Mira line in `src/content/tutorial.ts` say Discover *reveals*
  three matching cards and the player chooses one *to draw*. rules.md §
  Keywords and Effects → Discover (RD-hv-umm2.49-1) has the player *look at*
  them privately and *put* one into hand, which is not a draw.
- **Primitive beads' Areas omit the registry table.** Registering a primitive
  needs one getter in `src/engine/effects/registry.ts` (its `satisfies`
  clause makes a missing one a type error), but the Areas that
  `scripts/content-inventory.ts` plans for primitive beads list only the
  module, `primitives/index.ts`, and the group test file.
- **The card sweep cannot take its cards from the bead.**
  `scripts/qa/card-sweep.mjs --bead <id>` without `--cards` fails with
  "--cards <uuid,...|starter> is required", although the Phase 5 recipe
  (step 7) and workflow § Card QA give `--bead <id> --port <port>` as the
  whole command. It also sweeps only `as=player` unless `--as both` is given,
  while the recipe requires both sides.
- **The card picker's gallery sits left of center on desktop.** At 1440×900
  a `chooseCards` gallery of three deck cards spans x 180–963 rather than
  centering (`judged-desktop-discover-prompt.png`).
- **The debug-panel button covers the battle log's close button on mobile.**
  With `debug=1` at 390×844 the engine debug toggle sits over the log
  dialog's close control (`rejudge-enemy-mobile-log.png`); development only.
