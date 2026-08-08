# Tutorial Data

`data/tutorial.ron` is the authoritative source for the standalone
tutorial scenario, the playable battle handoff, tutorial-journey guidance, and
supplemental first-occurrence explanations. Run `npm run regenerate-assets`
after editing it. The typed `tutorial_v1` adapter validates the source, emits
the compatibility boundary at `data/tutorial.toml`, and writes the complete
normalized browser artifact to `public/tutorial-data.json`.

## Scenario identity

`battle.featured_cards` assigns stable semantic roles to the cards reused by the
tutorial:

- `player_card_id`: the scripted player character
- `opponent_card_id`: the scripted opponent character
- `enemy_starter_card_id`: the enemy character shown during loading and placed at
  the live handoff
- `loading_event_card_id`: the event shown during loading
- `dreamwell_card_id`: the featured Dreamwell card

Every field is a catalog UUID. Ordinary card roles resolve against
`cards.ron`; `dreamwellCardId` resolves against `dreamwell.ron`.
`player_dream_avatar_id` and `enemy_dream_avatar_id` resolve against
`dream_avatars.ron`.

## Battle setup

The `battle` record contains `starting_energy`, `score_to_win`, and
`starter_deck`. Each `StarterDeckEntry` has a `card_id` and a positive
`copies` count. The displayed and initialized deck size is the sum of those
counts.

`battle.scripted_board` selects the compact player back-rank and front-rank
indices used by the scripted presentation. Back-rank indices range from 0 to 2;
front-rank indices range from 0 to 1.

`player_draws`, `enemy_draws`, and `dreamwell_draws` define deterministic draw
prefixes. `ai_action_overrides` defines state-matched semantic AI actions. The
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

Rank placements use canonical `slot_id` values. Front-rank slots are `F0` through
`F8`; the player back rank uses `B0` through `B4`; the enemy back rank uses
`B0` through `B9`. Void placements omit `slotId`.

## Guidance and actions

`actions` is the ordered front-door tutorial sequence. `triggers` contains
shared first-occurrence explanations. The `journey_start`, `dreamscape`,
`atlas`, `draft`, `purge`, `dreamsign_revelation`, `first_battle`, and
`second_battle` records
configure persistent Mira guidance on their journey surfaces.

Each action, trigger, and AI override has a UUIDv4 identity. The development
Tutorial Editor applies typed semantic operations to the ordered `actions`
collection. Scalar saves patch the authored value span; behavior and structural
saves patch the affected subtree. Every save validates the complete typed
catalog, regenerates compatibility TOML and browser JSON in staging, and
publishes them with the canonical source under one source revision.

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
