# Dreamtides

Dreamtides is a single-player roguelike deckbuilding game. The player builds a
deck over the course of a **Dream Journey**, then uses that deck in a series of
card-game **Battles**. Journey decisions determine which Cards and upgrades are
available in later Battles; Battle results determine whether the journey
continues.

This chapter is an introduction to the game for new contributors. It explains
how journeys and Battles fit together, introduces the main game objects, and
defines the shared conventions used by the more detailed chapters in this book.

## A Dream Journey

A Dream Journey is one complete run, from Dream Avatar selection to victory or
defeat. The main activity during a journey is building and refining the deck
that the player brings into each Battle.

At the start of a journey, the player chooses one of three **Dream Avatars**.
The selected Dream Avatar supplies a fixed starter deck and starting Essence. It
also influences the Cards, Dreamsigns, and rewards that can appear during the
run. Once the journey has been assembled, the player enters its first
dreamscape.

The journey takes place on the **Dream Atlas**, a branching map of
**dreamscapes**. Each dreamscape contains several **Sites**. Sites let the
player draft or buy Cards, remove unwanted Cards, modify or duplicate Cards,
gain Dreamsigns, collect Essence, or resolve other encounters. Every dreamscape
ends with a Battle that must be completed before the player can continue along
the Atlas.

The normal journey loop is:

1. Choose the next reachable dreamscape on the Dream Atlas.
2. Visit its Sites to change the deck or other journey state.
3. Fight the dreamscape's Battle using the resulting deck.
4. Apply the Battle result and continue to the next dreamscape.

The final destination contains the journey's boss Battle. Winning that Battle
wins the journey. A journey normally ends in defeat when the player loses a
Battle.

Journey state includes the current deck, selected Dream Avatar, owned
Dreamsigns, Essence, Atlas progress, completed Sites, and effects that apply to
future Sites or Battles. These values persist between Battles. Details of Atlas
generation, Site behavior, rewards, shops, and deckbuilding belong to their
respective chapters.

## Battles

A Battle is a two-player card game between the player and an automated opponent.
Each participant brings a deck and a Dream Avatar. Dreamsigns and other journey
effects may also change the initial Battle state or apply rules throughout the
match.

Players use **Character** and **Event** Cards:

- Characters enter play and remain there until removed. Each Character has
  **Spark**, the value used to resolve Challenges against opposing Characters.
- Events produce an effect when they resolve, then move to the Void.

Cards are played by spending **Energy**. Energy comes from the shared
**Dreamwell**, a deck of special Cards used by both players. Drawing from the
Dreamwell increases a player's Energy production and may provide an additional
effect. The Dreamwell replaces the dedicated resource Cards used by many other
card games.

Characters occupy a staggered play area with front and back ranks. During each
turn, the active player positions front-rank Characters as challengers and the
opponent positions Characters across from them as blockers. A blocked Challenge
compares the two Characters' Spark; an unblocked Character scores Points equal
to its Spark. The first player to reach the Battle's target number of Points
wins.

The Battle Rules chapters define turn structure, zones, timing, costs,
Challenges, keywords, created Cards, and victory. For this chapter, the
important boundary is that a Battle is built from the current journey and has
its own temporary state. Hands, zones, current Energy, counters, temporary
effects, and Character positions belong to the Battle. Changes to the journey
deck occur only when a journey rule explicitly makes them persistent.

When a Battle ends, its result returns to the surrounding journey. A victory may
grant Essence or other rewards and unlock the next Atlas choice. A defeat
normally ends the run. Battle-local state is discarded once its outcome has been
applied.

## Cards

Cards are the main rules objects shared by journeys and Battles. A Card has a
name, art, type, Energy cost, and rules text. It may also have a subtype, Spark,
timing properties, and an optional status.

Dreamtides has two main Card types:

- A **Character** has Spark and a subtype such as Warrior, Guide, or Spirit
  Animal. Subtypes are open-ended rules tags; other Cards can refer to them.
- An **Event** has an effect that occurs when the Card resolves. Events usually
  have no Spark and may omit a subtype.

A Card can have a fixed Energy cost, a variable `X` cost, or multiple ordered
cost components. Character Spark can likewise be fixed or variable. An absent
Spark value is different from zero Spark: Events normally have no Spark, while a
Character with zero Spark still has the stat.

Cards may be **Fast** or **Interrupts**, which changes when they can be played.
Every Interrupt is also Fast. Some Events have **Reclaim**, allowing them to be
played from the Void. The Battle Rules define the exact timing and behavior of
these properties.

An optional Card status identifies Cards that particular systems treat
differently. Current statuses include Starter, Legendary, Special, and Tutorial.
Statuses are unordered labels, not a rarity scale. A system that uses a status
defines its meaning; for example, Starter marks Cards used to assemble a starter
deck.

