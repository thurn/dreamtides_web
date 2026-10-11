# RD-hv-umm2.60-1: Choose a player during resolution without changing the ability controller

- Ladder: 4 (MTG Comprehensive Rules 608.2d, adapted: choices other than modes, targets, costs and X are made while applying the resolving effect).
- Primary source: [Wizards Comprehensive Rules, 2026-06-19](https://media.wizards.com/2026/downloads/MagicCompRules%2020260619.pdf), § 608.2d, checked 2026-10-11.
- rules.md: § Playing Cards and the Stack → Choosing a player.
- Affects: 50fe6c54-4bf2-4177-a2f7-4c00a4a4c188.
- Why: The printed player choice does not say “Choose one:” and names a player rather than a character target. It is an instruction during resolution. Either player is eligible, including a player with an empty hand. The selected player chooses their own discard. The ability retains its source and controller; subsequent “you” instructions concern that controller. The printed draw amount reads the chosen energy X independently of the number of cards actually discarded, using the existing short-hand discard rule.

## Earlier ladder steps

The current decisions and card clarifications contain no player-choice timing decision. The actual semantic-card inventory at prototype commit `e0777f517`, `src/battle/semantic-play-card-ids.json`, and the current `legacy-behavior.md` do not implement this UUID or player-choice mechanic. The read-only Rust reference search in `rules_engine/` and `docs/battle_rules/battle_rules.md` found no `ChoosePlayer`, `choose_player`, `chosen_player`, or “choose a player” precedent. Sandbox operations are not rules precedent. The primary rules analog therefore supplies timing only; Dreamtides' existing discard and draw contracts supply the effects.

## Encoding

`choosePlayer` stores two declarative branches built with controller-relative `PlayerRef` values. Existing `chooseMode` represents the player choice, with role `choosePlayer`, mode 0 for the controller and mode 1 for the opponent. Only the selected subtree's modes and targets are chosen during resolution. Its scoped environment retains source, original root, controller, X, optional costs and shared duration. Normal prompt logs record source UUID/instance, choosing side and answer; discard/draw events identify the affected side.

The printed null energy cost maps to an energy-X cost with minimum one through `engineCardFromContent`. The catalog metadata retains that existing default; this bead adds no minimum override or new X legality rule. The generic primitive separately supports a synthetic energy-X minimum of zero.
