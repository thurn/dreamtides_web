# Source-to-Part Research Map

This reference is a high-level routing aid for connecting the current
Dreamtides repository to the parts of LToDD. Use it to answer “where should I
look?” and “which part probably owns this?” while researching a chapter.

The map is deliberately nonbinding. The book presents a clean game design, not
the source tree, and source ownership changes as the implementation evolves.
`ltodd/index.md` is the authoritative ownership map. The running production
game, authored data, and verified rules determine what the book says. Never cite
this reference or reproduce its source organization in an LToDD chapter.

## How to use the map

1. Read `ltodd/index.md` and choose candidate parts from their scope statements.
2. Use the neighborhoods below to begin source and data research.
3. Follow behavior across boundaries when a system spans several neighborhoods.
4. Assign the design to the part that answers the reader's primary question,
   then add local facts and cross-references wherever another part needs them.
5. Verify consequential behavior in the production flow before writing it as
   canonical.

A file may inform several parts. For example, a Card component contributes
evidence about both Game Objects and Cumulus, while a Purge screen contributes
evidence about both Sites and Deckbuilding. Map the behavior by design
responsibility rather than forcing every file into exactly one part.

## Repository-wide routing principles

- `src/types/` and `src/data/` are distributed by the game concept they model.
  They are evidence for the relevant gameplay part, not independent book
  subjects.
- `src/rules/` usually provides the strongest source evidence for resolution
  order, invariants, and durable consequences. Confirm presentation and
  player-facing terminology in the production flow.
- `src/cumulus/primitives/`, generic reusable components, and Cumulus internal
  systems primarily inform the two Cumulus parts. Feature-specific Cumulus
  screens and components also inform their gameplay parts.
- `src/cumulus/screens/` supplies presentation and local interaction evidence.
  Its corresponding builders and adapters under
  `src/screens/cumulus_adapters/` reveal how journey state becomes player-facing
  information.
- `src/state/`, application controllers, and routing code help reconstruct
  journey progression and handoffs. React state, URLs, and browser mechanics are
  implementation evidence rather than book concepts.
- Some gameplay decisions currently live under `src/coop/providers/`. Route
  those decisions to their gameplay parts. The co-op transport, room event log,
  synchronization architecture, and Firebase implementation remain outside the
  canonical single-player book.
- Authored TOML under `data/tabula/` accompanies the book. Explain each stable
  catalog interface and its consumption without copying its entries into prose.
- Editor, debug, QA, test, generated-documentation, and build-tool sources are
  research aids or implementation infrastructure rather than book subjects.

## `/game_foundations` — Foundations and Game Objects

Start with the shared Card, Dream Avatar, Dreamsign, Figment, resource, content,
and identity models under `src/types/` and `src/data/`. Card catalog loading,
effective Card transformations, glossary-backed rules language, and the semantic
Card and collectible components under `src/cumulus/components/` are common
evidence sources.

Keep acquisition and deck evolution in `/draft_deckbuilding`, Site
transactions in `/site_economy`, and contest-time resolution in the Battle
parts. Cumulus owns the reusable visual and interaction contracts of the same
objects.

## `/cumulus_design` — Visual Language and Components

Start with `src/cumulus/primitives/`, the material and control treatments under
`src/cumulus/internal/`, and the reusable catalog under
`src/cumulus/components/`. Tokens, color and glyph vocabularies, art references,
typography, spacing, shape, elevation, glass, solid materials, and invariant
component appearance belong here.

The `/cumulus` documentation route can clarify intended component contracts, but
it is supporting documentation rather than production behavior. Put coordinated
gestures and screen arrangement in `/cumulus_interaction`, and put a screen's
particular meaning in its gameplay part.

## `/cumulus_interaction` — Interaction and Screen Composition

Start with the shared press primitive, the entity-reveal coordinator under
`src/cumulus/internal/reveal/`, `CumulusRoot`, reusable control and overlay
behavior, the production screen router, journey chrome, and shared responsive
or safe-area helpers. These sources inform activation, focus, hover, touch-hold,
dragging, dismissal, modal behavior, accessibility, layering, transitions,
stages, frames, and responsive composition.

Gameplay parts own the consequences of an action and the state-dependent
arrangement of a particular destination or contest.

## `/dream_journeys` — Dream Journeys and the Dream Atlas

Start with journey state and lifecycle rules under `src/state/` and
`src/rules/journey/`, then follow the Atlas generator, affiliation logic,
Dreamscape and Atlas data, and the journey-start, Dreamscape, Atlas, completion,
and failure screens and adapters. Application-level progression and handoffs can
help reconstruct the complete run.