### Rules text and symbols

Card rules text uses a shared vocabulary and symbols:

| Symbol | Meaning                       |
| ------ | ----------------------------- |
| `●`    | Energy                        |
| `✦`    | Spark                         |
| `⍟`    | Points                        |
| `⧗`    | Counters stored by a Card     |
| `☾`    | Exhaust as an activation cost |
| `▸`    | A named trigger               |
| `❖`    | Fast                          |
| `❖❖`   | Interrupt                     |

Essence uses `◆` when it appears in rules or reward text. The rules glossary
defines shared keywords such as Reclaim, Materialize, Dissolve, and Foresee. A
glossary definition may depend on its surrounding text; for example, a printed
Reclaim cost should be included when explaining that instance of Reclaim.

Rules text belongs to a specific game object and is interpreted as one complete
block. Presentation may replace symbols with icons and expose glossary
definitions, but it does not alter the authored rule.

## Dream Avatars and Dreamsigns

A **Dream Avatar** is the character that leads a deck. Its definition includes a
name, title, ability, starting Essence, visual representation, and signature
Cards. The player selects one Dream Avatar for a journey, and both participants
bring one into each Battle. A Dream Avatar begins a Battle in play rather than
being drawn from the deck.

Dream Avatars connect the journey and Battle layers. During journey setup, the
selected Avatar determines the starter deck and influences the pools used to
generate later Cards and Dreamsigns. During Battle, its ongoing, triggered, or
activated ability helps define the deck's strategy.

A **Dreamsign** is a passive effect collected during a journey. Dreamsigns can
affect journey systems, Battle rules, or both. Each has a stable ID, name, rules
text, and art. An acquired Dreamsign remains with the journey unless a rule
replaces or removes it.

Dreamsign acquisition, capacity, and offer generation belong to the journey
economy and Site chapters. The system affected by a Dreamsign owns the exact
timing of its effect.

## Resources and scope

Dreamtides uses several numeric resources. Each belongs to a particular scope:

- **Essence** is the journey currency. Sites and Battle rewards grant it; shops
  and other Sites spend it.
- **Energy** is the resource spent to play Cards and activate abilities during a
  Battle. The Dreamwell increases each player's Energy production.
- **Spark** is a Character's power in Challenges.
- **Points** measure progress toward winning a Battle.
- **Counters** are stored by individual Battle Cards and spent or inspected by
  their rules.

These values are not interchangeable. Journey Essence is not Battle Energy. A
persistent Spark increase applied to one journey Card is distinct from a
temporary Spark increase applied to its Battle counterpart. Implementations must
update the scope that owns the value.

## Card definitions and instances

The remaining sections define technical conventions shared by systems that
create, modify, or display Cards.

A **Card definition** is the authored base Card. Its definition ID is a UUID and
does not change when a Card is acquired, copied, or modified. The Card's name is
display text, not identity. Names are allowed to collide, so lookup, equality,
grouping, and deduplication always use IDs.

A **Card instance** is one specific Card based on a definition. It has an
instance ID in addition to its definition ID. If a deck contains two copies of
the same definition, the copies have different instance IDs. A modification to
one copy does not affect the other or the base definition.

Journey deck entries are persistent Card instances. When a deck entry is used in
a Battle, the Battle creates its own Card instance and records which journey
entry it came from. This lets Battle rules track each copy independently without
putting zones, counters, and temporary effects into the journey deck.

Copying a Card creates a new instance with the same definition ID. Created Cards
also have a definition ID identifying the base Card they started from and a new
instance ID identifying the created object. Creating the same Figment twice, for
example, produces two Battle instances of the same Figment definition.

Instance IDs that become part of game state must be reproducible from that
state. Clocks and unrelated random UUIDs cannot determine gameplay identity.

## Persistent modifications and effective Cards

Journey effects can modify one deck entry without changing its base Card
definition. Persistent modifications include Transfigurations, type or subtype
changes, keyword changes, Energy-cost reductions, Reclaim changes, and Spark
bonuses.

An **effective Card** is the resolved version of a Card in its current context.
For a journey deck entry, resolution starts from the base definition and applies
the entry's persistent modifications. A Battle can then apply Battle-local
changes to its own instance. Each system's detailed chapter defines the
algorithms and order for the changes it owns.

Presentation receives the complete effective Card. A compact Card and its full
inspection view must use the same resolved values so they cannot disagree about
cost, type, Spark, or rules text. The effective Card is derived data; the base
definition, journey entry, and Battle instance remain the owners of state.

## Content and deterministic behavior

Cards, Dream Avatars, Dreamsigns, Figments, and other authored objects are
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
identify Cards by name, calculate persistent modifications, or own state needed
to continue the game.
