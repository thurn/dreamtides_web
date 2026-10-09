# hv-33id.1 measurements (Phase 6 tutorial baseline and test inventory)

Baseline of the whole tutorial at staging `2f7ef3f2e`, captured while the
standalone `/tutorial` battle still runs on its sandbox path and journey
battles still run on the prototype battle. 6.1 and 6.2 compare their screens
against these captures, and 6.1 ports or deletes the tests listed below.

## Baseline captures

The captures live in the primary checkout's gitignored
`artifacts/qa/hv-33id.1/` and are never committed. There are 42 beats per
viewport, named `NN-<beat>-desktop.png` and `NN-<beat>-mobile.png`. `file`
reports every desktop capture as 1440 x 900 and every mobile capture as
390 x 844 (8-bit RGB PNG).

Every capture logged its URL, viewport, both sides' energy and points, the
phase, and the visible speech, and every capture read an empty
`window.__caps`. One buffer, installed at the first navigation, covered the
whole walk on each viewport, through the second Battle Start preview.

### Reproducing the walk

Two Playwright scripts, kept beside the captures, produce both viewports:

- `artifacts/qa/hv-33id.1/baseline-tutorial.js`: beats 01–30, from the
  front door to the tutorial battle's Victory surface.
- `artifacts/qa/hv-33id.1/baseline-journey.js`: beats 31–42, run directly
  after the first script on the same page.

Run each with the Playwright MCP's `browser_run_code_unsafe` and `filename`
set to its path, after `browser_resize` to the target viewport, against a dev
server on port 5174. Each returns a per-capture log. The walk takes about
four minutes per script at the authored tutorial speed.

- **Entry:** `http://localhost:5174/main?seed=1`. Any parameter other than a
  presentation parameter makes `/main` create a fresh game instead of
  resuming the most recent one. The game id is random. Every battle state
  below matched across four desktop runs and two mobile runs.
- **Waits:** a speech beat is captured once the deepest element holding its
  text has an effective opacity above 0.95. Speech text is in the DOM before
  its bubble fades in, so waiting for text alone captures an empty board.
- **Pointer rest:** before each capture the pointer moves to (1300, 300) on
  desktop and outside the viewport (−5, −5) on mobile. An in-viewport rest
  point on mobile leaves a hover preview over the draft cards.
- **Dreamscape sites** are opened with a DOM `click()` on the site button and
  a check that the route changed. A pointer click can land while the
  dreamscape layer still has `pointer-events: none` after a site exit.

### Beats

Card UUIDs come from `src/content/tutorial.ts`. Battle-card IDs are stable
for this walk.

**Front door and scripted sequence (`TutorialScreen`)**

| NN | Beat | How to reach it |
| --- | --- | --- |
| 01 | `main-menu` | Load the entry URL. Route `/main`. |
| 02 | `loading` | Click New Journey. Route `/loading`, feature callouts on two cards, then a Begin button after about 5 s. |
| 03 | `mira-welcome` | Click Begin. Route `/tutorial`. Mira's first bubble is visible about 1.5–3 s after Begin. |
| 04 | `mira-nightmare` | Second Mira bubble, after the player portrait arrives. |
| 05 | `enemy-taunt` | Threxan's bubble at the enemy portrait. |
| 06 | `opponent-card-reveal` | Twilight Troubadour (`229ab3a1-…`) revealed full size, before it lands in the enemy front rank. |
| 07 | `howto-materialize` | The first How to Play panel. It waits for Close how to play. |
| 08 | `player-card-played` | Close it, then drag the hand card (`tutorial-player-deck-1`, Marked Direwolf `e83014d3-…`) to the middle player back slot: `player-back-4` on desktop, `player-back-3` on mobile. End Turn appears. |
| 09 | `howto-dreamwell` | Click End Turn. The enemy Dreamwell card (Autumn Glade, `02e8ea92-…`) appears with the Dreamwell How to Play panel. |
| 10 | `mira-dawn-ability` | Close it. Runebound Champion (`a28ad36d-…`) is revealed with Mira's ▸Dawn bubble. |
| 11 | `enemy-challenge-speech` | Threxan announces the challenge. |
| 12 | `howto-front-rank` | The front-rank How to Play panel, in the enemy Dusk. |
| 13 | `guided-block` | Close it. The guided slot highlight (`data-battle-guided-slot-highlight`) marks `player-front-4` on desktop and `player-front-2` on mobile. |
| 14 | `challenge-animation` | Drag the Direwolf to the highlighted slot. Captured 0.9 s after `data-tutorial-challenge-animation` mounts. |
| 15 | `mira-dissolve` | Mira explains that the lowest spark dissolves. |
| 16 | `mira-blocked-scoring` | Mira explains blocked scoring. |
| 17 | `player-dreamwell` | The player Dreamwell card (The Voltsurge, `7171ff89-…`), in the player's Dawn. |
| 18 | `mira-event-card` | Mira's event-card bubble, after the scripted draws. |

