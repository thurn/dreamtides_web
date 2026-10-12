# Pre-existing observations

- `npm install` completed with exit 0 and reported 17 dependency advisories: 9 moderate, 7 high, and 1 critical. This is the installer summary, without an independent advisory audit or dependency changes.
- `qa.battle.promptOrAutoAnswer` (`scripts/qa/prelude.mjs`, `promptOrAutoAnswer`) throws `missing engine probe (use debug=1)` as soon as one poll finds `window.__engineProbe` absent, rather than waiting until its own timeout. The probe published by `src/battle/components/EngineDebugPanel.tsx` is transiently absent around card-lab loads and reloads on a loaded host (load 15–32), so two judged attempts failed on that throw and one restored-prompt wait timed out while the probe was absent. A bead-local retry around the helper made the judged run pass on desktop and mobile.
- On a host at load 32, one `qa.capture` hit Playwright's 30 s `page.screenshot` timeout after its scenario assertions passed.
