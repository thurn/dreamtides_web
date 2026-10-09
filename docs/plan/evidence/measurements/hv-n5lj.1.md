# hv-n5lj.1 measurements (Phase 4 battle baseline and test inventory)

Baseline of the prototype journey battle at staging `df95db214`, captured
before Phase 4 replaces it with the engine. Phase 4 beads compare their
screens against these captures and delete or replace the tests listed below.

## Baseline captures

The captures live in the primary checkout's gitignored
`artifacts/qa/hv-n5lj.1/` and are never committed. Each viewport has six
files: the five required states plus the Battle Start preview.

| State | Desktop (1440×900) | Mobile (390×844) |
| --- | --- | --- |
| Battle Start preview (extra) | `battle-start-preview-desktop.png` | `battle-start-preview-mobile.png` |
| Battle start (opening board) | `battle-start-desktop.png` | `battle-start-mobile.png` |
| A prompt | `prompt-desktop.png` | `prompt-mobile.png` |
| The Day board with a hand | `day-board-hand-desktop.png` | `day-board-hand-mobile.png` |
| The Challenge | `challenge-desktop.png` | `challenge-mobile.png` |
| The reward surface | `reward-desktop.png` | `reward-mobile.png` |

`file` reports every desktop capture as 1440 x 900 and every mobile capture
as 390 x 844 (8-bit RGB PNG). Every capture, and the final hand-off to the
Atlas, read an empty `window.__caps` (no errors, rejections, or console
errors).

### Reproducing the states

The same Playwright script produced both viewports:
`artifacts/qa/hv-n5lj.1/baseline-run.js` in the primary checkout. Run it with
the Playwright MCP's `browser_run_code_unsafe` and `filename` set to that
path, after `browser_resize` to the target viewport, against a dev server on
port 5174. It writes `<state>-<desktop|mobile>.png` beside itself and returns
a per-capture log (URL, viewport, phase, energy and points, filled slots,
`__caps`).

- **Seed and scene:** `http://localhost:5174/?goto=battle&seed=1`. This is
  the Layer 1 keeper battle against Kaleth
  (`3c4773e4-f8e1-4686-86cb-b407a42489d4`) with Drusus Calvus
  (`bdd3a3a7-242c-4d2b-8071-ebe56891a340`). The URL becomes
  `/dreamscape/0-firstlight-meadow/battle?goto=battle&seed=1&game=<id>`. The
  game id is random, but every battle state below was identical across three
  runs (two desktop, one mobile).
- **Card instances** (battle-card IDs are stable for this seed):
  - `bc_0001`: Rusted Colossus, `5ab11bef-5dcd-49f5-be49-ae2ccde76e70`.
  - `bc_0002`: Marked Direwolf, `e83014d3-9d35-4e80-a1b3-9b25360ad2af`.
  - `bc_0004`: Runebound Champion, `a28ad36d-fa74-4190-a463-7efd3a6233d0`.
  - The turn-3 Dreamwell card is Astral Interface,
    `ee1ef770-29ea-4a63-a1f9-7e97b5b8870d`.
- **Mouse rest:** before each capture the pointer moves off the board, to
  (1300, 300) on desktop and (195, 200) on mobile, so no hover preview shows.

Steps and the state each capture shows:

1. **Battle Start preview.** Load the scene URL and wait 2.5 s. This is the
   opposing-Avatar preview with the Begin Battle button.
2. **Battle start.** Click Begin Battle (`data-testid`
   `cumulus-battle-start-begin`) and wait 3 s. Desktop opens the Battle
   Inspector rail by default, so close it
   (`#cumulus-battle-inspector` → Close battle inspector); mobile starts with
   it closed. State: turn 1, Day, both sides 0/0 energy and 0/10 points,
   five cards in hand.
3. **Prompt.** Click Next Phase eight times, 1.5 s apart: player Dusk, Night,
   Challenge, then the enemy's Day, Dusk, Night, Challenge, then the player's
   turn-3 Dawn. State: the Astral Interface Dreamwell reveal, a pick-cards
   discard prompt ("0/1", Submit disabled), 1/1 energy, six cards in hand.
4. Resolve the prompt: tap `bc_0001` (Rusted Colossus), Submit, then
   Continue. State: Day, 1/1 energy.
5. Open the Battle Inspector and click "Increase player current and maximum
   energy" eight times (1/1 → 9/9), then close it.