**Live tutorial battle (`TutorialBattleScreen`, `data-tutorial-live-battle`)**

| NN | Beat | How to reach it |
| --- | --- | --- |
| 19 | `live-handoff` | The hand-off board: player 5/5 energy, 0/10 points; enemy 0/5, 2/10; Day; End Turn shown. The hand holds Nocturne Strummer (`bc_0001`), Final Witness, and Glimpse of What Was (`bc_0003`). |
| 20 | `mira-foresee` | Drag Glimpse of What Was to the middle of the battlefield. The foresee card-play guidance. |
| 21 | `foresee-prompt` | The Foresee 1 prompt (Confirm). |
| 22 | `mira-no-valid-targets` | Confirm, then drag Flashpoint Detonation (`bc_0018`, `4408b942-…`) to the battlefield. With only Runebound Champion on the enemy side, the card-specific no-valid-targets guidance shows. |
| 23 | `mira-support` | Drag Nocturne Strummer to the back slot behind the Direwolf (`B4` on both viewports). The support card-play guidance. |
| 24 | `mira-dusk` | Click End Turn. The player Dusk guidance. |
| 25 | `mira-night` | The player Night guidance. Start Challenge appears afterwards. |
| 26 | `mira-challenge-resolved` | Click Start Challenge. The challenge-resolved (tie) guidance. Player at 6/10. |
| 27 | `mira-figment` | Enemy Dawn: the Nomad's Verge Dreamwell card creates a figment, with the figment guidance. |
| 28 | `mira-dissolved` | Enemy Day: Final Witness is played, with the ▸Dissolved guidance. |
| 29 | `enemy-challenge` | Enemy Dusk with Start Challenge shown, after the bubble clears. |
| 30 | `victory` | Click Start Challenge, then End Turn, then Start Challenge. The player ends at 11/10, and the Victory surface shows a single New Journey action. |

**Tutorial journey**

| NN | Beat | How to reach it |
| --- | --- | --- |
| 31 | `journey-start` | Click New Journey. Route `/`: the tutorial Avatar (Eldrik, `bfc40414-…`) with the `journeyStart` guidance. |
| 32 | `starting-deck` | Click Choose. Route `/dreamscape/0-firstlight-meadow`, Starting Deck overlay. |
| 33 | `dreamscape` | Click Begin Journey. The `dreamscape` guidance. |
| 34 | `draft-first-visit` | Open Draft 5x. The first-visit Draft guidance. |
| 35 | `draft-keyword-guidance` | Pick the first offered card until a keyword guidance shows. In the scripted runs it was Erode; later picks showed dissolve and ephemeral. |
| 36 | `dreamsign-revelation-first-visit` | Open Dreamsign Revelation. The first-visit guidance. Claim the first sign. |
| 37 | `purge-first-visit` | Open Purge. The first-visit guidance. Decline. |
| 38 | `battle-start-first` | Open the second Draft 5x and pick five, then open Battle. The first-battle Battle Start guidance (vs. Ossian). The second draft showed vengeful and awakened guidance. |
| 39 | `journey-battle1-board` | Begin Battle; close the dev Battle Inspector. The prototype journey battle's opening board. No Mira guidance shows here. |
| 40 | `journey-battle1-reward` | Battle Inspector → End Battle → Skip to Rewards. The Victory reward surface (+100 Essence). |
| 41 | `atlas` | Continue. Route `/atlas` with the `atlas` guidance. |
| 42 | `battle-start-second` | Enter Wilderveil (`/dreamscape/1-wilderveil`). Decline Augury, pick through both drafts (discover, banish, and rematerialize guidance), decline Purge, then open Battle. The second-battle Battle Start guidance (score 25). |

