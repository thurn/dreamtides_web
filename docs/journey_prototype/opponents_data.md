# Opponent Data

`data/opponents.ron` is the authoritative source for battle setup,
Dreamwell construction, opponent progression and deck generation, the journey
AI deck, and AI tuning. Asset setup strictly validates and normalizes the file
into gitignored `public/opponents-data.json`. The browser loads that artifact as
required `JourneyContent.opponentsData` before room gameplay mounts.

TypeScript owns mechanics such as interpolation, seeded selection, pruning,
rank geometry, fatigue, and card-effect automation. RON owns the schedules,
limits, coefficients, card UUID counts, and named presets those mechanics use.
Tutorial decks, scripted opening hands, action overrides, and other
tutorial-specific sequencing remain in `tutorial.ron`.

## Schema

The typed `OpponentsCatalog` root and its nested record and enum types define
the authored contract. Every field is required and unknown fields fail
compilation. The game-data compiler lowers this source to the established
`data/opponents.toml` compatibility shape consumed by asset generation.

| Section             | Authored contract                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `battle`            | Minimum deck size, both opening-hand sizes, score targets, turn/energy/hand limits, starting side, opening-draw behavior, and signature-card count. |
| `dreamwell`         | One-time opening orders, recurring orders, cards drawn per recurring order, and minimum constructed deck length.                                    |
| `progression`       | Ability, Dreamsign, and Legendary unlock layers plus the starter-dilution schedule.                                                                 |
| `coherent_draft`    | Distinct-card, removal, and temperature curves; best-of count; affiliation objective; record source count; and coherence scoring coefficients.      |
| `corpus_selection`  | Affiliation weight and the top-ranked seeded sampling window.                                                                                       |
| `journey_ai_deck`   | Card UUID and positive copy count for each journey AI deck entry.                                                                                   |
| `ai.evaluation`     | Static board-evaluation weights.                                                                                                                    |
| `ai.opponent-model` | Removal prior, response-archetype priors, and the global sampling safety cap.                                                                       |
| `ai.presets`        | Named search breadth, response mode, sample count, search depth, journey time budget, and deterministic tutorial expansion budget.                  |

Layer numbers are zero-indexed completion levels. Curve endpoints map to the
first and last Atlas layers and code linearly interpolates intermediate layers.
Score targets are indexed by completion level; completion levels beyond the
authored array use its final value. Starter dilution is indexed the same way,
with entries beyond the authored array contributing zero starters.

The compiler rejects missing or unknown keys, invalid numeric ranges,
non-monotonic curves, duplicate or overlapping Dreamwell orders, invalid
coherence weights, invalid or duplicate preset IDs, unknown preset references,
sample counts above the safety cap, non-positive deck counts, and AI deck UUIDs
absent from `cards.ron`. Failures identify the RON path that needs correction.

## Generated artifact and hashes

Run `scripts/regenerate-assets.sh` after editing the catalog. The game-data
compiler generates `data/opponents.toml`, then `scripts/opponents-data.mjs`
validates that compatibility document and generates the runtime JSON. Generated
TOML and JSON are reproducible from RON and are not committed.

The normalized document contains SHA-256 `contentHash` and `foldHash` fields.
Both cover the complete v1 normalized document and therefore have the same
value. Battle init persists the content hash alongside the complete resolved AI
preset, configured hand limit, and resolved opponent-ability state. Opponent
construction and AI-choice logs carry the relevant hash, resolved progression
or curve inputs, and preset ID for production reconstruction.

## Room compatibility

Room genesis pins `opponentsFoldHash` in its content configuration. A client may
join gameplay only when its local opponent catalog hash matches the room. The
opponent catalog is part of reducer protocol `dreamtides-coop-v23`. Gameplay
rooms require that protocol and a matching `opponentsFoldHash`.

## AI presets

`journey-default-preset` and `tutorial-default-preset` reference entries in
`ai.presets`. Journey planning enforces the preset's wall-clock budget. Tutorial
planning uses the preset's deterministic expansion budget so clients folding
the same room choose the same action. Both paths use the evaluation weights,
opponent-model tuning, search depth, response mode, sample count, and the active
battle's persisted score target.
