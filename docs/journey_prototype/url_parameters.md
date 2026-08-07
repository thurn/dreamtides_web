# URL Parameters

The journey runtime reads query-string parameters from `window.location.search`
once at page load via `parseRuntimeConfig` in `src/runtime/runtime-config.ts`.
Journey runtime parameters are not reactive: changing them requires a page reload.

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

One room runtime owns the full shared experience. `New Journey` appends a
menu action that starts the main-menu exit animation; animation completion
appends the transition to `/loading`; after five seconds the loading scene
reveals **Begin**, which appends the transition to `/tutorial` when pressed.
Every connected client reflects the same
folded phase and journey screen into its own pathname while preserving the room
query string and hash. The initial pathname is used only while creating a room;
joining an existing `?game=` follows that room's folded phase. `/loading` and
`/tutorial` can create rooms directly, with their initial scene stamped into
room genesis.

These rooms are single-controller hosted playtests. The first valid manual
tutorial gameplay action, including a first live-battle input, claims control
for that browser's room-scoped session identity. Other clients watch the same
scripted tutorial, live battle, victory, and fixed Dream Avatar selection
read-only. A disconnected controller leaves those phases paused until a viewer
explicitly chooses **Take Control**.

Selecting the fixed Dream Avatar starts the authored tutorial journey and
changes the room to normal collaborative control in the same event. Both
players can take journey actions and manually control either battle side while
the journey continues to use the guidance and first-occurrence triggers authored
in `data/tutorial.toml`.

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

The playable battle is a fully manual sandbox by default, with both sides driven
by hand. Set `ai=1` to run a local AI opponent on the enemy side. The AI plays a
fixed deck of the ten `Starter` cards and proposes each enemy action
— playing a character, repositioning, casting an event, declaring challengers,
and resolving the Challenge phase — through a proposal bar the human approves,
rejects, or ends with an explicit click. Only the human's approval commits
state. While an un-approved AI action proposal is held, the human's own board
controls are inactive; they return during the AI's end-of-turn proposal and the
human's own turn.

Only the exact value `ai=1` enables the journey battle AI. Any other value
(including `0`, `true`, empty, or absent) keeps the battle manual.

The AI is a local actor that runs on a single client, so it stays off in a
shared multiplayer room (when two or more clients are connected). `goto=battle`
opens the first opposing-Dream Avatar preview; pair it with `ai=1` for an AI
battle (`?goto=battle&ai=1`).

The standalone tutorial battle uses its own event-log-driven automated opponent.
Its automation is independent of this parameter, including when the journey
battle AI is left at the manual default.

## `realtime`

Selects the Firebase Realtime Database target. When set to exactly `1`, the app
uses the cloud Firebase project configured by `VITE_FIREBASE_*` environment
variables. Any other value (including `0`, `true`, empty, or absent) uses the
local Realtime Database emulator at `127.0.0.1:9000` with the
`demo-journey-prototype` project.

Room navigation keeps `realtime=1` in the URL when a cloud room is created.

## `algo`

The journey uses the `tides4` draft-pool algorithm documented in
`docs/cards2/tides_algorithms.md`. An absent `algo` value and `algo=tides4` both
select this pool. The parameter is read once at page load.

Two `algo` values select a deck-fit draft mode while retaining tides4 as the
run's underlying pool context. Both build a deck-fit model from the historical
draft-record corpus and rank candidate cards by how well they fit the deck
drafted so far:

- `algo=replay` — replays a historical draft, showing the deck-fit best slice of
  a real recorded pack at each pick.
- `algo=fresh20` — rolls a brand-new random pack of cards at each pick and shows
  the deck-fit best slice of it. A shown card is held off for at least 10 picks
  before it can be shown again, and is retired for good once it has been shown
  twice. Every pack is drawn only from cards still eligible under those rules.

The `algo` selection governs draft pack construction for these two modes.

## `packsize`

Sets the number of cards in each freshly generated pack for `algo=fresh20`. It
must be a positive integer; an absent or invalid value uses the fresh20 default
of 20. It has no effect in any other draft mode.

Examples:

```
http://localhost:5173/                          # journey prototype, tides4 pool
http://localhost:5173/?algo=tides4              # explicit tides4 pool
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
http://localhost:5173/?game=journey42
```

## `viewLogs`

