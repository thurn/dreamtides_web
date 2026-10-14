# Pre-existing issues observed by hv-umm2.236

- `src/engine/view/view.ts` maps ordinary private-source queued triggers to anonymous placeholders, while `docs/rules.md` limits observing a hidden card's triggered ability; `src/engine/view/determinize.ts` drops those unknown-source entries. This bead preserves that existing behavior and applies the observer guard to its new rule-reaction kind.
- `src/rules/battle/fold.ts` validates ordinary queued ability/node indexes structurally without an EngineCatalog. A structurally valid out-of-range or non-floating node can fail later at descriptor resolution. The parser accepts textless and synthetic origins; catalog-aware validation of every existing queue is separate from this bead's strict new-kind tuple and descriptor checks.

- At the 390px mobile viewport with `debug=1`, the fixed bug opener visually covers the right edge of the top Cancel button (`apple-three-routes-mobile.png`). Both existing positions are outside this bead's changes. The Cancel center remains usable and actual cancellation passed; this is a visual QA observation without measured overlap bounds.
