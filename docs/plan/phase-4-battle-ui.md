# Phase 4: Battle UI on the Engine

**Goal:**

- Journeys play complete engine battles in the **existing battle UI**, against
  placeholder bots.
- Every prompt, from any source and for either side, flows through one
  `PromptHost`.
- The journey sandbox and the old AI are deleted.
- The card-lab scene and the sweep tool are ready for Phase 5.

Look and flows are preserved ([D30](decisions.md#d30-ui-preservation)). New
affordances use existing Cumulus components; read the `cumulus` skill before
UI work. Player-facing copy is plain English in the UI copy module (D35).

**Read first:**

- [engine-design § Decisions and prompts](engine-design.md#decisions-and-prompts),
  especially its UI contract, plus
  [§ Presentation](engine-design.md#presentation) and
  [§ Policy interface](engine-design.md#policy-interface);
- `src/battle/components/PlayableBattleScreen.tsx`;
- `src/cumulus/screens/MobileBattleScreen.tsx`, which already has choice
  prompts, pick-cards, `targetSelectionPrompt: "legal-target"`, and prompt
  notices;
- `src/screens/cumulus_adapters/mobile-battle-view-model.ts`;
- `src/rules/battle/fold.ts`;
- `src/battle/integration/create-battle-init.ts`;
- the README's QA section and `scripts/screenshot-runtime.mjs`.

**Before starting,** capture baseline screenshots of the battle screen at
desktop 1440×900 and mobile 390×844. Capture these states:

- battle start;
- the Day board with a hand;
- a prompt;
- the Challenge;
- the reward surface.

## Tasks

### 4.1 Fold wiring and battle init

- **The fold:** wire the Phase 3.3 battle slice (`committed`, `inFlight`,
  `publishedEvents`) and its intents (`battleAction`, `answer`, `cancel`)
  into the real reducer.
- **Battle init** is built from the journey:
  - the player deck, padded per the battle data module;
  - the opponent deck, avatar, and dreamsigns from the existing generators and
    opponent progression;
  - the shared Dreamwell;
  - the score target;
  - journey modifiers.
- **`END_BATTLE`:** the handoff semantics stay identical.
- **Fixtures:** regenerate the replay fixtures.

**Acceptance:**

- Journey → battle → reward → atlas fold tests pass on the engine.
- Reload mid-battle and **mid-prompt** reproduce the same screen state.

### 4.2 Top-level action UI

- **The view model** comes from `engine.view(display, human)`. While a step is
  suspended, this is the intermediate state.
- **Highlights:** playable cards and activatable abilities come from
  `legalActions`, which are dry-run checked; illegal ones look disabled.
- **Playing:** tap or drag a card to submit `battleAction(play)`. Targets,
  modes, X, and costs then arrive as prompts. Cancel is offered until the
  commit point, and the card snaps back.
- **Repositioning:** legal destinations only; figment merges, with the
  Legionnaire confirmation prompt; All Forward and All Back.
- **Passing:** the end-phase controls in the existing action bar.
- **Dusk:** the human's blocking window.
- **No undo (P2):** remove the prototype's battle undo/redo controls. Cancel
  before the commit point is the only take-back.

**Acceptance:**

- Screen tests show that legal actions drive enabled controls (no UI-string
  assertions).
- Browser QA plays a full turn cycle against the Random bot.

### 4.3 PromptHost (core-review)

`PromptHost` is the single component that renders the pending prompt for the
human, whatever raised it:

- a card being played;
- a trigger;
- the opponent's effect;
- a rules choice.

Its rules:

- **Per-kind surfaces.** Each `kind` maps to an existing Cumulus surface
  ([UI contract](engine-design.md#ui-contract-implemented-in-phase-4)). Add a
  number picker for `chooseNumber`, built from Cumulus primitives.
- **Local selection** state is keyed by `prompt.id` and resets when the ID
  changes. **Submit** sends one `answer`. **Cancel** appears only when
  `cancellable`.
- **Present, then ask.** The prompt appears only after the presentation queue
  has finished every event that preceded it.
- **Prompt copy** comes from the UI copy module (`kind`/`role` templates),
  with the source card shown. Private reveals (`privateTo`) show cards only to
  the chooser. The opponent sees "opponent is choosing".
- **AI-side prompts** show the "opponent is acting" treatment while the AI
  host answers.
- **Human prompts during AI turns** appear whenever `pending.side` is the
  human, for example from "each player discards a card".
- **Response windows (P1)** reveal the opponent's stack item at reading size,
  offer the legal responses, and have a Pass control. They appear only when
  the human has a legal response.
- **Auto-answered prompts** get a brief notice event, so the player isn't
  surprised.
- **The loop shortcut** offers Repeat ×N and Repeat until victory when a
  candidate exists.

**Acceptance:**

- Every prompt kind is exercised through the UI by synthetic-card scenarios,
  on desktop and mobile, including:
  - a prompt mid-AI-turn;
  - cancel;
  - reload mid-prompt;
  - present-then-ask ordering (a "draw 2, then discard" fixture).
- `__caps` is empty.

### 4.4 Presentation and indicators

- **Visuals:** map every engine event kind to its visual
  ([engine-design § Presentation](engine-design.md#presentation)). Reuse the
  existing animations.
- **Indicators:** add Cumulus-consistent status indicators.
- **Battle log:** entries come from engine events, through the UI copy
  module.
- **AI plays:** they reuse the tutorial's reveal pacing.

**Acceptance:**

- A judged QA pass covers one synthetic case per event kind, on both
  viewports.
- Before/after comparison against the baseline shows no unintended visual
  change.

### 4.5 Policy host and placeholder bots

- **Worker host:** the Web Worker policy host, with budget handling. It
  answers top-level decisions and prompts for the AI side.
- **Bots:** `Random` and `Greedy`. Greedy uses a simple evaluation: score
  difference, board spark, cards, and energy.
- **The enemy is always AI-driven** in journeys. The default is Greedy;
  `?ai=random|greedy` selects one for QA.
- **AI logging** follows the [schema](workflow.md#logging).

**Acceptance:**

- A journey battle plays to completion without enemy input.
- No long main-thread tasks occur during AI turns.

### 4.6 Debug panel, card-lab, sweep tool

- **Debug panel** (`?debug=1`, dev builds only, P7): engine debug actions per
  D4.
- **Card-lab:**

  ```text
  ?goto=card-lab&card=<uuid>
    &variant=<base|amplified|empowered|kindled|resonant|inspired|enduring|hastened|attuned|perfected>
    &as=<player|enemy>
  ```

  It builds a deterministic battle from the setup solver plus
  `lab-overrides.ts`. `as=enemy` makes the AI play the card at the human.
  Document it in the README QA section.
- **`scripts/qa/card-sweep.mjs`:** behavior per
  [workflow § Card QA](workflow.md#card-qa-phases-47), built on
  `scripts/screenshot-runtime.mjs`. Never launch browsers directly.

**Acceptance:** the sweep runs over the 10 Starter cards and produces ledger
lines. Pending text is recorded as `pending`, not `fail`.

### 4.7 Remove the journey sandbox and the old AI

**Scope boundary:** the standalone tutorial battle (fold mode `tutorial`)
keeps running on its existing sandbox path, frozen and untouched, until
Phase 6 ports it and deletes that path. Everything only journey battles use
is deleted here:

- the journey `BattleDebugEdit` path;
- the debug rail, zone-drag sandbox, status and counter editors, and the
  figment creator;
- the journey use of `basic-automation` and the effect tables. First write
  `docs/plan/evidence/legacy-behavior.md`: for each Dreamwell card and each
  semantically automated card, its UUID, the behavior the old code
  implemented, and the source path, all at the pre-deletion commit OID.
  Phase 5 reads it;
- `semantic-play` and the automation audit;
- the old journey AI (`src/battle/ai/`, approval loop, planner);
- their tests.

Code that only the tutorial still needs gets a `// tutorial-only until Phase 6`
header.

**Tutorial-journey battles** run on the engine like every journey battle.
Their in-battle Mira guidance may regress until Phase 6
([D38](decisions.md#d38-tutorial-journey-battle-guidance-during-phases-45)).
Port it here only where that is cheap.

**Acceptance:**

- `knip` shows no orphans outside the tutorial-only set.
- The battle screen still matches the baseline.
- `/tutorial` still plays through, verified by a browser smoke.

### 4.8 Mason pass

Run the [mason pass](workflow.md#mason-passes) over the fold wiring, the
battle view-model adapter, `PromptHost`, the policy host, and the card-lab
and sweep tooling. Look especially for adapter leaks of engine internals into
UI code and for prompt-kind handling duplicated outside `PromptHost`.

### 4.9 Phase gate

1. Browser playthrough of a journey on desktop and mobile against Greedy:
   - Play the first two battles and the final boss battle for real.
   - Force-resolve the intermediate battles with debug actions.
   - Watch `__caps`.
2. Walk the tutorial journey through its battles and list in the gate notes
   exactly which Mira battle guidance is broken (D38). That list is Phase 6.2
   scope.
3. Run the independent review over the phase diff.
4. Update `metrics.md`.
5. Close the epic.

## Exit gate

- Engine battles run in the existing UI against bots.
- Every prompt flows through `PromptHost`.
- The journey sandbox and old AI are gone.
- The card-lab and sweep are working.
- Every mason bead filed this phase has landed.
- The review is resolved.
