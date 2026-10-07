# hv-7x4l.33 pre-existing issues

- **Plan pages name a `src/content/data/` directory.** The data modules live
  directly in `src/content/` (`ai.ts`, `tutorial.ts`, `economy.ts`, …), but
  `docs/plan/phase-7-ai.md` (the AI weights, `src/content/data/ai.ts`),
  `docs/plan/phase-6-tutorial.md` (`src/content/data/tutorial.ts`), and the
  example Areas line in `docs/plan/workflow.md`
  (`src/content/data/economy.ts`) use the `data/` path. Those pages are
  outside this bead's Areas; `engine-design.md` now names the real paths.
- **`StepDefinition.canceller`'s doc comment says only a play can be
  cancelled.** `src/engine/steps/types.ts` reads "Only a side's own play can
  be", but `activate` also returns its source's controller
  (`src/engine/steps/kinds/activate.ts`), so a side's own activation is
  cancellable before its commit point too, as engine-design § The rules-code
  contract states. The comment needs a one-word fix in an engine bead.
