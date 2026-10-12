# Pre-existing issues seen in hv-umm2.488

- `scripts/content-inventory.ts` still names `src/content/specs/index.ts` in each planned content bead's `Areas:` (`SPECS_INDEX`) and in its additive-file set. With scenario modules discovered, a bead adds only its own module file, so that Area is unused; the next inventory regeneration (outside this bead's Areas) can drop it.
