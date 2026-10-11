# Pre-existing observations: hv-umm2.313

## Debug opener covers the mobile battle-log close control

- Scope: development/debug chrome only, on the 390×844 battle log with `debug=1`. The source card, opponent-hand gallery, and gallery Submit are unaffected. The debug opener is not rendered by the normal production player workflow.
- Cause/path: `src/battle/components/EngineDebugPanel.tsx` positions its closed-panel opener at fixed top/right with `--layer-app-overlay`; `src/cumulus/screens/battle-overlays/BattleEventLogOverlay.tsx` renders a mobile full-viewport dialog whose close control occupies the same top-right region.
- Repro: open the card-lab route with `debug=1`, complete a nonempty take, and open the battle log at 390×844. This occurred for both player and enemy flows.
- Measured final-run bounds, CSS px: the log close control is `(324.328125, 20, 45.671875, 48)`; the engine-debug opener is `(338, 12, 40, 40)`. Their boxes intersect across `32×32` px. At the close control's center, `elementFromPoint` resolves to `engine-debug-open`, not the close button; the debug opener's own center hits itself.
- The log content fits: its measured content region is `(12, 112.25, 366, 77.71875)`. The transfer and opponent play text remain legible in `minds-door-enemy-log-mobile.png`.
- Desktop 1440×900 comparison: log close `(1105, 383.3125, 48, 48)` and debug opener `(1388, 12, 40, 40)` are separate; both centers hit their own control. Capture: `minds-door-enemy-log-desktop.png`.
- This is recorded as a developer-tool overlap outside the scoped card re-judgment, not as a failure of Mind's Door's private picker.
