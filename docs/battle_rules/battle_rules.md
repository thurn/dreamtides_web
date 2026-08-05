# Dreamtides Battle Rules

Dreamtides is a two-player card game in the tradition of collectible card games
like Magic: The Gathering. Players build decks of character and event cards,
then compete to score victory points by resolving challenges across a staggered
play area. Two features distinguish it from traditional card games: the shared
Dreamwell system replaces lands for energy production, and challenges are
resolved positionally — at the end of each turn the active player's front-rank
characters become challengers, the opposing player's front-rank characters
opposite them become blockers, and each pairing is resolved by comparing
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
- [Challengers, Blockers, and Scoring](#challengers-blockers-and-scoring)
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

Card text describes ownership with the phrase "you control": "a character you
control", "a warrior you control", and multiples as "characters you control" or
"warriors you control". Conditions on how many characters you control are phrased
with "if", as in "If you control 3 or more warriors, draw a card."

The play area is referred to in card text simply as being "in play". A
character's board position is described in terms of its front-rank or back-rank
designation rather than named slots.

## Objective

The first player to reach the victory point threshold wins the battle. The
default threshold is **25⍟**. Most points are scored during the Challenge phase,
when an unpaired challenger scores victory points equal to its spark or a
challenger that wins a blocked lane scores the spark difference. If 50 turns
pass without a winner, the battle ends in a draw.

## Card Types

**Character** — Permanent cards that enter play when they resolve. Each
character has a spark value (✦) used during the Challenge phase, and a subtype
(Warrior, Spirit Animal, Survivor, Outsider, and so on) that other cards can
reference. Subtypes are an open-ended set of tribal tags. Characters can have
triggered, activated, and static abilities. A character entering play is
**exhausted** unless it is **awakened**, so it cannot challenge, block, or pay
☪ costs on the turn it is played. Characters remain in play until removed by an
effect (Dissolve, Banish, or Abandon) or dissolved in a challenge. Characters
may be marked Fast (❖) or Interrupt (❖❖), controlling when they can be played
outside the Day phase.

**Event** — One-shot cards that produce an effect when they resolve, then move
to the void. Events can also be marked Fast (❖) or Interrupt (❖❖).

**Dream Avatar** — A player's identity card, an animated 3D character that starts
each battle already in play. Dream Avatars provide powerful ongoing abilities
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

Each player has a fixed, staggered play area split into a **front rank** and a
**back rank**. The front rank has **9 positions**, numbered `F0` through `F8`.
The back rank has **10 positions**, numbered `B0` through `B9`. These positions
are present for the entire battle.

**Staggered positions and Support:** Because the grid is staggered, each back-rank
position sits behind one or two front-rank positions, and each front-rank position
is backed by one or two back-rank positions. Numbering positions left to right
from 0, back-rank position `Bi` sits behind front-rank positions `F(i-1)` and
`Fi` wherever those exist. Thus `B0` supports `F0`, each of `B1` through `B8`
supports the two adjacent front positions, and `B9` supports `F8`.
Equivalently, `Fi` is supported by `Bi` and `B(i+1)`. A back-rank character
with the Support keyword benefits the up-to-two front-rank characters in the
positions it supports (see [Support](#keywords-and-effects)).

**Front rank and the back rank:** Only front-rank characters participate
directly in the Challenge phase, as challengers or blockers. Back-rank
characters are safe during the Challenge phase — they do not challenge, block,
or score, though their abilities (such as Support) can still affect front-rank
characters.

**Repositioning:** Repositioning means moving a character between any two
positions. Moving a character onto an occupied position swaps the two
characters. The active player repositions during their Day phase; the opposing
player repositions during the Dusk phase. An **exhausted character cannot be
moved to the front rank** by either player.

Dragging a figment onto a matching figment is an exception to the swap rule;
see [Combining Figments](#combining-figments).

The battlefield provides **All Forward** and **All Back** controls as
repositioning conveniences. They preserve destination-rank occupants, then move
eligible characters left to right into empty destination positions left to
right. Overflow remains in place, and All Forward skips exhausted characters.
These controls follow normal repositioning timing and never banish characters.

**Materializing:** A character entering play is placed in an open back-rank
position in the exhausted state. Releasing a character card over the battlefield
selects the nearest open back-rank position. Automatic effects select the
leftmost open back-rank position. An awakened character enters without the
exhausted status. If one or more characters would materialize and the back rank
lacks enough positions, use Battlefield Capacity.

### Battlefield Capacity

A player can have at most **10 characters** in their back rank and **9
characters** in their front rank. If a player's back rank is full, they may no
longer play any card or activate any ability which would cause a character to
enter play. If a trigger attempts to put a character into play when the back
rank is full, it instead stays in its previous zone. If a trigger attempts to
create a a figment or a copy of a character when the back rank is full, it is
not created and an explanatory message is shown.

Some effects cause multiple characters to enter play at once. In these cases,
characters are added until all back-rank slots are filled, and then the
remaining characters follow the rules above for triggers and an explanatory
message is shown. Characters are moved in source-zone order from top to bottom.

Figments are created characters which can be merged in the event that the back
rank is full, see [Creating Figments at
Capacity](#creating-figments-at-capacity) below.

## Turn Structure

Each turn progresses through these eight phases in order. The five main phases —
Dawn, Day, Dusk, Night, and Challenge — are surfaced in the UI; Dreamwell, Draw,
and Ending run as automatic bookends.

1. **Dreamwell** — The active player draws the next Dreamwell card, permanently
   increasing their maximum ●. Current ● then resets to the new maximum. Any
   bonus effect on the card is applied. Auto-advances.
2. **Draw** — The active player draws one card. (Skipped on the very first turn
   of the battle.) Auto-advances.
3. **Dawn** — The active player's ▸Dawn triggered abilities fire and resolve.
   Auto-advances when the stack is empty.
4. **Day** — The active player plays cards, repositions characters, and
   activates abilities. By the end of the Day phase the active player has
   positioned the characters they want as challengers in the front rank. The
   opposing player may respond with Interrupts. The active player explicitly
   passes to end this phase. **At the end of Day, the active player's front-rank
   characters become challengers.**
5. **Dusk** — The active player's ▸Dusk triggered abilities fire and resolve.
   The opposing player may reposition their own characters (subject to the rule
   that exhausted characters cannot be moved to the front rank), play Fast cards,
   and activate Fast abilities — this is their window to position blockers
   opposite the active player's challengers after seeing them. The opposing
   player explicitly passes to end this phase. **At the end of Dusk, each
   opposing front-rank character directly opposite a challenger becomes a
   blocker, and that challenger becomes blocked.**
6. **Night** — ▸Night triggered abilities fire for the active player, and
   ▸Challenge triggered abilities fire for each of the active player's
   challengers. The active player may play Fast cards and activate Fast
   abilities, but may not reposition characters. The active player explicitly
   passes to end this phase. Effects during Night can change positions, which
   can change challenger and blocker designations.
7. **Challenge** — Each front-rank lane is resolved in turn, left to right
   (see [Challengers, Blockers, and Scoring](#challengers-blockers-and-scoring)).
   No cards may be played during this phase, though triggered and static
   abilities still function and can modify spark.
8. **Ending** — If the active player has more than 10 cards in hand, they
   discard down to 10. Cards with the relevant end-of-turn statuses (Ephemeral,
   Offering) are banished, and every exhausted character in play loses the
   exhausted status. Auto-advances when the stack is empty, after which the
   turn passes to the opponent.

**Battle start:** Each player draws 5 cards as their opening hand. The first
player's first turn skips the Draw phase.

## Exhaust and Awaken

The **exhausted** status marks a character that cannot challenge, block, or
activate abilities with ☪ costs. The status persists until the current turn's
Ending phase, when it is cleared from every character in play.

- Characters enter play exhausted and therefore cannot challenge, block, or pay
  ☪ costs on the turn they are played.
- An **awakened** character enters play without the exhausted status. Awaken can
  also be applied as an effect — for example "2●: Awaken a character you
  control" clears the exhausted status, allowing that character to challenge,
  block, and pay ☪ costs.
- Paying a ☪ cost exhausts that character.

Front-rank characters cannot activate abilities with ☪ costs. Because an
exhausted character cannot be moved to the front rank, exhausting a back-rank
character keeps it from challenging or blocking until it awakens.

## Challengers, Blockers, and Scoring

**Challengers** are the active player's front-rank characters as of the end of
their Day phase. **Blockers** are the opposing player's front-rank characters
directly opposite a challenger as of the end of the Dusk phase. Repositioning
during the Night phase can change which characters hold these designations.

A character "scores ⍟" when a challenge converts its spark into victory points —
that is, when an unpaired challenger scores or when a challenger wins a blocked
lane. This is the event that
abilities reading "When an X you control scores ⍟" respond to. By contrast, a
flat "gain N⍟" effect (such as an Abandon-for-points ability, or Fatigue) awards
victory points to a player without any character scoring, and does not count as
a character scoring.

**Challenge phase resolution:** Each front-rank lane is resolved in turn, left to
right:

- **Blocked challenger:** Compare the spark of the challenger and its blocker.
  The character with lower spark is dissolved. If both have equal spark, both are
  dissolved.
  When the challenger wins, it scores victory points equal to the difference
  between its spark and the blocker's spark. For example, an 8✦ challenger that
  wins against a 2✦ blocker scores 6⍟. A winning blocker scores 0⍟.
  ▸Dissolved triggers fire after each lane is resolved.
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
- **Spark a character _has_** from a static ability, such as "Warriors you
  control have +1✦", persists only while that static ability applies. It does not carry
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
include characters you control, enemies (characters the opponent controls), any
card, or another card (not the source). Type predicates include
character, event, a specific subtype, characters with a minimum spark, or cards
with a specific energy cost.

**Targets are chosen before costs are paid.** Because of this, a character used
to pay a cost cannot also be chosen as the target of the same ability — for
example, "Abandon a character: Return a character from your void to hand" cannot
target the character abandoned to pay the cost (that character is in the void,
not in play, by the time the effect chooses among in-play characters; and the
abandoned character was selected as a cost, not a target).

Each [figment](#figments) is an independent character and is targeted
individually.

## Keywords and Effects

**Dissolve** — Move a target character from play to the void.

**Banish** — Permanently remove a card by sending it to its owner's Banished
zone. Variants include banish from play, banish from the void, banish until the
banishing card leaves play, and banish until the next Day phase.

**Materialize** — Put a character into play. This covers a character entering
play from hand (played normally), from the void, from the deck, as a created
figment, or returned "to play" by an effect. A materialized character enters the
leftmost open back-rank position exhausted (unless awakened). If there is not
enough room, use [Battlefield Capacity](#battlefield-capacity). A character that
enters fires its ▸Materialized trigger and any "When you materialize" triggers.
Putting a character directly into play (for example "return to play" or
"materialize from your void") is not "playing" it: it costs no energy, does not
use the stack, cannot be Prevented, and does not fire "when you play" triggers.

**Rematerialize** — Trigger an in-play character's materialization again, firing
its ▸Materialized trigger and any "When you materialize" triggers.

**Phasing** — ▸Materialized: Return another character you control to hand, then
move this character to that character's position. Phasing is resolved through the normal
return-to-hand and repositioning tools.

**Awakened** — A character with this keyword enters play without the exhausted
status. See [Exhaust and Awaken](#exhaust-and-awaken).

**Support** — A back-rank character with Support provides a benefit to the
front-rank characters in the positions it supports (up to two). Support has no
effect on its own; the keyword text states the benefit, such as "Support –
Supported characters have +1✦."

**Veil** — If a character with Veil would be dissolved by an effect the
opponent controls, instead it loses Veil.

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

**Vengeful** — When this character loses a challenge, it dissolves the opposing
enemy character. In effect both characters in the challenge are dissolved.

**Prevent** — Counter a card on the stack, sending it to the void without
resolving. Prevent effects are always Interrupts. Variants include conditional
forms such as "Prevent an event unless the opponent pays 2●."

**Abandon** — Move one of your own characters from play to the void. Abandon
cannot be prevented and targets only your own characters, and it fires the
character's ▸Dissolved trigger. It is frequently used as a cost. A figment that
is abandoned ceases to exist after firing its dissolved triggers.

**Foresee N** — Look at the top N cards of your deck, reorder them in any order,
and optionally send any of them to the void.

**Discover** — Look at 3 cards from your deck matching a stated criterion, then
add one of them to your hand.

**Copy** — Create a duplicate of a card or effect. Variants include copying a
character in play and copying the next card played.

**Gain control** — Move an opponent's character to the leftmost open back
position on the receiving side. It preserves its state and is exhausted through
this turn's Ending, even if Awakened; this is not materialization. If the rank
is full, the effect fails. Player-initiated Gain Control effects warn before
costs are paid. After a successful move, recalculate Support, controller-based
effects, subtype counts, and challenger or blocker status before resolving
resulting triggers.

## Ability Types

**Event abilities** — Effects printed on event cards. They resolve when the event
resolves from the stack, then the event moves to the void.

**Triggered abilities** — Abilities that fire automatically when a game event
occurs. The named (▸) triggers are:

- **▸Materialized** — fires when the character enters play.
- **▸Dawn** — fires during the controller's Dawn phase.
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
  referenced by abilities, as in "Supported characters have +1✦ for each stored ⧗."
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

**Figments** are a character-typed subset of created cards.

## Figments

Figments are independent characters created by card effects rather than played
from a deck. Each occupies one position and has its own identity, spark,
statuses, counters, and abilities.

A figment exists only in play: it cannot enter the deck, hand, void, or
Banished zone. When it leaves play, it **ceases to exist**.

**Figment catalog:**

| Figment type | Base ✦ | Keyword or ability |
| --- | --- | --- |
| Warrior | 1✦ | — |
| Shadow | 2✦ | — |
| Spirit Animal | 1✦ | — |
| Monstrosity | 4✦ | — |
| Survivor | 1✦ | — |
| Wraith | 0✦ | Vengeful |
| Ethereal | 1✦ | — |
| Ember | 1✦ | Awakened |
| Outsider | 1✦ | — |
| Legionnaire | 1✦ | +1✦ for each other Warrior you control |

A **Legionnaire** is a Warrior with 1 base spark and +1✦ for each other Warrior
you control. Three Legionnaires alone are therefore 3✦ each.

Figments follow normal character rules. Each counts separately as a character
and subtype member, is targeted and modified individually, and materializes,
challenges, scores, and interacts with Support on its own. A Support spark bonus
applies once to each figment. A figment which is dissolved fires its
'▸Dissolved' triggers before ceasing to exist.

### Merging Figments

During normal repositioning, a player can drag a figment onto another figment
they control with the same identity. The source figment ceases to exist, and its
current spark is permanently added to the destination figment. "Current Spark"
includes base spark and persistent spark gains, but not Support, anthems, or
spark granted by static abilities.

Merging figments is irreversible and follows all normal repositioning timing
and exhaustion rules. The source figment is not dissolved or banished, and this
process does not cause triggers to fire. An exhausted figment cannot be merged
with a non-exhausted figment, and attempting to do so displays an explanatory
message.

Combining **Legionnaire** figments causes only the base 1✦ spark value to be
added to the destination figment. A confirmation dialog is displayed showing a
warning about this result before combining Legionnaire figments.

### Creating Figments at Capacity

When materializing multiple figments, available back-rank slots are filled and
then the remaining figments are merged with the previously-created figments,
distributing their spark equally.

An effect's materializations form one ordered output. Each consecutive group of
one or more figments with the same catalog identity first fills the open back
positions with new figments. If every figment in that group fits, each keeps its
own spark. Otherwise, the group's total spark is divided as evenly as
possible among the new figments that fit, with any remainder assigned left to
right. Figments already in play are not destinations for this merging.
