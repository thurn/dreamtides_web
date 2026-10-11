# RD-hv-umm2.423-1: Setting a character type replaces earlier all-types grants

- Ladder: 4, clarification of [RD-hv-umm2.106-2](RD-hv-umm2.106-2.md)'s established subtype replacement rule and the existing timestamp order.
- rules.md: § Ability Types → Order of continuous effects.
- Affects: 5832785d-fb97-40b5-a12b-bb660f5e04b6 (base, amplified), interacting with any character's "has all character types" effect.
- Why: "This character is that character type" sets its character type without preserving earlier types. Applying that type change after an all-types grant makes it only the chosen type. Applying an all-types grant later makes it every character type. Selectors and anthems read that final type state.

## Provenance

RD-hv-umm2.106-2 records the preceding D10 ladder research and the replacement
rule. The existing Dreamtides continuous-effects rule applies effects in
timestamp order within the type step. The
[official MTG Comprehensive Rules, September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf)
205.1a specify that setting subtypes replaces the previous members of that
subtype set; 613.7 applies earlier timestamps before later timestamps within
the same layer. Dreamtides applies those analogs in its layer-2 character-type
step and keeps its established timestamp tie order.

## Encoding

The `subtype` case in `continuous/layers.ts` sets the chosen `subtype` and
`allTypes: false`. A later `allTypes` change sets `allTypes: true`. Synthetic
choose-subtype contracts exercise both orders through resolved effects and
assert the resulting subtype selectors and anthem spark.
