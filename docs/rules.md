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
- [Durations](#durations)
- [Counters](#counters)
- [Zone Changes](#zone-changes)
- [Created Cards](#created-cards)
- [Figments](#figments)
- [Infinite Loops](#infinite-loops)

## Symbols and Notation

Card text uses symbols in place of words wherever possible — for example, text
reads "✦" rather than "spark". The symbols are:

- **●** — Energy
- **⧗** — Counters
- **⍟** — Victory points
- **☾** — Exhaust (an exhaust cost, or the act of exhausting)
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
challenger that wins a blocked lane scores the spark difference.

A player's victory points never go below 0. An effect that makes a player lose
more ⍟ than they have reduces their total to 0.

**Victory check:** The battle checks for a result after every game action —
each card or ability played or resolved, each triggered ability, each challenge
lane, and each phase change — so a player who reaches the threshold wins at
once, even partway through a phase. In each check:

- A player at or above the threshold wins.
- A card in play that says "you win the game" when a condition holds wins the
  battle for its controller while that condition is true — for example, "If
  you have no cards in your deck, you win the game."
- If both players would win in the same check, the battle is a draw.

**Rounds and the turn limit:** A **round** is one turn for each player, the
first player's turn followed by the second player's. Extra turns (see [Turn
Structure](#turn-structure)) are not part of any round and do not advance the
round count. If 50 rounds end without a winner, the battle ends in a draw.

## Card Types

**Character** — Permanent cards that enter play when they resolve. Each
character has a spark value (✦) used during the Challenge phase, and a subtype
(Warrior, Spirit Animal, Survivor, Outsider, and so on) that other cards can
reference. Subtypes are an open-ended set of tribal tags. A character that
**has all character types** counts as every subtype a card refers to. Characters can have
triggered, activated, and static abilities. A character entering play is
**exhausted** unless it is **awakened**, so it cannot challenge, block, or pay
☾ costs on the turn it is played. Characters remain in play until removed by an
effect (Dissolve, Banish, or Abandon) or dissolved in a challenge. Characters
may be marked Fast (❖) or Interrupt (❖❖), controlling when they can be played
outside the Day phase.

**Event** — One-shot cards that produce an effect when they resolve, then move
to the void. Events can also be marked Fast (❖) or Interrupt (❖❖).

**Avatar** — A player's identity card, an animated 3D character that starts
each battle already in play. Avatars provide powerful ongoing abilities
(static, triggered, or activated) that define a player's playstyle.

**Dreamsign** — A card representing a 2D illustrated object that provides
ongoing effects, typically triggered or static. Active throughout the battle.

Avatars and dreamsigns are **not characters**. They occupy no position in the
play area, have no spark, do not benefit from Support, are never counted as
characters, and cannot be chosen by effects that choose characters. An avatar
pays its own ☾ costs: paying one exhausts the avatar, and an exhausted avatar
cannot pay another ☾ cost until the exhausted status is cleared during the
Ending phase (see [Exhaust and Awaken](#exhaust-and-awaken)).

**Dreamwell** — Special shared cards drawn during the Dreamwell phase. Not part
of either player's deck. They produce energy and usually carry a bonus effect
for the player who drew them.

## Zones

**Deck** — A player's shuffled draw pile. Cards are drawn from the top during
the Draw phase and by card effects.

**Hand** — Cards held by a player, hidden from the opponent. A hand may hold any
number of cards during the turn, but the active player discards down to 10
during the Ending phase, choosing which cards to discard.

An effect can put a card the opponent owns into your hand, as in "Prevent a
played card, then put that card into your hand." That card is in your hand
like any other: you may play it, discard it, or use it to pay a cost, and you
control it when you play it. Its owner does not change, so whenever it would
go to a deck, a void, the Banished zone, or its owner's hand, it goes to its
owner's.

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
shared deck of special cards that both players draw from once per turn beginning
in round 2 — in place of land cards.

- During each player's Dreamwell phase from round 2 onward, and in every extra
  turn, the next Dreamwell card is drawn automatically (no player choice
  involved). Both players skip this draw in round 1.
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

- Dreamwell cards carry order numbers 1–4 that set their position in the deck:
  all #1 cards are shuffled together and placed above the shuffled #2 cards, and
  so on.
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

Card text that refers to the characters **supporting** a character, as in "+2✦
for each character supporting it", counts every character in a back-rank
position that supports that character's front-rank position, whether or not it
has the Support keyword. A front-rank character therefore has 0–2 supporting
characters, and a back-rank character has none.

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
see [Combining Figments](#merging-figments).

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
enter play. Characters a player has already played that are still on the stack count
toward their back rank for this purpose, so a played character always has a
position to enter when it resolves. If a trigger attempts to put a character into play when the back
rank is full, it instead stays in its previous zone. If a trigger attempts to
create a figment or a copy of a character when the back rank is full, it is
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

1. **Dreamwell** — From round 2 onward, and in every extra turn, the active
   player draws the next Dreamwell card, permanently increasing their maximum ●.
   Current ● then resets to the new maximum. Any bonus effect on the card is
   applied. Both players skip this draw in round 1. Auto-advances.
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
8. **Ending** — These happen in order:
   1. If the active player has more than 10 cards in hand, they choose cards
      from their hand and discard them down to 10.
   2. Cards with the relevant end-of-turn statuses (Ephemeral, Offering) are
      banished.
   3. Effects that last "this turn" or "until end of turn" end, and cards
      banished until end of turn return (see [Banish](#keywords-and-effects)).
   4. Every exhausted character in play, and each exhausted avatar, loses the
      exhausted status.

   Auto-advances when the stack is empty, after which the turn passes to the
   opponent, unless the active player has an extra turn to take.

**Battle start:** Each player draws 5 cards as their opening hand. Both players
skip the Dreamwell draw in round 1. The first player's first turn skips the Draw
phase.

**Extra turns:** An effect such as "Take an extra turn after this one" gives its
controller another turn immediately after the current turn. An extra turn is a
full turn: it runs all eight phases, including the Dreamwell draw and the Draw,
and it is one of that player's turns for "this turn", "next turn", "last turn",
"once per turn", and "until your next turn". It does not advance the round
count, so it does not count toward the turn limit (see
[Objective](#objective)). If several extra turns are waiting, the one created
most recently is taken first.

## Exhaust and Awaken

The **exhausted** status marks a character that cannot challenge, block, or
activate abilities with ☾ costs. The status persists until the current turn's
Ending phase, when it is cleared from every character in play.

- Characters enter play exhausted and therefore cannot challenge, block, or pay
  ☾ costs on the turn they are played.
- An **awakened** character enters play without the exhausted status. Awaken can
  also be applied as an effect — for example "2●: Awaken a character you
  control" clears the exhausted status, allowing that character to challenge,
  block, and pay ☾ costs.
- Paying a ☾ cost exhausts that character.

Front-rank characters cannot activate abilities with ☾ costs. Because an
exhausted character cannot be moved to the front rank, exhausting a back-rank
character keeps it from challenging or blocking until it awakens.

An avatar has an exhausted status of its own, used only for its ☾ costs: paying
a ☾ cost exhausts the avatar, an exhausted avatar cannot pay ☾ costs, and the
status is cleared during each Ending phase along with the characters'.

## Challengers, Blockers, and Scoring

**Challengers** are the active player's front-rank characters as of the end of
their Day phase. **Blockers** are the opposing player's front-rank characters
directly opposite a challenger as of the end of the Dusk phase. Repositioning
during the Night phase can change which characters hold these designations.

Abilities reading "When you challenge with N or more …", such as "When you
challenge with 2 or more warriors", fire once, at the end of Day when
challengers are designated, and count the designated challengers that match.
Changes during Night never fire them again.

A character "scores ⍟" when a challenge converts its spark into victory points —
that is, when an unpaired challenger scores or when a challenger wins a blocked
lane. This is the event that
abilities reading "When an X you control scores ⍟" respond to, and abilities
reading "When the opponent scores ⍟" respond to it once for each character the
opponent controls that scores. A character that scores 0⍟ does not score. By contrast, a
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

**Base spark:** An effect such as "its base ✦ becomes 7" replaces the
character's printed spark. Gained spark and spark it has from other effects
still apply on top of the new base. If several such effects apply, the most
recent one wins (see [Order of continuous effects](#ability-types)).

**Spark below 0:** Spark changes add up, but a character's spark is never less
than 0 for any rule that reads it. A 1✦ character with −3✦ of changes has 0✦,
and it needs +3✦ more to reach 1✦.

**Values fixed as an effect resolves:** When a resolving effect gives
characters spark, a keyword, a new base spark, or another change for a while,
as in "Until end of turn, characters you control have +X✦, where X is the
number of characters you control", the characters it changes and any value it
uses are settled as it resolves. A character that arrives later is not
changed, and the value does not change when the count does. A static ability
that says characters _have_ something works the other way: it changes
whichever characters match at each moment, and its value stays current.

**Additional spark:** An ability such as "When a character you control gains
✦, it gains 1 additional ✦" applies to each "gains +N✦" event, permanent or
with a duration, and the additional ✦ has the same duration as the gain that
caused it. It never applies to spark a character _has_ (from static abilities,
Support, or similar effects). The additional gain does not cause the ability to
apply again. Several such abilities stack, each adding 1✦.

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

**Stack resolution:** Cards and activated abilities on the stack resolve
last-in, first-out. An event resolves by applying its effect and moving to the
void; a character resolves by entering play.

**Priority:** The player with priority may respond with an Interrupt or pass.

- Playing a card or activating an ability gives the **opponent** priority. A
  player therefore only ever responds to the opponent's cards and abilities, and
  cannot add a second item on top of their own: priority cannot be held.
- **A single pass resolves the top item of the stack.** The other player does
  not also need to pass.
- After an item resolves and any triggered abilities it caused have resolved,
  if the stack is not empty, the controller of the item that just resolved
  receives priority.
- When the stack becomes empty, play returns to the current phase.

For example: the active player plays A, the opponent responds with B, and the
active player responds with C. The opponent passes, so C resolves. The active
player now has priority with B on top, and may play another Interrupt or pass.
If they pass, B resolves, and the opponent receives priority with A on top.

**Automatic passing:** A player who receives priority but has no legal
response passes automatically. This never skips a player's phases: the active
player always ends their own Day and Night phases, and the opposing player
always ends the Dusk phase, by passing explicitly.

**Triggered abilities cannot be responded to.** They do not use the stack and
resolve before any player receives priority (see [Ability
Types](#ability-types)).

**Copies on the stack:** An effect that copies a card on the stack creates the
copy as a created card directly above the original, so the copy resolves first.
The copy is **not played**: it fires no "when you play" triggers, is not counted
by effects that count cards played, and does not give either player priority.
Its controller may choose new targets and modes for it: each choice is made
again as the copy is created, a choice with only one legal option is made
automatically, and a choice with no legal option keeps the original's. It uses
the original's value of X and counts any additional costs paid for the original
as paid. A copy can be Prevented like any other item, and it ceases to exist
when it resolves or is Prevented. A copy of a character is not created while
its controller's back rank would be full (see [Battlefield
Capacity](#battlefield-capacity)).

**Paying to end an effect:** An effect that lasts "until the opponent pays N●"
lets that opponent — the controller of the affected character — pay N● to end
the effect immediately. This is a special action, available whenever that
player could play a Fast card (❖) and never in response to a card or ability.
It does not use the stack and cannot be responded to.

## Costs, Requirements, and X

**Additional costs** are extra costs required to play a card, written as "To play
this event, do X." The card cannot be played unless the additional cost is paid.

An additional cost may offer alternatives, as in "To play this card, abandon a
character or discard a card." The player chooses one alternative they can pay
as they play the card and pays only that one. The card cannot be played if no
alternative can be paid.

**Optional additional costs** are written as "You may X to play this event",
paired with "If the additional cost was paid, do Y." The player chooses whether
to pay as they play the card, and can choose to pay only if they can pay the
whole cost. Activated abilities may have alternative and optional costs in the
same way.

Other costs include spending counters stored on the card itself ("1⧗, ☾: …"),
banishing cards from your void, and revealing cards from your hand. A revealed
card stays in your hand.

**Cost changes:** Effects such as "Events cost you 1● more" and "The next
character you play this turn costs 2● less" change the energy a player pays to
play a card. Every increase applies first, then every reduction, and the cost
never goes below 0●. They change the card's whole energy cost, including X
and the energy of any alternative or optional cost the player chooses to pay:
with a 2● reduction, a card costing 1● plus X can be played with X = 3 for 2●.
A "next card" change applies to the next matching card its player plays and is
used up when that card's costs are paid, even if the cost was already 0●. A
card that is not played does not use it up. A card's cost for conditions such
as "≤2● cost character" is its printed cost, unaffected by cost changes.

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

A card that "cannot be targeted by effects" cannot be chosen as a target by any
effect, including effects its own controller controls. Effects that do not
target, such as "Dissolve all characters", still affect it.

**Required choices with no legal option:** A card cannot be played, and an
ability cannot be activated, if a choice it requires when it is played — such
as a target — has no legal option. If a required choice has no legal option when
the card or ability resolves, that part of its effect does nothing; the rest of
the effect still happens. A choice of a set number of targets, such as "two
enemies", has no legal option while fewer than that many are available; a
choice of "up to" a number always has one.

## Keywords and Effects

**Dissolve** — Move a target character from play to the void.

**Banish** — Permanently remove a card by sending it to its owner's Banished
zone. Variants include banish from play, banish from the void, banish until the
banishing card leaves play, banish until the next Day phase, and banish until
end of turn. A character banished until end of turn returns to play during the
Ending phase, in the leftmost open back-rank position of the player who
controlled it when it was banished. Its return is a materialize: it enters
exhausted unless awakened and fires its ▸Materialized trigger. If that player's
back rank is full, it stays banished. A figment or other created card banished
this way ceases to exist and does not return. The other variants return the
same way at their own boundary: as the banishing card leaves play, as the next
Day phase begins, or as the banishing player's next turn begins. "Until this
leaves play" does nothing if the banishing card is no longer in play when it
would begin.

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
return-to-hand and repositioning tools. The move is part of the effect, so it
can put an exhausted character in the front rank; it happens only if this
character is still in play and the position is open.

**Awakened** — A character with this keyword enters play without the exhausted
status. See [Exhaust and Awaken](#exhaust-and-awaken).

**Support** — A back-rank character with Support provides a benefit to the
front-rank characters in the positions it supports (up to two). Support has no
effect on its own; the keyword text states the benefit, such as "Support –
Supported characters have +1✦."

**Veil** — If a character with Veil would be dissolved by an effect the
opponent controls, instead it loses Veil. A challenge and an abandon are not
effects the opponent controls. A character that loses Veil keeps that change
when it changes zones.

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
includes X, X is 0. The player chooses between Offering and the card's own costs
as they play it, from the ways they can pay; cost changes apply to the 0● cost
as to any play.

**Ephemeral** — A card drawn with Ephemeral is banished at the end of the turn if
it is still in hand, so it must be played the turn it is drawn. It is no longer
Ephemeral once it leaves the hand.

**Vengeful** — When this character loses a challenge, it dissolves the opposing
enemy character. In effect both characters in the challenge are dissolved.

**Prevent** — Counter a card on the stack, sending it to its owner's void
without resolving. Prevent effects are always Interrupts. Variants include
conditional forms such as "Prevent an event unless the opponent pays 2●," and
forms that send the card elsewhere: on top of its owner's deck, into its
owner's hand, or into your hand (see [Zones](#zones) → Hand).

**Abandon** — Move one of your own characters from play to the void. Abandon
cannot be prevented and targets only your own characters, and it fires the
character's ▸Dissolved trigger. It is frequently used as a cost. A figment that
is abandoned ceases to exist after firing its dissolved triggers.

**Foresee N** — Look at the top N cards of your deck, reorder them in any order,
and optionally send any of them to the void.

**Discover** — Look at 3 cards from your deck matching a stated criterion, then
add one of them to your hand.

**Copy** — Create a duplicate of a card or effect. Variants include copying a
character in play and copying the next card played. Copies of cards on the stack
follow [Copies on the stack](#playing-cards-and-the-stack); figment copies of
characters follow [Figment Copies](#figment-copies).

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
"▸Materialized, ▸Dawn" fire on both occasions. "When you play your second event
in a turn" counts only the matching cards that player played this turn,
including the one just played; copies are not played and are not counted.
A played card matches "when you play" abilities by its type and subtype as it
was played, including any changes to its types: a card that has all character
types as it is played is a play of every subtype. A later change to its types
does not change which of these abilities its play matched or counted toward.
"At the start of your turn" abilities trigger as each of your turns begins and
resolve before its Dreamwell phase; "At the start of your first turn" triggers
only as your first turn of the battle begins.

**Where triggered abilities work:** A triggered ability works while its card is
in play. An ability that names another zone, such as "▸Dawn: If this card is in
your void, …", works while the card is in that zone instead. Avatar and
dreamsign abilities always work. A ▸Dissolved ability triggers from wherever
the dissolved card went, and abilities that trigger when a card leaves play or
leaves your void see that card as it was just before it left. Nothing triggers
while the opening hands are dealt.

**Intervening conditions:** A triggered ability written "When X, if Y, …", or
"▸Dawn: If Y, …", triggers only if Y is true when X happens, and when it
resolves it does nothing unless Y is still true.

**Once per turn:** A triggered ability marked "Once per turn" triggers at most
once in each turn, extra turns included.

**Choices:** Triggered abilities do not use the stack, so their targets and
modes are chosen as they resolve. A required target with no legal option makes
that part of the ability do nothing (see [Targeting](#targeting)); a modal
triggered ability with no mode that can be chosen does nothing.

**Floating and delayed triggers:** An effect such as "Until end of turn, when you
play a character, draw a card" creates a floating trigger, which triggers each
time its condition is met until its duration ends. An effect such as "The next
time you play an event this turn, copy it" creates a delayed trigger, which
triggers once and then ends; without a stated duration it lasts until it
triggers. The player who controlled the effect that created a floating or
delayed trigger controls it.

**Triggering an ability outside its occasion:** An effect such as "Trigger this
character's ▸Materialized ability" makes that ability trigger as if its
occasion had happened. It waits and resolves like any other triggered ability.

**Disabled triggers:** While an effect says a character's triggered abilities
do not trigger, its abilities do not trigger; an ability that triggered before
that effect began still resolves.

**Trigger timing and order:** Triggered abilities do not use the stack and
cannot be responded to.

- An ability that triggers during an effect waits until that effect has
  finished, then resolves before any player receives priority. An effect is
  never interrupted partway by a triggered ability.
- Waiting triggered abilities resolve one at a time, first in, first out, in
  the order of the events that triggered them. Abilities triggered while they
  resolve join the end of the line.
- Abilities triggered by the same event resolve in a fixed order: the active
  player's first, then the opposing player's. For each player, the order is
  their avatar, then their dreamsigns, then their characters in play — back
  rank `B0` through `B9`, then front rank `F0` through `F8` — then their
  cards in other zones: void, then hand, then deck, each zone in the order the
  cards were created for the battle — and then their floating and delayed
  triggers, in the order they were created. A card that has just left play is
  ordered by the zone it went to; one that went to the stack or the Banished
  zone, or ceased to exist, comes after that player's deck.
- Players never choose the order of triggered abilities.

**Activated abilities** — Abilities with a cost the controller chooses to pay,
written as "Cost: Effect" (for example "2●: Draw a card" or "1⧗, ☾: Draw a
card"). They can be used any number of times per turn unless "Once per turn"
appears. Activated abilities use the same timing categories as cards: standard
abilities are Day-only while the stack is empty, Fast abilities follow Fast
timing, and Interrupt abilities follow Interrupt timing. An activated ability
on the stack is independent of its source: it resolves even if its source has
left play, using the ability as it was when activated.

**Static abilities** — Always-on rule modifications that apply while their source
is in play, such as cost reductions, spark bonuses for matching characters, or
other rule changes. Avatar and dreamsign static abilities always apply.

**Order of continuous effects:** When several static abilities and effects
with a duration change the same card, they apply in this order: changes to its
types ("has all character types"), then keywords it gains or loses, then base
spark it is given, then changes to its spark, then changes to its cost. Within
each step, effects apply in the order they began: a static ability when its
source entered play (an avatar's or dreamsign's at the start of the battle),
and any other effect when it resolved. Among effects that began at the same
moment, static abilities apply first — avatars and dreamsigns, then cards in
the order they were created for the battle — then the other effects, in the
order they were created. Where effects conflict, such as one that gives a
keyword and one that removes it, the one applied last wins. A static ability
decides which characters it changes, and by how much, from what the earlier
steps produced: an ability that changes spark reads types, keywords, and base
spark, but not other spark changes.

**Modal abilities** — Abilities that present multiple options, written as "Choose
one:" followed by the available effects (each with its own cost where relevant).

## Durations

An effect with a duration lasts until its boundary, wherever the cards it
changes are at that time. Extra turns count as their player's turns.

- **"This turn"** and **"until end of turn"** end in step 3 of the Ending phase.
  An effect of this kind that begins later in the Ending phase ends as the turn
  ends.
- **"Until your next turn"** ends as the next turn of the player who controlled
  the effect begins, before anything triggers at the start of that turn and
  before its Dreamwell phase.
- **"Until the next Day phase"** ends as the next Day phase begins, whichever
  player's turn it is in.
- **"While this is in play"** ends as its source leaves play. If its source is
  not in play when the effect would begin, the effect does not happen. An
  avatar or dreamsign is always in play.
- **"Until the opponent pays N●"** ends when that player pays to end it (see
  [Paying to end an effect](#playing-cards-and-the-stack)).
- An effect with no stated duration is permanent.

## Counters

Cards use counters (⧗) to track internal state.

- A card can **store** counters to increase its count, as in "When you discard a
  card, store 1⧗."
- Counters are local to a card; each card has its own counter value.
- Stored counters can be spent to pay costs, as in "1⧗, ☾: Draw a card", or
  referenced by abilities, as in "Supported characters have +1✦ for each stored ⧗."
- A card's counters reset to 0 when it leaves play.

## Zone Changes

In general, a card preserves its properties — cost, spark, status, and so on —
when it changes zones.

Targeting is based on card identity, which persists across zones. Banishing a
card and returning it to play does **not** protect a character: an effect
targeting that character still works once it is found in play again.

Three rules replace a zone change, applied in this order, each to the change as
the earlier ones left it:

1. A created card ceases to exist instead of moving to a deck, a hand, the
   void, or the Banished zone (see [Created Cards](#created-cards)). A
   dissolved one is still dissolved and fires its ▸Dissolved triggers first.
2. A reclaimed card is banished instead of any other zone change, which is no
   longer a dissolve (see Reclaim).
3. A dissolve by an effect the opponent controls removes Veil instead (see
   Veil).

So a figment with Veil that the opponent dissolves only loses Veil, while a
reclaimed character with Veil that the opponent dissolves is banished.

Gained spark and persistent statuses (such as reclaimed and Offering) travel
with the card across zones, while spark a character merely _has_ from a static
ability, and any counters on the card, do not (see [Spark](#spark) and
[Counters](#counters)).

## Created Cards

A **created card** is produced by an effect rather than drawn from a deck — for
example, an effect that creates a token event in your hand. A created card can
be played and otherwise used like a normal card, but it ceases to exist whenever
it would move to a deck, a hand, the void, or the Banished zone. A created event,
for instance, ceases to exist on resolution rather than moving to the void, and
a created character that would return to hand ceases to exist instead. A
created card that ceases to exist is gone from the battle and is not in any
zone.

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

A figment's cost is **0●** wherever a cost is read, such as "a character with
cost 2● or less" or "that character's cost". A figment copy has the cost it
copied.

### Figment Copies

A **figment copy** of a card is a figment that:

- copies the source card's printed subtype, abilities, cost, and base spark, as
  modified by the card's transfigurations and other permanent changes to the
  card itself;
- never copies the source's gained spark, counters, or statuses;
- has base spark 0 instead when the text says "0✦ figment copy";
- is a figment in every other respect: it counts for effects that refer to
  figments, and it ceases to exist when it leaves play;
- merges only with figment copies of the same card, and two different cards
  that share a name are different cards;
- with "until end of turn", ceases to exist during that turn's Ending phase.

### Merging Figments

During normal repositioning, a player can drag a figment onto another figment
they control with the same identity. The source figment ceases to exist, and its
current spark is permanently added to the destination figment. "Current Spark"
includes base spark and persistent spark gains, but not Support, anthems, or
spark granted by static abilities.

Merging figments is irreversible and follows all normal repositioning timing
and exhaustion rules. The source figment is not dissolved or banished, and this
process does not cause triggers to fire. An exhausted figment cannot be merged
with a non-exhausted figment, and trying to do so displays an explanatory
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

## Infinite Loops

Combinations of cards that can repeat without limit are a legitimate part of
the game, and they are never capped or broken up. A player can shorten a loop
they control, and a loop that nobody can stop ends the battle in a draw.

### Optional Loops

A player builds an optional loop through their own choices. When, within a
single main window of a turn (one player's Day, Dusk, or Night), a sequence of
that player's actions returns the battle to an equivalent position — the stack
empty, no triggered abilities waiting, and everything the same except victory
points, current and maximum ●, counters, gained spark, the cards in each deck
and void, and how many cards each player has played and drawn this turn — and
those differences gained something for that player and nothing for the
opponent, the player is offered a shortcut:

- **Repeat ×N** performs the sequence N more times, for any N up to 10,000.
- **Repeat until victory** performs it until the battle ends.

A difference is a gain for a player when their victory points, current or
maximum ●, counters on cards they control, gained spark on cards they control,
or cards in their deck increase. A player's cards in their void may change in
either direction, and the cards played and drawn this turn may grow, without
counting as a gain or a loss. The sequence qualifies only if none of the
player's own values fell, none of the opponent's rose, and at least one
changed. A sequence in which the opponent had a decision — a legal response
other than passing, or a choice with more than one option — is never offered.

Each repetition takes the same actions and makes the same choices as the
original sequence. Repeating stops early, returning control to the player,
when:

- an action in the sequence has become illegal;
- a choice offers different options than it did originally, so the player
  makes it;
- the battle ends;
- the opponent has a legal response other than passing;
- the repetition no longer follows the original sequence — for example, a
  triggered ability triggers that did not trigger originally — or it ends at a
  position not equivalent to the original one;
- the sequence has repeated 10,000 times.

Repeating stops at the last point the repetition reached. When a choice has
changed, the action or triggered ability that raised it is not repeated: if it
was one of the player's actions, the player decides what to do from the point
before it; otherwise it resolves normally and the player makes the choice. The
shortcut remains on offer after Repeat ×N completes or after 10,000
repetitions. Taking any other action withdraws it.

The cards played and drawn this turn are left out of the comparison so that a
sequence that plays or draws a card can repeat. A card that counts them — for
example "When you play your second card in a turn, gain 1⍟" — can therefore
trigger during the sequence on offer and not during a repetition, or the other
way around. That repetition stops at the first point it differs, and after the
player performs the sequence once more themselves, it is offered as it now
repeats.

### Mandatory Loops

A mandatory loop is one that repeats while no player has the opportunity to
play a card, activate an ability, reposition, or pass, and no player makes a
choice with more than one option — for example, triggered abilities that keep
triggering each other. Nobody can stop it, so:

- If the battle returns to exactly the same state during such a sequence, the
  battle ends in a draw. The order in which cards entered their zones is part
  of the state, but not when they did. The repeat may be noticed a few cycles
  after it first happens, and a loop more than 4,096 game actions long is
  ended by the limit below instead; the result is the same.
- If such a sequence runs for more than 100,000 consecutive automatic game
  actions without repeating, the battle also ends in a draw.

A choice with more than one option, such as accepting or declining a "you
may" effect, could stop the sequence, so the game actions before it never
make a mandatory loop with the ones after it, and the count of consecutive
automatic game actions starts again after it. A choice with only one option
does not. Repetitions of an optional loop are the player's own actions, so
they never make a mandatory loop either.
