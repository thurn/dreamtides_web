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

A file may inform several parts. For example, a card component contributes
evidence about both game objects and Cumulus, while a purge screen contributes
evidence about both sites and deckbuilding. Map the behavior by design
responsibility rather than forcing every file into exactly one part.

## Estimating relative source size

Run the skill's heuristic estimator from the repository root:

```bash
node .llms/skills/ltodd/scripts/estimate-part-loc.mjs
```

It reads the current part names from `ltodd/index.md`, scans physical lines in
production-oriented TS, TSX, and CSS files, assigns each included file to the
first matching part heuristic, and prints file count, line count, and share for
every part. Add `--paths` for a section per part listing its five largest source
neighborhoods by assigned line count, one path per line. Add `--details` to audit
every assignment plus the excluded and unassigned files.

The result estimates research surface area, not book length or design
importance. Shared files receive one dominant owner for counting even when they
inform several parts. The script excludes tests, tools, debug surfaces,
infrastructure, and noncanonical draft experiments at a coarse path level.
Update its ordered classifiers when the index or major source neighborhoods
change. Treat detailed assignments as audit hints: when a fallback assignment
conflicts with the boundaries below, correct the classifier rather than copying
that accident into the book map.

## Repository-wide routing principles

- `src/types/` and `src/data/` are distributed by the game concept they model.
  They are evidence for the relevant gameplay part, not independent book
  subjects.
- `src/rules/` usually provides the strongest source evidence for resolution
  order, state changes, and lasting results. Confirm presentation and
  player-facing terminology in the production flow.
- `src/cumulus/primitives/` and generic reusable components help identify each
  screen's brief component inventory. Cumulus documentation owns their standard
  behavior and APIs. Cumulus internal systems inform LToDD when they contain
  non-obvious UI algorithms.
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

## `/dreamtides` — Foundations and game objects

Begin by reconstructing the whole game and journey lifecycle. Use the main game
flow, `docs/journeys/journeys.md`, journey state, and the major destination and
battle handoffs to establish what Dreamtides is before researching its internal
object models.

Then inspect shared card, Dream Avatar, Dreamsign, figment, resource, content,
and identity models under `src/types/` and `src/data/`. Card catalog loading,
rules-language resolution, and the semantic card and collectible components
under `src/cumulus/components/` provide evidence for how definitions,
persistent instances, modifications, and current context determine what the
player sees. Treat resolved component data as a calculation unless the rules
give it separate identity or behavior.

Keep acquisition and deck evolution in `/draft_deckbuilding`, site
transactions in `/sites`, and contest-time resolution in the battle parts.
Cumulus owns the reusable visual and interaction contracts of the same objects.

## `/cumulus` — The Cumulus design system

Use `src/cumulus/primitives/`, `src/cumulus/components/`, and the `/cumulus`
documentation route to identify the components visible on each screen. The
Cumulus documentation owns component APIs and invariant appearance and behavior.
LToDD names those components briefly and explains only cross-cutting design
decisions or algorithms that prototype use and component documentation do not
reveal.

Put coordinated gestures, screen arrangement algorithms, and other non-obvious
UI behavior in `/cumulus_interaction`, and put a screen's particular meaning in
its gameplay part.

## `/cumulus_interaction` — Interaction and screen composition

Start with the shared press primitive, the entity-reveal coordinator under
`src/cumulus/internal/reveal/`, `CumulusRoot`, reusable control and overlay
behavior, the production screen router, journey chrome, and shared responsive
or safe-area helpers. These sources inform algorithms behind activation, focus,
hover, touch-hold, dragging, dismissal, modal priority, layering, safe-area
avoidance, responsive selection, fit-to-content behavior, and coordinated
placement and dismissal of reveals. Leave ordinary component interaction and
presentation to Cumulus documentation and the prototype.

Gameplay parts own the consequences of an action and the state-dependent
arrangement of a particular destination or contest.

## `/journeys` — Dream journeys and the Dream Atlas

Start with journey state and lifecycle rules under `src/state/` and
`src/rules/journey/`, then follow the Atlas generator, affiliation logic,
Dreamscape and Atlas data, and the journey-start, Dreamscape, Atlas, completion,
and failure screens and adapters. Application-level progression and handoffs can
help reconstruct the complete run. Journey content assembly, persistent status,
the front door, the main menu, and loading states expose the connective rules
between those phases. Treat the implementation's state machinery as evidence
for those rules rather than as book vocabulary.

Destination mechanics belong in the site parts, battle mechanics in the battle
parts, and authored teaching restrictions in `/tutorial`.

## `/draft_deckbuilding` — Draft pools, Tides, and deckbuilding

Start with the canonical Tide-backed pool path under `src/draft/`, the authored
Tide input, draft rules, and draft presentation. Follow journey deck rules,
entry identity, deck viewers, and the Purge, Duplication, Transfiguration, and
type-change logic and presentation for deck evolution. The draft engine, pool
support models, card multiplicity, pool inspection, and starting-deck reveal
clarify how the authored supply becomes a persistent player deck.

