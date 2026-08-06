# Exploration encounter design contract

## Purpose

Design one live-ready encounter from one canonical card request. Inspect the
full-size artwork before reading mechanics. Privately compare five complete
encounter concepts, then emit one winner with two actions and four concise
rejection notes. Do not edit repository files.

## Required request

Read one JSON object with this shape:

```json
{
  "card": {
    "id": "<canonical UUID>",
    "name": "<canonical display name>",
    "ability": "<complete rendered ability>",
    "image_number": 1,
    "card_type": "<canonical type>",
    "subtype": "<canonical subtype or empty string>"
  },
  "art_path": "<absolute full-size image path>",
  "repository": {
    "cards": "<absolute cards.toml path>",
    "dreamsigns": "<absolute dreamsigns.toml path>",
    "exploration": "<absolute exploration.toml path>",
    "templates": "<absolute templates.json path>",
    "journey_types": "<absolute journey.ts path>"
  }
}
```

Verify the card by UUID against `cards.toml`. Actually view `art_path`; never
design from its filename. Read the complete template catalog only after the
scene is understood. Inspect live template usage and canonical cards,
Dreamsigns, transfigurations, economy, and archetype data as needed.

## Scene reading

Privately record material facts, supported atmosphere, the required subject,
and deck intent before considering effects.

- For a Character card, use the canonical name only to identify the depicted
  source character. Make that character the primary and only character
  described. Visible props, terrain, architecture, weather, and light may
  support the scene without displacing the character.
- For other card types, describe the single entity or element occupying the
  largest visible area. Omit smaller entities and keep at most one background
  detail subordinate.
- Describe only visible or strongly implied material facts. Use precise nouns,
  strong verbs, restrained modifiers, and third-person present tense.
- Do not quote the complete card name, invent proper names or lore, introduce
  off-image observers, manufacture a dilemma, or disguise game operations as
  scenery.
- Reject metaphor, simile, personification, symbolic equivalence, impossible
  agency, and opaque poetic conceits. Conventional visual phrasing is fine when
  it describes literal appearance.

Winning prose must contain at most 16 words, refer to no player/reader/viewer,
never use the word `the`, and not begin with `one` to introduce a singular
subject. Introduce a singular count subject with `a` or `an` when natural.

## Mechanical design

Infer what owning the source card suggests the player is building toward. Both
choices must be useful: one may deepen synergy while the other offers
flexibility, conversion, or risk management. Avoid strictly dominated pairs.

Read every entry in `data/templates.json`. Prefer underused mechanics when
quality is comparable, but art fidelity, complete action-to-effect causality,
and deck intent are stronger criteria. A template marked
`balance_class: unique_effect` needs an exceptional card-specific fit. The two
winning actions must use distinct template IDs.

Use these standard predicates unless a verified card-specific exception is
materially stronger: `Event`, `Warrior`, `Spirit Animal`, `Survivor`, or
`≤2● cost Character`. Do not use `Character` as a broad predicate; omit a
runtime selection restriction when unrestricted eligibility is the better
choice. A nonstandard predicate requires a concise
`predicate_exception_rationale` naming the source-card connection and verified
eligible-target count.

Special variables are resolved from deterministic persisted offers:

- `$OFFERED_CARD`: an eligible card outside the deck offered when the site
  runtime is created.
- `$DECK_CARD`: an eligible entry in the current deck.
- `$STARTER_CARD`: an eligible starter entry in the current deck.

Every special-card pool excludes the source-card UUID. Add a `selection` rule
under the exact token only when a restriction improves the design. Braced
placeholders always receive literal values in `variables`; special variables
never appear in `variables`.

For canonical cards and Dreamsigns, store UUID identity with display text:

```json
{
  "id": "<canonical UUID>",
  "display_name": "<canonical display name>"
}
```

The referenced card UUID must differ from the source UUID. Verify
transfiguration names against the canonical `TransfigurationType` union.

## Private five-concept tournament

Generate five materially distinct complete concepts. Each concept has frozen
scene prose and two concrete labels paired with two template effects. Do not
revise scene facts merely to justify a mechanic.

Score privately from 1–10:

- scene quality, 40%: fidelity, focus, vivid precision, and first-arrival
  clarity with mechanics hidden;
- action quality, 15%: two distinct purposeful acts grounded in the scene;
- mechanical connection, 30%: the weaker action's complete
  scene-to-label-to-effect causal chain;
- archetype fit, 15%: both outcomes' usefulness for the source card's deck
  intent.

Round the weighted total to the nearest integer. Revise any concept whose
mechanical-connection score is below 7. Rank higher totals first, breaking ties
by scene fidelity, the weaker action chain, archetype fit, and clarity. Emit
only rank 1. Summarize the other four concepts without their full prose or
action data so the scratch result preserves selection pressure without forming
a reusable candidate catalog.

## Output JSON

Write one strict JSON object and no Markdown:

```json
{
  "card_id": "<source canonical UUID>",
  "prose": "<winning scene prose>",
  "actions": [
    {
      "label": "<2-5 words, at most 32 characters>",
      "template_id": 1,
      "variables": {},
      "selection": {
        "$SPECIAL_VARIABLE": {
          "predicate": "<verified predicate>"
        }
      },
      "predicate_exception_rationale": "<only for a nonstandard predicate>",
      "implementation_notes": {
        "state_transition": "<exact semantic state change>",
        "offer_or_selection": "<what is minted and what UUID-only intent selects>",
        "persisted_result": "<exact IDs and deltas needed for replay>",
        "outcome": "<what the dedicated semantic result must present>"
      }
    },
    {
      "label": "<second action>",
      "template_id": 2,
      "variables": {},
      "implementation_notes": {
        "state_transition": "<exact semantic state change>",
        "offer_or_selection": "<offer or none>",
        "persisted_result": "<persisted facts>",
        "outcome": "<exact result presentation>"
      }
    }
  ],
  "selection_rationale": "<why this concept won, at most 40 words>",
  "alternatives_considered": [
    {
      "summary": "<concise concept summary>",
      "rejected_because": "<specific weaker dimension>"
    },
    {
      "summary": "<second alternative>",
      "rejected_because": "<specific reason>"
    },
    {
      "summary": "<third alternative>",
      "rejected_because": "<specific reason>"
    },
    {
      "summary": "<fourth alternative>",
      "rejected_because": "<specific reason>"
    }
  ]
}
```

Omit `selection` and `predicate_exception_rationale` when inapplicable. Actions
must not contain `template`, `effect_text`, `effect-kind`, or guessed runtime
field names. Canonical template wording lives only in `data/templates.json`.
Implementation notes describe semantics so the operator can prove an existing
effect kind matches or assign a complete new vertical slice.

Each alternative `summary` must be a single line of at most 12 words. Each
`rejected_because` must be a single line of at most 20 words. Keep both at the
concept level: do not preserve full losing prose, action pairs, template IDs,
variables, predicates, or scores.
