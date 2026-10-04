# Phase 4: Battle UI on the Engine

**Goal:**

- Journeys play complete engine battles in the **existing battle UI**, against
  placeholder bots.
- The manual sandbox and the old AI are deleted.
- The card-lab scene and the sweep tool are ready for Phase 5.

Look and flows are preserved ([D30](decisions.md#d30-ui-preservation)). New
affordances use existing Cumulus components. Consult the `cumulus` and
`cumulus-migrate` skills before UI work, and the `localization` skill before
adding player-facing text.

**Read first:**

- [engine-design § Fold and UI integration](engine-design.md#fold-and-ui-integration)
  and [§ Policy interface](engine-design.md#policy-interface);
- `src/battle/components/PlayableBattleScreen.tsx`;
- `src/cumulus/screens/MobileBattleScreen.tsx`, which already has choice
  prompts, pick-cards, `targetSelectionPrompt: "legal-target"`, and prompt
  notices;
- `src/screens/cumulus_adapters/mobile-battle-view-model.ts`;
- `src/rules/battle/fold.ts`;
- `src/battle/integration/create-battle-init.ts`;
- `docs/journey_prototype/qa_scenes.md`;
- `scripts/screenshot-runtime.mjs`, an existing MCP client of the Playwright
  service.

**Before starting,** capture baseline screenshots of the battle screen at
desktop 1440×900 and mobile 390×844. Capture these states:

- battle start;
- the Day board with a hand;
- a prompt;
- the Challenge;
- the reward surface.

## Tasks

### 4.1 Fold adapter and battle init

- **Battle intents:** a single `battleAction` intent folds through
  `engine.apply`.
- **Fold state:** `BattleFoldState` holds the engine state and the
  presentation event buffer.
- **Battle init** is built from the journey:
  - the player deck, padded to the minimum per `battle.ron`;
  - the opponent deck, avatar, and dreamsigns from the existing generators
    and `opponents.ron` progression;
  - the shared Dreamwell from `dreamwell.ron`;
  - the score target by completion level;
  - journey modifiers.
- **`END_BATTLE`:** the terminal handoff and result derivation stay
  semantically identical.
- **Fixtures:** regenerate the replay fixtures.

**Acceptance:**

- The journey → battle → reward → atlas fold tests pass on the engine.
- `npm run regenerate-replay-fixtures` is deterministic.

### 4.2 Main-decision UI

The view model comes from `engine.view`. Build:

- **Highlights:** playable cards and activatable abilities are highlighted
  from `legalActions`; illegal ones look disabled.
- **Playing cards:**
  - Tap or drag a card to play it.
  - Play-time choices (targets, modes, X, costs, optional costs) are collected
    as local interaction state from `playOptions`, using the existing prompt
    surfaces and legal-target highlighting.
  - Then one `battleAction` is submitted.
- **Activating abilities:** abilities, including avatar abilities, are
  activated from the existing card and avatar affordances.
- **Repositioning:** legal destination slots only; figment merge onto a match,
  with the Legionnaire confirmation; All Forward and All Back.
- **Passing:** explicit pass and end-phase controls in the existing action
  bar.
- **Dusk:** the human's blocking window.

**Acceptance:**

- Screen tests, without UI-string assertions, show that legal actions drive
  enabled controls.
- Browser QA plays a full turn cycle against the Random bot.

### 4.3 Prompts, response windows, loop shortcut

- **Prompts:** every `Prompt` kind maps to an existing surface:
  - choice prompt;
  - pick-cards;
  - legal-target selection;
  - the foresee and card-order editors;
  - confirm;
  - number.
- **Prompt text** comes from structured purposes, through Trox templates.
- **Response window (P1):** shown only when the human holds a legal response.
  It reveals the opponent's stack item at reading size, offers the legal
  responses, and has a Pass control.
- **Loop shortcut:** offers Repeat ×N and Repeat until victory when a
  `LoopCandidate` exists. N comes from a number prompt.

**Acceptance:** each prompt kind is exercised in a scenario on desktop and
mobile, and `__caps` is empty.

### 4.4 Presentation and indicators

- **Visuals:** map every engine event kind to its visual
  ([engine-design](engine-design.md#fold-and-ui-integration)). Reuse the
  existing animations.
- **Indicators:** add Cumulus-consistent status indicators on battlefield
  cards:
  - temporary banish (return pending);
  - granted keywords;
  - disabled triggers;
  - reclaim until end of turn;
  - cost modifiers.
- **Battle log:** entries come from engine events, through localized
  templates.
- **AI plays:** they reuse the tutorial's reveal pacing.

**Acceptance:**

- A judged QA pass covers one card per event kind, on both viewports.
- Before/after comparison against the baseline shows no unintended visual
  change.

### 4.5 Policy host and placeholder bots

- **Worker host:** `src/engine/policy/worker.ts`, a Web Worker host with
  budget handling.
- **Bots:** `Random` and `Greedy`. Greedy uses a simple evaluation: score
  difference, board spark, cards in hand, and energy.
- **The enemy is always AI-driven** in journeys. The default is Greedy;
  `?ai=random|greedy` selects one for QA. There is no approval loop.
- **AI logging** follows the [schema](workflow.md#logging).

**Acceptance:**

- A journey battle plays to completion with no human enemy input.
- The worker keeps the UI responsive (no long main-thread tasks during AI
  turns).

### 4.6 Debug panel, card-lab, sweep tool

- **Debug panel** (`?debug=1`, dev builds only, P7): engine debug actions per
  D4.
- **Card-lab** (`?goto=card-lab&card=<uuid>&variant=<base|amplified|empowered|kindled|resonant|inspired|enduring|attuned|perfected>&as=<player|enemy>`):
  - It builds a deterministic battle from the setup solver, plus
    `lab-overrides.ts`.
  - `as=enemy` makes the AI play the card at the human.
  - Document it in `docs/journey_prototype/qa_scenes.md`.
- **`scripts/qa/card-sweep.mjs`:** behavior per
  [workflow § Card QA](workflow.md#card-qa-phases-47), appending to the QA
  ledger. Build it on `scripts/screenshot-runtime.mjs`. Never launch browsers
  directly.

**Acceptance:** the sweep runs over the 10 Starter cards as pending bodies and
produces ledger lines. Expected failures for pending text are recorded as
`pending`, not `fail`.

### 4.7 Remove the journey sandbox and the old AI

**Scope boundary:** the standalone tutorial battle (fold mode `tutorial`)
keeps running on its existing sandbox path, frozen and untouched, until
Phase 6 ports it and deletes that path. Everything only journey battles use
is deleted here:

- the journey `BattleDebugEdit` command path;
- the debug rail, the zone-drag sandbox, status and counter editors, and the
  figment creator;
- the journey use of `basic-automation` and the effect tables
  (`battle-card-effects-table`, `dreamwell-effects-table`). First copy their
  encoded behavior into the Phase 5 Dreamwell batch bead's notes;
- `semantic-play`, the automation audit, `docs/automation-audit.json`;
- the old `src/battle/ai/` journey AI, with its approval loop and planner;
- their tests.

Code that only the tutorial still needs stays, with a `// tutorial-only until
Phase 6` file header. Phase 6 deletes it.

Rewrite `docs/journey_prototype/battle_ai.md` and the battle sections of
`journey_prototype.md` to the current state.

**Acceptance:**

- `knip` shows no orphans outside the tutorial-only set.
- The suite is green.
- The battle screen still matches the baseline.
- `/tutorial` still plays through, verified by a browser smoke.

### 4.8 Phase gate

1. Browser playthrough of a journey on desktop and mobile against Greedy:
   - Play the first two battles and the final boss battle for real.
   - Force-resolve the intermediate battles with debug actions to save time.
   - Watch `__caps`.
2. Run the independent review over the phase diff.
3. Update `metrics.md`, including CI after the sandbox removal.
4. Close the epic.

## Exit gate

- Engine battles run in the existing UI against bots.
- The sandbox and old AI are deleted.
- The card-lab and sweep are working.
- The review is resolved.
