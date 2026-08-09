# Exploration encounter design contract

Design exactly one winning encounter for the request. Inspect the full-size artwork
at `art_path`, use the canonical card UUID, read every mechanic in
`repository.mechanic_ideas`, and write one JSON result at the assigned path.

## Request contract

The request has this shape:

```json
{
  "schema_version": 2,
  "card": {
    "id": "<canonical card UUID>",
    "name": "<display name>",
    "ability": "<rendered rules text>",
    "image_number": 123,
    "card_type": "Character",
    "subtype": "Warrior"
  },
  "action_ids": ["<UUIDv4>", "<UUIDv4>"],
  "art_path": "<absolute full-size image path>",
  "repository": {
    "cards_source": "<absolute data/cards.ron path>",
    "cards_compat": "<absolute generated cards.toml path>",
    "dreamsigns_source": "<absolute data/dreamsigns.ron path>",
    "dreamsigns_compat": "<absolute generated dreamsigns.toml path>",
    "exploration_source": "<absolute data/exploration.ron path>",
    "exploration_compat": "<absolute generated exploration.toml path>",
    "transfiguration_source": "<absolute data/transfiguration.ron path>",
    "transfiguration_compat": "<absolute generated transfiguration.toml path>",
    "mechanic_ideas": "<absolute mechanic-ideas.json path>",
    "exploration_model": "<absolute exploration.rs path>",
    "effect_schema": "<absolute exploration effect editor schema path>"
  }
}
```

Names exist for display and design context. UUIDs identify cards and Dreamsigns.

## Design procedure

1. Inspect the full-size art before writing prose or mechanics. Identify subjects,
   motion, setting, light, implied sequence, and salient objects.
2. Read the card's rules and type information to understand the deck intent the
   encounter should support.
3. Read all mechanic ideas. Consider both current `reuse` ideas and
   `vertical_slice` ideas; implementation cost is a ranking factor, not an automatic
   exclusion.
4. Develop five distinct candidate pairings using ten distinct mechanic IDs. Each
   pairing needs a coherent scene with two causally different actions.
5. Rank the candidates for art fidelity, narrative causality, deck relevance,
   meaningful choice tension, balance, and implementation tractability.
6. Emit only the winner plus four compact rejected summaries.

The two winning mechanic IDs must differ. Treat each mechanic's concept as a design
prompt: write final action-local presentation for the exact chosen values.

## Result contract

```json
{
  "card_id": "<request card UUID>",
  "prose": "<encounter prose>",
  "actions": [
    {
      "action_id": "<first request UUIDv4>",
      "label": "<2-5 words, at most 32 characters>",
      "mechanic_id": 14,
      "presentation": {
        "effect_text": "Draft a Warrior from 4 choices",
        "followup": {
          "title": "{action-label}",
          "subtitle": "Choose one offered card."
        }
      },
      "effect": {
        "variant": "DraftCard",
        "fields": {
          "predicate": "Warrior",
          "count": 1,
          "offer_count": 4
        },
        "runtime_effect_kind": "draft-card"
      },
      "implementation_notes": {
        "state_transition": "<exact state mutation>",
        "offer_or_selection": "<how eligible choices are produced and chosen>",
        "persisted_result": "<identifiers and values persisted for replay>",
        "outcome": "<what the outcome surface presents>"
      }
    },
    {
      "action_id": "<second request UUIDv4>",
      "label": "<2-5 words, at most 32 characters>",
      "mechanic_id": 64,
      "presentation": {
        "effect_text": "All characters in your deck gain +1✦",
        "followup": null
      },
      "effect": {
        "variant": "IncreaseSparkAll",
        "fields": {"spark_bonus": 1},
        "runtime_effect_kind": "increase-spark-all"
      },
      "implementation_notes": {
        "state_transition": "<exact state mutation>",
        "offer_or_selection": "<none or exact selection rule>",
        "persisted_result": "<exact persisted result>",
        "outcome": "<exact outcome presentation>"
      }
    }
  ],
  "selection_rationale": "<at most 40 words>",
  "alternatives_considered": [
    {"summary": "<at most 12 words>", "rejected_because": "<at most 20 words>"},
    {"summary": "<at most 12 words>", "rejected_because": "<at most 20 words>"},
    {"summary": "<at most 12 words>", "rejected_because": "<at most 20 words>"},
    {"summary": "<at most 12 words>", "rejected_because": "<at most 20 words>"}
  ]
}
```

`presentation.followup` must be either `null` or an object with non-empty `title`
and `subtitle`. Use it when the action opens a second-step chooser.

## Typed effect rules

For a mechanic whose implementation status is `reuse`:

- `effect.variant` must equal its catalog `effect_variant`;
- `effect.runtime_effect_kind` must equal its catalog `runtime_effect_kind`; and
- `effect.fields` must contain every field and only the fields declared by that
  current Rust `ActionEffect` variant. Represent optional fields explicitly as
  `null`.

Use Rust enum spellings in source fields, including `Warrior`, `SpiritAnimal`,
`CheapCharacter`, `Character`, `Survivor`, `Event`, `Chosen`, and `Offered`.
Card and Dreamsign fields contain canonical UUIDs. Transfiguration fields contain
an ID from generated `transfiguration.toml`.

For a `vertical_slice` mechanic, propose a PascalCase typed variant, snake_case
source fields, and a kebab-case runtime kind. Implementation notes must pin down the
new semantic contract strongly enough to implement preparation, persistence,
execution, replay, presentation, logging, and tests. If a nonstandard predicate is
part of the proposal, add `predicate_exception_rationale` to that action.

## Prose rules

Encounter prose:

- contains at most 16 words;
- describes only visible or strongly implied scene content;
- omits player, reader, viewer, first-person, and second-person references;
- omits the word `the`; and
- does not begin with `One`.

Action labels describe in-world choices, not implementation operations. Effect text
is precise player-facing disclosure for the selected values and may use established
runtime tokens such as `{fixed_card}`, `{offered_card}`, or `{action-label}`.

Write the completed JSON directly to the assigned result path. Do not emit prose
outside the JSON document.
