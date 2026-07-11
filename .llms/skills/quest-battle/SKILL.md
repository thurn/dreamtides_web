---
name: quest-battle
description: Use when editing or testing battle mode in the quest prototype, including playable battle UI, battle debug tools, battle overlays, reward flow, and battle-specific browser QA. Triggers on quest battle, playable battle, battle prototype, battle UI, goto=battle, battle log, reward surface, side summary, battle inspector, or battle QA.
---

# Quest Battle

Use this skill for changes under `src/battle/` and for interactive
verification of the playable battle surface.

Read these first:

- `docs/quest_prototype/quest_prototype.md`
- `docs/quest_prototype/qa_tooling.md`

## Scope

This skill covers:

- battle UI in the quest prototype
- playable-battle screen orchestration
- battle overlays, drawers, popovers, inspector, reward flow
- debug actions and battle-specific QA

This skill does not cover full quest-map progression except when needed to get
into a battle state.

## Runtime Basics

- The quest prototype is this repository (`~/quest_prototype/`).
- Battle mode is part of the quest prototype, not a separate app.
- The main battle screen is `src/battle/components/PlayableBattleScreen.tsx`.
- Screen-level battle bugs are often caused by UI orchestration state, not the
  leaf component that looks broken in the browser.
- Logging goes through `src/logging.ts` and battle reducers/controllers; do not
  add silent state changes.

## High-Value Files

When fixing battle UI, start by finding the owning layer:

| File | Role |
|------|------|
| `src/battle/components/PlayableBattleScreen.tsx` | Screen-level orchestration for popovers, overlays, zone browser, reward surface, inspector, selection |
| `src/battle/components/BattleInspector.tsx` | Inspector actions and card/side debug tools |
| `src/battle/components/BattleActionBar.tsx` | Compact action bar controls |
| `src/battle/components/BattleStatusStrip.tsx` | Side summary strip and quick zone buttons |
| `src/battle/components/BattleSideSummaryPopover.tsx` | Side-specific summary/debug popover |
| `src/battle/components/BattleZoneBrowser.tsx` | Hand/deck/void/banished browser and deck footer actions |
| `src/battle/components/BattleRewardSurface.tsx` | Victory reward surface |
| `src/battle/components/BattleLogDrawer.tsx` | Rich battle log UI |
| `src/battle/state/controller.ts` | Controller history / undo-redo / forced-result plumbing |
| `src/battle/state/reducer.ts` | Reducer transitions |
| `src/battle/state/apply-debug-edit.ts` | Debug edit behavior |
| `src/battle/debug/apply-command.ts` | Command-to-reducer action mapping |
| `src/battle/components/PlayableBattleScreen.test.tsx` | Best screen-level regression file for orchestration bugs |

## Edit Strategy

Use this order:

1. Reproduce the bug in the browser.
2. Identify the owning layer.
3. Add or update a focused regression test before or alongside the fix.
4. Patch the owning layer with minimal scope.
5. Re-run the targeted test first.
6. Run broader quest-prototype checks.
7. Re-run browser QA on the exact failing scenario.

Heuristics:

- If a button exists but does nothing, inspect command routing and screen state.
- If an overlay exists but controls are unreachable, inspect z-index, fixed
  positioning, and whether another surface is intercepting pointer events.
- If one popover prevents opening another, inspect scrims and screen-level
  open/close coordination.
- If a victory/defeat surface appears inconsistently, inspect `forcedResult`,
  `result`, and reward-overlay state together.

## Running

Use the commands validated in this repo during battle work:

```bash
cd /Users/dthurn/quest_prototype
npm install
npm run dev -- --host 127.0.0.1
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npx vitest run src/battle/components/PlayableBattleScreen.test.tsx
```

After the task, commit with a detailed message. Do not bundle unrelated dirty
worktree changes.

## Browser QA

Use `agent-browser` for interactive testing. It ships via `npx`:

