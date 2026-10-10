# hv-n5lj.36 issues outside the chrome error-fallback inset

- **The menu-trigger clearance formula is copied per consumer.** The top
  edge below the journey menu's trigger,
  `max(safe-inset-top, --safe-top, max(safe-inset-top, edgeInset) +
  MENU_BUTTON_PX)`, is composed separately in `DraftScreen`'s
  `topSafeOpFor`, `journey-result-layout`'s
  `JOURNEY_RESULT_TOP_CHROME_CLEARANCE`, `DeckGalleryOverlay`, and
  `CumulusJourneyChrome`'s `MOBILE_CHROME_FALLBACK_TOP`, all from the
  constants in `src/cumulus/primitives/chrome-geometry.ts`. One exported
  clearance helper there would keep every consumer in step with the trigger.
