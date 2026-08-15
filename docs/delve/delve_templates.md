# Delve Event Effects

At a Delve site, the game selects one card from the player's deck as the
narrative focus. The player enters a short event inspired by that card and
chooses between two actions.

Every production encounter is authored in
[`../../data/exploration_site.ron`](../../data/exploration_site.ron). An action colocates
its player-facing presentation with one closed typed gameplay effect:

```ron
[
  EncounterDefinition(
    card_id: "161482b6-af07-4d9e-822d-8c738672beb9",
    prose: "A young lantern bearer approaches a towering window of stars.",
    actions: [
      ActionDefinition(
        label: "Invite someone through",
        id: "6662e7ce-9ea7-49bf-85fe-4bbe6728f282",
        presentation: ActionPresentation(
          effect_text: "Gain {offered_card}",
        ),
        effect: GainGeneratedCard(
          predicate: Character,
          count: None,
        ),
      ),
    ],
  ),
]
```

The `presentation` record owns text shown to the player. `effect` owns all
gameplay semantics. Changing presentation text cannot change which cards are
eligible, whether a target is chosen, or how the effect resolves.
Each action has its own lowercase UUIDv4 identity.

## Presentation slots

Effect text supports typed card-reference slots where a runtime-selected card
must be shown inline:

- `{offered_card}` displays the card produced by `GainGeneratedCard`.
- `{deck_card}` displays the deck entry automatically offered by an effect whose
  `target` is `Offered`.

Followup title and subtitle support scalar slots derived from the same action,
including `{action-label}`, `{count}`, `{subtype}`, `{transfiguration}`, and
`{essence-per-spark}`.

Slots are presentation references. The compiler validates that each slot is
compatible with the typed effect, and runtime behavior reads only the effect.

## Deck targets

Effects that can operate on either a player-selected deck entry or an
automatically offered entry carry an explicit target:

```ron
effect: CopySelectedCard(
  target: Offered,
  predicate: Some(CheapCharacter),
  count: 2,
),
```

`Chosen` opens the appropriate card chooser after the action is selected.
`Offered` mints the target into the persisted Exploration offer and can present
it with `{deck_card}`.

## Editor schema

The browser editor obtains labels, controls, and safe field defaults from the
closed code-owned schema in
[`../../scripts/exploration-effect-definitions.mjs`](../../scripts/exploration-effect-definitions.mjs).
That schema is development tooling metadata. Player-facing action and followup
copy stays in `data/exploration_site.ron` and is saved on the individual action.

After editing canonical data, run `scripts/regenerate-assets.sh` to regenerate
the compatibility TOML and browser JSON.
