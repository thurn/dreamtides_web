# Living Tome of Dreamtides Design

This index is the authoritative reading order and ownership map for the
canonical design of Dreamtides.

## How to read this book

Choose the part that owns the system you are implementing, then choose a chapter
by its scope statement. Follow local links for prerequisites, shared rules, and
deeper systems. Each chapter states the complete rules needed in its own context
while linking to the primary chapter for the full design.

## Design

This part establishes the player experience and the principles that constrain
every Dreamtides system.

It owns the player promise, the nested journey and Battle loops, information
disclosure, meaningful commitment, authored identity, deterministic randomness,
durable state, and the relationship between rules, presentation, and rationale.
Specific gameplay algorithms remain with the parts that use them.

## Game Objects

This part defines the persistent and rule-bearing objects from which Dreamtides
is built.

It owns Cards and their identities, anatomy, types, subtypes, symbols, and rules
language; concrete deck entries and effective Cards; Dream Avatars; Dreamsigns;
resources; persistent Card modifications; and created objects. Acquisition and
deck evolution belong to Deckbuilding, while Battle owns how these objects
resolve during a contest.

## Draft Pools

This part specifies how a journey receives and consumes its curated supply of
Cards.

It owns authored Tide membership, Tide roles, Dream Avatar relationships, pool
eligibility, pool construction, Card multiplicity, deterministic selection,
per-journey commitment, affiliation influence, Draft offers, picks, and shared
pool consumption. The authored Tides are canonical inputs; their historical
derivation from play records is outside the book.

## Cumulus

This part defines the visual language that gives every Dreamtides experience a
shared material and expressive identity.

It owns the design philosophy, semantic visual vocabulary, color, typography,
glyphs, spacing, shape, elevation, liquid glass, solid materials, legibility,
and the distinction between tangible game objects and review chrome. Components
owns reusable surfaces, while Interaction and Composition own their coordinated
behavior and arrangement.

## Components

This part specifies the reusable Cumulus objects that carry information and
interaction across the game.

It owns the invariant appearance, semantic models, variants, local states, and
standard feedback of controls, glass surfaces, information reveals, dialogue,
text, Cards, Dreamsigns, Dream Avatars, Atlas objects, Site objects, Battle
objects, announcements, and journey chrome. Consequential components receive
individual chapters; compact primitives may share a family chapter.

## Interaction

This part specifies how players act on Cumulus objects and how those objects
respond across input modes.

It owns activation, press feedback, selection, focus, hover, touch-hold, entity
reveals, dismissal, dragging, reordering, keyboard and touch parity, modal
behavior, interruption, accessible communication, and reduced-motion
equivalence. Gameplay parts own the consequences of each action.

## Composition

This part specifies how Cumulus objects become complete screens and continuous
player flows.

It owns stages, frames, content-sized surfaces, visual hierarchy, responsive
desktop and narrow compositions, safe areas, journey chrome, overlays, layer
ordering, transitions, and screen-level motion. Gameplay parts own the
state-dependent meaning and particular arrangement of their screens.

## Journey

This part specifies the complete run from Dream Avatar selection to victory or
failure.

It owns journey assembly, durable inventory, the Dreamscape-Site-Battle-Atlas
loop, screen progression, Site and Battle handoffs, persistent and temporary
modifiers, journey inspection, completion depth, terminal outcomes, and starting
again. Atlas owns route topology, while specialized destination parts own the
activities entered during the journey.

## Atlas

This part specifies the world map, the Dreamscapes it reveals, and the route a
journey takes through them.

It owns graph structure, layers, node generation, revelation, reachability,
route commitment, known Dreamsigns, Dreamscape selection, repeat avoidance,
Dream Guides, affiliations, signature Site enhancement, Site composition, local
Dreamscape navigation, the final boss destination, and map presentation.
Destination mechanics begin when the player enters a Site.

## Deckbuilding

This part specifies how the player's concrete deck is established, understood,
and transformed throughout a journey.

It owns the starting deck, acquisition, entry identity, duplicate handling,
effective-Card resolution, Purge, Duplication, Transfiguration, type and keyword
changes, temporary and permanent modifications, and deck inspection. Draft Pools
owns the supply from which Draft offers are made; Economy owns prices and shared
reward valuation.

## Economy

This part specifies how value enters, leaves, and redirects a journey.

It owns Essence, sources and sinks, prices, discounts, rerolls, Battle payouts,
reward selection policies, deck-fit evaluation, Dreamsign capacity economics,
and modifiers that alter later rewards or costs. Sites owns the player-facing
transaction flow at each destination.

## Sites

This part specifies the shared destination contract and the Site experiences
that do not require their own parts.

It owns Site availability, entry, prepared randomness, enhancement, completion,
return to the Dreamscape, Guide hosting, inline rewards, Card and Dreamsign
markets, Dreamsign Revelation, Purge, Transfiguration, Duplication, Random Site,
and the handoffs into Draft, Augury, Exploration, Gamble, and Battle. The
specialized parts own the complete rules after those handoffs.

## Augury

This part specifies the adaptive vision in which the player chooses between two
rewards shaped by the current journey.

It owns the journey snapshot used for evaluation, offer families, eligibility,
candidate scoring, distinct-family pairing, target selection, acceptance,
decline, dialogue, persistent outcomes, and the symbolic two-offer presentation.
The parts for Game Objects, Deckbuilding, Economy, and Sites own the underlying
operations an accepted offer invokes.

## Exploration

This part specifies authored, art-led encounters that turn narrative choices
into replayable journey consequences.

It owns encounter selection, scene art and prose, the two-action authoring
contract, prepared choices, target-selection policies, effect families, future
Site and Battle modifiers, atomic resolution, persisted responses and outcomes,
and the transition and reward choreography. The accompanying encounter catalog
owns individual scenes and actions.

## Gamble

This part specifies the chance games that exchange committed hidden outcomes for
escalating risk and reward.

It owns the shared wager, commitment, reveal, and settlement model; the playing
Card deck; Three-Gate Wager; Tidemark Ladder Climb; Starway Stairs; enhanced
behavior; repeated rounds and cashing out; Essence costs and payouts; Dreamsign
awards and replacement; durable outcomes; and reveal choreography.

## Battle

This part specifies how a journey creates, presents, plays, and resolves a
Battle.

It owns participant setup, opposing packages, objectives, zones, the
Battlefield, the Dreamwell, Energy, turns, timing, priority, Card play, costs,
targeting, effects, triggers, counters, repositioning, Challenges, Spark,
scoring, Fatigue, created Cards, Figments, Battle interaction, results, rewards,
and the journey handoff.

## Tutorial

This part specifies how Dreamtides teaches its rules and then hands control to
the player.

It owns the main-menu entry, intentional loading primer, cinematic lesson,
guided actions, tutorial Battle, transition into the tutorial journey, guided
first encounters with journey systems, contextual Card guidance, and the
presentation and pacing of instruction. Primary gameplay parts remain
authoritative for the rules being taught.

## Book Reference

The book-level reference defines canonical terminology used across every part.

1. [Glossary](glossary.md) — Read this chapter when resolving the precise
   meaning or primary ownership of a Dreamtides term.
