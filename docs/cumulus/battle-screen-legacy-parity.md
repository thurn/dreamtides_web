# Cumulus Battle Screen Legacy Parity

## Status and scope

This document records the remaining feature gaps between the Cumulus playable
battle screen and the legacy playable battle screen. It covers player-visible
battle information, card interaction, battle completion, and the operator tools
used to resolve printed effects and inspect production games.

The inventory reflects the shared battle controller and both UI variants as of
July 16, 2026. It was verified through a source audit of the responsive Cumulus
battle implementation and a desktop browser comparison at 1440 by 1000 pixels.
Visual styling is outside the parity requirement unless it hides information or
removes an interaction.

## Current parity baseline

Both battle screens use the same event-sourced battle state, commands, rules
automation, and AI controller. Cumulus currently supports:

- the front- and back-rank battlefield;
- player-hand play, battlefield dragging, and slot swapping;
- AI proposals with approve and reject controls;
- Dreamwell reveals;
- inline card-picking and choice prompts;
- deck, void, and banished card browsers;
- battlefield and player-hand card context actions;
- card notes;
- resource editing, draw, discard, shuffle, Foresee, Erode, and Dreamwell draw;
- Figment creation and the pool viewer;
- battle log and Dreamwell history drawers; and
- victory, defeat, and draw routing.

The remaining work is therefore presentation and interaction parity, not a
second battle engine.

## Player-facing parity gaps

### Explicit turn and phase display

The live Cumulus board communicates the active side and phase through the
position of an unlabeled phase light. Back and Next Phase controls move through
the sequence. The turn number, active-side label, and phase name are visible in
the developer inspector.

Parity requires the live board to expose the current turn number, active side,
and phase name without opening developer tools. The phase control should also
communicate the complete set of selectable phases as clearly as the legacy
phase chips.

Relevant implementation:

- [Cumulus battle phase indicator](../../src/cumulus/screens/MobileBattleScreen.tsx)
- [Legacy battle status and phase controls](../../src/battle/components/PlayableBattleScreen.tsx)

### Battle-card status feedback

The Cumulus battle card model carries exhaustion, Figment identity, and the
effective spark value. Its rendered battlefield card does not visibly present
the complete battle-instance status carried by the legacy card:

- exhausted treatment;
- stored-time counter badge;
- Figment stack count; and
- automation gear for scripted card text.

Parity requires these states to remain readable at battlefield and hand sizes.
The visual state must update from the authoritative battle instance after every
committed edit.

Relevant implementation:

- [Cumulus battle card view model and renderer](../../src/cumulus/screens/MobileBattleScreen.tsx)
- [Legacy battle card status presentation](../../src/battle/components/BattleGameCard.tsx)

### Complete enemy-hand reveal and interaction

The general Cumulus enemy-hand fan displays at most six cards. Show Enemy Hand
turns those displayed cards face up, while authoritative enemy-owned card-picker
prompts display the complete hand. Face-up cards in the general reveal have no
drag or card-debug interaction.

Parity requires Show Enemy Hand to make every enemy-hand card inspectable and
to provide the same card-scoped debug actions and movement gestures available
from the legacy revealed hand. A large hand may use a browser, scrollable fan,
or explicit overflow interaction, but its hidden remainder must be reachable.

Relevant implementation:

- [Cumulus enemy-hand fan](../../src/cumulus/screens/MobileBattleScreen.tsx)
- [Legacy hand tray](../../src/battle/components/BattleHandTray.tsx)

### Dreamcaller and Dreamsign inspection during battle

The Cumulus battle status object displays each Dreamcaller portrait, energy,
and points. The live board has no reveal carrying Dreamcaller rules, opponent
ability activation state, or either side's Dreamsign details.

Parity requires both status objects to expose their Dreamcaller rules and
Dreamsigns during battle. The enemy reveal must identify whether its Dreamcaller
ability is active for the current run layer.

Relevant implementation:

- [Cumulus battle status display](../../src/cumulus/components/battle/BattleStatusDisplay.tsx)
- [Legacy side summary](../../src/battle/components/BattleSideSummaryPopover.tsx)
- [Legacy battle Dreamsign row](../../src/battle/components/BattleActionBar.tsx)

### Victory inspection flow

The Cumulus victory surface presents the reward summary, essence count-up, and
Continue action. Defeat and draw surfaces support Keep Inspecting and a reopen
control.

Parity requires victory to support the same terminal-board inspection loop:
dismiss the reward surface, inspect the final board, and reopen or continue the
reward flow without changing the battle result.

Relevant implementation:

- [Cumulus battle result surface](../../src/cumulus/screens/BattleResultSurface.tsx)
- [Legacy battle reward surface](../../src/battle/components/BattleRewardSurface.tsx)

