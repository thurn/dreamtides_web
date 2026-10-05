# hv-47xj.14 follow-ups outside the bead's areas

- `vendor/iosevka-ron/` (two font files, license, README) is unused by `src/`
  and `index.html`; its README documents `scripts/build-iosevka-ron-font.py`,
  which this bead deleted with the RON tooling it served.
- `.gitignore` lines 28–30 name outputs of deleted screenshot tools
  (`scripts/mobile-screenshot.mjs`, `screenshots/`,
  `artifacts/journey-desktop-screenshots/`).
- `src/runtime/device-frame.ts` (line 3) and
  `src/cumulus/primitives/cumulus-tokens.css` (line 280) cite
  `scripts/device-screenshots.mjs` and `scripts/screenshot-devices.mjs`,
  which this bead deleted.
- `scripts/regenerate-replay-fixtures.mjs`'s header cites a deleted doc
  (`docs/journey_prototype/qa_tooling.md`) and TOML data.
- Eleven application modules live under `scripts/` because `src/` or
  `vite.config.ts` imports them: `saved-journeys-api.mjs` (+ test),
  `exploration-effect-kinds`, `glossary-source`, `tutorial-battle-contracts`,
  `reward-selection-contracts` (+ test), each `.mjs` with a `.d.mts`. They
  belong in `src/`.
- knip reports `estree` as an unlisted dependency of
  `eslint-rules/engine-purity.js` (a JSDoc type import satisfied
  transitively by `@types/estree`).
