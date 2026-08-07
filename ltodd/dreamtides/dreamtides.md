# Foundations of Dreamtides and Its Game Objects

This chapter defines the state and object conventions shared by Dream Journeys
and Battles. It covers identity, authored definitions, Card instances, effective
Cards, persistent state, and random state. Chapters for individual systems own
their rules and algorithms.

## Game structure

A game of Dreamtides has two nested scopes:

- A **Dream Journey** owns the player's persistent state for one run. This
  includes the selected Dream Avatar, deck, Dreamsigns, Essence, Dream Atlas
  progress, completed Sites, and modifiers that affect later Sites or Battles.
- A **Battle** is a bounded game constructed from the current journey state. It
  has its own Cards, zones, resources, turn state, and result. The result is
  applied to the journey before play continues.

The journey is the owner of state that must survive between Battles. A Battle
receives the journey data needed to initialize its participants, then maintains
Battle-local state until it reaches a terminal result. Battle-local details such
as a Card's zone, current Spark, or exhausted status do not modify the journey's
deck entry unless a rule explicitly creates a persistent change.

The two scopes use the same authored Card definitions but not the same Card
instances. A deck entry is a persistent journey object. When that entry is
included in a Battle, the Battle creates an instance with a Battle instance ID
and a reference back to the deck entry. This keeps Battle state out of the
journey deck while preserving provenance.

## Authored definitions and runtime instances

Dreamtides separates an object's definition from a particular instance of that
object.

A **definition** is authored game content. Definitions live in catalogs and have
stable IDs. A Card definition includes its type, subtype, costs, Spark, rules
text, status, and art reference. Dream Avatars, Dreamsigns, Figments, and other
authored objects follow the same rule: their IDs identify their content, not a
particular occurrence in a game.

An **instance** is one concrete object in game state. Its instance ID identifies
that occurrence. Multiple instances may use the same definition, and each may
have different state.

For example, suppose the Card definition with ID `U` appears twice in a journey
deck. The first deck entry has instance ID `E1`, and the second has instance ID
`E2`. Each entry owns its own persistent Card modifications.

Transfiguring `E1` does not modify `E2` or definition `U`. Both entries still
refer to `U`, because that is the base Card from which they started.

When a Battle is created, a participating deck entry produces a Battle Card
instance. That instance has a new ID and retains both the Card definition ID and
the source deck entry ID. A Battle rule can therefore distinguish two copies of
the same Card and trace either copy back to its persistent journey entry.

IDs, not names, define equality. Names are display text and are allowed to
collide. Code that looks up, groups, deduplicates, or compares game objects by
name is incorrect. A name should be resolved from an ID only when presentation
needs it.

Instance IDs must also be deterministic when the instance is part of durable
state. Creating an object by applying the same game action to the same prior
state must create the same ID. Local counters, clocks, and process-local random
UUIDs are not suitable sources for durable instance IDs.

## Cards

A Card definition is the stable source record for a Card. Its definition ID is a
UUID. The definition ID does not change when a particular instance is copied,
transfigured, or otherwise modified.

### Card anatomy

Every Card has the following authored properties:

- **Name.** Display text only; it is not an identifier.
- **Card type.** Either Character or Event.
- **Subtype.** A rules classification within the Card type. Characters have a
  subtype. Events may have one when a rule needs a more specific category.
- **Energy cost.** The Energy normally spent to play the Card. A Card may have
  one cost, multiple ordered cost components, or a variable `X` cost.
- **Rules text.** The Card's abilities and instructions.
- **Status.** An optional, unordered classification used by systems that need to
  distinguish groups such as Starter, Legendary, Special, or Tutorial.
- **Art and presentation metadata.** The authored image reference and crop used
  to present the Card.

Characters also have **Spark**, their power in a Challenge. Spark may be a fixed
number or a variable `X`. An absent Spark is different from a Spark of zero.
Events normally have no Spark.

Cards may also carry timing and play attributes. A Fast Card can be played at
the end of either player's turn. An Interrupt Card can also be played in
response to an opponent action; every Interrupt is therefore also Fast. An Event
may have a Reclaim cost that allows it to be played from the Void under the
Reclaim rules.

The status field is not a general rarity scale. Its values have no implied
ordering. Each system that reads a status defines the behavior attached to that
value. For example, deck construction can recognize Starter Cards while Card
presentation can give Legendary Cards a distinct frame.

### Rules language

Rules text is authored game data. It uses a shared vocabulary and a small set of
symbols:

| Symbol     | Meaning                                |
| ---------- | -------------------------------------- |
| `●`        | Energy                                 |
| `⍏` or `✦` | Spark                                  |
| `◆`        | Essence                                |
| `⍟`        | Points                                 |
| `⧗`        | Memory                                 |
| `☾`        | Exhaust as an activation cost          |
| `▸`        | The start of a named trigger condition |
| `❖`        | Fast timing                            |
| `❖❖`       | Interrupt timing                       |

