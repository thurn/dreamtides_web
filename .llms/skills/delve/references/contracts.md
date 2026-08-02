# Delve JSON contracts

## Input

Pass one object. Exactly five pair objects are required, and every pair contains
exactly two actions.

```json
{
  "card": {
    "id": "18ff6a45-148a-40bf-85ae-4a51f32f406a",
    "name": "Blazing Emberwing",
    "ability": "☪: Gain 1● for each character you control.",
    "image_number": 2123360855,
    "card_type": "Character",
    "subtype": "Spirit Animal"
  },
  "template_pairs": [
    {
      "id": "pair-1",
      "actions": [
        {
          "template_id": 16,
          "template": "Take any number of {predicate} cards from 4 random choices"
        },
        {
          "template_id": 52,
          "template": "Gain one copy of each of {count} random {predicate} cards"
        }
      ]
    }
  ]
}
```

Use the numbered strings in `docs/delve/delve_templates.md` exactly. The example
shows one pair for brevity; a valid request contains five.

## Output

Return a bare JSON list of five event objects in input order:

```json
[
  {
    "template_pair_id": "pair-1",
    "prose": "Four firelit silhouettes rise beneath the circling wings, awaiting your signal.",
    "actions": [
      {
        "label": "Call the Flock",
        "template_id": 16,
        "template": "Take any number of {predicate} cards from 4 random choices",
        "variables": {
          "predicate": "Character"
        },
        "effect_text": "Take any number of Character cards from 4 random choices"
      },
      {
        "label": "Share the Spark",
        "template_id": 52,
        "template": "Gain one copy of each of {count} random {predicate} cards",
        "variables": {
          "count": 3,
          "predicate": "Character"
        },
        "effect_text": "Gain one copy of each of 3 random Character cards"
      }
    ],
    "scores": {
      "story_mechanics_fit": 9,
      "archetype_fit": 10,
      "overall": 9
    },
    "rank": 1,
    "ranking_rationale": "Both responses turn the gathering flock into character-focused rewards that reinforce the source card's strategy."
  }
]
```

The example shows one event for brevity; a valid output contains five.

### Action variables

Use JSON primitives for counts, essence values, predicates, card types, and
transfiguration names.

For an existing card or dreamsign, store identity and display text together:

```json
{
  "card_id": {
    "id": "<canonical UUID>",
    "display_name": "<canonical display name>"
  },
  "dreamsign_name": {
    "id": "<canonical UUID>",
    "display_name": "<canonical display name>"
  }
}
```

`effect_text` renders the display name. Logic consumes the UUID.
Use the same entity-reference shape for the catalog's `{card_name}` and
`{dreamsign}` placeholders. Use an exact canonical name such as `Empowered` for
`{transfiguration}`.

For a special runtime variable, add `selection` only when eligibility is
restricted:

```json
{
  "selection": {
    "$DECK_CARD": {
      "predicate": "Character"
    }
  }
}
```

Predicates must describe objective card data or rules, such as `Character`,
`Spirit Animal`, `cost 2 or less`, or `has an activated ability`.

For `$CUSTOM_CARD`, set `variables.custom_card`:

```json
{
  "custom_card": {
    "id": "<new UUID>",
    "name": "<archetypal card name>",
    "energy_cost": 2,
    "card_type": "Character",
    "subtype": "Spirit Animal",
    "rendered_text": "<complete ability text>",
    "spark": 2
  }
}
```

A custom Event uses `"card_type": "Event"`, an empty-string `subtype`, and an
empty-string `spark`, matching canonical Event records. A custom Character
requires a non-empty subtype and an integer spark.

For `$CUSTOM_DREAMSIGN`, set `variables.custom_dreamsign` with a new UUID,
`name`, and complete `rendered_text`.

`effect_text` is complete player-facing copy. It contains no `{placeholder}` or
`$SPECIAL_VARIABLE` tokens. The `template`, `variables`, and `selection` fields
remain the authoritative machine-readable design.

## Scoring and ranking

Score each component from 1–10:

- `story_mechanics_fit`: How naturally both narrative actions arise from one
  situation and explain their fixed effects. This cannot exceed 6 when the
  selected variables make one choice mechanically noncredible.
- `archetype_fit`: How well the values and rewards support the strategy implied
  by owning the source card. This cannot exceed 6 when one option is effectively
  dead for that likely deck.
- `overall`: `70% story_mechanics_fit + 30% archetype_fit`, rounded to the
  nearest integer.

Assign every rank from 1 through 5 exactly once. Higher overall scores outrank
lower scores; use qualitative comparison to break tied overall scores. Keep the
events in input order rather than sorting them. The `ranking_rationale` is one
concise sentence explaining the design's score and rank.
