# Tutorial Data

`data/tabula/tutorial.toml` is the authoritative source for the standalone
tutorial scenario, the playable battle handoff, tutorial-journey guidance, and
supplemental first-occurrence explanations. Run `npm run regenerate-assets`
after editing it. Asset generation validates the source and writes the complete
normalized browser artifact to `public/tutorial-data.json`.

## Scenario identity

`battle.featuredCards` assigns stable semantic roles to the cards reused by the
tutorial:

- `playerCardId`: the scripted player character
- `opponentCardId`: the scripted opponent character
- `enemyStarterCardId`: the enemy character shown during loading and placed at
  the live handoff
- `loadingEventCardId`: the event shown during loading
- `dreamwellCardId`: the featured Dreamwell card

Every field is a catalog UUID. Ordinary card roles resolve against
`cards.toml`; `dreamwellCardId` resolves against `dreamwell.toml`.
`playerDreamAvatarId` and `enemyDreamAvatarId` resolve against
`dream_avatars.toml`.

## Battle setup

The `battle` table contains `startingEnergy`, `scoreToWin`, and
`starterDeck`. Each inline `starterDeck` entry has a `cardId` and a positive
`copies` count. The displayed and initialized deck size is the sum of those
counts.

`battle.scriptedBoard` selects the compact player back-rank and front-rank
indices used by the scripted presentation. Back-rank indices range from 0 to 2;
front-rank indices range from 0 to 1.

`playerDraws`, `enemyDraws`, and `dreamwellDraws` define deterministic draw
prefixes. `aiActionOverrides` defines state-matched semantic AI actions. The
validator checks that the starter recipe contains enough copies for scripted
hands, configured draws, deck-backed placements, and the three-card Erode
state.

## Playable handoff

`battle.handoff` describes the shared rules-engine state created after the
scripted sequence:

- `activeSide`, `turnNumber`, `phase`, and `dreamwellDeckIndex` set global
  battle state.
- `battle.handoff.player` and `battle.handoff.enemy` set current and maximum
  energy, score, Dreamwell card index, and the turn of the latest Dreamwell
  draw.
- `battle.handoff.placements` materializes featured card roles into a side and
  zone. A placement sourced from `deck` consumes a matching starter-deck copy;
  a placement sourced from `created` creates an instance with tutorial
  provenance.

Rank placements use canonical slot IDs. Front-rank slots are `F0` through
`F8`; the player back rank uses `B0` through `B4`; the enemy back rank uses
`B0` through `B9`. Void placements omit `slotId`.

## Guidance and actions

`actions` is the ordered front-door tutorial sequence. `triggers` contains
shared first-occurrence explanations. The `journeyStart`, `dreamscape`,
`atlas`, `draft`, `purge`, `dreamsignRevelation`, and `battleStart` tables
configure persistent Mira guidance on their journey surfaces.

The development Tutorial Editor edits the `actions` array. Saving serializes
the complete normalized TOML document and preserves every guidance, trigger,
and battle setup table.

## Validation and hashes

Build-time and browser loaders require every scenario field and validate UUID
shape, enums, slot addresses, unique deck entries, positive copy counts, draw
sufficiency, and cross-catalog references. Invalid tutorial data stops asset
generation or runtime loading with a field-specific error.

The generated artifact includes two SHA-256 hashes:

- `contentHash` covers the complete normalized tutorial configuration.
- `foldHash` covers tutorial battle and trigger configuration used by pure
  reducer decisions and registered content providers.

Room genesis pins `tutorialFoldHash`. Connected clients join a room only when
their fold-relevant tutorial content matches the room configuration.