6. **Day board with a hand.** Drag `bc_0002` from the hand to player slot
   `B4`, then `bc_0004` to `B6` (pointer down, 20 moves, up). State: Day,
   0/9 energy, both characters in the back rank and exhausted, four cards
   in hand.
7. Click Next Phase three times (Dusk, Night, Challenge with no
   challengers). Keep clicking Next Phase while that is the control; this
   runs the enemy's turn and stops at the player's turn-5 Dawn. Click
   Continue to reach Day. The enemy's Dreamwell creates an Ethereal Figment
   (`bc_0061`) in player slot `B0`.
8. **Challenge.** Drag `bc_0002` from `B4` to front slot `F4` and `bc_0004`
   from `B6` to `F5`. Click Next Phase three times (Dusk, Night, Challenge)
   and capture 0.6 s after the last click. State: Challenge, two unblocked
   challengers, player at 7/10 points.
9. **Reward.** Click Next Phase or Continue, whichever the control shows,
   until the reward surface appears, then wait 1.5 s. State: the Victory
   surface ("Defeated Kaleth · 11–2 · 4 Turns", +100 Essence). The battle
   ends during the player's turn-7 Challenge.
10. Click Continue on the reward surface. The route changes to `/atlas`, and
    `__caps` is still empty.

`F5` is used instead of `F6` because the mobile board does not render `F6`
when `B6` is the rightmost occupied lane (`pre-existing/hv-n5lj.1.md`). Using
`F5` keeps the two viewports in the same game state.

## Test inventory: prototype battle path

Found with
`git ls-files 'src/**/*.test.ts*' | xargs grep -l -E "src/battle|rules/battle|MobileBattleScreen|battle-view-model|BattleSiteRoute|createBattleInit"`,
an import sweep for the battle, battle-init, replay-fixture, and battle-screen
modules, and the Phase 2.11a triage (`test-triage/hv-47xj.19.jsonl`). Line
counts are at `df95db214`.

Bead keys:

- 4.1 `hv-n5lj.2`: fold wiring and battle init.
- 4.2 `hv-n5lj.4`: top-level action UI.
- 4.3 `hv-n5lj.5`: PromptHost.
- 4.4 `hv-n5lj.6`: presentation and indicators.
- 4.7 `hv-n5lj.8`: remove the journey sandbox and the old AI.
- `hv-n5lj.11`: delete the single-controller playtest machinery.
- 6.1 `hv-33id.2`: the tutorial battle on the engine.

### Phase 2.11a smoke files

| Test file | Lines | What it covers | Bead |
| --- | --- | --- | --- |
| `src/rules/battle/battle-events.test.ts` | 552 | Smoke 1 of 2. `BEGIN_BATTLE` bounces with no provider, folds deterministically, and bounces a second begin, a malformed payload, or a seed override. `END_BATTLE` victory (reward, site completion, Atlas advance, modifier expiry, journey-complete routing), defeat (frozen failure summary, forced-result reason), and bounces | 4.1 `hv-n5lj.2` deletes it; the new fold tests replace it |
| `src/battle/integration/create-battle-init.test.ts` | 97 | Smoke 2 of 2. `createBattleInit` gives a deterministic frozen init, carries every journey deck entry, and derives the Essence reward from the reward curve and its floor | 4.1 `hv-n5lj.2` deletes it; the engine `BattleInit` contracts (next-battle effects, deck-modification kinds) replace it |

### Battle screen and view-model contracts

| Test file | Lines | What it covers | Bead |
| --- | --- | --- | --- |
| `src/cumulus/screens/MobileBattleScreen.test.tsx` | 406 | Render smoke of both battlefields, hands, piles, and phase controls. Phase change and pile browsing. A hand drop goes through the play intent to the closest open slot. Repositioning is only on the dragged card's own side. Inline card picker. A choice prompt replaces the phase advance | 4.2 `hv-n5lj.4` replaces the render, phase, drop, and reposition cases with legal-action-driven screen tests. 4.3 `hv-n5lj.5` replaces the card-picker and choice-prompt cases with PromptHost tests |
| `src/screens/cumulus_adapters/mobile-battle-view-model.test.ts` | 437 | `buildMobileBattleView` over the prototype `BattleMutableState` and `PendingPrompt`: UUID card models, board reversal, pick-cards and choice prompt mapping, affordable hand cards in Day, hidden zones as IDs only | 4.2 `hv-n5lj.4` rewrites it over `engine.view` (affordability comes from `legalActions`). 4.3 `hv-n5lj.5` takes over the prompt-mapping cases |
| `src/components/BattleSiteRoute.test.tsx` | 313 | Battle Start preview, then `BEGIN_BATTLE` with the seed only on click, then hand-off to the playable surface. Reopens on an existing fold. Returns to the preview when the battle is cleared, and not on the exit to the Atlas. Built on `createInitialBattleState` and `battle/test-support` | 4.1 `hv-n5lj.2` rewrites its fixtures onto the engine battle slice; the hand-off semantics stay |
| `src/session/providers/battle-init-provider.test.ts` | 109 | The preview init equals the init `BEGIN_BATTLE` folds | 4.1 `hv-n5lj.2` replaces it with the engine battle-init build |

