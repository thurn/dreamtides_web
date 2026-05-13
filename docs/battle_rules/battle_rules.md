# Dreamtides Battle Rules

Dreamtides is a two-player card game in the tradition of collectible card games
like Magic: The Gathering. Players build decks of character and event cards,
then compete to score victory points by resolving challenges on a staggered
battlefield. Two key differences from traditional card games: the shared
Dreamwell system replaces lands for energy production, and challenges are
resolved positionally — during the Challenge phase of each turn, the active
player's deployed characters become challengers, the opposing player's
deployed characters become defenders if they are in the same lane as a
challenger, and each lane is resolved as a challenge (spark comparison, lower
dissolves) or a triumph (unpaired challenger scores points equal to its
spark).

## Table of Contents

- [Objective](#objective)
- [Card Types](#card-types)
- [Zones](#zones)
- [The Dreamwell and Energy](#the-dreamwell-and-energy)
- [Turn Structure](#turn-structure)
- [Playing Cards and the Stack](#playing-cards-and-the-stack)
- [Spark and Scoring](#spark-and-scoring)
- [Keywords and Effects](#keywords-and-effects)
- [Ability Types](#ability-types)
- [Targeting](#targeting)
- [Figments](#figments)

## Objective

The first player to reach the victory point threshold wins the game. The
default threshold is 25 points, but this is configurable per battle. Most
points are scored during the Challenge phase, when unpaired challengers
triumph and score victory points equal to their spark. If 50 turns pass
without a winner, the game ends in a draw.

## Card Types

**Character** — Permanent cards that enter the battlefield when they resolve.
Each character has a spark value used during the Challenge phase. Characters
enter your reserves as reserved characters and cannot be deployed on the turn
they are played. Starting on the next turn (which may be the opponent's), they
may be deployed at any action window their controller has — the opponent's
Response phase counts. Characters remain on the battlefield until removed by
an effect (Dissolve or Banish) or dissolved in a challenge. Surviving deployed
characters remain where they are after the Challenge phase; they do not
automatically return to your reserves. Characters can have triggered,
activated, and static abilities. Characters have subtypes (Mage, Warrior,
Robot, etc.) that other cards can reference. Characters may also be marked
**Fast** or **Interrupt** (see Playing Cards and the Stack); this controls
when they can be played outside the Main phase.

**Event** — One-shot cards that produce an effect when they resolve, then move
to the void. Events can be marked **Fast** or **Interrupt**, which controls
when they may be played outside the Main phase (see Playing Cards and the
Stack).

**Dreamcaller** — A player's identity card, an animated 3D character that
starts each battle already in play. Dreamcallers provide powerful ongoing
abilities (static, triggered, or activated) that define a player's playstyle.
Dreamcaller abilities are active from the start of the battle. Primarily
chosen during quest mode.

**Dreamsign** — A quest-layer card representing a 2D illustrated object that
provides ongoing effects. Selected during quest mode and active throughout
battles.

**Dreamwell** — Special shared cards drawn during the Dreamwell phase. Not
part of either player's deck. They produce energy and can have bonus effects.

In constructed decks, the main card types are Characters and Events.

## Zones

**Deck** — A player's shuffled draw pile. Cards are drawn from the top during
the Draw phase and by card effects.

**Hand** — Cards held by a player, hidden from the opponent. A player's hand
can hold at most 10 cards. If a draw effect would exceed this limit, the
player gains 1 energy instead of drawing.

**Stack** — A temporary zone for cards that have been played but not yet
resolved. While a card is on the stack, the opponent may respond with
Interrupts. Characters move to the battlefield when they resolve; events move
to the void.

**Battlefield** — Where characters reside. Each player has a staggered
battlefield with 4 deployed lanes (`D0-D3`) in front and 5 reserve slots
(`R0-R4`) behind, for 9 total positions. Dreamtides does **not** use columns.
Because the grid is staggered, a deployed lane sits in front of one or two
reserve slots: `D0` is in front of `R0` and `R1`, `D1` is in front of `R1` and
`R2`, `D2` is in front of `R2` and `R3`, and `D3` is in front of `R3` and
`R4`. `D0` and `R0` are not a column, and `D0` and `R1` are not a column
either.

- `R0` supports `D0`
- `R1` supports `D0` and `D1`
- `R2` supports `D1` and `D2`
- `R3` supports `D2` and `D3`
- `R4` supports `D3`

Only deployed characters participate directly in the Challenge phase. A player
can have at most 9 total characters on the battlefield, and new characters
always enter the reserves as reserved characters.

**Void** — The discard pile. Events go here after resolving. Characters go
here when dissolved. Some cards can interact with cards in the void (notably
via Reclaim).

**Banished** — A permanent exile zone. Cards sent here cannot return to play
under normal circumstances.

## The Dreamwell and Energy

Energy is the resource used to play cards. Unlike traditional card games that
use land cards, Dreamtides uses the Dreamwell — a shared deck of special cards
that both players draw from, one per turn.

**How the Dreamwell works:**

- The Dreamwell is a shared deck of cards (the size varies by configuration).
  During each player's Dreamwell phase, the next card is drawn automatically
  (no player choice involved).
- Each Dreamwell card has an energy production value that permanently
  increases the player's total energy production.
- At the start of each turn, your current energy is reset to equal your total
  production. After you draw your Dreamwell card, your current energy updates
  to match your new total production. Unspent energy does not carry over
  between turns.
- Many Dreamwell cards also have bonus effects such as drawing a card, using
  Foresee, gaining a point, gaining extra energy, or milling cards to the
  void.

**Phases and cycling:**

- Dreamwell cards have a phase number. Phase 0 cards only appear during the
  first cycle through the deck, typically providing a larger early energy
  boost. Higher-phase cards appear in every subsequent cycle, producing less
  energy per card but with bonus effects attached.
- When the deck cycles, it is reshuffled within phase groups so that
  lower-phase cards always come first within a cycle, while cards of the same
  phase remain randomized.

For example, a phase 0 Dreamwell card might produce 2 energy with no bonus
effect, while a phase 1 card might produce 1 energy and also let you Foresee
1.

## Turn Structure

Each turn progresses through these seven phases in order:

1. **Dreamwell** — The active player draws the next Dreamwell card,
   permanently increasing their energy production. Their current energy then
   resets to match that new total. Any bonus effect on the card is applied.
   Auto-advances when resolution completes.
2. **Draw** — The active player draws one card from their deck. (Skipped on
   the very first turn of the game.) Auto-advances.
3. **Dawn** — Start-of-turn triggers fire. The active player's **Dawn**
   triggered abilities fire and resolve here. Auto-advances when the stack is
   empty.
4. **Main** — The active player plays cards, deploys characters, repositions
   characters, and activates abilities at Main-phase speed. The opposing
   player may play Interrupt cards and Interrupt-speed activated abilities in
   response to cards on the stack. The active player may also play Interrupts
   in response to opposing Interrupts. The active player explicitly passes to
   end this phase. Once Main ends, the active player cannot return to it this
   turn.
5. **Response** — The opposing player may play Fast cards (including
   Interrupts), activate Fast or Interrupt activated abilities, and reposition
   their own characters between any of the 9 battlefield positions, subject
   to the reserved restriction. Repositioning includes deploying reserved
   characters into deployed lanes — this is the opposing player's window to
   set up defenders after seeing the challengers. The active player retains
   the ability to play Interrupts (cards or abilities) in response to cards
   on the stack. The opposing player explicitly passes to end this phase.
6. **Challenge** — All of the active player's deployed characters become
   challengers, and opposing deployed characters in the same lanes become
   defenders. Lanes resolve sequentially from `D0` to `D3` as challenges or
   triumphs (see Spark and Scoring for full resolution rules). No cards may
   be played during this phase, though triggered and static abilities still
   function and can modify spark.
7. **Dusk** — End-of-turn triggers fire. Auto-advances when the stack is
   empty, after which the turn passes to the opponent.

**Game start:** Each player draws 5 cards as their opening hand. The first
turn skips the Draw phase.

## Playing Cards and the Stack

To play a card, the controlling player must have enough current energy to pay
its energy cost. Playing a card deducts the cost from current energy, moves
the card to the stack, fires "played card" triggers, and gives the opponent
priority to respond.

**Timing categories:**

- **Standard cards** can be played by the active player during their Main
  phase, only when the stack is empty.
- **Fast cards** (marked with a single lightning bolt) can be played by the
  controlling player during a Response phase, only when the stack is empty.
- **Interrupt cards** (marked with two lightning bolts) are a subtype of
  Fast — Interrupt cards count as Fast for all rules purposes. Interrupts can
  be played in response to a card on the stack.

Activated abilities use the same timing categories as cards: standard, Fast,
or Interrupt. The same speed rules apply.

**Only Interrupts can be played while the stack is non-empty.** Standard and
Fast cards (and standard and Fast activated abilities) require the stack to
be empty at the moment they are played. The only way to put something onto
the stack in response to a card already on the stack is with an Interrupt.

**Stack resolution:** Cards on the stack resolve last-in, first-out (LIFO).
Only one pass is needed to resolve a card. Events resolve by applying their
effects and moving to the void. Characters resolve by entering the
battlefield. After a card resolves, if the stack is not empty, the card's
controller receives priority. Triggered abilities cannot be responded to in
Dreamtides — they resolve directly when their trigger condition is met.

## Spark and Scoring

Spark is the primary stat on characters. Characters have no health or
toughness — spark is their only stat. When an effect modifies a character's
spark, including support-based effects from other characters, that effective
spark is what challenges, triumphs, scoring, and other game rules use.

**Challengers and defenders:** When the Challenge phase begins, every
deployed character belonging to the active player is automatically a
challenger; the active player has no choice in this. Every deployed character
belonging to the opposing player in the same lane as a challenger becomes a
defender for that lane, and the challenger becomes defended.

**Challenge phase resolution:** Each deployed lane (`D0` through `D3`) is
resolved in turn:

- **Defended challenger (challenge):** Compare the spark of the challenger
  and the defender. The character with lower spark is dissolved. If both have
  the same spark, both are dissolved. A defended challenger does **not**
  score points unless it has Unstoppable. Dissolved triggers fire after each
  lane is resolved.
- **Unpaired challenger (triumph):** The challenger scores victory points
  equal to its spark for the active player.
- **Only the opposing player has a deployed character in the lane:** Nothing
  happens in that lane.

**After the Challenge phase:** Surviving deployed characters remain where
they are. A surviving challenger or defender stays in its lane until
repositioned or removed.

Reserves are safe during the Challenge phase — reserved characters do not
participate in challenges or triumphs and do not score points, though their
abilities can still affect deployed characters they support.

**Reserved status:** When a character enters the battlefield, it is placed in
your reserves and is reserved for the rest of the turn on which it was
played. A reserved character cannot be deployed and cannot become a
challenger or defender. The reserved status lasts only until the end of the
current turn; starting on the next turn (which may be the opponent's), the
character can be deployed by its controller at any action window the
controller has — including the opponent's Response phase, when the
controller is the opposing player.

**Repositioning:** Repositioning means moving a character between any of the
9 battlefield positions (deployed lanes and reserve slots), subject to the
reserved restriction. Moving a character onto an occupied position swaps the
two characters. The active player repositions during their Main phase. The
opposing player repositions during the Response phase; this is when
defenders are set up by deploying reserved characters into lanes opposite
challengers.

**Materializing new characters:** Characters enter the battlefield in the
reserves. If all 5 reserve slots are occupied, no additional characters that
would enter reserves can be played or materialized until a reserve slot is
freed, even if the player has open deployed lanes.

**Spark modification:** Spark may be modified by card effects up to the end
of the Response phase. During the Challenge phase, no cards can be played,
but triggered and static abilities still function and can continue to modify
spark during lane resolution.

**Character limit:** Each player can have at most 9 characters on the
battlefield at once. If the battlefield is full, additional characters cannot
be played.

## Keywords and Effects

**Dissolve** — Destroy a target character, moving it from the battlefield to
the void. Fires the "Dissolved" trigger. Can target any character (yours or
the opponent's).

**Banish** — Permanently remove a card from the game by sending it to the
Banished zone. Several variants exist: banish from the battlefield, banish
from the void, banish until the banishing card leaves play, and banish until
the next Main phase.

**Materialize** — Put a character onto the battlefield, into your reserves.
This is the term for a character entering play, whether from hand (played
normally), from the void (via Reclaim or effects), from the deck (via
effects), or as a token (Figments). Characters enter reserved and cannot be
deployed on the turn they are materialized. Materialize requires an empty
reserve slot.

**Supported / Supporting** — These terms describe the staggered adjacency
between the 5 reserve slots and 4 deployed lanes. A reserved character's
**supported** characters are the deployed characters in the lanes its slot
supports. A deployed character's **supporting** characters are the reserved
characters behind it. On the standard battlefield, `R0` supports `D0`, `R1`
supports `D0/D1`, `R2` supports `D1/D2`, `R3` supports `D2/D3`, and `R4`
supports `D3`; equivalently, `D0` is supported by `R0/R1`, `D1` by `R1/R2`,
`D2` by `R2/R3`, and `D3` by `R3/R4`. Support has no built-in effect by
itself, but abilities can reference these relationships.

**Prevent** — Counter a card on the stack, sending it to the void without
resolving. Prevent effects are always Interrupts (they respond to a card on
the stack).

**Abandon** — Move one of your own characters from the battlefield to the
void. Cannot be prevented and only targets your own characters. Fires the
"Dissolved" trigger. Often used as a cost for abilities.

**Kindle N** — Add N spark to your character with the highest spark value. If
there is a tie, the oldest character (earliest materialized) is chosen.

**Foresee N** — Look at the top N cards of your deck. You may reorder them in
any order and optionally send any of them to the void.

**Reclaim** — A named ability that allows you to play a card from your void
instead of from your hand. The card is played at its normal cost (or at a
specified alternate cost: Reclaim N means it costs N energy when played from
the void). When a reclaimed card would later leave the stack or battlefield,
it is banished instead of returning to the void.

**Fast** — A property on cards and abilities indicating they can be played
during the Response phase, only when the stack is empty.

**Interrupt** — A subtype of Fast (Interrupt cards and abilities count as
Fast for all rules purposes). Interrupts can be played in response to a card
on the stack. Interrupts are marked with a doubled lightning bolt symbol.

**Discover** — Look at 3 cards from your deck that match a specified
criteria, then choose one to add to your hand.

**Copy** — Create a duplicate of a card or effect. Variants include copying a
character on the battlefield or copying the next card played.

**Echo** — Copy an effect so it happens an additional time. If an effect says
to echo something, that effect is copied and resolves again.

**Gain Control** — Take control of an opponent's character, moving it to your
side of the battlefield.

**Challenge** — Initiate a one-on-one challenge between your character and a
target character. The two characters compare spark as in a lane challenge —
the character with lower spark is dissolved, and if both have the same spark,
both are dissolved. No points are scored from this challenge.

**Dread N** — During a challenge, this character dissolves opposing
characters as though its spark were N higher. The bonus applies only to the
challenge spark comparison, not to triumph points.

**Preeminence** — This character wins spark ties during a challenge. If both
characters in a challenge have Preeminence, both are dissolved as normal.

**Unbound** — This character can be deployed on the turn it is played. It
still enters your reserves on materialization, but the reserved restriction
does not apply to it, so it can be moved to a deployed lane and act as a
challenger or defender on that turn.

**Unstoppable** — When this character is a defended challenger, the
challenge resolves as normal **and** this character also triumphs (scoring
victory points equal to its spark for its controller). The spark comparison
still occurs as normal.

**Veil X** — This character costs X additional energy for the opponent to
target with cards or abilities.

**Reserve** — Keep a character in your reserves. A reserved character cannot
be deployed and cannot become a challenger or defender. New characters enter
reserved; the reserved restriction lasts until the end of the turn on which
the character was played.

**Other effect categories:** Effects also exist for drawing cards, gaining or
losing energy, gaining or losing points, modifying spark values on
characters, granting temporary abilities until end of turn, taking extra
turns, triggering additional Challenge phases, and shuffling hands and voids
back into decks.

## Ability Types

**Event abilities** — Effects printed on event cards. They resolve when the
event resolves from the stack, then the event moves to the void.

**Triggered abilities** — Abilities that fire automatically when a specific
game event occurs. Three keyword triggers can appear on characters:
**Materialized** (fires when the character enters the battlefield), **Dawn**
(fires during the controller's Dawn phase at the start of each turn the
controller is the active player), and **Dissolved** (fires when the
character is destroyed). Triggered abilities can also use descriptive
conditions like "When you play a card" or "At end of turn." A character
played from hand can satisfy both "when you play" and "Materialized"
triggers, but a character put directly onto the battlefield without being
played satisfies only "Materialized." Characters can have combined triggers
such as "Materialized, Dawn" (fires both on entry and each Dawn phase).
Triggered abilities cannot be responded to — they resolve directly when
their trigger condition is met.

**Activated abilities** — Abilities with a cost that a player chooses to
use, written as "Cost: Effect" (e.g., "2 energy: Draw a card"). Can be once
per turn or unlimited use. Activated abilities use the same timing
categories as cards: standard activated abilities are Main-phase only when
the stack is empty, Fast activated abilities follow the Fast timing rules,
and Interrupt activated abilities follow the Interrupt timing rules.

**Static abilities** — Always-on rule modifications that apply as long as
the source is on the battlefield. Examples include cost reductions, spark
bonuses for matching characters, or modifications to game rules.

**Modal abilities** — Abilities that present multiple options to choose
from, written as "Choose one:" followed by the available effects and their
costs.

## Targeting

Effects target cards using ownership and type predicates. Ownership
predicates include your cards, enemy cards, any card, or another card (not
the source). Type predicates include character, event, specific subtypes,
characters with a minimum spark value, or cards with a specific energy cost.

Targeting is specified when a card is played (for stack targets) or when an
effect resolves (for pending effect targets). Players are prompted to select
valid targets from the available options.

## Figments

Figments are token characters created by card effects rather than played
from a deck. Figments enter the battlefield through "Materialize Figments"
effects and behave like regular characters — they have spark values, count
toward the character limit, and can be targeted by effects.

**Stacking:** Unlike other characters, any number of figments may occupy the
same battlefield position. Figments sharing a position behave as a single
combined entity whose effective spark for that position is the sum of the
individual figments' sparks. Stacked figments also count their combined
spark for triumphs (an unpaired stack scores points equal to the sum of its
figments' sparks).

**Stacked figments in a challenge:** When a stack of one or more figments
in a deployed lane is paired with a defender:

- The defender's controller chooses any subset of the figments in the stack
  whose combined spark is at most the defender's spark. All chosen figments
  are dissolved.
- The defender is dissolved if the combined spark of all figments in the
  stack is greater than or equal to the defender's spark. As with any other
  challenge, ties dissolve both sides — when the combined spark equals the
  defender's spark, the defender is dissolved and the defender's controller
  may choose figments totaling the full defender's spark to dissolve.
