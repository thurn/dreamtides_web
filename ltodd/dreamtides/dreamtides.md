# Dreamtides

Dreamtides is a single-player roguelike deckbuilding game. The player builds a
deck over the course of a [**dream journey**](#a-dream-journey), then uses that
deck in a series of card-game [**battles**](#battles). Journey decisions
determine which cards and upgrades are available in later battles; battle
results determine whether the journey continues.

This chapter is an introduction to the game for new contributors. It explains
how journeys and battles fit together, introduces the main game objects, and
defines the shared conventions used by the more detailed chapters in this book.

## A dream journey

A dream journey is one complete run. It begins when the player selects a
[**dream avatar**](#dream-avatars-and-dreamsigns), the character that leads the
player's deck, and ends in victory or defeat. The main activity during a journey
is building and refining the deck that the player brings into each battle.

At the start of a journey, the player chooses one of three dream avatars. The
selected dream avatar supplies a fixed starter deck and starting
[essence](#resources-and-scope). It also influences which [cards](#cards),
rewards, and [**dreamsigns**](#dream-avatars-and-dreamsigns) can appear during
the run. Dreamsigns are passive effects collected during the journey. Once the
journey has been assembled, the player enters its first dreamscape.

The journey takes place on the **Dream Atlas**, a branching map of
**dreamscapes**. Each dreamscape contains several **sites**. Sites let the
player draft or buy cards, remove unwanted cards, modify or duplicate cards,
gain dreamsigns, collect essence, or resolve other encounters. Every dreamscape
ends with a battle that must be completed before the player can continue along
the Atlas.

The normal journey loop is:

1. Choose the next reachable dreamscape on the Dream Atlas.
2. Visit its sites to change the deck or other journey state.
3. Fight the dreamscape's battle using the resulting deck.
4. Apply the battle result and continue to the next dreamscape.

The final destination contains the journey's boss battle. Winning that battle
wins the journey. A journey normally ends in defeat when the player loses a
battle.

Journey state includes the current deck, selected dream avatar, owned
dreamsigns, essence, Atlas progress, completed sites, and effects that apply to
future sites or battles. These values persist between battles. Details of Atlas
generation, site behavior, rewards, shops, and deckbuilding belong to their
respective chapters.

## Battles

A battle is a two-player card game between the player and an automated opponent.
Each participant brings a deck and a dream avatar. Dreamsigns and other journey
effects may also change the initial battle state or apply rules throughout the
match.

Players use two main types of [cards](#cards):

- **Characters** enter play and remain there until removed. Each character has
  [**spark**](#resources-and-scope), the value used to resolve challenges
  against opposing characters.
- **Events** produce an effect when they resolve, then move to the void.

Cards are played by spending [**energy**](#resources-and-scope). Energy comes
from the shared **Dreamwell**, a deck of special cards used by both players.
Drawing from the Dreamwell increases a player's energy production and may
provide an additional effect. The Dreamwell replaces the dedicated resource
cards used by many other card games.

Characters occupy a staggered play area with front and back ranks. During each
turn, the active player positions front-rank characters as challengers and the
opponent positions characters across from them as blockers. A blocked challenge
compares the two characters' spark; an unblocked character scores
[points](#resources-and-scope) equal to its spark. The first player to reach the
battle's target number of points wins.

The battle rules chapters define turn structure, zones, timing, costs,
challenges, keywords, created cards, and victory. For this chapter, the
important boundary is that a battle is built from the current journey and has
its own temporary state. Hands, zones, current energy, counters, temporary
effects, and character positions belong to the battle. Changes to the journey
deck occur only when a journey rule explicitly makes them persistent.

When a battle ends, its result returns to the surrounding journey. A victory may
grant essence or other rewards and unlock the next Atlas choice. A defeat
normally ends the run. Battle-local state is discarded once its outcome has been
applied.

## Cards

**Cards** are the main rules objects shared by journeys and battles. A card has
a name, art, type, energy cost, and rules text. It may also have a subtype,
spark, timing properties, and an optional status.

Dreamtides has two main card types:

- A character has spark and a subtype such as warrior, guide, or spirit animal.
  Subtypes are open-ended rules tags; other cards can refer to them.
- An event has an effect that occurs when the card resolves. Events usually have
  no spark and may omit a subtype.

A card can have a fixed energy cost, a variable `X` cost, or multiple ordered
cost components. Character spark can likewise be fixed or variable. An absent
spark value is different from zero spark: events normally have no spark, while a
character with zero spark still has the stat.

Cards may be **fast** or **interrupts**, which changes when they can be played.
Every interrupt is also fast. Some events have **reclaim**, allowing them to be
played from the void. The battle rules define the exact timing and behavior of
these properties.

An optional card status identifies cards that particular systems treat
differently. Current statuses include starter, legendary, special, and tutorial.
Statuses are unordered labels, not a rarity scale. A system that uses a status
defines its meaning; for example, starter marks cards used to assemble a starter
deck. The distinction between a base card and a modified copy is described in
[Card definitions and instances](#card-definitions-and-instances).

### Rules text and symbols

Card rules text uses a shared vocabulary and symbols:

| Symbol | Meaning                       |
| ------ | ----------------------------- |
| `●`    | energy                        |
| `◆`    | essence                       |
| `✦`    | spark                         |
| `⍟`    | points                        |
| `⧗`    | counters stored by a card     |
| `☾`    | exhaust as an activation cost |
| `▸`    | a named trigger               |
| `❖`    | fast                          |
| `❖❖`   | interrupt                     |

The rules glossary defines shared keywords such as reclaim, materialize,
dissolve, and foresee. A glossary definition may depend on its surrounding text;
for example, a printed reclaim cost should be included when explaining that
instance of reclaim.

Rules text belongs to a specific game object and is interpreted as one complete
block. Presentation may replace symbols with icons and expose glossary
definitions, but it does not alter the authored rule.

## Dream avatars and dreamsigns

A dream avatar is the character that leads a deck. Its definition includes a
name, title, ability, starting essence, visual representation, and signature
cards. The player selects one dream avatar for a journey, and both participants
bring one into each battle. A dream avatar begins a battle in play rather than
being drawn from the deck.

Dream avatars connect the journey and battle layers. During journey setup, the
selected avatar determines the starter deck and influences the pools used to
generate later cards and dreamsigns. During battle, its ongoing, triggered, or
activated ability helps define the deck's strategy.

A dreamsign is a passive effect collected during a journey. Dreamsigns can
affect journey systems, battle rules, or both. Each has a stable ID, name, rules
text, and art. An acquired dreamsign remains with the journey unless a rule
replaces or removes it.

Dreamsign acquisition, capacity, and offer generation belong to the journey
economy and site chapters. The system affected by a dreamsign owns the exact
timing of its effect.

## Resources and scope

Dreamtides uses several numeric resources. Each belongs to a particular scope:

- **Essence** is the journey currency. Sites and battle rewards grant it; shops
  and other sites spend it.
- **Energy** is the resource spent to play cards and activate abilities during a
  battle. The Dreamwell increases each player's energy production.
- **Spark** is a character's power in challenges.
- **Points** measure progress toward winning a battle.
- **Counters** are stored by individual battle cards and spent or inspected by
  their rules.

These values are not interchangeable. Journey essence is not battle energy. A
persistent spark increase applied to one journey card is distinct from a
temporary spark increase applied to its battle counterpart. Implementations must
update the scope that owns the value.

## Card definitions and instances

A **card definition** is the authored base card. Its definition ID is a UUID and
does not change when a card is acquired, copied, or modified. The card's name is
display text, not identity. Names are allowed to collide, so lookup, equality,
grouping, and deduplication always use IDs.

A **card instance** is one specific card based on a definition. It has an
instance ID in addition to its definition ID. If a deck contains two copies of
the same definition, the copies have different instance IDs. A modification to
one copy does not affect the other or the base definition.

Journey deck entries are persistent card instances. When a deck entry is used in
a battle, the battle creates its own card instance and records which journey
entry it came from. This lets battle rules track each copy independently without
putting zones, counters, and temporary effects into the journey deck.

Copying a card creates a new instance with the same definition ID. Created cards
also have a definition ID identifying the base card they started from and a new
instance ID identifying the created object. Creating the same figment twice, for
example, produces two battle instances of the same figment definition.

Instance IDs that become part of game state must be reproducible from that
state. Clocks and unrelated random UUIDs cannot determine gameplay identity.

## Persistent modifications and effective cards

Journey effects can modify one deck entry without changing its base card
definition. Persistent modifications include transfigurations, type or subtype
changes, keyword changes, energy-cost reductions, reclaim changes, and spark
bonuses.

An **effective card** is the resolved version of a card in its current context.
For a journey deck entry, resolution starts from the base definition and applies
the entry's persistent modifications. A battle can then apply battle-local
changes to its own instance. Each system's detailed chapter defines the
algorithms and order for the changes it owns.

Presentation receives the complete effective card. A compact card and its full
inspection view must use the same resolved values so they cannot disagree about
cost, type, spark, or rules text. The effective card is derived data; the base
definition, journey entry, and battle instance remain the owners of state.

## Content and deterministic behavior

Cards, dream avatars, dreamsigns, figments, and other authored objects are
defined in data catalogs. Catalog IDs are the stable interface between authored
content and game systems. Rules should resolve names and visual data from those
IDs only when needed for presentation.

Consequential randomness uses `Xoshiro256PlusPlus`. Its complete state is part
of the game state so the same state and action produce the same result. Systems
must document the order in which they draw random values; changing that order
changes later results. Separate streams can be used when two systems need to
evolve independently.

Game rules determine legal actions and resulting state. Presentation displays
that state and collects player intent. It does not choose random outcomes,
identify cards by name, calculate persistent modifications, or own state needed
to continue the game.