Historical pool derivation and experimental draft modes are outside the book.
The stable authored Tide result is the canonical input. Site arrival, payment,
and departure belong in `/sites`, even when the site changes the deck.

## `/sites` — Journey economy and Dream Sites

Start with journey site, shop, reward, and economy rules; pricing and reward
helpers; authored economy data; and the site screens and adapters for markets,
Dreamsign Revelation, inline rewards, random site, and shared destination
flows. These sources inform availability, entry, enhancement, prepared
randomness, Guide hosting, payment, reward receipt, completion, and return to
the Dreamscape. Site intent resolution, shop generation, reward effects,
Dreamsign pool construction, and the Guide gallery expose the algorithms and
presentation shared by several destinations.

The deck mutation performed by Purge, Duplication, or Transfiguration belongs in
`/draft_deckbuilding`. Augury, Exploration, and Gamble continue in their own
parts after the shared site handoff.

## `/exploration_augury` — Augury and Exploration

Start with the adaptive-offer system under `src/journey_v2/`, reward-selection
logic, authored Exploration data, the gameplay provider that resolves
Exploration intents, and the Augury and Exploration screens, builders, and
adapters. These sources inform eligibility, scoring, pairing, target selection,
prepared choices, authored encounters, atomic outcomes, persistence, dialogue,
and reward sequencing philosophy. Within the adaptive-offer system, follow
operation archetypes, journey context, fit and Dreamsign signals, merchant
generation, dialogue, decision traces, and offer presentation as one connected
pipeline.

Underlying card changes belong in `/draft_deckbuilding`; shared prices and
rewards belong in `/sites`; future battle modifiers also need coverage in the
relevant battle part.

## `/gamble_site` — Gamble

Start with the journey gamble rules, gamble state types, authored data for each
chance game, and the gamble screen, builder, and adapter. These sources inform
wagers, committed hidden outcomes, reveals, settlement, repeated rounds,
cashing out, enhancement, payouts, Dreamsign awards, replacement, and reveal
sequencing philosophy.

Shared Essence and Dreamsign economics remain in `/sites` and Game
Object identity remains in `/dreamtides`.

## `/battle_setup` — Battle setup and opposition

Start with `src/battle/integration/`, opponent package and deck construction,
`src/battle/ai/`, initial battle state, Dreamwell and figment catalogs, the
battle initialization provider, and the battle-start screen and adapter. These
sources inform participants, objectives, decks, Dreamsigns, initial zones and
resources, deterministic setup, opponent coherence, difficulty, decision
priorities, and the preview of the coming contest. Corpus-backed deck selection,
signature relationships, coherence adjustment, forward modeling, blocking, and
evaluation explain how an opponent package becomes a legible opposing strategy.

Rules governing legal play belong in `/battle_rules`; the live player-facing
contest belongs in `/battle_outcomes`.

## `/battle_rules` — Battle rules and resolution

Start with `src/rules/battle/`, `src/battle/engine/`, battle state transitions
and selectors, and the shared battle types. Use
`docs/battle_rules/battle_rules.md` as the trusted secondary source required by
the skill. These sources inform zones, turns, timing, priority, energy, card
play, costs, legality, targeting, effects, triggers, counters, repositioning,
challenges, spark, scoring, fatigue, created cards, figments, resolution order,
and terminal conditions. The effect runner, rules tables, automation, and state
selectors provide evidence for exact ordering and automatic results. Translate
that evidence into state transitions and rules rather than runtime architecture.

Debug-edit commands and inspector behavior are outside the canonical rules.
Opponent decision policy belongs in `/battle_setup`; presentation and rewards
belong in `/battle_outcomes`.

## `/battle_outcomes` — Battle presentation and outcomes

Start with the live battle controllers and components under `src/battle/`, the
playable battle screen, battle-specific Cumulus components and overlays, battle
view-model builders and adapters, the result surface, and the reward handoff.
These sources inform battle-specific algorithms, participant status, action and
target consequences, responsive selection, inspection, rewards, and durable
journey consequences. Briefly cover the context menu, zone browser, Foresee
view, battle log, figment creation, card notes, deck ordering, and Dreamwell
history as distinct player workflows, while leaving their detailed presentation
to the prototype.

The legal and state-changing meaning of those interactions remains in
`/battle_rules`; shared reward economics remain in `/sites`.

## `/tutorial` — Tutorial journey and teaching

Start with tutorial-authored data and types, tutorial guidance rules, tutorial
state hooks and controllers, front-door and loading presentation, and the
Tutorial, tutorial battle, and guided-journey screens, builders, and adapters.
These sources inform authored action restrictions, guidance triggers,
instruction timing, contextual card help, the cinematic lesson, tutorial
battle, and the transition into the guided journey. The authored action
timeline, fixed journey pool, tutorial AI overrides, controller timing, card and
site guidance, and speech-bubble presentation define how that teaching sequence
stays deterministic and context-sensitive.

The primary gameplay parts remain authoritative for every rule being taught.
This part owns the teaching sequence, high-level presentation philosophy, and
deliberate restrictions that turn those rules into instruction.