Keywords, trigger labels, and symbols resolve through the shared rules glossary.
Matching is case-insensitive where ordinary prose permits it, and a glossary
entry may use the surrounding sentence and the object that owns the rules text
to select a more specific definition. For example, Reclaim with a printed Energy
value can explain that exact cost rather than showing only the general Reclaim
definition.

Rules text is interpreted as a complete block owned by a specific game object.
The owning object's definition ID supplies the semantic context. Presentation
may tokenize the text into words, symbols, and glossary terms, but tokenization
does not change the authored rules.

The Battle Rules chapter owns the behavior of Card keywords, triggers, timing,
and zones. This chapter defines only the common representation needed to carry
those rules between catalogs, journey state, Battle state, and presentation.

## Card definitions, deck entries, and effective Cards

Three related objects must not be conflated:

1. A **Card definition** is the immutable catalog record identified by its UUID.
2. A **deck entry** is one persistent Card instance in a journey deck. It has
   its own entry ID and stores persistent modifications.
3. An **effective Card** is a resolved, read-only snapshot of what a Card means
   in a particular state.

The definition is shared. The deck entry owns changes to a particular copy. The
effective Card is derived when a system needs the current rules or display
values.

Suppose a journey deck contains two instances of the same Character. One gains
+1 Spark and the other receives a Transfiguration that changes its Energy cost.
Both still have the same definition ID. Their entry IDs and effective Cards are
different.

An effective Card is produced by applying changes in a fixed order:

1. Start with the authored Card definition.
2. Apply the deck entry's Transfiguration, if any.
3. Apply persistent type and subtype changes.
4. Apply persistent keyword changes, including Fast, Energy-cost reductions, and
   Reclaim changes.
5. Apply the persistent additive Spark bonus.
6. Apply any state-local changes owned by the system requesting the snapshot.

The algorithm that defines each Transfiguration and the detailed handling of
deck modifications belong to the deckbuilding chapters. Battle-local changes
belong to the Battle Rules. Those systems extend the common resolution order;
they do not mutate the authored definition.

The resolved snapshot must contain all values the consumer needs. A Card shown
in compact form and the same Card shown in a full inspection view must use the
same snapshot. Resolving one representation from the catalog and another from
the deck entry can produce contradictory costs, types, or rules text.

Effective Cards should be replaced rather than mutated. They are derived data,
not an additional owner of state. Persistent changes remain on the deck entry,
and transient Battle changes remain on the Battle instance.

## Copying and created Cards

Copying creates a new instance, not a new base definition. A copied journey Card
retains the source Card's definition ID and receives a new deck entry ID. It
begins with the persistent modifications specified by the copy rule. Later
changes to either copy are independent.

A created Battle Card follows the same identity model:

- Its definition ID identifies the base Card it started from.
- Its instance ID identifies this specific Card in this Battle.
- If it was created from another instance, provenance may record that source,
  but the new Card is still a separate instance.

A **Figment** is a catalog-defined created Character. The Figment definition
specifies its identity, subtype, base Spark, rules, art, and any implicit
keyword. Creating the same Figment twice uses the same definition ID and two
different Battle instance IDs. The Battle may merge compatible Figment instances
for presentation or rules processing, but it must retain enough instance
information to preserve their order and state.

Every created Card must have both levels of identity. If a rule derives a Card
definition from parameters rather than selecting a catalog entry, the derived
definition still needs a stable semantic definition ID. The concrete created
Card then receives a separate instance ID. Identity-less synthetic Cards cannot
participate reliably in equality checks, inspection, diagnostics, or state
restoration.

The rules that create, copy, merge, move, or remove Battle Cards belong to the
Battle Rules chapter. Journey Duplication and other persistent copy operations
belong to the deckbuilding chapters.

## Dream Avatars

A Dream Avatar is an authored definition selected at the start of a journey. Its
definition includes:

- a stable ID, name, and title;
- rules text for its ability;
- portrait and crop information;
- starting Essence; and
- references to its signature Cards.

Signature Cards are referenced by Card definition ID. Their names may also be
stored for display, but the IDs are authoritative.

The selected Dream Avatar is part of durable journey state. It affects journey
construction and initializes the player's Battle participant. A Battle may add
temporary state such as whether the Avatar's ability has been used this turn;
that state belongs to the Battle instance, not the authored Dream Avatar.

## Dreamsigns

A Dreamsign is an authored passive effect collected during a journey. Its
definition has a stable ID, a display name, rules text, and art metadata. An
owned Dreamsign retains that ID as the authoritative reference to its
definition.

Dreamsigns can affect journey systems, Battle setup, or Battle rules. The
Dreamsign definition describes the effect, while the system that consumes the
effect owns its timing and algorithm. Capacity, acquisition, replacement, and
offer generation belong to the journey economy and Site chapters.

