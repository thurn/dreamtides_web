# Dream Guide and Site Data

`data/tabula/dream_guides.ron` and `data/tabula/sites.ron` are the canonical
cross-site authoring catalogs. Full asset setup validates and compiles them to
`public/dream-guides-data.json` and `public/sites-data.json`; the browser loads
both documents before constructing `JourneyContent`.

TypeScript owns structural identities and algorithms: `SiteType`, Gamble game
IDs, the standard card deck, fixed gate and suit identities, routing, reducers,
and screen composition. RON owns guide identity and dialogue, site
presentation, selection tuning, and rule tables that designers and modders are
expected to revise.

## Dream guides

The Dream Guide document uses `schema-version = 1`. Each guide record defines a
unique ID, player-facing name and title, portrait source filename, home
Dreamscape ID, signature `SiteType`, and named dialogue contexts.

Every guide provides nonempty `site` dialogue. The Random Site guide also
provides `random-site` dialogue. The Gamble guide provides one context for each
Gamble game, and its templates include every value slot required by that game.
The loader selects a line once per mounted site screen and projects guide
identity and portrait through the shared guide view model.

Guide home and specialty assignments are canonical for authored Dreamscapes.
The Dreamscape compiler derives `guideId` and `signatureSite` from these
assignments. The starter Dreamscape keeps its fixed guide-independent sites and
authored Draft signature.

## Sites

The Site document uses `schema-version = 1` and contains:

| Section                 | Authored contract                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `site-types`            | Exactly one icon and glossary reference for every `SiteType`.                                |
| `fallback-site-type`    | Neutral presentation for an unknown site identifier.                                         |
| `random-site`           | Eligible destinations, home and away choice counts, and the insufficient-destination policy. |
| `card-choice-limits`    | Standard and enhanced candidate counts for Transfiguration and Duplication.                  |
| `gamble.selection`      | Game weights and a guaranteed supported fallback.                                            |
| `gamble.three-gate`     | Gate order and win/lose results.                                                             |
| `gamble.ladder-climb`   | Attempt count, target range, and ordered reward tiers.                                       |
| `gamble.starway-stairs` | Attempt count, target range, and ordered reward tiers.                                       |
| `gamble.four-suit`      | Draw count, suit order, ranking order, and result table.                                     |

Four-Suit prices and Essence rewards live in `economy.ron`. The other Gamble
prices and rewards continue to use the existing Economy catalog. The Sites
compiler cross-validates its schedule against the compiled Economy data.

Metadata glossary IDs must resolve in `glossary.ron`. Random Site destinations
must be materializable site implementations and fit the configured choice
counts. Gamble tables must cover their code-owned identities and accepted
template values. When the external art catalog is available, guide portrait
source filenames must also resolve.

## Generated artifacts and hashes

`scripts/guide-sites-data.mjs` provides the strict compilers used by full asset
generation, targeted Vite regeneration, and the Dreamscape editor. Runtime
loaders reject malformed or unsupported generated artifacts.

Both compiled catalogs have stable SHA-256 `contentHash` values. Sites also has
a `foldHash` covering guide home and specialty assignments plus every site rule
that can affect generated or reduced state. Icons, glossary mappings, fallback
presentation, guide portraits, and dialogue affect content hashes while staying
outside `foldHash`.

Atlas generation, site opening, Random Site resolution, and Gamble resolution
log the Sites fold hash and the resolved configuration needed to reconstruct a
production decision.

## Development regeneration

The targeted development pipeline applies these dependencies:

- A Dream Guide edit recompiles guides, derives Dreamscapes, recompiles Sites,
  and refreshes guide portrait links.
- A Site edit recompiles Sites.
- A Glossary edit recompiles its artifact and revalidates Site references.
- An Economy edit recompiles Economy and cross-validates Sites.

The Dreamscape editor patches affected guide assignments and returns recomputed
guide, Dreamscape, and Site catalogs in one atomic transaction. Selecting a
guide swaps the two guides' home assignments. Selecting a signature site swaps
the two guides' specialties and the specialty-specific dialogue contexts.

## Co-op compatibility

Room genesis pins `sitesFoldHash` alongside the Atlas, Economy, Exploration,
Reward Selection, Augury, Draft, and opponent-rule configuration. A joining
client compares that value before folding gameplay. A room genesis that lacks
the Sites hash remains readable and opens the content-configuration gate, where
the client can start a room using the current catalog.

Presentation-only guide and site edits retain room compatibility. Guide
assignment or site-rule edits produce a distinct Sites fold hash and therefore
start a compatible new room.
