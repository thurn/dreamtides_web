# Exploration encounter JSON contracts

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

Use the `template_id` and `template` values in
[the canonical template catalog](../../../../data/templates.json) exactly. The
example shows one pair for brevity; a valid request contains five.

## JSON output

Return a bare JSON list of five event objects sorted by ascending `rank`:

```json
[
  {
    "template_pair_id": "pair-1",
    "prose": "The figure of a bird towers above you, wreathed in flame.",
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
# Blazing Emberwing

☪: Gain 1● for each character you control.

![Source artwork for Blazing Emberwing](</absolute/path/to/source-image>)

1. The figure of a bird towers above you, wreathed in flame.
   - ***Call Others to Witness*** — Take any number of Spirit Animal cards from 4 random choices
     - **Response:** Distant figures gather beneath the burning wings.
   - ***Call Down Its Kin*** — Gain one copy of each of 2 random Spirit Animal cards
     - **Response:** Winged shapes descend through the heated sky.
```

The display starts with the canonical card `name` and complete `ability`, then
the inline source artwork. It contains five top-level entries in ascending rank
order. Each entry uses `prose` as its top-level text, preserves action order,
places the bold-italic `label` and fully populated `effect_text` together in a
sub-bullet, and places its `resolution` in a nested response bullet. Omit all
other JSON fields and any surrounding commentary from the display response.

Test mode uses `scripts/generate-exploration-input.py --card-type <type>` to
choose a random canonical card from the `character`, `event`, or `all` pool.
The designer selects ten distinct templates later, constructs the complete
input contract, and emits the same display format after validating the request
and complete JSON output.

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

The standard predicate values are exactly `Event`, `Warrior`, `Spirit Animal`,
`Survivor`, and `≤2● cost Character`. For a special runtime variable, omitting
its `selection` entry is the standard `none` choice and leaves it unrestricted.
For a `{predicate}` placeholder, choose one of the five standard values.
`Character` is always forbidden because no constraint is the more useful broad
option.

Use a nonstandard predicate only for a strong, card-specific design reason that
none of the standard values can express. Verify that the relevant canonical
pool contains enough eligible targets for the template, then put a concise
`predicate_exception_rationale` on the action alongside `variables` and
`effect_text`:

```json
{
  "variables": {
    "predicate": "has a ▸Dawn ability"
  },
  "predicate_exception_rationale": "The source ability repeats ▸Dawn triggers, and the relevant pool contains 18 eligible cards."
}
```

The rationale must identify the source-card connection and the verified target
availability. Mechanical variety, visual flavor, and the source card's own type
or cost are not strong reasons. Choose predicates independently for each action;
do not reuse one merely because it appeared elsewhere in the set.

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

- `scene_quality` (40%): Whether the prose is a coherent, focused, vivid, and
  materially faithful description of the card's artwork. Score it with mechanics
  and actions hidden. Subjects, objects, setting features, depicted actions, and
  physical conditions must be visible or strongly implied. Require one dominant
  image expressed through precise nouns, strong verbs, and restrained details of
  scale, light, texture, motion, stillness, or atmosphere. Reject a candidate
  before scoring if it inventories the frame, uses generic caption language,
  introduces metaphor, simile, personification, symbolic equivalence, impossible
  agency, or a reality-bending conclusion, quotes the source name as a proper
  noun, or invents a material fact. Conventional visual phrasing such as
  `wreathed in flame` and `coils of shadow` is allowed when it directly describes
  appearance. An ordinary word from the source name remains available when it
  independently gives the strongest description. Reusing a strong visual focus
  across distinctly worded scenes does not lower this score; novelty does not
  raise it.
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
lower scores; use vivid descriptive precision, art fidelity, and focus as the
first qualitative tiebreakers, followed by the strength of the two complete
action chains and immediate clarity. Beyond requiring distinct wording for all five
`prose` fields, do not use prose novelty as a score or tiebreaker. Sort the final
list from rank 1 through rank 5. Preserve the
authoritative input pairing through
`template_pair_id`, and preserve the two template actions in their input order
within each event. The `ranking_rationale` is one concise sentence explaining
the design's score and rank.
