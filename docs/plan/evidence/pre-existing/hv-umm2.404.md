# Pre-existing issues found by hv-umm2.404

- `docs/plan/evidence/friction/hv-umm2.96.json`: `hostLoad` is an object, so
  `npm run friction:triggers` (the validation added in 372185386) exits 2 with
  "hostLoad: expected a finite number" on staging 372185386.
