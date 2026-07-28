# URL Parameters

The quest runtime reads query-string parameters from `window.location.search`
once at page load via `parseRuntimeConfig` in `src/runtime/runtime-config.ts`.
Quest runtime parameters are not reactive: changing them requires a page reload.

These parameters configure _how a run boots and behaves_ and ride in the query
string. The address-bar **path** is a separate concern: it reflects _where the
player is_ (e.g. `/dreamscape/2-ember-wood/purge`, `/atlas`). See
`url_structure.md` for the path grammar; the two compose (a path always carries
the run's query string).

## Standalone tutorial paths

`/main`, `/loading`, and `/tutorial` run inside the Firebase co-op room carried
by `?game=<roomId>`. Opening any of these paths without `game` automatically
creates a room and adds its id to the URL, so another player can join by opening
the resulting address.

The room event log owns the shared front-door phase. `New Journey` appends a
menu action that starts the main-menu exit animation; animation completion
appends the transition to `/loading`; after five seconds the loading scene
appends the transition to `/tutorial`. Every connected client reflects the same
folded phase into its own pathname while preserving the room query string and
hash. `/loading` and `/tutorial` can also create rooms directly, with their
initial scene stamped into room genesis.

## `tutorialSpeed`

Sets the local playback-speed multiplier for the standalone front-door and
tutorial sequence. It accepts a positive finite decimal. A value of `4` makes
the main-menu handoff, loading gate, authored waits, animations, transitions,
and tutorial presentation effects run at four times normal speed. Values below
`1` slow the sequence down. An absent or invalid value uses normal speed (`1`).

The multiplier is presentation-only and is read once at page load. Tutorial
progress remains shared through the room event log, so the first connected
client to finish a timed action advances that action for the room.

```
http://localhost:5173/main?tutorialSpeed=4
http://localhost:5173/tutorial?tutorialSpeed=0.5
```

## `seed`

Overrides the battle RNG seed. The value must be a non-negative integer literal
(digits only). Examples of accepted values: `0`, `42`, `12345`.

Rejected (treated as no override):

- Missing or empty (`seed=`)
- Non-integer (`seed=foo`, `seed=1.5`, `seed=1e3`)
- Negative (`seed=-5`)

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
shared multiplayer room (when two or more clients are connected). `goto=battle`
opens the first opposing-Dream Avatar preview; pair it with `ai=0` for a manual
battle (`?goto=battle&ai=0`).

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
pool context).

Each strategy is a `PoolStrategy` registered in `src/draft/pool/registry.ts`,
the single source of truth for the accepted ids. The registry currently
provides:

- `algo=color_pool` — color-identity generator.
- `algo=diverse` — spreads cards and archetypes more evenly across pools.
- `algo=decklists` — grows the pool out of real human-built decklists.
- `algo=merged` — draws from pre-merged per-archetype lists.
- `algo=idf` — grows a pool from one random decklist by IDF-cosine similarity.
- `algo=idf2` — `idf` with a diversity-biased starter draw.
- `algo=idf3` — `idf2` steered toward a Dream Avatar by its signature cards
  (the default).
- `algo=seed` — draws one card uniformly at random and grows a 150-card pool
  around it by IDF-weighted co-occurrence affinity, both to the seed card and to
  the cards already chosen (the same co-occurrence signal the deck-fit draft model
  reads). Copies cap at 2; the most central cards earn the second copy.
- `algo=tides` — combines the 32 preconstructed tide decks
  (`data/tides.jsonc`, rendered as `docs/cards2/tide_decklists.md`): one of the
  Dream Avatar's baked favored tides is shuffled together with tides drawn at
  random until a full pool is dealable, then 200 cards are dealt with at most
  2 copies of any card. The human-legible counterpart of `idf3`; requires the
  baked artifact (`npm run bake-tides`).
- `algo=tides2` — an affinity-selected counterpart to `tides`, built for direct
  comparison. It draws a lead tide from the Dream Avatar's curated tide pool, then
  shuffles in the lead's allied tides until a full pool is dealable, dealing 200
  cards with at most 2 copies of any card. Tides are smaller and purer than
  `tides`, and which tides ally and which a Dream Avatar draws from are curated in
  `data/tides2_relationships.jsonc` (decks in `data/tides2.jsonc`, both rendered
  as `docs/cards2/tides2_decklists.md`). Requires the baked decks
  (`npm run bake-tides2`) and the seeded relationships
  (`npm run seed-tide-relationships`).
