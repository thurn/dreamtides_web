# URL Parameters

The quest prototype reads query-string parameters from `window.location.search`
once at page load via `parseRuntimeConfig` in `src/runtime/runtime-config.ts`.
Parameters are not reactive: changing them requires a page reload.

## `seed`

Overrides the battle RNG seed. The value must be a non-negative integer literal
(digits only). Examples of accepted values: `0`, `42`, `12345`.

Rejected (treated as no override):

- Missing or empty (`seed=`)
- Non-integer (`seed=foo`, `seed=1.5`, `seed=1e3`)
- Negative (`seed=-5`)

## `startInBattle`

When set to exactly `1`, the prototype boots directly into a battle instead of
the normal Dreamcaller selection flow. Any other value (including `0`, `true`,
empty, or absent) leaves the normal start flow in place.

## Dream Journey Debug Harness

In local development, Dream Journey QA can force selected generation inputs:

- `debugJourneyShape=<shape_id>` pins generation to a registered Journey shape.
- `debugJourneyReward=<reward_id>` searches deterministic generation attempts
  until the manifest includes that reward template.
- `debugJourneyCost=<cost_id>` searches deterministic generation attempts until
  the manifest includes that cost template.

Invalid ids and unviable combinations render a visible QA failure state and log
the failed debug request to the browser console. These parameters are read at
page load with the rest of the runtime config.

Examples:

```
http://localhost:5173/?debugJourneyShape=single_offer
http://localhost:5173/?debugJourneyReward=gain_essence
http://localhost:5173/?debugJourneyCost=pay_essence
http://localhost:5173/?debugJourneyShape=single_offer&debugJourneyReward=gain_omens&debugJourneyCost=gain_named_banes
```

## `game`

Parses a Firebase multiplayer room id into `runtimeConfig.gameId`. The value is
normalized to lowercase and must be 4 to 24 lowercase letters or digits after
normalization. Invalid values are treated as an absent room id.

The parsed room id is stored on `runtimeConfig.gameId`.

Example:

```
http://localhost:5173/?game=quest42
```

## Examples

```
http://localhost:5173/                          # default
http://localhost:5173/?seed=42                  # fixed seed
http://localhost:5173/?startInBattle=1          # boot straight into battle
http://localhost:5173/?game=quest42             # parsed multiplayer room id
http://localhost:5173/?debugJourneyShape=single_offer
http://localhost:5173/?debugJourneyReward=gain_essence
http://localhost:5173/?debugJourneyCost=pay_essence
http://localhost:5173/?seed=7&startInBattle=1
```
