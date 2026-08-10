# Exploration action-redesign contract

Design exactly one replacement action for one immutable template assignment. Inspect
every candidate's full-size artwork and current encounter. Choose the candidate
where the assigned template creates the strongest narrative action.

## Immutable assignment

Each request contains:

- `assignment_id`;
- one `target_template` from the complete 82-template library;
- one pre-minted `replacement_action_id`;
- two or three `candidates`; and
- repository paths and source hashes.

Each candidate contains its canonical card data, full-size artwork, current
generated encounter, one nominated `replace_action_id`, and that action's
`donor_template_id`.

The target template is an assignment, not a suggestion. Never substitute another
template because it has an existing implementation. A `vertical_slice` assignment
requires a new or extended production implementation.

## Design procedure

1. Read the complete template library and the assigned template's exact text.
2. Inspect all candidate images at full size.
3. Read each encounter's prose and both actions.
4. Imagine the assigned mechanic as a replacement for each nominated action.
5. Rank candidates by visible art grounding, causal action clarity, choice tension
   with the preserved action, deck relevance, and balance.
6. Select one candidate. Preserve its prose and other action exactly.
7. Write a new label, presentation, typed effect, and implementation contract for
   the assigned template.
8. Explain briefly why each other candidate was rejected.

If no candidate produces a strong encounter, return a candidate-set rejection
instead of choosing another template. The controller will provide new candidates
for the same assignment.

## Result contract

```json
{
  "assignment_id": "template-1-assignment-1",
  "selected_card_id": "<candidate card UUID>",
  "replaced_action_id": "<that candidate's nominated action UUID>",
  "replacement_action": {
    "action_id": "<request replacement UUIDv4>",
    "label": "<2-5 words, at most 32 characters>",
    "mechanic_id": 1,
    "presentation": {
      "effect_text": "Gain 100 essence",
      "followup": null
    },
    "effect": {
      "variant": "GainEssence",
      "fields": {"essence": 100},
      "runtime_effect_kind": "gain-essence"
    },
    "implementation_notes": {
      "state_transition": "<exact event-log state mutation>",
      "offer_or_selection": "<none or exact deterministic preparation>",
      "persisted_result": "<exact replay data>",
      "outcome": "<exact outcome presentation>"
    }
  },
  "selection_rationale": "<at most 40 words>",
  "rejected_candidates": [
    {"card_id": "<unselected UUID>", "rejected_because": "<at most 20 words>"},
    {"card_id": "<unselected UUID>", "rejected_because": "<at most 20 words>"}
  ]
}
```

For a two-candidate request, include one rejection. Use canonical UUIDs for every
identity. Card and Dreamsign names are display-only.

## Typed effect rules

For `reuse` assignments:

- use the catalog's exact `effect_variant` and `runtime_effect_kind`;
- provide every source field and no undeclared fields;
- preserve the assigned template's semantics, including quantity, eligibility,
  target choice, persistence, and outcome; and
- use canonical UUIDs for fixed content.

For `vertical_slice` assignments:

- propose a PascalCase typed variant, snake_case source fields, and kebab-case
  runtime kind;
- specify deterministic preparation and all persisted outcome data;
- define the intent event and replayable fold transition;
- define follow-up and outcome presentation; and
- pin down logging and synthetic-test contracts.

Implementation complexity may influence exact balanced values. It may not alter the
assigned mechanic concept.

## Presentation rules

Action labels describe visible in-world choices, not code operations. Effect text
must disclose the complete mechanical result and may use established tokens such as
`{fixed_card}`, `{offered_card}`, `{deck_card}`, or `{nightmare_card}`.

Use a follow-up only when the action opens a chooser or another player decision.
Outcome presentation must reveal persisted results rather than rerolling or
recomputing mutable data.

Write only the completed JSON document to the assigned result path.
