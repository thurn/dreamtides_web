# Living Tome of Dreamtides Design (LToDD)

This index is the authoritative reading order and ownership map for the
canonical design of Dreamtides.

## How to read this book

Choose the numbered part that matches the system you are implementing, then
choose a chapter by its scope statement. Each part shows its stable path beneath
the heading. Follow local links for prerequisites, shared rules, and deeper
systems. Chapters state the complete rules needed in their own context while
linking to the primary chapter for the full design.

## Part I: Foundations of Dreamtides

Part path: `/design`

The player promise, nested journey and Battle loops, information disclosure,
meaningful commitment, authored identity, deterministic randomness, durable
state, and the relationship between rules, presentation, and rationale. Specific
gameplay algorithms appear with the systems that use them.

## Part II: Cards and Game Objects

Part path: `/game_objects`

Cards and their identities, anatomy, types, subtypes, symbols, and rules
language; concrete deck entries and effective Cards; Dream Avatars; Dreamsigns;
resources; persistent Card modifications; and created objects. Deckbuilding
explains acquisition and deck evolution, while Battle explains how these objects
resolve during a contest.

## Part III: Draft Pools and Tides

Part path: `/draft_pools`

The curated Card supply for a journey: authored Tide membership, Tide roles,
Dream Avatar relationships, pool eligibility, pool construction, Card
multiplicity, deterministic selection, per-journey commitment, affiliation
influence, Draft offers, picks, and shared pool consumption. Authored Tides are
canonical inputs; their historical derivation from play records is outside the
book.

## Part IV: The Cumulus Language

Part path: `/cumulus`

The visual language shared by every Dreamtides experience: design philosophy,
semantic visual vocabulary, color, typography, glyphs, spacing, shape,
elevation, liquid glass, solid materials, legibility, and the distinction
between tangible game objects and review chrome. Reusable surfaces appear in
Cumulus Components, with coordinated behavior and arrangement in the following
two parts.

## Part V: The Cumulus Components

Part path: `/components`

The reusable Cumulus objects that carry information and interaction across the
game. Chapters define their semantic models, invariant appearance, variants,
local states, and standard feedback. The catalog includes controls, glass
surfaces, information reveals, dialogue, text, Cards, Dreamsigns, Dream Avatars,
Atlas objects, Site objects, Battle objects, announcements, and journey chrome.
Consequential components receive individual chapters; compact primitives may
share a family chapter.

## Part VI: Cumulus Interaction Systems

Part path: `/interaction`

Activation, press feedback, selection, focus, hover, touch-hold, entity reveals,
dismissal, dragging, reordering, keyboard and touch parity, modal behavior,
interruption, accessible communication, and reduced-motion equivalence. Gameplay
chapters provide the consequences attached to each action.

## Part VII: Cumulus Screen Composition

Part path: `/composition`

The principles that turn Cumulus objects into complete screens and continuous
flows: stages, frames, content-sized surfaces, visual hierarchy, responsive
desktop and narrow compositions, safe areas, journey chrome, overlays, layer
ordering, transitions, and screen-level motion. Gameplay chapters provide each
screen's state-dependent meaning and particular arrangement.

## Part VIII: The Dream Journey

Part path: `/journey`

The complete run from Dream Avatar selection to victory or failure: journey
assembly, durable inventory, the Dreamscape-Site-Battle-Atlas loop, screen
progression, Site and Battle handoffs, persistent and temporary modifiers,
journey inspection, completion depth, terminal outcomes, and starting again.
Atlas describes route topology, while destination parts describe the activities
entered along the way.

## Part IX: The Dream Atlas

Part path: `/atlas`

The world map, the Dreamscapes it reveals, and the route a journey takes through
them. Topics include graph structure, layers, node generation, revelation,
reachability, route commitment, known Dreamsigns, Dreamscape selection, repeat
avoidance, Dream Guides, affiliations, signature Site enhancement, Site
composition, local Dreamscape navigation, the final boss destination, and map
presentation. Destination mechanics begin when the player enters a Site.

## Part X: Building the Deck

Part path: `/deckbuilding`

The player's concrete deck and its evolution throughout a journey: the starting
deck, acquisition, entry identity, duplicate handling, effective-Card
resolution, Purge, Duplication, Transfiguration, type and keyword changes,
temporary and permanent modifications, and deck inspection. Draft Pools provides
the supply for Draft offers; Economy provides prices and shared reward
valuation.

## Part XI: The Journey Economy

Part path: `/economy`

The flow of value through a journey: Essence, sources and sinks, prices,
discounts, rerolls, Battle payouts, reward selection policies, deck-fit
evaluation, Dreamsign capacity economics, and modifiers that alter later rewards
or costs. Sites describes the player-facing transaction at each destination.

## Part XII: The Site System

Part path: `/sites`

The shared destination contract and the Site experiences that do not require
their own parts. Content includes Site availability, entry, prepared randomness,
enhancement, completion, return to the Dreamscape, Guide hosting, inline
rewards, Card and Dreamsign markets, Dreamsign Revelation, Purge,
Transfiguration, Duplication, Random Site, and the handoffs into Draft, Augury,
Exploration, Gamble, and Battle. The specialized parts continue from those
handoffs.

## Part XIII: The Augury Site

Part path: `/augury`

The adaptive vision in which the player chooses between two rewards shaped by
the current journey. Chapters address the journey snapshot used for evaluation,
offer families, eligibility, candidate scoring, distinct-family pairing, target
selection, acceptance, decline, dialogue, persistent outcomes, and the symbolic
two-offer presentation. The accepted operations draw their underlying rules from
Game Objects, Deckbuilding, Economy, and Sites.

## Part XIV: The Exploration Site

Part path: `/exploration`

Authored, art-led encounters that turn narrative choices into replayable journey
consequences. Content includes encounter selection, scene art and prose, the
two-action authoring contract, prepared choices, target-selection policies,
effect families, future Site and Battle modifiers, atomic resolution, persisted
responses and outcomes, and transition and reward choreography. The accompanying
encounter catalog supplies the individual scenes and actions.

## Part XV: The Gamble Site

Part path: `/gamble`

Chance games that exchange committed hidden outcomes for escalating risk and
reward. Chapters describe the shared wager, commitment, reveal, and settlement
model; the playing Card deck; Three-Gate Wager; Tidemark Ladder Climb; Starway
Stairs; enhanced behavior; repeated rounds and cashing out; Essence costs and
payouts; Dreamsign awards and replacement; durable outcomes; and reveal
choreography.

## Part XVI: The Battle System

Part path: `/battle`

The creation, presentation, play, and resolution of a Battle: participant setup,
opposing packages, objectives, zones, the Battlefield, the Dreamwell, Energy,
turns, timing, priority, Card play, costs, targeting, effects, triggers,
counters, repositioning, Challenges, Spark, scoring, Fatigue, created Cards,
Figments, Battle interaction, results, rewards, and the journey handoff.

## Part XVII: The Dreamtides Tutorial

Part path: `/tutorial`

The teaching path from the main menu into a guided journey: the intentional
loading primer, cinematic lesson, guided actions, tutorial Battle, transition
into the tutorial journey, first encounters with journey systems, contextual
Card guidance, and the presentation and pacing of instruction. Primary gameplay
chapters remain authoritative for the rules being taught.

## Book-Level Reference

The canonical terminology used throughout every part.

1. [Glossary](glossary.md) — Read this chapter when resolving the precise
   meaning or primary ownership of a Dreamtides term.
