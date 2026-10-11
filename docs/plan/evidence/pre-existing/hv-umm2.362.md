# Pre-existing issues found by hv-umm2.362

- `docs/plan/engine-design.md` (§ Presentation) and the header comment of `src/battle/components/battle-presentation.ts`: both say the prompt host shows a prompt once the queue is idle; the prompt host also waits for the presentation's notice to clear (`promptPresentable` in `src/battle/components/presentation-items.ts`), which neither names.
- `src/battle/components/battle-presentation.ts` (`PresentationQueue`) and `src/cumulus/screens/battle-overlays/BattlePromptHost.tsx` (`BattlePromptNotice`): a notice's expiry is a timer in the rendered toast, not part of the queue. The prompt host waits for the notice to clear, and the toast is rendered whenever a notice is set, but an expiry owned by the queue would not depend on rendering.
