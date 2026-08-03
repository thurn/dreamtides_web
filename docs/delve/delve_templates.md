# Delve Event Effects

At a Delve site, the game selects one card from the player's deck as the
narrative focus. The player enters a short event inspired by that card and
chooses between two actions. Each action uses one mechanical effect template.

The exploration encounter designer studies the selected card and its artwork,
then chooses ten distinct effect templates and arranges them into five pairs.
Every pair has a stable ID and exactly two actions. The designer preserves each
pair, action, ID, and template string in the output while adding narrative
labels and resolving the template's variables.

The canonical effect catalog is
[`../../data/templates.json`](../../data/templates.json).
Each catalog entry has this shape:

```json
{
  "template_id": 6,
  "template": "Purge up to {count} chosen {predicate} cards"
}
```

The complete request and response shapes are documented in the
[exploration encounter contracts](../../.llms/skills/exploration-encounter-designer/references/contracts.md).
A random canonical card can be generated from the repository root with:

```bash
python3 .llms/skills/exploration-encounter-designer/scripts/generate-exploration-input.py
```

Pass `--seed <integer>` to reproduce the selected card and `--card-type` with
`character`, `event`, or `all` to choose its pool.

## Template Variables

Braced variables such as `{count}`, `{predicate}`, and `{card_id}` are values
chosen by the encounter designer. Every braced variable in a template receives
a value in the action's `variables` object. The completed player-facing text is
stored separately in `effect_text`.

For example, this template:

```text
Purge up to {count} chosen {predicate} cards
```

can be resolved as:

```json
{
  "variables": {
    "count": 4,
    "predicate": "Event"
  },
  "effect_text": "Purge up to 4 chosen Event cards"
}
```

A predicate is an objective rule that selects or classifies cards. Predicates
can describe card type, subtype, cost, spark, ability, legendary status, or
starter status. Predicates must create a meaningful restriction; `Character` is
forbidden because it covers roughly 70% of the card catalog. Use a narrower
subtype, cost, spark, ability, or combined objective condition instead.

Existing cards and dreamsigns use an object containing their canonical UUID and
display name. Game logic consumes the UUID, while `effect_text` uses the display
name:

```json
{
  "card_id": {
    "id": "18ff6a45-148a-40bf-85ae-4a51f32f406a",
    "display_name": "Blazing Emberwing"
  }
}
```

## Runtime Variables

Templates can contain special variables resolved from game state when the event
is created:

- `$OFFERED_CARD` is a random card offered from the card pool.
- `$DECK_CARD` is a random card selected from the player's current deck.
- `$STARTER_CARD` is a random starter card selected from the player's current
  deck.

When a runtime card variable has an eligibility restriction, the action records
it in `selection`:

```json
{
  "selection": {
    "$DECK_CARD": {
      "predicate": "Spirit Animal"
    }
  }
}
```

An unrestricted runtime variable omits `selection`.

## Applying a Template

For each action, the encounter designer:

1. Preserves the catalog's `template_id` and exact `template` string.
2. Adds every required braced value to `variables`.
3. Adds restricted runtime selection rules when the template calls for them.
4. Writes complete display copy in `effect_text`, with every placeholder and
   runtime token resolved.
5. Validates the request and output with
   `.llms/skills/exploration-encounter-designer/scripts/validate-exploration.py`.