## Operator and debug parity gaps

### Basic Automation toggle

The legacy action bar can change Basic Automation during a battle. Cumulus
reads the authoritative automation setting but exposes no board or inspector
action for changing it.

Parity requires an explicit automation control whose pressed state reflects
the battle fold and whose action writes the existing automation intent.

Relevant implementation:

- [Legacy automation control](../../src/battle/components/BattleActionBar.tsx)
- [Cumulus inspector action contract](../../src/cumulus/screens/MobileBattleScreen.tsx)

### Stack zone

The battle state includes an ordered stack. The Cumulus inspector reports its
card count, while the live board has no stack object, stack drop target, card
inspection, or resolution actions.

Parity requires Cumulus to display every stack entry, accept the supported
stack movement gesture, and expose Void and Banish resolution. This is also a
cross-client requirement: a command submitted from a legacy client can leave a
card on the shared stack that a Cumulus client must be able to see and resolve.

Relevant implementation:

- [Legacy stack zone](../../src/battle/components/PlayableBattleScreen.tsx)
- [Shared battle stack state](../../src/battle/types.ts)

### Full deck toolkit

The Cumulus deck browser presents ordered cards with search, sort, filter, drag,
and context-menu interaction. Its current action surface omits these legacy
deck operations:

- Reveal Top;
- Hide Top;
- Play From Top; and
- Reorder Full Deck.

Foresee and Shuffle remain available from the inspector. Parity requires every
operation above to be reachable with the existing battle command semantics and
logging provenance.

Relevant implementation:

- [Cumulus battle zone browser adapter](../../src/battle/components/CumulusBattleZoneBrowser.tsx)
- [Cumulus card zone browser](../../src/cumulus/screens/CardZoneBrowserOverlay.tsx)
- [Legacy battle zone browser](../../src/battle/components/BattleZoneBrowser.tsx)

### Complete manual Foresee controls

The Cumulus Foresee surface can change the inspected count, reorder the viewed
deck prefix, move viewed cards to the void, and confirm the complete result.
Its manual invocation has no cancel or close action and no Play From Top or Send
to Bottom operation. Confirm is disabled for an empty deck, leaving an empty
manual Foresee surface without a dismissal action.

Parity requires:

- a cancel path for manually opened Foresee;
- a valid dismissal path for an empty deck;
- Play From Top;
- Send to Bottom;
- preservation of the current reorder and send-to-void behavior; and
- authoritative effect prompts to retain their required-resolution gate.

Relevant implementation:

- [Cumulus Foresee surface](../../src/cumulus/screens/BattleForeseeOverlay.tsx)
- [Legacy Foresee surface](../../src/battle/components/BattleForeseeOverlay.tsx)

### Physical Banished zone

Cumulus exposes banished cards and their count through the inspector and card
browser. The board itself presents deck and void piles only, and its direct zone
drop targets are deck, hand, and void.

Parity requires a visible Banished count or pile plus a direct Banished drop
target for each side. Opening the pile must continue to use the Cumulus card
browser and UUID-backed card actions.

Relevant implementation:

- [Cumulus side zones and drop targets](../../src/cumulus/screens/MobileBattleScreen.tsx)
- [Legacy Banished zone](../../src/battle/components/PlayableBattleScreen.tsx)

## Secondary parity gaps

These differences preserve a route to the underlying capability but remain
below strict legacy parity:

- direct phase selection instead of sequential Back and Next Phase navigation;
- live-region announcements for turn, active-side, phase, and result changes;
- search and type filtering in the void browser; and
- always-visible hand and Banished counts outside the developer inspector.

## Parity completion criteria

The Cumulus battle screen reaches legacy feature parity when all of the
following are true on desktop and mobile:

1. A player can identify turn, active side, and phase from the live board.
2. Every rendered battle card communicates exhaustion, counters, Figment stack
   size, and automated-rules status when applicable.
3. Show Enemy Hand exposes every enemy card and its supported debug actions.
4. Both Dreamcaller status objects expose rules and Dreamsign details.
5. Victory can round-trip between reward presentation and terminal-board
   inspection.
6. Basic Automation can be changed from Cumulus.
7. Stack cards are visible, inspectable, movable, and resolvable.
8. Reveal Top, Hide Top, Play From Top, and Reorder Full Deck are reachable.
9. Manual Foresee supports cancel, empty-deck dismissal, play-from-top, and
   send-to-bottom behavior.
10. Both Banished zones have visible counts and direct drop targets.
11. Turn and result changes have equivalent accessible announcements.
12. Each interaction submits existing battle intents through the shared
    controller and produces enough logging to reconstruct the action from a
    production game.
