# Tutorial Data

`data/tutorial.ron` is the authoritative source for the standalone
tutorial scenario, the playable battle handoff, tutorial-journey guidance, and
supplemental first-occurrence explanations. Run `npm run regenerate-assets`
after editing it. The typed `tutorial_v1` adapter validates the source, emits
the compatibility boundary at `data/tutorial.toml`, and writes the complete
normalized browser artifact to `public/tutorial-data.json`.

## Scenario identity

`battle.tutorial_card_constants` is the set of card UUID constants used by tutorial
presentation, scripted actions, and the playable handoff:

- `tutorial_player_character_card_id`: the character controlled by the player
  during the scripted tutorial sequence
- `tutorial_opponent_character_card_id`: the character controlled by the
  opponent during the scripted tutorial sequence
- `loading_screen_character_card_id`: the character shown on the loading screen
- `loading_screen_event_card_id`: the event shown on the loading screen
- `handoff_enemy_character_card_id`: the enemy character placed into the back
  rank at the playable handoff
- `tutorial_dreamwell_card_id`: the Dreamwell card featured during the scripted
  tutorial sequence

Every field is a catalog UUID. Ordinary card roles resolve against
`cards.ron`; `tutorialDreamwellCardId` resolves against `dreamwell.ron`.
`player_avatar_id` and `enemy_avatar_id` resolve against
`avatars.ron`.

The loading-screen character and handoff enemy character must use different
card UUIDs.

## Battle setup

The `battle` record contains `starting_energy`, `score_to_win`, and
`starter_deck`. Each `TutorialStarterDeckEntry` has a `card_id` and a positive
`copies` count. The displayed and initialized deck size is the sum of those
counts.

The compact scripted presentation places its player character in the first
available back-rank or front-rank presentation slot. These transient layout
positions are presentation-owned and are not authored battle state.

`forced_player_draws` and `forced_enemy_draws` define deterministic post-handoff
draw prefixes. `dreamwell_draws` defines the shared Dreamwell prefix, and
`ai_action_overrides` defines state-matched semantic AI actions. The
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
- `battle.handoff.card_placements` materializes scripted card roles into a side
  and zone. A placement sourced from `Deck` consumes a matching starter-deck
  copy; a placement sourced from `Created` creates an instance with tutorial
  provenance.

Rank placements use typed `Front(index)` and `Back(index)` slots. Front-rank
indices range from 0 through 8; player back-rank indices range from 0 through
4; enemy back-rank indices range from 0 through 9. The compiler lowers these
typed slots to the browser battle-address format.

## Guidance and actions

`scripted_tutorial_sequence` is the ordered front-door tutorial sequence.
`triggers` contains shared first-occurrence explanations. The `journey_start`, `dreamscape`,
`atlas`, `draft`, `purge`, `dreamsign_revelation`, `first_battle`, and
`second_battle` records
configure persistent Mira guidance on their journey surfaces. Every authored
bubble uses `TutorialSpeechBubble`; surface-owned guidance omits
`duration_seconds`, while timed sequence bubbles set it.

`default_maximum_width_pixels` supplies the desktop width for bubbles and
triggers that omit `maximum_width_pixels`. Individual entries override it only
when their composition needs a different width.

Each action, trigger, and AI override has a UUIDv4 identity. The development
Tutorial Editor applies typed semantic operations to the ordered
`scripted_tutorial_sequence`
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