- `algo=tides3` — the human-legible counterpart of `sigseed`. Combines the 32
  preconstructed tides in `data/tides3.jsonc` (rendered as
  `docs/cards2/tides3_decklists.md`): a signatured Dream Avatar's own signature
  tide leads, shuffled together with broad tides until a 150-card pool can be
  dealt (at most 2 copies of any card). Each signature tide is a Dream Avatar's
  full-signature `sigseed` pool baked as a deck, so a pool delivers the
  Dream Avatar's identity the way `sigseed` does. Requires the baked artifact
  (`npm run bake-tides3`); see `docs/cards2/tides3_algorithm.md`.
- `algo=tides4` — the human-legible counterpart of `sigseed`'s run-to-run
  _variety_. Combines the preconstructed tides in `data/tides4.jsonc` (rendered as
  `docs/cards2/tides4_decklists.md`): the Dream Avatar's signature tide is always
  joined as a dense on-theme core, a random subset of its small _facet_ tides
  (each a single-anchor `sigseed` pool) is mixed in to lean the pool a different
  way each run, and broad tides top it up to a 150-card pool (at most 2 copies of
  any card). Drawing a random facet subset reproduces the variety `sigseed` gets
  from a random signature subset, so a Dream Avatar yields a cloud of distinct,
  on-identity pools rather than one fixed pool. Requires the baked artifact
  (`npm run bake-tides4`); see section 5 of `docs/cards2/tides_algorithms.md`.
- `algo=tides5` — the exact `tides4` algorithm (same signature / facet / neutral
  tides, same runtime combine), grown from a curated corpus: only the known-good
  decklists in `docs/known_good_decklists.json` feed the pick-affinity statistics,
  and every other draft seat is discarded. Combines the preconstructed tides in
  `data/tides5.jsonc` (rendered as `docs/cards2/tides5_decklists.md`). Requires the
  baked artifact (`npm run bake-tides5`); see section 5.6 of
  `docs/cards2/tides_algorithms.md`.

Most of these are described in `docs/cards2/draft_pool_algorithms.md`. Any value
not registered (including empty or absent) falls back to `DEFAULT_POOL_VARIANT`,
currently `idf3`. `idf3` consumes the Dream Avatar's signature cards; `seed`
ignores it and draws its own random seed card. Both `idf3` and `seed` produce the
"Why Cards" provenance surface — `idf3` describing the signature → starter →
growth chain, `seed` describing the random seed card and its affinity growth. The
other strategies ignore the signature and produce no provenance, and a pool with
no anchor/seed yields no anchor deck, so the enemy battle deck falls back to a
sampled draftable deck.

The parameter is read once at page load and is not reactive; changing it requires
a reload.

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
(`idf3`) and supplies the resolved Dream Avatar package: signatures, Dreamsign
pool, starter decklist, and the transient shop pool used by the deck-fit modes.
The `algo` selection governs draft pack construction.

## `packsize`

Sets the number of cards in each freshly generated pack for `algo=fresh20`. It
must be a positive integer; an absent or invalid value uses the fresh20 default
of 20. It has no effect in any other draft mode.

Examples:

```
http://localhost:5173/                          # quest prototype, default idf3 pool
http://localhost:5173/?algo=color_pool          # quest prototype, color-identity pool
http://localhost:5173/?algo=seed                # single random-card affinity-grown pool
http://localhost:5173/?algo=replay              # record-replay deck-fit draft
http://localhost:5173/?algo=fresh20             # fresh-pack deck-fit draft (20-card packs)
http://localhost:5173/?algo=fresh20&packsize=30 # fresh-pack draft with 30-card packs
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

## `viewLogs`

Renders the read-only quest-log viewer for a room instead of joining a game,
parsed into `runtimeConfig.viewLogs`. The value is a room id, normalized exactly
like `?game=` (lowercase, 4 to 24 letters or digits); an invalid value is
treated as absent and the app boots normally.

While a game is played, every `logEvent` entry for that room is mirrored into
Realtime Database at `rooms/<roomId>/logs` (newest `ROOM_LOG_LIMIT` entries
retained), so a run's log survives the playing tab closing. `?viewLogs=<roomId>`
reads that node back, shows the entries as JSONL with a substring filter and a
download button, and works against whichever database `?realtime` selects
(cloud by default on a deployed build, the emulator in local dev). It pairs
naturally with the `gameId` that already stamps every entry: open the same id
the player used.

```
https://redacted-firebase-project.web.app/?viewLogs=r3f7vk   # view a production run's log
http://localhost:5173/?viewLogs=quest42                  # view a local run's log
```

## `goto`

Jumps a fresh room straight onto a developer QA scene on boot, parsed into
`runtimeConfig.gotoScene`. The value is trimmed; empty or absent is treated as no
scene. When set with no `?game=` room id, the app auto-creates a room and parks
it on the scene, skipping the manual "Create Game" gate.

The registered scene ids and full mechanics are documented in
`docs/quest_prototype/qa_scenes.md`; the source of truth is `QA_SCENES` in
`src/runtime/qa-scenes.ts`.

`goto=tutorial-battle` opens the standalone tutorial directly at the automated
battle handoff. The fresh battle starts on the player's turn with three cards
in the player's hand and two cards in the opponent's hand.

`goto=tutorial-victory` opens the tutorial battle victory payoff directly. Its
New Journey action enters the fixed tutorial Dream Avatar selection in the same
room.

```
http://localhost:5173/?goto=atlas
http://localhost:5173/?goto=tutorial-dream-avatar-select
http://localhost:5173/?goto=duplication-enhanced
http://localhost:5173/?goto=tutorial-battle
http://localhost:5173/?goto=tutorial-victory
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
- `sort=number`, `sort=name`, `sort=cost`, `sort=type`, `sort=subtype`,
  `sort=spark`, or `sort=namesubstring` selects the sort field. The
  `namesubstring` view groups card names by maximal case-insensitive substrings
  with 5 or more non-space characters shared by at least two cards. Group labels
  omit surrounding whitespace, and a card appears in every matching group it
  participates in. The default `name` sort is omitted.
- `dir=asc` or `dir=desc` selects the sort direction. The default `asc`
  direction is omitted.
- `size=small`, `size=medium`, or `size=large` selects the card preview size.
  The default `medium` size is omitted.

Example:

```
http://localhost:5173/editor?q=moon&type=event&sort=name&dir=desc&size=large
```

## Dream Avatar Editor

The standalone Dream Avatar editor is available at `/dream-avatars`.
`/avatars` and `/dreamavatars` are aliases that preserve the query string and
hash while opening the canonical editor URL.

## Image Viewer

The standalone `/images` route browses candidate card art. Favorite and manual
used marks are keyed by Shutterstock image number in the tracked
`data/image-viewer-state.json` file. The toolbar's Favorites link opens
`/images/favorites`, which shows every favorite including images marked as used.

## Info Card Glossary

The standalone `/glossary` route edits the reusable explanatory Info Cards
shown for rules terms, resources, tides, sites, and other shared game concepts.
It provides a searchable catalog and an interactive Info Card whose rendered
title and description edit in place. Saved copy and rules-text variants write
to `data/tabula/glossary.toml` through the local Vite development server.

## Examples

```
http://localhost:5173/                          # default
http://localhost:5173/?seed=42                  # fixed seed
http://localhost:5173/?game=quest42             # parsed multiplayer room id
http://localhost:5173/?viewLogs=quest42         # read-only quest-log viewer for a room
http://localhost:5173/?goto=atlas               # jump straight to a QA scene
http://localhost:5173/?realtime=1               # use cloud Firebase RTDB
http://localhost:5173/?identicons=1             # force identicon art for cards
http://localhost:5173/tutorial?tutorialSpeed=4  # play the tutorial at 4× speed
http://localhost:5173/editor?identicons=1       # same, in the card editor
http://localhost:5173/?goto=battle&seed=7
http://localhost:5173/?goto=battle              # Layer I battle preview vs the local AI opponent
http://localhost:5173/?goto=battle5             # Layer V battle preview with a stronger opponent
http://localhost:5173/?goto=tutorial-battle     # automated battle after the scripted tutorial
http://localhost:5173/?goto=tutorial-victory    # tutorial victory payoff
http://localhost:5173/?goto=battle&ai=0         # manual battle, no AI opponent
http://localhost:5173/editor?q=moon&type=event
http://localhost:5173/glossary                    # edit explanatory Info Card copy
```
