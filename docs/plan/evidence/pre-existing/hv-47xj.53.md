# hv-47xj.53 issues outside the chrome error-fallback layering

- **Mobile menu trigger overlaps a sibling chrome fallback's title.** When
  the `overlay:cumulus-status-bar` or `overlay:card-tutorial-guidance`
  boundary trips on mobile (390x844), the in-flow fallback panel sits at the
  top of the chrome on the app-chrome layer, and the journey menu's
  hamburger trigger (same layer, later in the DOM) paints over the leading
  letters of the fallback title. The fallback's title and buttons stay
  hit-testable and the trigger stays usable; the panel has no top
  reservation for the chrome trigger (`--safe-top`). Seen in
  `artifacts/qa/hv-47xj.53/mobile-390-card-tutorial-fallback.png`.
- **App-shell stacking is a set of literals.** Many full-screen and
  floating surfaces stack with literal `zIndex` values at or around the
  app-chrome layer rather than named `--layer-*` tokens, so their order
  relative to the journey chrome is kept by hand: `GlassDialog`,
  `DeveloperRail`, `TransientStatusToast`, `DeckGalleryOverlay`,
  `DesktopDeckViewer`, `CardZoneBrowserOverlay`, and the shop and bazaar
  site screens at 60; `PoolViewerFloatingController` at 58;
  `JourneyStatusBar` at 40, 41 and 70; `BattleResultSurface` at 80;
  `Select` at 90; `RadialAnnouncement` at 55 and 110.