### Behavior seen during capture

- **First occurrence is shared.** Wilderveil shows no dreamscape, Draft, or
  Purge guidance, because those already showed in Firstlight Meadow. In the
  tutorial-journey battle at beat 39, Next Phase through Dusk and Night shows
  no Dusk or Night guidance. Those triggers already fired in `/tutorial`.
  In a fresh game from `?goto=tutorial-battle1&seed=1`, which has an empty
  history, Dusk and Night showed no guidance either: the prototype journey
  battle opens phase guidance only on the tutorial battle's phase command
  path. 6.2 should compare against this list of what the prototype journey
  battle shows, alongside the Phase 4 gate's D38 list.
- **Draft guidance order** depends on the offered cards. It was the same in
  every scripted run (three desktop, two mobile); an earlier exploratory
  walk that picked differently showed Discover first. 6.2 should compare "a keyword bubble
  over a draft offer" and not a specific keyword.
- **The live battle is short.** The player wins on its third live turn: 6
  points from the first Challenge (Direwolf at spark 6 with support), then 5
  more.
- **Not reached:** the `transfiguration-seen` trigger and the glossary
  triggers whose keywords did not appear (prevent, phasing, veil, reclaim,
  offering). No site or card on this walk raises them. The direct QA entries
  `?goto=tutorial-battle` and `?goto=tutorial-victory` were not captured;
  this walk reaches the same screens through the front door.

## Test inventory: tutorial sandbox path

Found with an import sweep over `git ls-files 'src/**/*.test.ts*'` for the
tutorial battle, controller, interactions, presentation, guidance, and
handoff modules, plus `RESOLVE_PROMPT`, `battleModeOf`, and the tutorial
battle actions, and with the `hv-n5lj.1` inventory. Line counts are at
`2f7ef3f2e`.

### 6.1 contracts

6.1's acceptance says the tutorial lifecycle tests become contracts against
engine actions. The 6.1 bullets give these contracts:

- **C1 Tutorial `BattleInit`.** The authored setup (decks, hands, energy,
  board, forced draws, Dreamwell order, hand-off placements) builds a
  deterministic engine `BattleInit`. The terminal scripted cursor begins the
  battle, and the scripted segment replays as engine actions to the authored
  hand-off state.
- **C2 AI overrides in the policy host.** UUID state triggers such as
  `after-dreamwell`. The first matching override wins, in source order. A
  blocked override yields to the policy and logs its stable reason. The
  committed transition records the override ID, the trigger card UUID, the
  action card UUID, and the instance ID. Each override is consumed once.
- **C3 Presentation checkpoints.** Card reveals, Challenge lanes, and the
  Night explanation map onto engine phase and lane steps plus presentation
  events. Authored timings hold, including the two-second reveal minimum.
- **C4 Guidance triggers and shared first-occurrence history.** Phase
  (Dusk, Night), card-play, Dreamwell-resolve, challenge-resolved,
  figment-created, and no-valid-targets triggers fire from engine events.
  Priority, dedupe, UUID matching, and the seen-ID history live in the fold
  and are shared with journey guidance.
- **C5 Lifecycle.** Begin, restart, exit, player-only Victory, and the hand-off
  from Victory into the tutorial Avatar offer, all as engine actions on the
  local-first log.
- **C6 Tutorial view over `engine.view`.** The tutorial screen and view model
  render the engine view plus presentation events: reveal pacing, Challenge
  travel, the Victory hold, the unavailable Avatar abilities, and the direct
  Victory preview.
