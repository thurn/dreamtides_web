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
    "prose": "A child offers the emberwing a hand; the great bird lowers its burning head.",
    "actions": [
      {
        "label": "Pull Them Back",
        "template_id": 16,
        "template": "Take any number of {predicate} cards from 4 random choices",
        "variables": {
          "predicate": "Character"
        },
        "effect_text": "Take any number of Character cards from 4 random choices"
      },
      {
        "label": "Approach Together",
        "template_id": 52,
        "template": "Gain one copy of each of {count} random {predicate} cards",
        "variables": {
          "count": 2,
          "predicate": "Spirit Animal"
        },
        "effect_text": "Gain one copy of each of 2 random Spirit Animal cards"
      }
    ],
    "scores": {
      "story_quality": 9,
      "choice_quality": 9,
      "archetype_fit": 10,
      "overall": 9
    },
    "rank": 1,
    "ranking_rationale": "The encounter presents a clear relationship and dilemma, while both rewards remain useful to the card's character-heavy strategy."
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

- `story_quality` (60%): Whether the prose is a coherent, specific, evocative
  vignette grounded in the card's world. Score it with the mechanics hidden.
- `choice_quality` (25%): Whether both labels are distinct, plausible responses
  to the situation. The effects must not contradict the choices, but literal
  explanation of the effects earns no credit.
- `archetype_fit` (15%): Whether both mechanical outcomes are credible and
  useful for the strategy implied by owning the source card.
- `overall`: The weighted score above, rounded to the nearest integer.

Assign every rank from 1 through 5 exactly once. Higher overall scores outrank
lower scores; use qualitative comparison to break tied overall scores. Keep the
events in input order rather than sorting them. The `ranking_rationale` is one
concise sentence explaining the design's score and rank.
