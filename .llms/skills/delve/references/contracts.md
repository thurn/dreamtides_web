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

Use the `template_id` and `template` values in [`templates.json`](templates.json)
exactly. The example shows one pair for brevity; a valid request contains five.

## JSON output

Return a bare JSON list of five event objects sorted by ascending `rank`:

```json
[
  {
    "template_pair_id": "pair-1",
    "prose": "A great bird with wings wreathed in flame towers above you.",
    "actions": [
      {
        "label": "Call Others to Witness",
        "resolution": "Distant figures gather beneath the burning wings.",
        "template_id": 16,
        "template": "Take any number of {predicate} cards from 4 random choices",
        "variables": {
          "predicate": "Spirit Animal"
        },
        "effect_text": "Take any number of Spirit Animal cards from 4 random choices"
      },
      {
        "label": "Call Down Its Kin",
        "resolution": "Winged shapes descend through the heated sky.",
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
      "scene_quality": 9,
      "action_quality": 9,
      "mechanical_connection": 9,
      "archetype_fit": 10,
      "overall": 9
    },
    "rank": 1,
    "ranking_rationale": "The imposing tableau supports two causal action chains, while both rewards remain useful to the card's character-heavy strategy."
  }
]
```

The example shows one event for brevity; a valid output contains five.

This JSON contract is authoritative in both output modes. In display mode,
validate the complete JSON first, then render only the user-facing fields as
Markdown:

```markdown
![Source artwork for Blazing Emberwing](</absolute/path/to/source-image>)

1. A great bird with wings wreathed in flame towers above you.
   - **Call Others to Witness** — Take any number of Spirit Animal cards from 4 random choices
     - **Response:** Distant figures gather beneath the burning wings.
   - **Call Down Its Kin** — Gain one copy of each of 2 random Spirit Animal cards
     - **Response:** Winged shapes descend through the heated sky.
```

The complete display contains five top-level entries in ascending rank order.
Each entry uses `prose` as its top-level text, preserves action order, places
the action's `label` and fully populated `effect_text` together in a sub-bullet,
and places its `resolution` in a nested response bullet. Omit all other JSON
fields and any surrounding commentary from the display response.

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
      "predicate": "Spirit Animal"
    }
  }
}
```

Predicates must describe objective card data or rules and create a meaningful
restriction, such as `Spirit Animal`, `cost 2 or less`, or `has an activated
ability`. `Character` is forbidden because it covers roughly 70% of the card
catalog and is not mechanically selective.

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

### Action resolutions

Every action includes a `resolution` of 5–10 words. It is brief post-choice
prose shown before or alongside the effect. It describes the world's immediate
response to the label and makes the mechanical outcome feel earned without
using game terminology or repeating `effect_text`.

## Scoring and ranking

Score each component from 1–10:

- `scene_quality` (40%): Whether the prose is a coherent, specific, evocative,
  and materially faithful description of the card's artwork. Score it with
  mechanics and actions hidden. Every subject, object, setting feature, and
  depicted action must be visible or strongly implied by visible evidence.
  Reward poetic compression, sensory immediacy, posture, scale, and precise
  attention to observed details. A faithful but flat inventory is competent,
  not excellent. Reject a candidate before scoring if it invents a companion,
  crowd, creature, prop, structure, weather event, or incident to support a
  mechanic. Conflict, plot, and an unresolved problem earn no inherent credit.
- `action_quality` (15%): Whether both labels are distinct, purposeful things to
  do in the scene and both resolutions are concise, vivid responses.
- `mechanical_connection` (30%): Whether each label and resolution make its
  effect feel like a plausible consequence, including the thematic fit of any
  selected card, dreamsign, predicate, or custom reward. Score the weaker
  action chain rather than averaging the two; revise scores below 7.
- `archetype_fit` (15%): Whether both mechanical outcomes are credible and
  useful for the strategy implied by owning the source card.
- `overall`: The weighted score above, rounded to the nearest integer.

Assign every rank from 1 through 5 exactly once. Higher overall scores outrank
lower scores; use art fidelity and evocative precision as the first qualitative
tiebreakers, followed by the strength of the two complete action chains. Sort
the final list from rank 1 through rank 5. Preserve the authoritative input
pairing through `template_pair_id`, and preserve the two template actions in
their input order within each event. The `ranking_rationale` is one concise
sentence explaining the design's score and rank.