- **C7 Interactions through legal actions.** Hand drops, Day and Dusk
  repositioning, Night to Challenge, and a required-target card with no legal
  target, all derived from `legalActions`.

Tests about room control, the persisted driver, observers, and authority
transfer cover single-controller playtest machinery. `hv-n5lj.11` deletes
that machinery, and 6.2 removes any remnants, so those cases are deleted and
not ported.

### Tests that pin the sandbox (6.1 ports or deletes them)

| Test file | Lines | What it covers | 6.1 contract |
| --- | --- | --- | --- |
| `src/rules/battle/tutorial-battle-lifecycle.test.ts` | 2632 | The tutorial battle fold: live battle before any claim; parking a play or opponent card for Mira's guidance; Dusk and Night guidance; terminal cursor hand-off; authored draws and Dreamwell stack; synthetic hand-off board; the Twilight Troubadour override; Day and Dusk swaps; semantic Dusk destination; restart and Victory into the Avatar offer; Dawn triggers once; hand-off playable to player-only Victory; figment guidance; room authority and driver binding; mode-less `LOAD_STATE` | Hand-off, draws, and Dreamwell cases → **C1**. The override case → **C2**. Parking a play or card for Mira → **C3**. Dusk, Night, and figment guidance → **C4**. Restart, Victory into the Avatar offer, Dawn once, playable to Victory → **C5**. Swaps and the semantic Dusk destination → **C7**. Room authority, driver binding, observer rejection, the tutorial AI actor, and journey-mode actor cases are **deleted** (single-controller machinery). The mode-less `LOAD_STATE` case is **deleted** (sandbox battle mode) |
| `src/rules/battle/tutorial-guidance.test.ts` | 187 | `matchTutorialGuidance`: priority, seen-ID suppression, keyword deferral, UUID match; every yellow battle term has a trigger | **C4** (matcher cases against the fold's shared history). The term-coverage case survives as a content check |
| `src/battle/tutorial-battle-controller.test.ts` | 627 | `planTutorialBattleController`: Dreamwell from round 2; stops at player Day and Night; enemy blocking heuristics; semantic enemy play and slot choice; deterministic enemy prompt answers; terminal Challenge presentation; driver assignment and pause | Round and Dreamwell sequencing → **C1**. Enemy play, blocks, and prompt answers → **C2** (the policy host plays them; the heuristics are the engine policy's job, not tutorial contracts). Terminal presentation → **C3**. Driver and pause cases are **deleted** (single-controller machinery) |
| `src/battle/tutorial-presentation-timing.test.ts` | 74 | Authored opponent guidance timing and the two-second reveal pad | **C3** |
| `src/battle/use-tutorial-battle-controller.test.tsx` | 223 | Dwell starts after the reveal is visible; Challenge waits for the result animation; the Victory preview does not advance automation; no driving another client's battle | First three cases → **C3** and **C6**. The other-client case is **deleted** (single-controller machinery) |
| `src/battle/use-tutorial-battle-interactions.test.tsx` | 670 | Night to Challenge; hand drag and drop as a play; click and drag attempts with no legal target; revisiting a cell; exhausted moves at Dusk | **C7**. The no-legal-target cases also feed **C4** |
| `src/cumulus/screens/TutorialBattleScreen.test.tsx` | 458 | Victory hold; absent-driver hold; movement warning; target banner; reveal size and reduced motion; opponent-block checkpoint; Challenge travel and unpaired points; missing render payload; Dreamwell visibility after the turn announcement | **C6**, with the checkpoint and Dreamwell-visibility cases → **C3**. The absent-driver case is **deleted** (single-controller machinery) |
| `src/screens/cumulus_adapters/tutorial-battle-view-model.test.ts` | 588 | `buildTutorialBattleView`, layered on the prototype `buildMobileBattleView`: guidance without a board presentation; opponent card before its slot; missing display data; dissolved UUIDs in the Challenge lane; Avatar abilities unavailable; Victory payoff and preview | **C6**, rebuilt over `engine.view` |
| `src/screens/cumulus_adapters/tutorial-guidance-view-model.test.ts` | 470 | The battle section: `buildBattleTutorialGuidanceView` over `BattleFoldState` (opponent guidance as the reveal window, Challenge and phase bubbles). The card and site sections do not touch the battle fold | Battle section → **C4** and **C6** over engine presentation events. The card and site sections survive |
| `src/rules/reducer.test.ts` | 776 | Rule 4 prompt gate, `isMatchingResolve`, and `RESOLVE_PROMPT` throw containment on a prototype prompt fold. The tutorial sandbox is their last user once 4.1 moves the journey to `answer` and `cancel` | **Deleted** in 6.1 with `RESOLVE_PROMPT`; engine `answer` and `cancel` contracts cover prompts. The CAS, routing, and genesis cases survive |
| `src/session/actions.test.ts` | 614 | The facade lists the tutorial battle creators (`beginTutorialBattle`, `restartTutorialBattle`, `exitTutorialBattle`, `completeTutorialBattlePresentation`) and the sandbox battle creators the tutorial still uses (`battleCommand`, `battleRepositionCharacter`, `battlePlayCard`, `battleGesture`, `battleAiBlock`, `resolvePrompt`) | Begin, restart, and exit → **C5** as engine-backed intents. `completeTutorialBattlePresentation` → **C3**. The sandbox battle creators are **deleted** with their event types |
| `src/session/single-controller.test.ts` | 193 | `keepLocalPlayerInControl`, including claiming an unowned tutorial battle on a direct `tutorial-battle` entry | **Deleted** by `hv-n5lj.11`. Any remnant goes in 6.2 |
| `src/screens/cumulus_adapters/TutorialScreenAdapter.test.tsx` | 656 | One case, "hands the terminal scripted cursor to the durable tutorial battle lifecycle" (`beginTutorialBattle`). The rest covers the scripted stage | That case → **C1** and **C5**. The scripted-stage cases survive |
| `src/components/app-shell.test.tsx` | 285 | Two cases route a `{ mode: { kind: "tutorial" } }` battle to `TutorialBattleScreenAdapter` and pass the direct-route flag | Rewritten against the engine battle slice's tutorial marker under **C5**; the routing semantics stay |

### Tutorial tests that survive 6.1

These test the scripted stage, authored content, or journey guidance, not the
sandbox battle fold. 6.1 keeps them. 6.2 revalidates the guidance ones on
engine events.

- `src/cumulus/screens/TutorialScreen.{how-to-play,opponent-cards,player,scene}.test.tsx`
  (484, 408, 313, 474 lines): the scripted stage; they stub `MobileBattleScreen`.
- `src/screens/cumulus_adapters/tutorial-view-model.test.ts` (1880): the
  scripted stage view model and its reconstruction logs.
- `src/data/tutorial-actions.test.ts` (517): authored action and trigger validation.
- `src/rules/front-door.test.ts` (478),
  `src/screens/cumulus_adapters/FrontDoorAdapter.test.tsx` (291),
  `src/cumulus/screens/front-door-screens.test.tsx` (443): front door, loading,
  and the scripted tutorial fold.
- `src/cumulus/screens/BattleTutorialGuidance.test.tsx` (480): the guidance
  surface for journey and tutorial battles (6.2 checks the journey side).
- `src/rules/card-tutorial-guidance.test.ts` (483),
  `src/session/providers/card-tutorial-guidance-provider.test.ts` (180),
  `src/components/JourneyCardTutorialController.test.tsx` (311): journey
  card-seen guidance on the shared seen-ID history.
- `src/cumulus/components/overlay/tutorial-overlay.test.tsx` (378),
  `src/cumulus/components/overlay/tutorial-overlay-geometry.test.ts` (148):
  overlay presentation.
- `src/runtime/qa-scenes.test.ts`, `src/session/game-selection.test.ts`,
  `src/rules/journey/lifecycle.test.ts` (`tutorialTriggerIdsSeen` reset), and
  `src/rules/journey/journey-properties.test.ts`: journey cases that only
  mention tutorial scenes or the seen-ID history. `journey-properties`
  generates `RESOLVE_PROMPT`; 4.1 `hv-n5lj.2` owns that generator.
