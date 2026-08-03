# Exploration encounter JSON contracts

## Contract notation

The snippets in this file are structural schemas, not encounter-design
examples. Angle-bracket strings and nonpositive integers are documentation
sentinels that must be replaced with values derived from the current card,
artwork, canonical content, and complete template catalog. They are
deliberately ineligible for validation and do not nominate any prose,
mechanic, template, predicate, value, pairing, label, or resolution.

## Input

Pass one object. Exactly five pair objects are required, and every pair contains
exactly two actions.

```json
{
  "card": {
    "id": "<canonical card UUID>",
    "name": "<canonical card name>",
    "ability": "<complete canonical ability>",
    "image_number": 0,
    "card_type": "<canonical card type>",
    "subtype": "<canonical subtype or empty string>"
  },
  "template_pairs": [
    {
      "id": "pair-1",
      "actions": [
        {
          "template_id": 0
        },
        {
          "template_id": -1
        }
      ]
    }
  ]
}
```

Use `template_id` values from
[the canonical template catalog](../../../../data/templates.json). The
schema shows one pair for brevity; a valid request contains five, and each
sentinel represents a different deliberately selected catalog entry.

## JSON output

Return a bare JSON list of five event objects sorted by ascending `rank`:

```json
[
  {
    "template_pair_id": "<input pair ID>",
    "prose": "<distinct frozen scene prose>",
    "actions": [
      {
        "label": "<first scene-grounded action label>",
        "resolution": "<first immediate world response>",
        "template_id": 0,
        "variables": {
          "<required placeholder name>": "<resolved value>"
        }
      },
      {
        "label": "<second scene-grounded action label>",
        "resolution": "<second immediate world response>",
        "template_id": -1,
        "variables": {
          "<required placeholder name>": "<resolved value>"
        }
      }
    ],
    "scores": {
      "scene_quality": 0,
      "action_quality": 0,
      "mechanical_connection": 0,
      "archetype_fit": 0,
      "overall": 0
    },
    "rank": 0,
    "ranking_rationale": "<concise design-specific ranking rationale>"
  }
]
```

The schema shows one event for brevity; a valid output contains five. Replace
all score and rank sentinels with validated values.

This JSON contract is authoritative in both output modes. In display mode,
validate the complete JSON first, then render only the user-facing fields as
Markdown:

```markdown
# <card name>

<complete card ability>

![Source artwork for <card name>](</absolute/path/to/source-image>)

1. <prose>
   - ***<action label>*** — <rendered canonical template>
     - **Response:** <resolution>
   - ***<action label>*** — <rendered canonical template>
     - **Response:** <resolution>
```

The display starts with the canonical card `name` and complete `ability`, then
the inline source artwork. It contains five top-level entries in ascending rank
order. Each entry uses `prose` as its top-level text, preserves action order,
places the bold-italic `label` and rendered canonical template together in a
sub-bullet, and places its `resolution` in a nested response bullet. Rendering
replaces each braced placeholder with its `variables` value (or an entity
reference's `display_name`) and preserves `$SPECIAL_VARIABLE` tokens literally.
Omit all other JSON fields and any surrounding commentary from the display response.

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

Template rendering uses the display name. Logic consumes the UUID.
Use the same entity-reference shape for the catalog's `{card_name}` and
`{dreamsign}` placeholders. Verify every `{transfiguration}` value against the
canonical transfiguration types.

Every card entity reference must use a UUID different from `card.id` in the
input. The source card is ineligible for all template resolutions. Eligibility
is UUID-based, so a different canonical UUID remains eligible when it shares
the source card's display name. No action field may identify the source card as
the resolved target.

For a special runtime variable, add `selection` only when eligibility is
restricted:

```json
{
  "selection": {
    "$DECK_CARD": {
      "predicate": "<eligible predicate>"
    }
  }
}
```

The standard predicate values are exactly `Event`, `Warrior`, `Spirit Animal`,
`Survivor`, and `≤2● cost Character`. Every special card variable removes the
input `card.id` from its eligible pool before applying any predicate. Omitting
its `selection` entry is the standard `none` choice and leaves the remaining
pool unrestricted. For a `{predicate}` placeholder, choose one of the five
standard values. `Character` is always forbidden because no constraint is the
more useful broad option.

Use a nonstandard predicate only for a strong, card-specific design reason that
none of the standard values can express. Verify that the relevant canonical
pool contains enough eligible targets for the template, then put a concise
`predicate_exception_rationale` on the action alongside `variables`:

```json
{
  "variables": {
    "predicate": "<verified card-specific predicate>"
  },
  "predicate_exception_rationale": "<source-card connection and verified eligible-target count>"
}
```

The rationale must identify the source-card connection and the verified target
availability. Mechanical variety, visual flavor, and the source card's own type
or cost are not strong reasons. Choose predicates independently for each action;
do not reuse one merely because it appeared elsewhere in the set.

Actions contain `template_id`, `variables`, and optional `selection`; they do
not copy canonical template text. `data/templates.json` is the sole source of
template wording. Rendering replaces `{placeholder}` tokens and deliberately
leaves `$SPECIAL_VARIABLE` tokens unchanged.

### Action resolutions

Every action includes a `resolution` of 5–10 words. It is brief post-choice
prose shown before or alongside the effect. It describes the world's immediate
response to the label and makes the mechanical outcome feel earned without
using game terminology or repeating the rendered template.

## Scoring and ranking

Score each component from 1–10:

- `scene_quality` (40%): Whether the prose is a coherent, focused, vivid, and
  materially faithful description of the card's artwork. Score it with mechanics
  and actions hidden. It uses entity-focused third-person present tense and
  contains no first- or second-person pronouns, player, reader, viewer, implied
  off-image observer, or viewpoint-relative framing. Subjects, objects, setting
  features, depicted actions, and physical conditions must be visible or
  strongly implied. For a Character
  card, reject a candidate before scoring unless the canonical character
  identified by the card name is the primary subject and the only person,
  creature, or character-like figure described. Visible non-character elements
  such as props, architecture, terrain, weather, light, and framing shapes may
  appear, as may the source character's relationships to them, when they sharpen
  the scene without inventorying the frame or displacing the character. Any
  mention of another character is an automatic rejection. This character
  selection overrides relative image area.
  For other card types, require the single most prominent element, expressed
  through precise nouns, strong verbs, and restrained details of scale, light,
  texture, motion, stillness, or atmosphere. When multiple entities appear,
  prose may describe only the entity occupying the largest visible image area;
  smaller entities must be omitted. Background detail must remain subordinate,
  while the primary figure receives evocative, specific treatment. Reject a
  candidate before scoring if it inventories the frame, foregrounds framing or
  scenery over a more prominent figure, uses generic caption language,
  introduces metaphor, simile, personification, symbolic equivalence,
  impossible agency, or a reality-bending conclusion, quotes the source name as
  a proper noun, or invents a material fact.
  Conventional visual phrasing such as `wreathed in flame` and `coils of shadow`
  is allowed when it directly describes appearance. An ordinary word from the
  source name remains available when it independently gives the strongest
  description. Neither allowance overrides the one-character rule or permits
  scenery to displace the source character. Reusing a strong visual focus across
  distinctly worded scenes does not lower this score; novelty does not raise it.
- `action_quality` (15%): Whether both labels are distinct, purposeful things to
  do in the scene and both resolutions are concise, vivid responses.
- `mechanical_connection` (30%): Whether each label and resolution make its
  effect feel like a plausible consequence, including the thematic fit of any
  selected card, dreamsign, or predicate. Score the weaker
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