### Other tests that drive the prototype battle

| Test file | Lines | What it covers | Bead |
| --- | --- | --- | --- |
| `src/rules/reducer.test.ts` | 776 | Rule 4 prompt gate and `RESOLVE_PROMPT` throw containment, on a prototype battle fold with a Dreamwell-script `pendingPrompt` | 4.1 `hv-n5lj.2` moves the journey prompt gate onto `answer`/`cancel`. The `RESOLVE_PROMPT` cases stay for the tutorial sandbox until 6.1 `hv-33id.2` deletes them. The CAS, routing, and genesis cases survive |
| `src/rules/replay/replay.test.ts` | 221 | The `battle.json` and `adversarial.json` fixtures replay to their stamped hashes. Synthetic picker and choice prompt scripts | 4.1 `hv-n5lj.2` regenerates the fixtures and drops the prototype prompt-script cases |
| `src/session/local-game.test.ts` | 491 | Reload mid-battle from a checkpoint plus later events, using the `battle.json` fixture | 4.1 `hv-n5lj.2` (its acceptance includes reload mid-battle and mid-prompt; the fixture is regenerated) |
| `src/state/journey-flow.integration.test.ts` | 140 | `BATTLE_COMMAND`, then one `END_BATTLE` fold that commits the reward, site completion, Atlas progress, routing, and teardown. An early `END_BATTLE` bounces | 4.1 `hv-n5lj.2` replaces it with the engine journey → battle → reward → Atlas fold tests |
| `src/session/providers/register-game-providers.test.ts` | 810 | One full-journey walk: `BEGIN_BATTLE`, `BATTLE_COMMAND` `SKIP_TO_REWARDS`, `END_BATTLE` on each layer | 4.1 `hv-n5lj.2` rewires that case onto the engine; the other provider cases survive |
| `src/rules/journey/journey-properties.test.ts` | 957 | Fold property tests (safety, determinism, JSON purity). They register a fixture battle-init provider and generate `BEGIN_BATTLE`, `END_BATTLE`, and battle-slice events | 4.1 `hv-n5lj.2` swaps the provider and battle-slice generators to the engine slice |
| `src/session/actions.test.ts` | 614 | The actions facade lists the sandbox battle creators (`setBattleAutomation`, `battleCommand`, `battleRepositionCharacter`, `battlePlayCard`, `battleGesture`, `battleAiBlock`, `resolvePrompt`) and the durable keys of battle Dreamwell commands. Also the `BEGIN_BATTLE` seed | 4.1 `hv-n5lj.2` adds `battleAction`/`answer`/`cancel`. 4.7 `hv-n5lj.8` removes the journey-only sandbox and old-AI creators. The tutorial creators stay until 6.1 `hv-33id.2` |
| `src/screens/cumulus_adapters/deck-view-model.test.ts` | 638 | One case: a gallery entry stays stable through the pool-to-deck battle mutation (`createPoolCardDropCommand`, the zone-drag sandbox) | 4.7 `hv-n5lj.8` deletes that case; the rest survives |
| `src/screens/cumulus_adapters/dreamscape-view-model.test.ts` | 523 | The `battle-start-view-model` section is built from `createTestBattleInit`. It includes the Mira guidance for the first two tutorial-journey battles | 4.1 `hv-n5lj.2` rebuilds that section on the engine `BattleInit`; the rest survives |
| `src/session/single-controller.test.ts` | 193 | `keepLocalPlayerInControl`: taking control, claiming a tutorial battle, reopening, collaborative games | `hv-n5lj.11` deletes it |

### Cumulus battle surfaces (survive; Phase 4 revalidates)

