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

The playable battle runs a local AI opponent on the enemy side by default. The
AI plays a fixed deck of the ten `Starter` cards and proposes each enemy action
— playing a character, repositioning, casting an event, declaring challengers,
and resolving the Challenge phase — through a proposal bar the human approves,
rejects, or ends with an explicit click. Only the human's approval commits
state. While an un-approved AI action proposal is held, the human's own board
controls are inactive; they return during the AI's end-of-turn proposal and the
human's own turn.

Set `ai=0` to switch the battle into a fully manual sandbox with no AI actor:
both sides are driven by hand. Any other value (including `1`, `true`, empty, or
absent) keeps the AI opponent on.

The AI is a local actor that runs on a single client, so it stays off in a
shared multiplayer room (when two or more clients are connected). The battle is
the default, so `startInBattle=1` enters straight into an AI battle; pair it
with `ai=0` for a manual battle (`?startInBattle=1&ai=0`).

## `realtime`

Selects the Firebase Realtime Database target. When set to exactly `1`, the app
uses the cloud Firebase project configured by `VITE_FIREBASE_*` environment
variables. Any other value (including `0`, `true`, empty, or absent) uses the
local Realtime Database emulator at `127.0.0.1:9000` with the
`demo-quest-prototype` project.

Room navigation keeps `realtime=1` in the URL when a cloud room is created.

## `algo`

Selects the draft-pool construction strategy. It drives the quest prototype's
draft and enemy pools (parsed by `parseRuntimeConfig`, threaded through the run's
pool context) and the standalone `/draft_test` harness (parsed by
`DraftTestApp`).

Each strategy is a `PoolStrategy` registered in `src/draft/pool/registry.ts`,
the single source of truth for the accepted ids. The registry currently
provides:

- `algo=color_pool` — color-identity generator.
- `algo=diverse` — spreads cards and archetypes more evenly across pools.
- `algo=decklists` — grows the pool out of real human-built decklists.
- `algo=merged` — draws from pre-merged per-archetype lists.
- `algo=idf` — grows a pool from one random decklist by IDF-cosine similarity.
- `algo=idf2` — `idf` with a diversity-biased starter draw.
- `algo=idf3` — `idf2` steered toward a Dreamcaller by its signature cards
  (the default).

All of these are described in `docs/cards2/draft_pool_algorithms.md`. Any value
not registered (including empty or absent) falls back to `DEFAULT_POOL_VARIANT`,
currently `idf3`. Only `idf3` consumes the Dreamcaller's signature cards and
produces the "Why Cards" provenance surface; the other strategies ignore the
signature, and a non-`idf3` pool yields no anchor deck, so the enemy battle deck
falls back to a sampled draftable deck.

The parameter is read once at page load and is not reactive; changing it requires
a reload. On `/draft_test` the active strategy is also shown as a chip in the
draft header, and clicking the chip reloads with the next registered strategy
(in registry order) so they can be compared side by side. That route exercises
the experimental `cards_v2` pool directly: start the dev server with
`npm run dev:vite` (or `npm run draft_test`) and visit it on port 5173.

Two values of `algo` select a deck-fit draft mode instead of a pool strategy.
Both build a deck-fit model from the historical draft-record corpus and, at each
pick, rank candidate cards by how well they fit the deck drafted so far:

- `algo=replay` — replays a historical draft, showing the deck-fit best slice of
  a real recorded pack at each pick.
- `algo=fresh20` — rolls a brand-new random pack of cards at each pick and shows
  the deck-fit best slice of it. A shown card is held off for at least 10 picks
  before it can be shown again, and is retired for good once it has been shown
  twice. Every pack is drawn only from cards still eligible under those rules.

When `algo` is `replay` or `fresh20`, `poolVariant` still resolves to the default
(`idf3`); the pool variant no longer drives the draft but is retained for the
resolved Dreamcaller package (signatures, dreamsign pool, starter decklist, and
the transient shop pool the deck-fit modes draw from).

## `packsize`

Sets the number of cards in each freshly generated pack for `algo=fresh20`. It
must be a positive integer; an absent or invalid value uses the fresh20 default
of 20. It has no effect in any other draft mode.

Examples:

```
http://localhost:5173/                          # quest prototype, default idf3 pool
http://localhost:5173/?algo=color_pool          # quest prototype, color-identity pool
http://localhost:5173/?algo=replay              # record-replay deck-fit draft
http://localhost:5173/?algo=fresh20             # fresh-pack deck-fit draft (20-card packs)
http://localhost:5173/?algo=fresh20&packsize=30 # fresh-pack draft with 30-card packs
http://localhost:5173/draft_test?algo=diverse   # draft harness, diverse algorithm
```

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
http://localhost:5173/?startInBattle=1          # battle vs the local AI opponent (default)
http://localhost:5173/?startInBattle=1&ai=0     # manual battle, no AI opponent
http://localhost:5173/editor?q=moon&type=event
http://localhost:5173/draft_test?algo=diverse   # diverse draft-pool algorithm
```
