# Pre-existing issues found by hv-umm2.106

- `docs/plan/evidence/friction/hv-umm2.96.json` (landed in 56c18cda0): `hostLoad` is an object rather than a finite number, so `npm run friction:triggers` exits 2 on the base before this bead's file is read.