Destination mechanics belong in the Site parts, Battle mechanics in the Battle
parts, and authored teaching restrictions in `/tutorial_journey`.

## `/draft_deckbuilding` — Draft Pools, Tides, and Deckbuilding

Start with the canonical Tide-backed pool path under `src/draft/`, the authored
Tide input, Draft rules, and Draft presentation. Follow journey deck rules,
entry identity, deck viewers, and the Purge, Duplication, Transfiguration, and
type-change logic and presentation for deck evolution.

Historical pool derivation and experimental draft modes are outside the book.
The stable authored Tide result is the canonical input. Site arrival, payment,
and departure belong in `/site_economy`, even when the Site changes the deck.

## `/site_economy` — Journey Economy and Dream Sites

Start with journey Site, shop, reward, and economy rules; pricing and reward
helpers; authored economy data; and the Site screens and adapters for markets,
Dreamsign Revelation, inline rewards, Random Site, and shared destination
flows. These sources inform availability, entry, enhancement, prepared
randomness, Guide hosting, payment, reward receipt, completion, and return to
the Dreamscape.

The deck mutation performed by Purge, Duplication, or Transfiguration belongs in
`/draft_deckbuilding`. Augury, Exploration, and Gamble continue in their own
parts after the shared Site handoff.

## `/site_encounters` — Augury and Exploration

Start with the adaptive-offer system under `src/journey_v2/`, reward-selection
logic, authored Exploration data, the gameplay provider that resolves
Exploration intents, and the Augury and Exploration screens, builders, and
adapters. These sources inform eligibility, scoring, pairing, target selection,
prepared choices, authored encounters, atomic outcomes, persistence, dialogue,
and reward choreography.

Underlying Card changes belong in `/draft_deckbuilding`; shared prices and
rewards belong in `/site_economy`; future Battle modifiers also need coverage in
the relevant Battle part.

## `/gamble_site` — Gamble

Start with the journey Gamble rules, Gamble state types, authored data for each
chance game, and the Gamble screen, builder, and adapter. These sources inform
wagers, committed hidden outcomes, reveals, settlement, repeated rounds,
cashing out, enhancement, payouts, Dreamsign awards, replacement, and reveal
choreography.

Shared Essence and Dreamsign economics remain in `/site_economy` and Game
Object identity remains in `/game_foundations`.

## `/battle_setup` — Battle Setup and Opposition

Start with `src/battle/integration/`, opponent package and deck construction,
`src/battle/ai/`, initial Battle state, Dreamwell and Figment catalogs, the
Battle initialization provider, and the Battle-start screen and adapter. These
sources inform participants, objectives, decks, Dreamsigns, initial zones and
resources, deterministic setup, opponent coherence, difficulty, decision
priorities, and the preview of the coming contest.

Rules governing legal play belong in `/battle_rules`; the live player-facing
contest belongs in `/battle_outcomes`.

## `/battle_rules` — Battle Rules and Resolution

Start with `src/rules/battle/`, `src/battle/engine/`, Battle state transitions
and selectors, and the shared Battle types. Use
`docs/battle_rules/battle_rules.md` as the trusted secondary source required by
the skill. These sources inform zones, turns, timing, priority, Energy, Card
play, costs, legality, targeting, effects, triggers, counters, repositioning,
Challenges, Spark, scoring, Fatigue, created Cards, Figments, resolution order,
and terminal conditions.

Debug-edit commands and inspector behavior are outside the canonical rules.
Opponent decision policy belongs in `/battle_setup`; presentation and rewards
belong in `/battle_outcomes`.

## `/battle_outcomes` — Battle Presentation and Outcomes

Start with the live Battle controllers and components under `src/battle/`, the
playable Battle screen, Battle-specific Cumulus components and overlays, Battle
view-model builders and adapters, the result surface, and the reward handoff.
These sources inform Battlefield composition, participant status, action and
target feedback, responsive layouts, inspection, announcements, motion,
accessible interaction, result presentation, rewards, and durable journey
consequences.

The legal and state-changing meaning of those interactions remains in
`/battle_rules`; shared reward economics remain in `/site_economy`.

## `/tutorial_journey` — Tutorial Journey and Teaching

Start with tutorial-authored data and types, tutorial guidance rules, tutorial
state hooks and controllers, front-door and loading presentation, and the
Tutorial, tutorial-Battle, and guided-journey screens, builders, and adapters.
These sources inform authored action restrictions, guidance triggers,
instruction timing, contextual Card help, the cinematic lesson, tutorial
Battle, and the transition into the guided journey.

The primary gameplay parts remain authoritative for every rule being taught.
This part owns the teaching sequence, presentation, and deliberate restrictions
that turn those rules into instruction.