Renders the read-only journey-log viewer for a room instead of joining a game,
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
http://localhost:5173/?viewLogs=journey42                  # view a local run's log
```

## `goto`

Jumps a fresh room straight onto a developer QA scene on boot, parsed into
`runtimeConfig.gotoScene`. The value is trimmed; empty or absent is treated as no
scene. When set with no `?game=` room id, the app auto-creates a room and parks
it on the scene, skipping the manual "Create Game" gate.

The registered scene ids and full mechanics are documented in
`docs/journey_prototype/qa_scenes.md`; the source of truth is `QA_SCENES` in
`src/runtime/qa-scenes.ts`.

`goto=tutorial-battle` opens the standalone tutorial directly at the automated
battle handoff. The fresh battle starts on the player's turn with three cards
in the player's hand and two cards in the opponent's hand.

`goto=tutorial-victory` opens the tutorial battle victory payoff directly. Its
New Journey action enters the fixed tutorial Dream Avatar selection in the same
room. That selection presents the three authored Valor tides from
`data/tutorial_journey_pool.toml`; choosing the avatar starts a journey with
their 150-card pool and collaborative room control.

For the Exploration QA scenes, `card=<UUID>` selects the authored encounter for
that exact source-card UUID. It works with `goto=exploration`,
`goto=exploration-enhanced`, and `goto=exploration-duplicates`. The duplicate
deck scene includes two duplicated card UUIDs so effects that remove every copy
of duplicated cards have a deterministic browser-QA fixture.

```
http://localhost:5173/?goto=atlas
http://localhost:5173/?goto=augury
http://localhost:5173/?goto=tutorial-dream-avatar-select
http://localhost:5173/?goto=duplication-enhanced
http://localhost:5173/?goto=tutorial-battle
http://localhost:5173/?goto=tutorial-victory
http://localhost:5173/?goto=exploration&card=161482b6-af07-4d9e-822d-8c738672beb9
http://localhost:5173/?goto=exploration-duplicates&card=b1d36337-5668-4f1d-b155-2d07fc00f872
```

## `gambleGame`

Chooses the game prepared when a Gamble site opens. Omit it to choose randomly
among Three-Gate Wager, Ladder Climb, Starway Stairs, Four-Suit Reprise, and
Blackjack. The supported values are `three-gate`, `ladder-climb`,
`starway-stairs`, `four-suit-reprise`, and `blackjack`; other values use the
random selection.

```
http://localhost:5173/?goto=gamble&gambleGame=three-gate
http://localhost:5173/?goto=gamble&gambleGame=ladder-climb
http://localhost:5173/?goto=gamble&gambleGame=starway-stairs
http://localhost:5173/?goto=gamble&gambleGame=four-suit-reprise
http://localhost:5173/?goto=gamble&gambleGame=blackjack
```

## `identicons`

When set to exactly `1`, every card renders its generated identicon art in
place of its assigned image. Any other value (including `0`, `true`, empty, or
absent) shows normal card art, with identicons used only as the fallback for
cards that have no assigned image.

The parameter applies wherever cards render, so it works on both the journey
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
to `data/glossary.toml` through the local Vite development server.

## Examples

```
http://localhost:5173/                          # default
http://localhost:5173/?seed=42                  # fixed seed
http://localhost:5173/?game=journey42             # parsed multiplayer room id
http://localhost:5173/?viewLogs=journey42         # read-only journey-log viewer for a room
http://localhost:5173/?goto=atlas               # jump straight to a QA scene
http://localhost:5173/?goto=augury              # jump straight to the Augury site
http://localhost:5173/?goto=gamble&gambleGame=ladder-climb
http://localhost:5173/?goto=gamble&gambleGame=starway-stairs
http://localhost:5173/?goto=gamble&gambleGame=four-suit-reprise
http://localhost:5173/?realtime=1               # use cloud Firebase RTDB
http://localhost:5173/?identicons=1             # force identicon art for cards
http://localhost:5173/tutorial?tutorialSpeed=4  # play the tutorial at 4× speed
http://localhost:5173/editor?identicons=1       # same, in the card editor
http://localhost:5173/?goto=battle&seed=7
http://localhost:5173/?goto=battle              # Layer I manual battle preview
http://localhost:5173/?goto=battle5             # Layer V battle preview with a stronger opponent
http://localhost:5173/?goto=tutorial-battle     # automated battle after the scripted tutorial
http://localhost:5173/?goto=tutorial-victory    # tutorial victory payoff
http://localhost:5173/?goto=battle&ai=0         # manual battle, no AI opponent
http://localhost:5173/?goto=battle&ai=1         # battle with the local AI opponent
http://localhost:5173/editor?q=moon&type=event
http://localhost:5173/glossary                    # edit explanatory Info Card copy
```
