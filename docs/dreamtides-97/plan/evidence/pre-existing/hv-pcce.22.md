# Pre-existing issues found in hv-pcce.22

- **A preview or shop panel whose opening intent bounces stays open empty.**
  Opening an encounter preview for the first time sends
  `D97_PREVIEW_ENCOUNTER` and opens the preview panel at once; the preview
  renders only once the encounter folds into the run. When the fold bounces
  (for example, the content cannot build the opponent's deck, or the
  incarnation has no Avatar), the panel stays open with nothing drawn, and the
  canvas ignores input until a reload. The shop panel behaves the same when
  `D97_OPEN_SHOP` bounces. The resolver refuses everything the rules'
  predicates can answer before the fold; the remaining bounces depend on
  content the overworld does not see. Closing an opened panel when its intent
  bounces needs the intent outcome from `actions.d97`.