```bash
npx agent-browser --help
```

Core commands:

```bash
agent-browser open <url>
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/file.png --annotate
agent-browser eval "<js>"
agent-browser click <selector|@ref>
agent-browser fill <selector|@ref> "<text>"
agent-browser console
agent-browser errors
```

### Battle URL

Primary playable-battle URL:

```bash
http://localhost:5173/?goto=battle
```

This is the fastest path for battle-only QA.

Use `?goto=battle1` through `?goto=battle7` to exercise layer-tuned opponents.
Every scene opens on the Battle Start opponent preview; click **Begin Battle**
before measuring the playable board.

### Baseline Battle Checks

At battle load, establish:

- action bar contents
- strip counts for both sides
- visible hand-card count
- open/closed overlay state

Good invariants:

- player `H` equals visible player hand cards
- deck/void/banished counts change only when an action should affect them
- compact action bar stays compact unless the task explicitly changes it
- reward surfaces and popovers must appear above the inspector and battlefield

Useful eval patterns:

```bash
agent-browser eval "(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean))()"
```

```bash
agent-browser eval "(() => [...document.querySelectorAll('*')].filter(el => typeof el.className === 'string' && el.className.includes('battle-card') && el.getBoundingClientRect().y > 430 && el.getBoundingClientRect().width > 40).length)()"
```

```bash
agent-browser eval "(() => ({ enemy: !!document.querySelector('[data-battle-side-summary-popover=\"enemy\"]'), player: !!document.querySelector('[data-battle-side-summary-popover=\"player\"]') }))()"
```

### QA Rules

When testing interactively:

1. State the current invariant values.
2. State what you expect to happen next.
3. Perform one action.
4. Take a screenshot.
5. Re-measure the invariants.
6. Compare expected vs actual immediately.

Do not batch multiple interactions without measurement in between.

Screenshots are primary evidence. `snapshot -i` is only for finding targets.

### Battle-Specific Flows To Test

For battle UI edits, cover the relevant subset of:

- side-summary open, close, and switching between sides
- Dreamcaller panel open/close
- deck browser open/close
- `Reveal Top`, `Play From Top`, `Hide Top`, `Foresee…`, `Reorder Full Deck`
- enemy hand `Reveal All` / `Hide All`
- card-scoped note, marker, and copy actions
- log drawer expand/collapse and raw events
- reward-surface open/cancel/select/confirm
- undo/redo after debug actions

If you fix one of these, test the exact user path that previously failed.

## Testing Lessons From This Session

- A control being visible in the DOM does not mean it is interactable. Verify
  the surface is visually on top and that clicks change state.
- Screen-level regressions belong in
  `src/battle/components/PlayableBattleScreen.test.tsx`.
- `Force victory` and `Skip to rewards` may share reward-flow semantics but can
  still diverge if wired through different command paths. Test both when
  touching result transitions.
- Reward-surface cancel behavior is easy to regress. Verify whether cancel is
  supposed to go back to live battle or only dismiss the overlay, and align the
  tests to the intended behavior before patching.
- Summary popovers can block each other through scrims or pointer interception
  even when the buttons are still visible. Test direct switching, not just open
  and close.
- If a browser repro is inconsistent but the screen-level regression is stable,
  note the routing inconsistency separately instead of conflating it with the
  fixed battle bug.

## Acceptance Checklist

For battle changes:

1. Run the most relevant focused battle test.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm test`.
5. Run browser QA with `agent-browser` on the battle flow you changed.
6. Commit only the intended battle files.

## Anti-Patterns

- Do not patch a leaf component when the bug is owned by
  `PlayableBattleScreen`.
- Do not rely on `snapshot -i` alone for QA.
- Do not assume a `goto=battleN` scene worked without checking the preview's
  displayed layer and opponent details.
- Do not stop at automated tests for battle UI; browser QA is mandatory.
- Do not commit unrelated dirty battle files that were already modified before
  your change.
