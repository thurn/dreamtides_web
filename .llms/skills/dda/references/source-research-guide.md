# DDA source research guide

Use this guide to choose a starting point for essay research. It is a routing
aid, not an anthology outline or ownership map. Follow behavior across every
relevant boundary and never cite this guide in an essay.

## Contents

- [Repository-wide approach](#repository-wide-approach)
- [Whole game and persistent objects](#whole-game-and-persistent-objects)
- [Journeys and the Dream Atlas](#journeys-and-the-dream-atlas)
- [Draft pools and deckbuilding](#draft-pools-and-deckbuilding)
- [Sites, rewards, and economy](#sites-rewards-and-economy)
- [Exploration and Augury](#exploration-and-augury)
- [Gamble](#gamble)
- [Battle setup and opposition](#battle-setup-and-opposition)
- [Battle rules and resolution](#battle-rules-and-resolution)
- [Battle presentation and outcomes](#battle-presentation-and-outcomes)
- [Tutorial and teaching](#tutorial-and-teaching)

## Repository-wide approach

1. Play or inspect the production flow to establish visible behavior and
   terminology.
2. Follow the player-facing object through rules, state, data, presentation,
   and its next destination.
3. Verify consequential ordering and edge cases in production code and data.
4. Inspect `logs/journey-log.jsonl` when a production decision needs
   reconstruction.
5. Use tests and debug tools as evidence, not as design vocabulary.

Shared neighborhoods have different evidentiary roles:

- `src/types/` and `src/data/` identify persistent objects and authored
  definitions, but their source types do not automatically become design
  concepts.
- `src/rules/` usually gives the strongest evidence for resolution order and
  state changes.
- `src/cumulus/screens/` and `src/screens/cumulus_adapters/` show how game state
  becomes player-facing information.
- `src/state/`, controllers, and routing code help reconstruct progression and
  handoffs. Their framework mechanics remain outside DDA.
- Some gameplay decisions live under `src/coop/providers/`. Extract the game
  rule without documenting transport or synchronization architecture unless
  the essay explicitly concerns cooperative design.
- Authored RON and JSONC under `data/` accompany the design. Explain stable
  semantics without copying mutable catalog entries.
- Editors, debug surfaces, QA tooling, fixtures, generated documentation, and
  build scripts are research aids rather than design subjects.

## Whole game and persistent objects

Begin with the main game flow, `docs/journeys/journeys.md`, journey state, and
the major destination and battle handoffs. Then inspect shared card, Dream
Avatar, Dreamsign, figment, resource, content, and identity models under
`src/types/` and `src/data/`.

Card catalog loading, rules-language resolution, and semantic card components
help explain how definitions, persistent instances, modifications, and current
context determine what the player sees. Treat resolved component data as a
calculation unless rules give it separate identity or behavior.

## Journeys and the Dream Atlas

Start with journey state and lifecycle rules under `src/state/` and
`src/rules/journey/`. Follow the Atlas generator, affiliation logic,
Dreamscape and Atlas data, and the journey-start, Dreamscape, Atlas, completion,
and failure screens and adapters.

Use application progression only to reconstruct the game transition. Describe
the design handoff rather than routes, reducers, or browser state.

## Draft pools and deckbuilding

Start with the canonical Tide-backed pool path under `src/draft/`, authored
Tide input, draft rules, and draft presentation. Follow journey deck rules,
entry identity, deck viewers, and Purge, Duplication, Transfiguration, and
type-change behavior.

Treat the stable authored Tide as the production input. Historical derivation,
legacy corpora, and experimental draft modes are outside an essay unless the
user explicitly selects them as its subject.

## Sites, rewards, and economy

Start with journey site, shop, reward, and economy rules; pricing and reward
helpers; authored economy data; and the site screens and adapters. Follow
availability, entry, enhancement, prepared randomness, payment, reward receipt,
completion, and return to the Dreamscape.

When a site changes the deck, trace the mutation into the deckbuilding rules.
When it creates a future battle modifier, trace that modifier into battle setup
and resolution.

## Exploration and Augury

Start with the adaptive-offer system under `src/journey_v2/`, reward-selection
logic, authored Exploration data, gameplay intent resolution, and the Augury
and Exploration screens, builders, and adapters.

Follow eligibility, scoring, pairing, target selection, prepared choices,
authored encounters, dialogue, and reward sequencing as one pipeline. Inspect
decision traces in the journey log when explaining why a production offer was
constructed.

## Gamble

Start with journey gamble rules, gamble state types, authored chance-game data,
and the gamble screen, builder, and adapter. Trace wagers, committed hidden
outcomes, reveals, settlement, repeated rounds, cashing out, enhancement,
payouts, Dreamsign awards, and replacement.

## Battle setup and opposition

Start with `src/battle/integration/`, opponent package and deck construction,
`src/battle/ai/`, initial battle state, Dreamwell and figment catalogs, battle
initialization, and the battle-start screen.

Trace participants, objectives, decks, Dreamsigns, initial zones and resources,
deterministic setup, opponent coherence, difficulty, and decision priorities.
Separate opponent construction and decision policy from the rules that make an
action legal.

## Battle rules and resolution

Read `docs/battle_rules/battle_rules.md`, then inspect `src/rules/battle/`,
`src/battle/engine/`, battle state transitions, selectors, and shared battle
types.

Trace zones, turns, timing, priority, energy, card play, costs, legality,
targeting, effects, triggers, counters, repositioning, challenges, spark,
scoring, fatigue, created cards, figments, resolution order, and terminal
conditions. Translate effect-runner and selector behavior into rules and state
transitions rather than runtime architecture.

## Battle presentation and outcomes

Start with live battle controllers and components, the playable battle screen,
battle-specific Cumulus components and overlays, view-model builders and
adapters, the result surface, and the reward handoff.

Separate the legal and state-changing meaning of an action from its
presentation. Trace battle rewards into the journey rules that make their
effects persistent.

## Tutorial and teaching

Start with tutorial-authored data and types, guidance rules, state hooks and
controllers, and Tutorial, tutorial battle, and guided-journey screens.

Trace authored action restrictions, guidance triggers, instruction timing,
contextual card help, deterministic sequences, and the transition into normal
play. The main gameplay rules remain authoritative for the mechanics being
taught; the tutorial owns the deliberate restrictions and presentation that
turn them into instruction.
