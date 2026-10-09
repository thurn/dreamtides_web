# hv-47xj.51 issues outside the journey-menu fallback fix

- **Journey menu layer is a literal.** `CommandMenu`'s app-chrome placement
  (`src/cumulus/components/overlay/CommandMenu.tsx`) stacks with literal
  `zIndex` values (60, 65 when elevated, 61 for its status line) rather than
  the `--layer-app-chrome` token that the journey menu's error fallback
  reads. The two must stay equal by hand until the menu reads the token.
- **Sibling chrome boundaries use the in-flow fallback.** The
  `overlay:cumulus-status-bar` and `overlay:card-tutorial-guidance` error
  boundaries in `src/components/CumulusJourneyChrome.tsx` render the default
  fallback unpositioned, the arrangement that hid the journey menu's
  fallback beneath the routed screen. Not reproduced in the browser.
