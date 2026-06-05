# URL Parameters

The quest runtime reads query-string parameters from `window.location.search`
once at page load via `parseRuntimeConfig` in `src/runtime/runtime-config.ts`.
Quest runtime parameters are not reactive: changing them requires a page reload.

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

## `ai`

When set to exactly `1`, the playable battle runs a local AI opponent on the
enemy side. The AI plays a fixed deck of the ten `Starter` cards and proposes
each enemy action — playing a character, repositioning, casting an event,
declaring challengers, and resolving the Challenge phase — through a proposal
bar the human approves, rejects, or ends with an explicit click. Only the
human's approval commits state. While an un-approved AI action proposal is held,
the human's own board controls are inactive; they return during the AI's
end-of-turn proposal and the human's own turn. Any other value (including `0`,
`true`, empty, or absent) leaves the battle as a manual sandbox with no AI actor.

The AI is a local actor that runs on a single client, so it stays off in a
shared multiplayer room (when two or more clients are connected). It pairs with
`startInBattle=1` for a direct entry point (`?startInBattle=1&ai=1`).

## `realtime`

Selects the Firebase Realtime Database target. When set to exactly `1`, the app
uses the cloud Firebase project configured by `VITE_FIREBASE_*` environment
variables. Any other value (including `0`, `true`, empty, or absent) uses the
local Realtime Database emulator at `127.0.0.1:9000` with the
`demo-quest-prototype` project.

Room navigation keeps `realtime=1` in the URL when a cloud room is created.

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

## `identicons`

When set to exactly `1`, every card renders its generated identicon art in
place of its assigned image. Any other value (including `0`, `true`, empty, or
absent) shows normal card art, with identicons used only as the fallback for
cards that have no assigned image.

The parameter applies wherever cards render, so it works on both the quest
prototype and the standalone `/editor` route. It is read once at page load and
is not reactive; changing it requires a reload.

## Card Editor

The standalone `/editor` route manages display state through query parameters.
Invalid values fall back to the default editor display state. The editor updates
these parameters with `history.replaceState`, so display changes keep the
current history entry.

- `q=<text>` stores card search text. Empty search text is omitted.
- `type=character` or `type=event` filters by card type. The default `all`
  type filter is omitted.
- `cost=0`, `cost=1`, `cost=2`, `cost=3`, or `cost=4` filters by exact
  numeric energy cost. `cost=5plus` filters by costs of 5 or more, and
  `cost=x` selects variable cost cards. The default `all` cost filter is
  omitted.
- `subtype=<text>` filters by subtype. Empty subtype filtering is omitted.
- `sort=number`, `sort=name`, `sort=cost`, `sort=type`, `sort=subtype`, or
  `sort=spark` selects the sort field. The default `number` sort is omitted.
- `dir=asc` or `dir=desc` selects the sort direction. The default `asc`
  direction is omitted.
- `size=small`, `size=medium`, or `size=large` selects the card preview size.
  The default `medium` size is omitted.

Example:

```
http://localhost:5173/editor?q=moon&type=event&sort=name&dir=desc&size=large
```

## Draft Test

The standalone `/draft_test` route exercises the experimental `cards_v2` draft
pool. Start the dev server with `npm run dev:vite` (or `npm run draft_test`,
which opens the route directly) and visit it on port 5173. It reads one query
parameter at page load (not reactive; changing it requires a reload).

- `algo=default`, `algo=diverse`, or `algo=decklists` selects the
  pool-construction algorithm. `default` is the color-identity generator;
  `diverse` spreads cards and archetypes more evenly across pools; `decklists`
  grows the pool out of real human-built decklists. All three are described in
  `docs/cards2/draft_pool_algorithms.md`. Any other value (including empty or
  absent) falls back to the build default, which is `default`.

The chosen algorithm applies to the pool built from your Dreamcaller selection,
and the active variant is shown as a chip in the draft header; clicking the chip
reloads with the other algorithm so the two can be compared side by side.

Examples:

```
http://localhost:5173/draft_test                # default pool algorithm
http://localhost:5173/draft_test?algo=diverse   # diverse (flattened) algorithm
http://localhost:5173/draft_test?algo=default   # original algorithm (explicit)
```

## Examples

```
http://localhost:5173/                          # default
http://localhost:5173/?seed=42                  # fixed seed
http://localhost:5173/?startInBattle=1          # boot straight into battle
http://localhost:5173/?game=quest42             # parsed multiplayer room id
http://localhost:5173/?realtime=1               # use cloud Firebase RTDB
http://localhost:5173/?identicons=1             # force identicon art for cards
http://localhost:5173/editor?identicons=1       # same, in the card editor
http://localhost:5173/?debugJourneyShape=single_offer
http://localhost:5173/?debugJourneyReward=gain_essence
http://localhost:5173/?debugJourneyCost=pay_essence
http://localhost:5173/?seed=7&startInBattle=1
http://localhost:5173/?startInBattle=1&ai=1     # battle vs the local AI opponent
http://localhost:5173/editor?q=moon&type=event
http://localhost:5173/draft_test?algo=diverse   # diverse draft-pool algorithm
```