These render view models and never touch the prototype fold. D30 keeps the
surfaces. No Phase 4 bead deletes them; the named bead owns any change.

| Test file | Lines | What it covers | Owner |
| --- | --- | --- | --- |
| `src/cumulus/components/battle/battle-components.test.tsx` | 424 | `CardPile`, `BattlefieldCard`, `BattleStatusDisplay`, `DreamwellCard`, `BattlePhaseIndicator`, `CardBack` | 4.4 `hv-n5lj.6` (indicators) |
| `src/cumulus/components/battle/BattleForeseeEditor.test.tsx` | 412 | Foresee workflow: reorder or void by battle-instance ID, then one confirmation; an empty Foresee still confirms | 4.3 `hv-n5lj.5` (PromptHost's Foresee surface) |
| `src/cumulus/screens/battle-and-results.test.tsx` | 381 | `BattleStartScreen`, `BattleResultSurface`, journey complete and failed screens | 4.1 `hv-n5lj.2` feeds them; they survive unchanged |
| `src/cumulus/screens/BattleTutorialGuidance.test.tsx` | 480 | Mira guidance surface for journey and tutorial battles | Survives. Journey-battle guidance may regress under D38; 6.2 restores it |

### Tutorial sandbox (frozen until Phase 6)

Phase 4.7 leaves the standalone tutorial battle on its sandbox path. All of
these pin that path, and 6.1 `hv-33id.2` deletes or ports each in its commit.
The first six are the Phase 2.11a "keep" verdicts.

| Test file | Lines | What it covers |
| --- | --- | --- |
| `src/rules/battle/tutorial-battle-lifecycle.test.ts` | 2632 | The tutorial battle fold lifecycle, authored draws, AI overrides, and presentation checkpoints |
| `src/rules/battle/tutorial-guidance.test.ts` | 187 | `matchTutorialGuidance` priority, dedupe, ordering, UUID triggers, and keyword coverage |
| `src/battle/tutorial-battle-controller.test.ts` | 627 | `planTutorialBattleController` |
| `src/battle/tutorial-presentation-timing.test.ts` | 74 | Tutorial presentation timing over the battle fold |
| `src/battle/use-tutorial-battle-controller.test.tsx` | 223 | The tutorial controller hook, including the victory preview |
| `src/battle/use-tutorial-battle-interactions.test.tsx` | 670 | Tutorial battle interactions |
| `src/cumulus/screens/TutorialBattleScreen.test.tsx` | 458 | Tutorial screen: victory hold, reveal pacing, Challenge travel, and checkpoint reporting |
| `src/screens/cumulus_adapters/tutorial-battle-view-model.test.ts` | 588 | `buildTutorialBattleView`, layered on the prototype `buildMobileBattleView` |
| `src/screens/cumulus_adapters/tutorial-guidance-view-model.test.ts` | 470 | `buildBattleTutorialGuidanceView` over `BattleFoldState`. Its card and site guidance sections survive |

### Matched but not on the battle path

These match the search but do not exercise the prototype battle:

- `src/components/ScreenRouter.test.tsx` mocks `BattleSiteRoute`.
- `src/components/app-shell.test.tsx` mocks `TutorialBattleScreenAdapter`.
- The four `src/cumulus/screens/TutorialScreen.*.test.tsx` files test the
  scripted how-to-play stage and stub `MobileBattleScreen`.
- `src/screens/cumulus_adapters/tutorial-view-model.test.ts` tests authored
  tutorial configuration, with no battle fold.
- `src/exploration/site-insertion-plan.test.ts` and
  `src/rules/journey/shop.test.ts` (`PUSH_BATTLE_MODIFIER`) test journey
  reducers. 4.1 consumes those modifiers into `BattleInit`.
- `src/engine/**` tests the engine itself.

## Prototype behavior seen during capture

- The enemy has no AI here. Next Phase steps its turn, and its Dreamwell
  effects resolve on their own (for example, the Ethereal Figment and the
  enemy's 2 points).
- Runebound Champion's ▸Dawn ability (gain 1 point) did not fire at the
  player's turn-5 or turn-7 Dawn: points stayed at 0, then at 7. This is the
  sandbox's partial card automation, which the engine replaces.
- "4 Turns" on the reward surface matches the player's four turns (1, 3, 5,
  and 7).
- The Challenge stops scoring at the threshold. On turn 7 the `F4`
  challenger brings the player from 7 to 11, and the battle ends there.
