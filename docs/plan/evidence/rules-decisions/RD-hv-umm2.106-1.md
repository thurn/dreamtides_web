# RD-hv-umm2.106-1: "Choose a character type" offers every character type in the game, chosen openly as the instruction resolves

- Ladder: 4 (MTG Comprehensive Rules 608.2d, adapted: choices other than modes, targets, costs and X are made and announced while the effect resolves; 205.3m, adapted: "choose a creature type" names any creature type in the game, not only one present)
- rules.md: § Keywords and Effects → Choose a character type
- Affects: 5832785d-fb97-40b5-a12b-bb660f5e04b6 (base, amplified), 3076694f-ffc2-46c9-8e1a-39f3878c73c9
- Why: The text names no restriction, and Through the Rift exists to find a type in a hidden deck, so limiting the choice to types present in play or in known zones would defeat it and leak or depend on hidden information. The game's character types are the subtypes its catalog prints on characters and figment types; the placeholders printed on characters that have all character types ("*", "X") name no type. The choice is announced, so the opponent learns that Through the Rift's discovered card is a character of that type and nothing more.

## Earlier ladder steps

No D-, C- or P-entry covers a resolution-time type choice; C12 concerns the journey-level type-remap dreamsign and is unaffected. The prototype has no battle implementation of either UUID (its `chosenSubtype` provenance belongs to journey type changes and figments). The read-only `~/dreamtides` search found no `ChooseCharacterType`/`chosen_subtype` rule, only rendered card text.

## Encoding

`chooseSubtype` (src/engine/effects/primitives/choose-subtype.ts) asks a public `chooseMode` prompt with role `chooseSubtype`; `ChooseModePrompt.subtypes` names each mode's type, from `EngineCatalog.characterTypes` (distinct, code-unit order, without `BATTLE.untypedSubtypes`). The answer is announced by the `subtypeChosen` event, private only when its source is a card in a hand or deck. The following instruction resolves with `CHOSEN_SUBTYPE` replaced by the chosen type.
