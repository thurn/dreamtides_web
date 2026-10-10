# hv-n5lj.33 issues outside the app-shell layer tokens

- **The session bounce toast renders outside every `.cumulus` scope.**
  `LocalGameProvider` (`src/session/hooks.ts`) mounts `BounceToast`
  (`src/components/BounceToast.tsx`) beside the app tree, and no ancestor
  carries the `cumulus` class, so none of `TransientStatusToast`'s tokens
  resolve there: its glass material, radius, padding, text color, type,
  and bottom offset all fall back to their initial values.
  The battle and prompt toasts render inside the journey chrome's scope and
  resolve normally. `TransientStatusToast` keeps its literal `zIndex: 60`
  (the `--layer-app-overlay` value), annotated, so that the bounce toast's
  computed z-index stays 60; tokenizing it needs the bounce toast to
  re-establish the token scope with its own `.cumulus` class, which changes
  that toast's rendering.
- **App-shell stacking literals outside this bead's list.** These surfaces
  stack on the same app-shell layers with literal `zIndex` values:
  `MobileDeckViewer` (60, the mobile twin of `DesktopDeckViewer`),
  `PoolViewerScreen` (60), the Transfiguration site's purchase travel (60,
  the twin of the shop and bazaar travels), `MobileBattleScreen`'s figment
  merge animation (60), `EngineDebugPanel`'s fixed hosts (60, twice),
  `TutorialBattleScreen`'s prompt banner (80) and victory screen (90),
  `DreamscapeScreen` and `DreamsignRevelationScreen` while replacing a
  screen (80), `TutorialScreen`'s travel layers (40, twice), and the Gamble
  site's HUD travel (42).
