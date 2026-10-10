# hv-umm2.47 measurements (Phase 5 scenario-spec file projection)

Counted at staging `9b5c70695` with
`git ls-files | grep -E '^(src|scripts|eslint-rules)/.*\.(test|spec)\.(js|mjs|cjs|ts|mts|cts|jsx|tsx)$'`,
the patterns `vitest.config.ts` collects.

| Layout | Test files after Phase 5 batches | D19 cap |
| --- | --- | --- |
| Before this bead | 213 | 220 |
| One `<slug>.spec.ts` per batch (28 batches, hv-umm2.3–.30) | ~241 | 220 |
| One `<slug>.scenarios.ts` module per batch, one runner (this bead) | 214 | 220 |

- This bead adds one test file, `src/content/specs/specs.test.ts`, and puts
  the runner's failure-behavior cases in the existing
  `src/engine/testing/tooling.test.ts`.
- Each batch then adds a plain scenario module and a registration line, and
  no test file, so the 28 batches leave the count at 214.
- The runner file imports the content catalog once for every batch's
  scenarios, where the per-batch layout imported it once per batch file.
- With no modules registered, the runner file runs one case (the registry
  case) in about 1 ms after a ~0.8 s first import, at a 1-minute host load of
  about 5.
