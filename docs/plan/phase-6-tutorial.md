# Phase 6: Tutorial on the Engine

**Goal:** the standalone `/tutorial` scripted battle and the tutorial journey
run on the engine. All authored content, guidance, timing, and presentation
stay as they are ([D9](decisions.md#d9-tutorial-is-ported-to-the-engine)).
Then delete the tutorial-only sandbox path.

**Read first:**

- the tutorial content module, `src/content/data/tutorial.ts`, created in
  Phase 2.4;
- `src/battle/tutorial-battle-controller.ts`;
- `src/battle/use-tutorial-battle-controller.ts`;
- `src/cumulus/screens/TutorialBattleScreen.tsx`;
- `src/rules/battle/tutorial-guidance.ts`;
- the tutorial notes in the README's architecture section (Phase 2.1).

Before starting, record the baseline: full screenshots of every tutorial beat
on desktop and mobile, taken while the old path still works.

## Tasks

### 6.1 Tutorial battle on the engine (core-review)

- **Battle setup.** The tutorial module's battle setup (decks, hands, energy,
  board) becomes an engine `BattleInit`. The scripted segment is replayed as
  engine actions.
- **AI overrides.** `battle.aiActionOverrides` become engine-level overrides
  in the policy host. They are triggered by UUID-based state triggers, such
  as `after-dreamwell`, and resolved as ordinary `play` actions:
  - The first override that matches takes priority, in source order.
  - A blocked override yields to the policy and logs its stable reason.
  - The committed transition records the override ID, the trigger card UUID,
    the action card UUID, and the instance ID.
- **Presentation checkpoints.** Challenge lanes, card reveals, and the Night
  explanation map onto engine phase and lane steps plus presentation events.
  Keep the tutorial's authored timings.
- **Mira guidance.** Speech bubbles, card-seen and card-play triggers, and the
  battle concept triggers keep their shared first-occurrence history in the
  fold.
- **Delete the tutorial-only sandbox code** marked in Phase 4.7, with its
  tests.

**Acceptance:**

- Tutorial lifecycle tests are ported as contracts against engine actions.
- `knip` is clean.
- No `tutorial-only` markers remain.

### 6.2 Tutorial journey and front door

Verify the tutorial journey flow on the local-first log:

- the `journeyStart`, `dreamscape`, and `atlas` delayed guidance;
- first visits to Draft, Purge, and Dreamsign Revelation;
- the first and second Battle Start guidance;
- first-occurrence keyword explanations across journey and battle.

Remove the hosted-playtest controller remnants if Phase 2 left any adapters.

**Acceptance:** a browser walkthrough of the whole tutorial, on desktop and
mobile, matches the baseline screenshots beat by beat, with `__caps` empty.

### 6.3 Phase gate

1. Run the independent review over the phase diff.
2. Check that the gate passes and GitHub checks are green.
3. Close the epic.

## Exit gate

- The tutorial and tutorial journey work end to end on the engine.
- The sandbox code is gone.
- The review is resolved.
