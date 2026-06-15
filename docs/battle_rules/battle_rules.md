# Dreamtides Battle Rules

Dreamtides is a two-player card game in the tradition of collectible card games
like Magic: The Gathering. Players build decks of character and event cards,
then compete to score victory points by resolving challenges across a staggered
play area. Two features distinguish it from traditional card games: the shared
Dreamwell system replaces lands for energy production, and challenges are
resolved positionally — at the end of each turn the active player's front-rank
characters become challengers, the opposing player's front-rank characters
opposite them become defenders, and each pairing is resolved by comparing
spark.

This document describes the complete design of the game and is the authoritative
reference for reading any card definition.

## Table of Contents

- [Symbols and Notation](#symbols-and-notation)
- [Objective](#objective)
- [Card Types](#card-types)
- [Zones](#zones)
- [The Dreamwell and Energy](#the-dreamwell-and-energy)
- [The Play Area](#the-play-area)
- [Turn Structure](#turn-structure)
- [Exhaust and Awaken](#exhaust-and-awaken)
- [Challengers, Defenders, and Scoring](#challengers-defenders-and-scoring)
- [Spark](#spark)
- [Playing Cards and the Stack](#playing-cards-and-the-stack)
- [Costs, Requirements, and X](#costs-requirements-and-x)
- [Targeting](#targeting)
- [Keywords and Effects](#keywords-and-effects)
- [Ability Types](#ability-types)
- [Counters](#counters)
- [Zone Changes](#zone-changes)
- [Created Cards](#created-cards)
- [Figments](#figments)

## Symbols and Notation

Card text uses symbols in place of words wherever possible — for example, text
reads "✦" rather than "spark". The symbols are:

- **●** — Energy
- **⧗** — Counters
- **⍟** — Victory points
- **☪** — Exhaust (an exhaust cost, or the act of exhausting)
- **✦** — Spark
- **❖** — Fast
- **❖❖** — Interrupt
- **–** — Marker preceding a keyword such as Reclaim or Support
- **▸** — Marker preceding a named trigger such as ▸Dawn or ▸Challenge

The terms "ally" and "allied" describe a character you control: "an ally" is a
character you control, "an allied warrior" is a warrior you control, and
multiples are written "allied characters" or "allied warriors". Conditions are
phrased with "with", as in "With 3 allied warriors, draw a card." Card text does
not use the word "control" to describe ownership.

The play area is referred to in card text simply as being "in play". A
character's board position is described in terms of its front-rank or back-rank
designation rather than named slots.

## Objective

The first player to reach the victory point threshold wins the battle. The
default threshold is **25⍟**. Most points are scored during the Challenge phase,
when an unpaired challenger scores victory points equal to its spark. If 50
turns pass without a winner, the battle ends in a draw.

## Card Types

**Character** — Permanent cards that enter play when they resolve. Each
character has a spark value (✦) used during the Challenge phase, and a subtype
(Warrior, Spirit Animal, Survivor, Outsider, and so on) that other cards can
reference. Subtypes are an open-ended set of tribal tags. Characters can have
triggered, activated, and static abilities. A character entering play is
**exhausted** unless it is **awakened**, so it cannot challenge, defend, or pay
☪ costs on the turn it is played. Characters remain in play until removed by an
effect (Dissolve, Banish, or Abandon) or dissolved in a challenge. Characters
may be marked Fast (❖) or Interrupt (❖❖), controlling when they can be played
outside the Day phase.

**Event** — One-shot cards that produce an effect when they resolve, then move
to the void. Events can also be marked Fast (❖) or Interrupt (❖❖).

**Dreamcaller** — A player's identity card, an animated 3D character that starts
each battle already in play. Dreamcallers provide powerful ongoing abilities
(static, triggered, or activated) that define a player's playstyle.

**Dreamsign** — A card representing a 2D illustrated object that provides
ongoing effects, typically triggered or static. Active throughout the battle.

**Dreamwell** — Special shared cards drawn during the Dreamwell phase. Not part
of either player's deck. They produce energy and usually carry a bonus effect
for the player who drew them.

## Zones

**Deck** — A player's shuffled draw pile. Cards are drawn from the top during
the Draw phase and by card effects.

**Hand** — Cards held by a player, hidden from the opponent. A hand may hold any
number of cards during the turn, but the player discards down to 10 during the
Ending phase.

**Stack** — A temporary zone for cards that have been played but not yet
resolved. While a card is on the stack, an opponent may respond with Interrupts.
Characters move into play when they resolve; events move to the void.

**In Play** — Where characters reside, in the staggered play area described in
[The Play Area](#the-play-area).

**Void** — The discard pile. Events go here after resolving; characters go here
when dissolved or abandoned. Some cards interact with the void (notably via
Reclaim).

**Banished** — A permanent exile zone. Cards sent here do not return under normal
circumstances.

## The Dreamwell and Energy

Energy (●) is the resource used to play cards. Dreamtides uses the Dreamwell — a
shared deck of special cards that both players draw from, one per turn — in place
of land cards.

- During each player's Dreamwell phase, the next Dreamwell card is drawn
  automatically (no player choice involved).
- Each Dreamwell card has an energy production value that permanently increases
  the player's **maximum ●** (their energy production).
- At the start of each turn, current ● resets to equal maximum ●. After the
  Dreamwell card is drawn, current ● updates to match the new maximum. Unspent
  current ● does not carry between turns.
- Many Dreamwell cards also carry a bonus effect such as drawing a card, using
  Foresee, gaining a point, gaining extra current ●, or eroding cards.

**Maximum ● and current ●:** Maximum ● is the per-turn production that current ●
resets to each turn; it is raised permanently by Dreamwell cards and by effects
such as "Gain 1 maximum ●". Current ● is the pool you spend right now; effects
such as "Gain 2●" or "Double your current ●" change only the current pool for
this turn.

**Dreamwell numbers and cycling:**

- Dreamwell cards carry order numbers 0–4 that set their position in the deck:
  all #1 cards are shuffled together and placed above the shuffled #2 cards, and
  so on.
- #0 cards appear only during the first cycle through the deck, typically
  providing a larger early energy boost. These are the starting cards for each
  player.
- When the deck cycles, it is reshuffled within numeric groups so that
  lower-numbered cards always come first within a cycle while cards of the same
  number remain randomized.

## The Play Area

Each player has a staggered play area with a **front rank** of 4 positions
(`F0`–`F3`) and a **back rank** of 5 positions (`B0`–`B4`), for 9 total
positions. A player can have at most 9 characters in play.

Because the grid is staggered, a back-rank position sits behind one or two
front-rank positions:

- `B0` supports `F0`
- `B1` supports `F0` and `F1`
- `B2` supports `F1` and `F2`
- `B3` supports `F2` and `F3`
- `B4` supports `F3`

Equivalently, `F0` is supported by `B0`/`B1`, `F1` by `B1`/`B2`, `F2` by
`B2`/`B3`, and `F3` by `B3`/`B4`. A back-rank character with the Support keyword
benefits the up-to-two front-rank characters in the positions it supports (see
[Support](#keywords-and-effects)).

**Front rank and the back rank:** Only front-rank characters participate
directly in the Challenge phase, as challengers or defenders. Back-rank
characters are safe during the Challenge phase — they do not challenge, defend,
or score, though their abilities (such as Support) can still affect front-rank
characters.

**Repositioning:** Repositioning means moving a character between any of the 9
positions. Moving a character onto an occupied position swaps the two
characters. The active player repositions during their Day phase; the opposing
player repositions during the Dusk phase. An **exhausted character cannot be
moved to the front rank** by either player.

**Materializing:** A character entering play is placed in the back rank, in the
exhausted state, and requires an open position. If all positions are full, no
further characters can be materialized until a position is freed. (A figment
materializing into an existing same-type stack joins that stack and does not
require a new position; see [Figments](#figments).)

## Turn Structure

Each turn progresses through these eight phases in order. The five main phases —
Dawn, Day, Dusk, Night, and Challenge — are surfaced in the UI; Dreamwell, Draw,
and Ending run as automatic bookends.

1. **Dreamwell** — The active player draws the next Dreamwell card, permanently
   increasing their maximum ●. Current ● then resets to the new maximum. Any
   bonus effect on the card is applied. Auto-advances.
2. **Draw** — The active player draws one card. (Skipped on the very first turn
   of the battle.) Auto-advances.
3. **Dawn** — The active player's exhausted characters lose the exhausted
   status. Then ▸Dawn triggered abilities fire and resolve. Auto-advances when
   the stack is empty.
4. **Day** — The active player plays cards, repositions characters, and
   activates abilities. By the end of the Day phase the active player has
   positioned the characters they want as challengers in the front rank. The
   opposing player may respond with Interrupts. The active player explicitly
   passes to end this phase. **At the end of Day, the active player's front-rank
   characters become challengers.**
5. **Dusk** — The active player's ▸Dusk triggered abilities fire and resolve.
   The opposing player may reposition their own characters (subject to the rule
   that exhausted characters cannot be moved to the front rank), play Fast cards,
   and activate Fast abilities — this is their window to position defenders
   opposite the active player's challengers after seeing them. The opposing
   player explicitly passes to end this phase. **At the end of Dusk, each
   opposing front-rank character directly opposite a challenger becomes a
   defender, and that challenger becomes defended.**
6. **Night** — ▸Night triggered abilities fire for the active player, and
   ▸Challenge triggered abilities fire for each of the active player's
   challengers. The active player may play Fast cards and activate Fast
   abilities, but may not reposition characters. The active player explicitly
   passes to end this phase. Effects during Night can change positions, which
   can change challenger and defender designations.
7. **Challenge** — Each front-rank lane (`F0` through `F3`) is resolved in turn
   (see [Challengers, Defenders, and Scoring](#challengers-defenders-and-scoring)).
   No cards may be played during this phase, though triggered and static
   abilities still function and can modify spark.
8. **Ending** — If the active player has more than 10 cards in hand, they
   discard down to 10. Cards with the relevant end-of-turn statuses (Ephemeral,
   Offering) are banished. Auto-advances when the stack is empty, after which the
   turn passes to the opponent.

**Battle start:** Each player draws 5 cards as their opening hand. The first
player's first turn skips the Draw phase.

## Exhaust and Awaken

The **exhausted** status marks a character that cannot challenge, defend, or
activate abilities with ☪ costs. The status persists until the start of the
character's controller's next turn, when it is cleared during the Dawn phase.

- Characters enter play exhausted and therefore cannot challenge, defend, or pay
  ☪ costs on the turn they are played.
- An **awakened** character enters play without the exhausted status. Awaken can
  also be applied as an effect — for example "2●: Awaken an ally" clears the
  exhausted status, allowing that character to challenge, defend, and pay ☪
  costs.
- A character can be exhausted by an effect — for example "2●: Exhaust an
  enemy".
- Paying a ☪ cost exhausts that character.

Because an exhausted character cannot be moved to the front rank, exhausting a
character keeps it from challenging or defending. As a convenience, when a front-rank character
pays a ☪ cost it is automatically moved to an available back-rank position so
that it does not remain a potential challenger or defender. If there is no
available back-rank position (and no front-rank position to swap into), the
character cannot pay the ☪ cost.

## Challengers, Defenders, and Scoring

**Challengers** are the active player's front-rank characters as of the end of
their Day phase. **Defenders** are the opposing player's front-rank characters
directly opposite a challenger as of the end of the Dusk phase. Repositioning
during the Night phase can change which characters hold these designations.

A character "scores ⍟" when it converts its spark into victory points — that is,
when an unpaired challenger scores during the Challenge phase, or when an
Unstoppable character scores after winning a challenge. This is the event that
abilities reading "When an allied X scores ⍟" respond to. By contrast, a flat
"gain N⍟" effect (such as an Abandon-for-points ability, or Fatigue) awards
victory points to a player without any character scoring, and does not count as
a character scoring.

**Challenge phase resolution:** Each front-rank lane (`F0` through `F3`) is
resolved in turn:

- **Defended challenger:** Compare the spark of the challenger and its defender.
  The character with lower spark is dissolved. If both have equal spark, both are
  dissolved (unless one has Preeminence; see [Keywords](#keywords-and-effects)).
  A defended challenger does not score unless it has Unstoppable. ▸Dissolved
  triggers fire after each lane is resolved.
- **Unpaired challenger:** The challenger scores victory points equal to its
  spark for the active player.
- **Only the opposing player has a front-rank character in the lane:** Nothing
  happens in that lane.

After the Challenge phase, surviving characters remain in their positions until
repositioned or removed.

## Spark

Spark (✦) is a character's power in challenges. Characters have no health or
toughness; spark is their only stat. When an effect modifies a character's
spark — including Support effects from other characters — that effective spark is
what challenges, scoring, and other rules use.

Spark can change in three distinct ways:

- **Gained spark** is a permanent increase, as in "1●: This character gains
  +1✦". Gained spark is not reset when the character leaves play: a character
  replayed from the void or returned to hand keeps spark it gained while in play.
- **Gained spark with a duration**, such as "gains +1✦ this turn", is removed
  when the duration expires, regardless of which zone the character is in at that
  time.
- **Spark a character _has_** from a static ability, such as "Allied warriors
  have +1✦", persists only while that static ability applies. It does not carry
  across zones the way gained spark does.

## Playing Cards and the Stack

To play a card, the controlling player must be able to pay its costs (see
[Costs, Requirements, and X](#costs-requirements-and-x)). Playing a card pays
its costs, moves it to the stack, fires "played card" triggers, and gives the
opponent priority to respond.

**Timing categories** apply identically to cards and to activated abilities:

- **Standard** cards and abilities can be played by the active player during
  their Day phase, only when the stack is empty.
- **Fast** (❖) cards and abilities can be played during a Fast window available
  to their controller: the active player during their Day and Night phases, and
  the opposing player during the Dusk phase. Fast cards and abilities can only be
  played when the stack is empty.
- **Interrupt** (❖❖) cards and abilities are a subtype of Fast — they count as
  Fast for all rules purposes, so they can be played any time a Fast card could
  be. In addition, an Interrupt can be played **in response** to the opponent
  playing a card or activating an ability. Because of this, an Interrupt can be
  played during the opponent's Day or Night phase, but only as a response to
  something — it cannot be played in those phases while the stack is empty.

**Only Interrupts can be played while the stack is non-empty.** Standard and Fast
cards and abilities require the stack to be empty at the moment they are played.

**Stack resolution:** Cards on the stack resolve last-in, first-out. An event
resolves by applying its effect and moving to the void; a character resolves by
entering play. After a card resolves, if the stack is not empty its controller
receives priority. **Triggered abilities cannot be responded to** — they resolve
immediately when their trigger condition is met.

## Costs, Requirements, and X

**Additional costs** are extra costs required to play a card, written as "To play
this event, do X." The card cannot be played unless the additional cost is paid.

**Optional additional costs** are written as "You may X to play this event",
paired with "If the additional cost was paid, do Y."

**Requirements** are written as "Play this event only if X." A card with a
requirement cannot be played unless the requirement is met.

**When costs are paid:** All costs are paid before the card is put on the stack,
so they are paid even if the card is later prevented. Costs are paid by the act
of playing the card; if a card is copied, the copy does not require the cost to
be paid again.

**X costs:** When a card or ability has an X cost, the player picks the value of
X as it is played. Whether 0 is a legal choice for X is contextual and not
printed on the card — generally, if choosing 0 would not make sense, it is not
allowed. For example, a character with X cost and X spark cannot be played for 0
just to make it immediately dissolve, and an event cannot generally be played for
no effect merely to increase a card count. A card written with two costs, such as
"2 X", requires paying 2● first and then X●.

## Targeting

Effects choose targets using ownership and type predicates. Ownership predicates
include allies (characters you control), enemies (characters the opponent
controls), any card, or another card (not the source). Type predicates include
character, event, a specific subtype, characters with a minimum spark, or cards
with a specific energy cost.

**Targets are chosen before costs are paid.** Because of this, a character used
to pay a cost cannot also be chosen as the target of the same ability — for
example, "Abandon a character: Return a character from your void to hand" cannot
target the character abandoned to pay the cost (that character is in the void,
not in play, by the time the effect chooses among in-play characters; and the
abandoned character was selected as a cost, not a target).

When an effect targets a [figment](#figments) stack, it affects the stack's
**topmost** figment — the single active figment. The reserve figments beneath it
cannot be chosen or affected. Spark-threshold targeting reads the topmost
figment's spark, not the stack's displayed total.

## Keywords and Effects

**Dissolve** — Move a target character from play to the void.

**Banish** — Permanently remove a card by sending it to the Banished zone.
Variants include banish from play, banish from the void, banish until the
banishing card leaves play, and banish until the next Day phase.

**Materialize** — Put a character into play. This covers a character entering
play from hand (played normally), from the void, from the deck, as a created
figment, or returned "to play" by an effect. A materialized character enters the
back rank exhausted (unless awakened) and requires an open position.
Materializing fires the character's ▸Materialized trigger and any "When you
materialize" triggers. Putting a character directly into play (for example
"return to play" or "materialize from your void") is not "playing" it: it costs
no energy, does not use the stack, cannot be Prevented, and does not fire "when
you play" triggers.

**Rematerialize** — Trigger an in-play character's materialization again, firing
its ▸Materialized trigger and any "When you materialize" triggers.

**Phasing** — ▸Materialized: Return another ally to hand, then move this
character to that ally's position. Phasing is resolved through the normal
return-to-hand and repositioning tools.

**Awakened** — A character with this keyword enters play without the exhausted
status. See [Exhaust and Awaken](#exhaust-and-awaken).

**Support** — A back-rank character with Support provides a benefit to the
front-rank characters in the positions it supports (up to two). Support has no
effect on its own; the keyword text states the benefit, such as "Support –
Supported allies have +1✦." Support is a non-figment mechanic: a [figment](#figments)
neither grants Support to allies nor benefits from an ally's Support.

**Veil N●** — While a character has Veil, it costs the opponent N additional ●
to choose it as a target with an event, activated ability, or triggered ability.
The Veil cost is paid by the opponent at the moment the veiled character is
chosen as a target; if the opponent cannot pay it, the character cannot be
chosen. The controller does not pay to target their own veiled character.

**Reclaim** / **Reclaim N●** — A card with Reclaim may be played from the void
instead of from hand. With plain Reclaim it is played for its normal ● cost; with
"Reclaim N●" it is played from the void for N●. A card played this way becomes
**reclaimed**: when a reclaimed card would leave play, it is banished instead.
The reclaimed status replaces all other zone changes for that card (for example,
an effect that would banish and then materialize a reclaimed character does not
bring it back). A reclaimed character does not fire ▸Dissolved triggers when it
is dissolved, because the move to the void is replaced by banishment. Some
abilities, such as "Cards you reclaim are not banished when they leave play,"
remove the reclaimed status.

**Erode N** — Put the top N cards of your deck into your void; those cards are
the **eroded** cards. Erode can also be directed at a player, as in "The opponent
erodes 2." Eroding with an empty deck causes Fatigue.

**Fatigue** — If a player would draw from an empty deck, or erode from an empty
deck, they suffer Fatigue instead. For each card they would have drawn or eroded,
the opponent gains an increasing number of victory points, doubling each time:
1⍟, then 2⍟, then 4⍟, and so on.

**Offering** — A card with Offering may be played for 0● by banishing a card from
your hand; if played this way, the card is banished at the end of the turn. For a
character, it stays in play for the current turn and is then banished; for an
event, it is banished from the void at the end of the turn. The Offering status
persists across zones, so banishing the card and materializing it, or returning
it to hand and replaying it, does not prevent the end-of-turn banishment. Other
costs (such as "To play this card, …") must still be paid; if the card's cost
includes X, X is 0.

**Ephemeral** — A card drawn with Ephemeral is banished at the end of the turn if
it is still in hand, so it must be played the turn it is drawn.

**Unstoppable** — When this character wins a challenge against an opposing enemy
character, it scores ⍟ equal to its spark. (A defended challenger with
Unstoppable resolves the spark comparison as normal and also scores if it
survives.)

**Vengeful** — When this character loses a challenge, it dissolves the opposing
enemy character. In effect both characters in the challenge are dissolved.

**Preeminence** — This character wins spark ties in a challenge. If both
characters in a challenge have Preeminence, both are dissolved as normal.

**Prevent** — Counter a card on the stack, sending it to the void without
resolving. Prevent effects are always Interrupts. Variants include conditional
forms such as "Prevent an event unless the opponent pays 2●."

**Abandon** — Move one of your own characters from play to the void. Abandon
cannot be prevented and targets only your own characters, and it fires the
character's ▸Dissolved trigger. It is frequently used as a cost. When abandoning
a figment stack, the topmost figment is abandoned.

**Foresee N** — Look at the top N cards of your deck, reorder them in any order,
and optionally send any of them to the void.

**Discover** — Look at 3 cards from your deck matching a stated criterion, then
add one of them to your hand.

**Copy** — Create a duplicate of a card or effect. Variants include copying a
character in play and copying the next card played.

**Gain control** — Take control of an opponent's character, moving it to your
side of play.

## Ability Types

**Event abilities** — Effects printed on event cards. They resolve when the event
resolves from the stack, then the event moves to the void.

**Triggered abilities** — Abilities that fire automatically when a game event
occurs. The named (▸) triggers are:

- **▸Materialized** — fires when the character enters play.
- **▸Dawn** — fires during the controller's Dawn phase, after the exhausted
  status is cleared.
- **▸Dusk** — fires during the controller's Dusk phase.
- **▸Night** — fires at the start of the controller's Night phase.
- **▸Challenge** — fires at the start of the controller's Night phase if the
  character with this ability is a challenger.
- **▸Dissolved** — fires when the character is dissolved.

Triggered abilities can also use descriptive conditions such as "When you play a
card" or "When you materialize a character". A character played from hand can
satisfy both "when you play" and ▸Materialized triggers, while a character put
directly into play satisfies only ▸Materialized. Combined triggers such as
"▸Materialized, ▸Dawn" fire on both occasions. Triggered abilities cannot be
responded to; they resolve immediately.

**Activated abilities** — Abilities with a cost the controller chooses to pay,
written as "Cost: Effect" (for example "2●: Draw a card" or "1⧗, ☪: Draw a
card"). They can be used any number of times per turn unless "Once per turn"
appears. Activated abilities use the same timing categories as cards: standard
abilities are Day-only while the stack is empty, Fast abilities follow Fast
timing, and Interrupt abilities follow Interrupt timing.

**Static abilities** — Always-on rule modifications that apply while their source
is in play, such as cost reductions, spark bonuses for matching characters, or
other rule changes.

**Modal abilities** — Abilities that present multiple options, written as "Choose
one:" followed by the available effects (each with its own cost where relevant).

## Counters

Cards use counters (⧗) to track internal state.

- A card can **store** counters to increase its count, as in "When you discard a
  card, store 1⧗."
- Counters are local to a card; each card has its own counter value.
- Stored counters can be spent to pay costs, as in "1⧗, ☪: Draw a card", or
  referenced by abilities, as in "Supported allies have +1✦ for each stored ⧗."
- A card's counters reset to 0 when it leaves play.

## Zone Changes

In general, a card preserves its properties — cost, spark, status, and so on —
when it changes zones.

Targeting is based on card identity, which persists across zones. Banishing a
card and returning it to play does **not** protect a character: an effect
targeting that character still works once it is found in play again.

Gained spark and persistent statuses (such as reclaimed and Offering) travel
with the card across zones, while spark a character merely _has_ from a static
ability, and any counters on the card, do not (see [Spark](#spark) and
[Counters](#counters)).

## Created Cards

A **created card** is produced by an effect rather than drawn from a deck — for
example, an effect that creates a token event in your hand. A created card can
be played and otherwise used like a normal card, but it ceases to exist whenever
it would leave play: it is banished instead of going to the void, and it never
enters a deck. A created event, for instance, is banished on resolution rather
than moving to the void.

**Figments** are a character-typed subset of created cards. In addition to the
created-card rule, a figment can exist only in play: it cannot enter the deck,
void, or hand, and ceases to exist if it would leave play.

## Figments

Figments are characters created by card effects rather than played from a deck.
Each figment is one of a fixed set of generic **types**, listed in the catalog
below. A figment exists only in play: it cannot enter the deck, hand, or void,
and when it leaves play it **ceases to exist** — it is not sent to the void or
the Banished zone. Effects that copy a named card produce an ordinary character
token (a created card), not a figment.

**Figment catalog:**

| Figment type | Base ✦ | Keyword |
| --- | --- | --- |
| Warrior | 1✦ | — |
| Ancient | 4✦ | Unstoppable |
| Enigma | 0✦ | — |
| Shadow | 2✦ | — |
| Spirit Animal | 1✦ | — |
| Monstrosity | 4✦ | — |
| Survivor | 1✦ | — |
| Celestial | 2✦ | — |
| Wraith | 0✦ | Vengeful |
| Ethereal | 1✦ | — |
| Radiant | 2✦ | — |
| Ember | 1✦ | Awakened |
| Outsider | 1✦ | — |
| Legion | 1✦ per allied warrior | — |

A **Legion** is a Warrior whose spark equals the number of allied warriors,
counting itself. Because each figment counts individually toward subtype tallies
(see [Spark and counting](#spark-and-counting)), three Legion figments alone are
three allied warriors, so each is 3✦.

### Stacks

Figments of the **same type** occupy a single shared position as a **stack**.
Different types never share a stack, so a player can have several stacks in
different positions. A stack is a **topmost (active) figment** together with a
set of **reserve** figments beneath it:

- The **topmost figment** is the only one that can be targeted or affected. A
  dissolve, an Abandon cost, a spark pump, or a granted keyword all apply to the
  topmost. **Reserve figments cannot be chosen or affected by anything.**
- A figment materializing into an existing same-type stack joins the **bottom**
  of the stack as a reserve and does not require a new position. The topmost
  figment stays topmost until it is removed, at which point the next figment up
  is promoted to topmost. The topmost is identified by position, not by spark.
- A stack **displays its total spark**, the sum of every figment's spark.
- When a stack's last figment is removed, the stack **ceases to exist** and frees
  its position immediately.
- The play-area cap is **9 positions**. A stack occupies one position regardless
  of how many figments it holds, so stacking lets a player field more than 9
  figments.
- Materializing any figment fires "when you materialize" triggers, including a
  figment that joins an existing stack.

### Spark and counting

- A figment counts **individually** as one member of its subtype, and as one
  character, for every tally — "with 3 allied warriors", "+1✦ for each allied
  warrior", and so on. A stack of three Warrior figments is three allied
  warriors.
- A targeted **spark gain** ("+2✦") applies to the **topmost** figment. It rides
  that figment and is gone when the topmost is removed.
- An **anthem** — a static "allied X have +N✦" — applies to **each** figment in
  the stack, topmost and reserves alike. An anthem can therefore multiply a
  stack's total spark, and it persists as figments are removed.

### Statuses

- **Exhausted and awakened are properties of the stack.** A stack that has been
  in play since the start of its controller's turn is awakened and can challenge
  that turn, regardless of figments added or removed during the turn. A stack
  created this turn is exhausted until its controller's next Dawn.
- Every **other** status — a granted keyword such as Unstoppable or Veil — rides
  the **topmost** figment and is gone when the topmost is removed.
- A figment type's **inherent** keyword (the Keyword column above) is carried by
  every figment of that type, so a promoted reserve keeps it.

### Challenge resolution

Whether a figment stack is a challenger or a defender, its **topmost figment
resolves a normal challenge** against the opposing character using its own
single-figment spark; the **reserve figments take no part in the challenge**. The spark comparison
resolves normally: with lower or equal spark the topmost is dissolved (one figment
removed); with higher spark the opposing character is dissolved and the topmost
survives. The opposing character is compared only against the **topmost's** spark,
never the stack total, so a tall stack of small figments cannot dissolve a large
defender.

Scoring follows the usual rule that **only a challenger scores**, never a
defender. So a stack's reserves earn points only when the stack is the
challenger:

- **Stack challenging, unopposed** (no defender in the lane): every figment is
  unopposed, so the stack scores its **total** spark.
- **Stack challenging into a defender:** only the **reserves** are unopposed, so
  the stack scores the reserves' spark. The contested topmost scores nothing
  unless it has Unstoppable and wins.
- **Stack defending:** the topmost defends and the spark comparison resolves as
  above, but the stack scores nothing — its reserves are safe and idle.

**Stack against stack:** the two topmost figments resolve a normal challenge
against each other. Only the challenging stack can score, by the rules above; the
defending stack's reserves score nothing.

For example:

- A stack of four 2✦ figments, unopposed, scores **8⍟**.
- That stack challenges into a 3✦ defender. The topmost (2✦) is dissolved; the
  three reserves (6✦) score **6⍟**; the defender survives. The stack is now three
  2✦ figments.
- A stack of three 4✦ Monstrosity figments challenges into a 3✦ defender. The
  topmost (4✦) dissolves the defender and survives, scoring nothing; the two
  reserves score **8⍟**.
- A stack of two 4✦ Ancient figments (Unstoppable) challenges into a 3✦ defender.
  The topmost dissolves the defender, survives, and scores **4⍟**; the reserve
  scores **4⍟**, for **8⍟** total.
- A stack of three 0✦ Wraith figments (Vengeful) challenges into a 5✦ defender.
  The topmost is dissolved, and Vengeful dissolves the defender as well; the
  reserves score 0. The stack is now two Wraiths and the defender is gone.

### Removal and triggers

A figment removed by a **dissolve**, an **Abandon**, or a lost challenge fires
dissolved triggers, once per figment removed; the figment then ceases to exist. A
figment removed by **banish** does not fire dissolved triggers. Support does not
interact with figments — a figment neither grants Support to allies nor benefits
from an ally's Support.
