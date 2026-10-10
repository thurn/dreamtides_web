# hv-n5lj.50 issues outside the menu-trigger clearance helper

- **`DeckGalleryOverlay`'s `clearMobileJourneyMenu` prop has no caller.**
  `src/cumulus/screens/DeckGalleryOverlay.tsx`: its only consumer,
  `StartingDeckOverlay`, never passes it, so the mobile menu clearance
  branch (scrim, reduced height, top margin) never renders in the app.
- **`CommandMenu` picks the platform edge inset itself.**
  `src/cumulus/components/overlay/CommandMenu.tsx` repeats the
  `isDesktop ? MENU_EDGE_INSET_DESKTOP_PX : MENU_EDGE_INSET_MOBILE_PX`
  choice that `chrome-geometry.ts` makes for `menuTriggerClearance` and
  `debugRerollCornerStyle`.
