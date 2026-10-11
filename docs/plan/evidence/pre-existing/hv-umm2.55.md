# Pre-existing observations — hv-umm2.55

- The fresh worktree's `npm install` reports 17 dependency vulnerabilities (9 moderate, 7 high, 1 critical). Dependency upgrades are outside this content bead.

- During custom debug setup, blurring a long Card UUID input emits an input scroll that dismisses the Zone Select's menu. The captured focus/scroll trace showed focus reaching the Hand option, then `scroll` on `INPUT`, followed by an empty option list. Moving the input caret to Home and using the established locator-click sequence made setup reliable on both viewports. Diagnostic capture: `diagnose-zone-menu.png`. The player workflows use the existing UI unchanged.