Dreamsign names are display text. Acquisition, removal, deduplication, and
effect lookup use definition IDs.

## Resources

Resources are scoped to the system that owns them:

- **Essence** is the journey currency. The selected Dream Avatar establishes the
  starting amount. Sites and Battle outcomes may add or spend it.
- **Energy** is spent to play Cards and activate abilities in Battle. It is
  initialized and refreshed by Battle rules.
- **Spark** is a Character value used when resolving Challenges. Authored Spark
  belongs to the Card definition; persistent and Battle-local changes produce
  the effective value.
- **Points** determine progress toward a Battle's scoring target.
- **Memory** is stored by Cards for later effects. It belongs to the relevant
  Battle Card instance.

An identical number in two scopes is not the same resource. Journey Essence is
not Battle Energy, and a Card's persistent Spark bonus is not the same state as
a temporary Spark change in Battle. Resource changes must update the object or
scope that owns them.

## Durable state and actions

A legal game action transforms one valid state into another. The rules validate
the action against the current state and either apply one complete transition or
leave the state unchanged.

State shared across the game cannot depend on presentation-local state. A Card
selection becomes gameplay state only when a durable action commits it. The same
rule applies to route choices, purchases, rewards, and Battle actions.

A transition is atomic at the rules level. Consider a Site action with the
effect “Pay 4 Essence: gain a random Character.” Applying that action must
validate the cost, spend the Essence, select the Character, create the deck
entry, advance random state, and record any prepared Site result as one
transition. It must not expose a state where the Essence was spent but the Card
was not created.

Invalid and stale actions do not partially apply. This matters when an action
refers to an instance ID: if the referenced deck entry has already been removed
or the cost can no longer be paid, the state remains unchanged.

References in durable state use IDs as their authority. A state representation
may include resolved definition fields for immediate use, but those fields do
not replace the ID for lookup or equality. Derived data such as effective Cards
can be recomputed from the catalog and instance state. A resolved random offer
or encounter becomes durable when later actions need to refer to that exact
result.

## Deterministic randomness

Consequential randomness uses `Xoshiro256PlusPlus`. Its complete 256-bit state
is part of durable game state and must be retained exactly.

A transition that consumes random values reads the current generator state,
draws values in a documented order, and stores the advanced generator state in
the same transition. Reconstructing the same prior state and applying the same
valid action therefore produces the same result and the same next generator
state.

Random draw order is part of an algorithm's contract. Adding an unrelated draw
before an existing selection changes every subsequent result. Systems should use
separate random streams when their random sequences must evolve independently,
or persist prepared results when later choices must refer to a fixed set of
outcomes. The owning system's chapter specifies its streams and draw order.

The generator state must never be all zero, because that is not a valid
`Xoshiro256PlusPlus` state. Initialization must deterministically expand the run
seed into a nonzero 256-bit state. The seed-expansion algorithm is a shared
rules contract and must remain stable for restored games and deterministic
tests.

Ambient random sources are not used for gameplay decisions. They may be used for
values with no rules meaning, but not for Card selection, offers, Atlas
generation, Battle setup, AI decisions, or instance IDs that enter durable
state.

## Rules and presentation

Rules state is independent of how it is displayed. Presentation receives
semantic objects and resolved snapshots, then chooses an appropriate layout. It
does not decide Card identity, calculate persistent modifications, draw random
outcomes, or gate a game transition.

The following boundaries apply throughout the game:

- Rules compare definition IDs or instance IDs, never display names.
- Catalogs own authored definitions; instances own mutable state.
- Effective Cards are resolved before presentation receives them.
- Compact and expanded representations of an object use the same resolved data.
- Rules text remains associated with its semantic owner so glossary definitions
  can be resolved in context.
- Presentation can collect intent, but only a durable rules action changes game
  state.

The Cumulus chapters define the standard visual and interaction treatment for
Game Cards, Rules Text, Card stat orbs, Dream Avatars, Dreamsigns, Essence, and
other game objects. Gameplay chapters define what those objects mean and which
actions are legal.

## Shared invariants

Implementations of Dreamtides systems must preserve these invariants:

1. Every authored definition has a stable definition ID.
2. Every concrete mutable Card has an instance ID distinct from its definition
   ID.
3. Card names are never used as keys or equality values.
4. Persistent Card modifications belong to one deck entry and do not mutate the
   catalog definition.
5. Effective Cards are derived in a fixed order and supplied as complete,
   read-only snapshots.
6. Created and copied Cards retain the definition ID of the base Card they
   started from and receive new instance IDs.
7. Journey state, Battle state, and authored content have explicit owners.
8. A valid durable action applies all of its consequences atomically; an invalid
   action applies none of them.
9. Gameplay randomness uses durable `Xoshiro256PlusPlus` state, and random draw
   order is part of the owning algorithm.
10. Presentation does not own or gate gameplay state.
