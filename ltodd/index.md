# Living Tome of Dreamtides Design (LToDD)

This index is the authoritative reading order and ownership map for the
canonical design of Dreamtides.

## How to read this book

Choose the numbered part that matches the system you are implementing, then
choose a chapter by its scope statement. Each part shows its stable directory
beneath the heading. Follow local links for prerequisites, shared rules, and
deeper systems. Chapters state the complete rules needed in their own context
while linking to the primary chapter for the full design.

## Part I: Foundations of Dreamtides and Its Game Objects

Directory: `/game_foundations`

The player promise, nested journey and Battle loops, information disclosure,
meaningful commitment, authored identity, deterministic randomness, durable
state, and the relationship between rules, presentation, and rationale. This
part also defines Cards and their identities, anatomy, types, subtypes, symbols,
and rules language; concrete deck entries and effective Cards; Dream Avatars;
Dreamsigns; resources; persistent Card modifications; and created objects.
Specific gameplay algorithms appear with the systems that use them.

## Part II: The Cumulus Design System

Directory: `/cumulus`

The visual language shared by every Dreamtides experience: design philosophy,
semantic visual vocabulary, color, typography, glyphs, spacing, shape,
elevation, liquid glass, solid materials, legibility, and the distinction
between tangible game objects and review chrome. This part also defines the
reusable Cumulus objects that carry information and interaction across the game:
their semantic models, invariant appearance, variants, local states, and
standard feedback. The catalog includes controls, glass surfaces, information
reveals, dialogue, text, Cards, Dreamsigns, Dream Avatars, Atlas objects, Site
objects, Battle objects, announcements, and journey chrome.

## Part III: Cumulus Interaction and Screen Composition

Directory: `/cumulus_interaction`

Activation, press feedback, selection, focus, hover, touch-hold, entity reveals,
dismissal, dragging, reordering, keyboard and touch parity, modal behavior,
interruption, accessible communication, and reduced-motion equivalence. This
part also defines how Cumulus objects become complete screens and continuous
flows: stages, frames, content-sized surfaces, visual hierarchy, responsive
desktop and narrow compositions, safe areas, journey chrome, overlays, layer
ordering, transitions, and screen-level motion. Gameplay chapters provide the
consequences, state-dependent meaning, and particular arrangement.

## Part IV: Dream Journeys and the Dream Atlas

Directory: `/journeys`

The complete run from the main menu and Dream Avatar selection to victory or
failure: journey assembly, durable inventory, the Dreamscape-Site-Battle-Atlas
loop, screen progression, handoffs, persistent and temporary modifiers, journey
inspection, completion depth, terminal outcomes, and starting again. The Dream
Atlas chapters define graph structure, layers, node generation, revelation,
reachability, route commitment, Dreamscape selection, repeat avoidance, Dream
Guides, affiliations, Site composition and enhancement, local navigation, the
final boss destination, and map presentation. Destination parts define the
activities entered along the route.

## Part V: Draft Pools, Tides, and Building the Deck

Directory: `/draft_deckbuilding`

The curated Card supply and the concrete deck it becomes during a journey. Draft
Pool chapters define authored Tide membership, Tide roles, Dream Avatar
relationships, pool eligibility and construction, Card multiplicity,
deterministic selection, per-journey commitment, affiliation influence, Draft
offers, picks, and shared pool consumption. Deckbuilding chapters define the
starting deck, acquisition, entry identity, duplicate handling, effective-Card
resolution, Purge, Duplication, Transfiguration, type and keyword changes,
temporary and permanent modifications, and deck inspection. Authored Tides are
canonical inputs; their historical derivation from play records is outside the
book.

## Part VI: The Journey Economy and Dream Sites

Directory: `/sites`

The flow of value and the shared destination contract throughout a journey.
Economy chapters define Essence, sources and sinks, prices, discounts, rerolls,
Battle payouts, reward selection policies, deck-fit evaluation, Dreamsign
capacity economics, and modifiers that alter later rewards or costs. Site
chapters define availability, entry, prepared randomness, enhancement,
completion, return to the Dreamscape, Guide hosting, inline rewards, Card and
Dreamsign markets, Dreamsign Revelation, Random Site, and destination handoffs.

## Part VII: The Augury and Exploration Sites

Directory: `/exploration_and_augury_sites`

The two choice-driven destinations that transform the current journey into
persistent consequences. Augury chapters define the journey snapshot used for
evaluation, offer families, eligibility, candidate scoring, distinct-family
pairing, target selection, acceptance, decline, dialogue, persistent outcomes,
and symbolic two-offer presentation. Exploration chapters define authored,
art-led encounters, encounter selection, scene art and prose, the two-action
authoring contract, prepared choices, target-selection policies, effect
families, future Site and Battle modifiers, atomic resolution, persisted
responses and outcomes, and transition and reward choreography. The encounter
catalog supplies the individual Exploration scenes and actions.

## Part VIII: The Gamble Site

Directory: `/gamble_site`

Chance games that exchange committed hidden outcomes for escalating risk and
reward. Chapters define the shared wager, commitment, reveal, and settlement
model; the playing Card deck; Three-Gate Wager; Tidemark Ladder Climb; Starway
Stairs; enhanced behavior; repeated rounds and cashing out; Essence costs and
payouts; Dreamsign awards and replacement; durable outcomes; and reveal
choreography.

## Part IX: Battle Setup, Participants, and Opposition

Directory: `/battle_setup`

The formation of a Battle before normal play begins: the player and opponent
packages, Dream Avatars, decks, Dreamsigns, objectives, the Dreamwell supply,
Figment availability, initial zones and resources, deterministic setup, and the
preview that establishes the coming contest. Opponent chapters define package
selection, deck coherence, difficulty, decision priorities, legal automated
actions, and the behavior that makes an opposing strategy legible.

## Part X: Battle Rules, Timing, and Resolution

Directory: `/battle_rules`

The authoritative contest model from the first playable state to its terminal
result: zones, the Battlefield, the Dreamwell, Energy, turns, timing, priority,
Card play, costs, legality, targeting, effects, triggers, counters,
repositioning, Challenges, Spark, scoring, Fatigue, created Cards, Figments,
state transitions, automatic consequences, and victory or defeat. Resolution
order, randomness, persistence, and meaningful edge cases appear beside the
rules they govern.

## Part XI: Battle Presentation, Interaction, and Outcomes

Directory: `/battle_outcomes`

The player-facing Battle experience and its return to the journey: Battlefield
composition, participant status, Cards and Dreamwell objects, selection and
targeting feedback, available-action communication, responsive layouts,
overlays, inspection, logs, tutorial guidance, announcements, motion, and
accessible interaction. Outcome chapters define result presentation, rewards,
durable Battle consequences, and the handoff into the next journey state.

## Part XII: The Tutorial Journey and Teaching Experience

Directory: `/tutorial`

The teaching path from the main menu into a guided journey: the intentional
loading primer, cinematic lesson, guided actions, tutorial Battle, transition
into the tutorial journey, first encounters with journey systems, contextual
Card guidance, and the presentation and pacing of instruction. Tutorial chapters
define how guidance is staged, timed, advanced, and adapted to the player's
current action while the primary gameplay parts remain authoritative for the
rules being taught.

## Book-Level Reference

The canonical terminology used throughout every part.

1. [Glossary](glossary.md) — Read this chapter when resolving the precise
   meaning or primary ownership of a Dreamtides term.
