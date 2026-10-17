# Pre-existing issues found by hv-pcce.16

- **The hv-rtga.12 quest-flow QA script selects the quest log by
  `[data-glass-dialog-panel]`.** Since eafe548cc the D97 panels render
  through `D97Panel` (`[data-d97-panel-frame]`), so the script fails with
  `quest log overflows null` before reaching any quest behavior. hv-pcce.16
  reran a copy with the selector updated
  (`artifacts/qa/hv-pcce.16/quest-flow.mjs`); the original is unchanged.
- **Browser QA after `npm run review` needs workspace preparation again**
  (recorded by hv-rtga.16). With the compiled maps removed, a `/d97` run now
  shows the dream-unavailable surface and logs `d97_dream_unavailable`
  instead of playing another dream, until `node scripts/prepare-workspace.mjs`
  runs.
