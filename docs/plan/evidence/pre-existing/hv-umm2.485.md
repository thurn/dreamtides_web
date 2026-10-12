# Pre-existing issues found by hv-umm2.485

- `scripts/qa/prelude.mjs` (`qa.battle` answer, gallery branch, and its `tap` helper): candidates are tapped through an `elementFromPoint` hit test at the element's on-screen box without scrolling it into view, so on mobile (390×844) a card-picker gallery whose required candidates lie below the fold never reaches its count and `playUntil` stalls (seen with a 7-of-8 `banishCost` gallery; desktop fits every candidate and passes).
