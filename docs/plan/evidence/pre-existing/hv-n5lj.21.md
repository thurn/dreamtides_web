# Pre-existing issues found by hv-n5lj.21

Measured on production builds at staging `6761a8219`; see
`docs/plan/evidence/measurements/hv-n5lj.21.md`.

- **`GameCard` text fits twice on mount** (`src/cumulus/components/card/CardView.tsx`
  `useCardMetrics`, `src/cumulus/components/controls/useFitText.ts`): the
  card measures its width in a passive effect, so it first fits its rules
  text and stat orbs at the default width, then re-renders and fits again at
  the measured width. Each fit is a binary search over forced layouts. On the
  AI's card reveal this costs 17–28 ms after the commit and keeps every
  remaining AI-turn long task over 50 ms.
- **Production builds post every log record to `/api/log`**
  (`src/logging.ts` `postLogRecordToDevServer`, skipped only under Vitest):
  outside the dev server the request fails, and each record is also
  stringified for it; `logEvent` costs about 5 ms per AI-turn long task.
- **Compositor stalls of 145–215 ms** during some AI turns, mostly about
  6 s into the turn, in both builds: main-thread `Commit` or `PrePaint` with
  no JavaScript on the stack. Not reproduced on demand.
