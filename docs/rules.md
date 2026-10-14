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
- A character in play, an avatar, or a dreamsign whose ability says "you win
  the game" when a condition holds wins the battle for its controller in any
  check where that condition is true. A card in any other zone, such as a void
  where its activated abilities may work, does not. A condition that is true only partway
  through an action and false by the check does not win.
- An event or ability whose effect says "you win the game" checks its
  condition as that effect resolves. If the condition holds then, the effect's
  controller wins in the check that follows the resolution — for example, an
  event that says "If you have no cards in your deck, you win the game." wins
  the battle if your deck is empty as it resolves.
- If both players would win in the same check — by the threshold, by "you win
  the game", or one of each — the battle is a draw.

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

## Journey Site Effects

Journey Dreamsign effects apply after validated gameplay changes, in held-copy
order. A Dreamsign gained by the change applies immediately; one lost by it
provides no new effect. Administrative state edits preserve their exact values.

An additional enhanced site is an unvisited guide site in the current
dreamscape whose runtime has not opened and which is not already enhanced.
Battle, Draft, Essence, and Dreamsign Reward are ineligible. Starter and final
dreamscapes can receive an additional enhancement when they contain an eligible
site. Each held copy grants its printed number of additional enhancements;
historical grants are recorded per source Dreamsign and dreamscape. Applied
enhancements persist through loss, reacquisition, and reordering of Dreamsigns,
and the same entitlement is consumed once. Existing enhanced sites use no
additional Dreamsign entitlement.

Each new Draft offer quotes its card count from the catalog base and every
qualifying held Dreamsign copy. An essence requirement is inclusive: the
printed minimum qualifies. The prepared choices, requested count, and spent
pool remain fixed through essence edits, Dreamsign gains or losses, and reload.
A pick prepares its next offer using the holdings and essence at that change;
a debug reroll retains the current offer's quoted count. Offers contain
unique cards, and cards already shown at this site remain excluded. The final
pick prepares no additional offer.

A Dreamsign that enhances Dreamsign and Dreamsign draft sites applies to free
Reward and Dreamsign Revelation sites. Holding it enhances an unvisited site
whose runtime is unprepared. Losing it before preparation ends that targeted
mode; naturally enhanced sites retain their enhancement. Successful preparation
records the enhanced mode with its immutable choices. That prepared mode
persists through source loss and reload, and duplicate sources share one mode.
An additional random enhancement excludes sites already enhanced by a held
targeted source, so its entitlement applies to another eligible guide site.

A targeted enhancement of a free Dreamsign Reward prepares a choice of up to
three distinct Dreamsigns, including the standard prepared reward. All shown
UUIDs are spent from the shared Dreamsign pool when the Reward opens. You may
accept one shown Dreamsign for free or decline the Reward. At your current
Dreamsign limit, accepting one replaces a held Dreamsign you choose. Either
choice completes the site once. A Reward with one available alternative still
requires your choice. The stored alternatives, count, selection protocol, and
remaining pool stay fixed through Dreamsign gains or losses, essence changes,
and reload. A site has one enhanced mode; duplicate enhancement sources do not
multiply its alternatives. An unopened site uses its enhancement when it opens.
The empty-pool Essence fallback retains its ordinary collection behavior.

A permission to reroll dream journey sites applies to unresolved Exploration
sites, including an Exploration reached through a Random Site. Each held copy
permits its printed number of rerolls per site. Consumed uses persist for that
site through reload, loss, and reacquisition. A successful reroll offers a
different catalog-valid encounter with fully prepared choices; existing action
requirements and costs determine which choices are available. It preserves the site,
journey route, deck, and essence. If no different fully prepared encounter exists, the
reroll consumes no use. A choice names the encounter and reroll generation it
was offered in, so an earlier choice cannot resolve against a later reroll.

## Zones

**Deck** — A player's shuffled draw pile. Cards are drawn from the top during
the Draw phase and by card effects.

**Hand** — Cards held by a player, hidden from the opponent. A hand may hold any
number of cards during the turn, but the active player discards down to 10
during the Ending phase, choosing which cards to discard.

**Chosen discard** — When an effect says to discard a chosen card from the
opponent's hand, you choose as that effect resolves. Only cards that match the
stated restriction are shown privately to you for that choice. Choose one of
those cards; it is discarded from the opponent's hand into its owner's void.
The opponent is the discarding player because the card leaves their hand, so
this fires their "When you discard a card" abilities, even if you own the card.
The choice itself does not count as you discarding a card.
If the hand has no matching card, that part of the effect does nothing.

**When you discard** — An ability that triggers "When you discard a card"
triggers once for each card discarded from your hand, whatever made you
discard it: your own effect, the opponent's effect, a cost such as "Reclaim –
Discard a card", or the hand-limit discard during the Ending phase. A created
card that is discarded triggers it too, though it ceases to exist instead of
entering the void.

**Discarding one or more cards** — An ability that triggers when you discard
one or more cards triggers once for a completed discard occasion. Each discard
instruction, each separate discard payment, and the hand-limit choice is one
occasion for the player whose hand the cards leave. Separate instructions or
payments in the same effect stay separate. Discarding a whole hand is one
occasion. The number actually discarded includes created cards that cease to
exist and cards banished by Reclaim's replacement. Discarding zero cards does
not trigger the ability or use its once-per-turn limit. The ability keeps its
occasion's count as it triggers; later draws or zone changes do not change it.
The count is public, and it identifies no hidden card. Individual discarded
cards and subjects of other triggered abilities keep their visibility rules.

A card leaving a hand is shown to the opponent as it enters a zone they can
see, so a discarded card is shown to both players as it enters its owner's void.
A created card that ceases to exist instead (see [Created
Cards](#created-cards)), such as a discarded or Ephemeral one, enters no zone and
is not shown.

An effect can let you look at the opponent's hand, as in "Look at the
opponent's hand. Put a card from it into your hand." Only you see its cards.
You see every card in the hand, even when the effect lets you choose only a
card that matches a restriction, and even when no card matches. You keep
knowing each of them while it stays in that hand, but not the cards the
opponent puts into it later. The opponent sees which card you put into
your hand, since it left their hand. An empty hand gives you nothing to choose.

An effect can put a card the opponent owns into your hand, as in "Prevent a
played card, then put that card into your hand," or "Put a card from it into
your hand." That card is in your hand like any other: you may play it, discard
it, or use it to pay a cost, and you control it when you play it. Its owner does not change, so whenever it would
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

**References to cards in a zone.** Effects name cards in a deck, a hand, or a
void. "Your hand" is the hand you hold; "your deck" and "your void" are the ones
you own. A reference reads each card's current characteristics, so a card whose
type changed matches by its new type:

- "A character from your void" chooses cards there as targets (see
  [Targeting](#targeting)).
- "Cards in your void" and "your hand" name every matching card there, chosen by
  nobody.
- "The top card of your deck" names that card when it matches; with fewer cards
  in the deck, it names the ones there are, and an empty deck names none
  without causing Fatigue.
- "This character from your void" names its own card only while that card is in
  your void.
- "Two random ≤2● cost characters from your deck" names that many different
  matching cards there, chosen at random among all of them as the effect
  resolves. Nobody chooses them and they are not targets. With fewer matching
  cards it names all of them; with none it names none, and the effect's other
  parts still happen. A cost compared with another value, as in "a random
  character with higher cost," compares each card's copiable cost (see
  [Costs, Requirements, and X](#costs-requirements-and-x)). Choosing them does
  not shuffle the deck.

When an effect checks whether the top card of a deck matches a condition, it reads
only that card's current characteristics when the condition is checked. The
condition is false for an empty deck, and checking it reveals nothing and
emits no event. "Otherwise, draw that card" draws the top card only when one
exists; with an empty deck it draws nothing and causes no Fatigue.

Naming a card reveals nothing: only what the effect then does with a hidden
card, such as putting a copy of it into a hand, can show it to a player. When
random cards leave a deck, as in "Materialize two random characters from your
deck," both players see which cards left and in what deck order, but not
which places they left, so a player keeps knowing where a card still in that
deck is only when the cards that left determine it (see **Put on top or on
the bottom of a deck** in [Keywords and Effects](#keywords-and-effects)).

**Counting cards in a zone.** "The number of cards in your void" and "for each
character in your void" count the cards in that zone whenever the number is
read, with "your" read as for references. A void is public, so a count of it may
count only the cards matching a type, subtype, or cost, by their current
characteristics. The number of cards in a hand or deck is public, but which of
them match is not: a count of a hand or deck counts every card there. A card on
the stack is in no zone a count reads, so an event being played does not count
itself in its own void. An ability that always applies reads the count anew as
it changes; a resolving effect reads it as the effect resolves.

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

An effect that changes maximum ● changes only energy production; it does not
change current ●. An effect that changes current ● does not change maximum ●.
If an effect changes both, apply each change separately. The normal
start-of-turn and Dreamwell refreshes set current ● to maximum ● as described
above.

An effect that says "Lose N●" reduces current ● by N, stopping at 0, and
leaves maximum ● unchanged. This loss is not an energy payment; resolve the
remaining instructions even if fewer than N● were available.

**Carrying unspent ●:** "Your unspent ● carries over between turns" keeps
that player's current pool. Their first own-turn refresh sets current ● to
maximum ● normally; at each later own-turn refresh, add maximum ● to current
● once. This also applies to extra turns. A Dreamwell draw still refills to
its new maximum: with carry, current ● becomes the greater of that new
maximum and the previous current pool plus the card's energy production.
Several carry abilities hold the same rule and do not multiply a refresh.
The rule applies as each refresh happens, after start-of-turn abilities have
resolved; gaining or losing it afterward does not change an earlier refresh.
A gain of maximum ● outside a refresh changes only maximum ●.

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

**Repositioning by an ability:** An instruction to reposition a character uses
the position, swapping, exhaustion, and compatible-figment merging rules of
repositioning. It follows the ability's timing. The ability's controller chooses
a legal position within the character's current controller's battlefield as it
resolves. If the character is absent from play or has no legal destination,
it does not reposition.

**Movement by an effect:** An ability that moves a character resolves within
its current controller's battlefield and preserves its identity, controller,
exhaustion, and other state. The ability's controller chooses an unoccupied position
when the effect says to move to an unoccupied character position. Effect
movement can put an exhausted character in the front rank and follows the
ability's timing. It does not swap occupants. If the character is absent from
play or the required destination is occupied, that movement does nothing.

An activated ability that moves this character to the position of the
character abandoned for its single-character cost remembers that character's
side and position immediately before payment. The destination survives the
abandoned character leaving play or ceasing to exist. The movement happens
only if its source is still in play on that side and that position is open.
The source can be abandoned for its own cost; its absent source does not move.

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
8. **Ending** — As the Ending phase begins, "at end of turn" abilities
   trigger, and they resolve before anything below happens (see [Ability
   Types](#ability-types)). Then these happen in order:
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
most recently is taken first. After all pending extra turns finish, the normal
turn order resumes with the opponent of the last player who took a normal turn.

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

**Holding a role:** An effect that refers to challengers or blockers, such as
"unless you control a challenger" or "Challengers you control have +1✦",
checks the roles whenever it reads them, as the Challenge phase does. A
challenger is a character designated as a challenger this turn that is in the
active player's front rank, in any lane. A blocker is a character designated
as a blocker this turn that is in the opposing player's front rank directly
opposite a challenger. A designated character that leaves the front rank, a
blocker with no challenger opposite it, and a character whose control changes
(it moves to its new controller's back rank) hold no role. No character is a
challenger before the end of Day or a blocker before the end of Dusk, and the
designations last until the turn ends. A condition in an effect is checked as
that part of the effect resolves: "Draw a card, then discard a card unless you
control a challenger" counts challengers after the draw, as the discard would
happen. A player controls no blockers during their own turn, so "a challenger
or blocker" counts a blocker only when such an ability resolves during the
opponent's turn.

Abilities reading "When you challenge with N or more …", such as "When you
challenge with 2 or more warriors", fire once, at the end of Day when
challengers are designated, and count the designated challengers that match.
Changes during Night never fire them again.

A character "scores ⍟" when a challenge converts its spark into victory points —
that is, when an unpaired challenger scores or when a challenger wins a blocked
lane. This is the event that
abilities reading "When an X you control scores ⍟" respond to, and abilities
reading "When the opponent scores ⍟" or "When an enemy scores ⍟" respond to it
once for each character the opponent controls that scores. A character that scores 0⍟ does not score. By contrast, a
flat "gain N⍟" effect (such as an Abandon-for-points ability, or Fatigue) awards
victory points to a player without any character scoring, and does not count as
a character scoring.

An ability such as "When an enemy scores ⍟, return this card from your void
to your hand" names your void, so it works while its card is there (see
[Ability Types](#ability-types)), not while the card is in play, in a hand, or
on the stack. "This card" names the card while it is in your void: when
several enemies score in one Challenge phase, it returns once, and a trigger
that resolves after the card has left the void does nothing. Returning it is
not a draw.

An equivalent quantity of ⍟ in an ability triggered by scoring is the number
of points that challenge awarded, captured when the character scored. A later
change to the character's spark does not change that quantity. Losing those
points follows the floor of 0 in [Objective](#objective).

**Additional challenge points:** "When a character you control scores ⍟ in a
challenge, it scores 1 additional ⍟" awards its controller 1⍟ as that ability
resolves, once for each positive challenge-scoring occasion. Each source adds
its own point. This supplementary award creates no new character-scoring
occasion and does not change the challenge award captured by other scoring
abilities. An unpaired 0✦ character, a flat point gain, and Fatigue do not
trigger it.

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

**Spark outside play:** A card in a hand, a deck, or a void, or on the stack,
has its printed spark after its variant and deck-entry modifications, with X
in a printed ✦ counting as 0, plus the spark it gained and any unexpired
spark with a duration. Spark a character _has_ from a static ability applies
only in play. A criterion such as "a ≤2✦ character" or "a ≥3✦ card" compares
that spark wherever the card is, and the effective spark of a character in
play. An event has no spark and never meets a ✦ criterion. A "when you play"
criterion with a ✦ bound reads the spark the card had as it was played, like
its types: a later change to its spark, or its move to a deck, does not
change which of these abilities its play matched or counted toward.

**Gains on the triggering card:** An effect that says a character you play,
draw, or return to hand gains ✦ changes that same physical character card
wherever it is as the effect resolves. It can gain ✦ on the stack or outside
play. The amount is fixed as the effect resolves. With no stated duration,
the gained ✦ travels with the card across zones; a stated duration ends
wherever the card is. If that card has ceased to exist or is an event as the
effect resolves, it gains nothing. An effect that gives ✦ to characters in
play applies to those characters in play.

**Values fixed as an effect resolves:** When a resolving effect gives
characters spark, a keyword, a new base spark, or another change for a while,
as in "Until end of turn, characters you control have +X✦, where X is the
number of characters you control", the characters it changes and any value it
uses are settled as it resolves. A character that arrives later is not
changed, and the value does not change when the count does. A static ability
that says characters _have_ something works the other way: it changes
whichever characters match at each moment, and its value stays current.

**Gaining ✦:** A character _gains ✦_ when an effect gives it +N✦, permanent
or with a duration, and N is at least 1. A gain of +0✦, such as "gains +X✦"
where X is 0, is not a gain, and neither is an effect that lowers a
character's spark, just as a character that scores 0⍟ does not score. Spark a
character _has_ (from static abilities, Support, or similar effects) and a new
base spark are never gains. Abilities that trigger "when … gains ✦" trigger
only on gains.

**This character's ✦:** An effect that reads "this character's ✦", as in
"gain X⍟ where X is this character's ✦", reads the character's spark as the
effect resolves, every change to it included: gained spark, spark with a
duration, and spark it has from static abilities and Support. A later part
of the same effect, as in "Then this character gains +1✦," does not change
the value already read. If the source leaves play while its ability is queued,
on the stack, delayed, or resolving, the ability reads the effective spark
immediately before that departure, including changes that end as it leaves.
This applies when the source ceases to exist and to an ability activated by
abandoning its source. If the same card is in play again when the value is
read, its current effective spark applies. A source with no in-play information
for that ability contributes 0; an emblem is not a character and contributes 0.
Only resolving effects, and abilities choosing their targets, read this value;
a static ability cannot read its own spark through this expression.

**This character's ✦ as a bound:** A target restriction such as "an enemy with
✦ less than or equal to this character's ✦" or "an event in your void with
cost less than or equal to this character's ✦" reads the value the same way,
each time the restriction is checked (see [Bounds that count](#targeting)). An
activated ability chooses its targets before its costs are paid, so "Abandon
this character: Dissolve an enemy with ✦ less than or equal to this
character's ✦" offers the enemies at or below its spark while it is still in
play; as the ability resolves, the chosen enemy is checked again against the
spark the character had immediately before it was abandoned. A triggered
ability chooses its targets as it resolves: if its source left play after it
triggered, both the targets offered and the check read the spark immediately
before that departure.

**Highest spark:** An instruction naming the character you control with the
highest spark reads the current effective spark of your characters in play
when that instruction resolves, in either rank and including figments. It
names exactly one character: among equal maxima, the one that entered play
earliest during its current stay. Repositioning, gaining control and firing
its materialization again preserve that age; leaving and entering play again
starts a new age. The instruction uses the resolving ability's controller,
even if its source has left play or changed controller. This is not a target,
so target protection does not exclude a character. With no controlled
character in play, that instruction does nothing.

**Additional spark:** An ability such as "When a character you control gains
✦, it gains 1 additional ✦" applies to each gain, and the additional ✦ has
the same duration as the gain that caused it. The additional ✦ triggers no
"when … gains ✦" ability: neither the ability that caused it nor any other.
Several such abilities therefore stack, each adding exactly 1✦: with two of
them, a character that gains +2✦ gains 2 additional ✦, 4✦ in all.

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
void, unless its effect already moved it off the stack, as "Banish this card"
does; a character resolves by entering play.

**Conditional alternatives:** An effect written "Do A. If Y, do B instead"
checks Y as that instruction resolves, before doing A. If Y holds, do B;
otherwise, do A. A hand-size condition counts the cards before any discard
from that instruction. For example, "The opponent discards a card. If they
have 5 or more cards in hand, they discard two cards instead" makes them
discard two cards if their hand has at least 5 cards at that point, and one
card otherwise. A discard effect with fewer cards available discards the
whole hand; with an empty hand it does nothing.

An ordinary conditional instruction checks its condition when that instruction
is reached, after preceding instructions have resolved. Only its selected
branch makes choices during resolution. A mode or target already chosen for
that same reference stays chosen; changing the condition does not replace it.

**Choosing a player:** "Choose a player. That player …" lets the effect's
controller choose either player as that instruction resolves. It is not a
modal choice or a target. The chosen player performs the instructions that
name them, and chooses the cards they discard from their own hand. Choosing
the opponent does not change the effect's controller: "you" still refers to
the player who controls the ability. A following instruction to draw X cards
draws that full amount even if fewer than X cards were discarded.

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
the original's value of X, its new targets included: a target bounded by X is
chosen among the cards that match the original's X. It counts any additional
costs paid for the original as paid. A copy can be Prevented like any other item, and it ceases to exist
when it resolves or is Prevented. A copy of a character is not created while
its controller's back rank would be full (see [Battlefield
Capacity](#battlefield-capacity)).

**Playing from the void:** Some abilities let a player play cards from their
void, as in "You may play ≤2● cost characters from your void." A card played
this way follows the timing rules and is played for its normal costs,
additional costs included, with cost changes applying as to any play. It is not
reclaimed, so it goes where it normally would: an event to the void as it
resolves, a character to the void when it is dissolved. Only cards in the void
you own are covered, never the opponent's, and a cost criterion compares the
card's copiable cost.

- A static ability, such as "You may play ≤2● cost characters from your
  void," covers every matching card while its source is in play, any number
  of times unless it says "once per turn". A once-per-turn permission allows
  one matching card to be played each turn, shared across all matching cards.
  It is used as the play commits, even if the card is prevented or later
  returns to the void. It renews at the start of the next turn, and covers
  nothing while its source is outside the zone where the ability works.
  Each copy of the ability has its own allowance. A conditional permission
  covers cards only while its condition holds; the allowance stays spent
  when that condition stops holding and holds again during the same turn.
  A source that leaves its zone and returns is a new object with a fresh allowance.
- A card's own ability, as in "You may play this character from your void,"
  works while that card is in your void and covers that card only, any number
  of times: played that way, it pays its normal costs, additional costs
  included, and after it leaves play it can be played from your void again.
  It covers nothing while the card is in another zone, including the stack.
- A permission naming a card, as in "When you discard a card, you may play
  that card from your void this turn," covers that card whenever it is in
  your void during the permission's duration. A card that did not reach your
  void, such as one the opponent owns or a created card that ceased to exist,
  is not covered.
- "You may play an event from your void" in a resolving effect, such as an
  activated ability, is a permission for one play, not a play during the
  effect: it covers one matching card and ends as that card is played. With
  no stated duration it lasts until it is used (see
  [Durations](#durations)).
- A play uses an unlimited permission when one covers the card, and otherwise
  the earliest unused once-per-turn static permission that does, and then
  the earliest permission for one play that does. Earliest means the order
  continuous effects apply: when a static source entered its applicable zone
  or gained the ability, whichever is later, or when a resolving effect made
  its permission, with static abilities first on ties, in source and ability
  order, followed by resolving permissions in creation order. A permission is
  chosen before costs are paid; abandoning its source as a cost does not undo the
  announced play. Cancelling or failing a play spends no allowance.
- A void card that a permission covers and that has Reclaim can be played
  either way: the player chooses as they play it between its normal costs and
  Reclaim, which makes it reclaimed. Playing it by Reclaim uses up no
  permission. Offering is a way to play a card from your hand only.

**Immediately play:** An effect that says to immediately play a character from
your void offers one play as that instruction resolves, even outside a normal
play window or while another item is resolving. Only matching characters in the
void you own are covered, with a cost criterion reading their copiable cost.
You may decline. The character must pass play restrictions, reserved battlefield
capacity and payable costs. You choose its normal costs or available Reclaim;
X, cost changes and additional costs apply normally. Offering applies from hand.
This instruction creates no lasting permission and uses no other permission's
allowance.

The chosen character is played onto the stack, its costs are paid and its played
triggers fire. The enclosing effect finishes, and queued triggers resolve,
before the opponent of the player who made this new play receives priority to
respond with an Interrupt. The character enters play only when its own stack
item resolves, exhausted unless awakened. With no legal play, nothing is played
or paid. Copies are not played and follow the ordinary resolved-item priority
rule.

**Paying to end an effect:** An effect that lasts "until the opponent pays N●"
lets that opponent — the controller of the affected character — pay N● to end
the effect immediately. This is a special action, available whenever that
player could play a Fast card (❖) and never in response to a card or ability.
It does not use the stack and cannot be responded to.

**Play restrictions:** Some effects stop players from playing cards, as in
"The opponent cannot play events this turn," "That card cannot be played while
this character is in play," or "Players may only play one card per turn." A
restriction applies as a player would begin to play a card, by every way of
playing it: from a hand for its costs or by Offering, and from a void by a play
permission or by Reclaim. A card already played is not affected, and neither
is a card put into play without being played, such as a materialized one, nor
a copy, which is not played. Activating an ability is not playing a card.

- A restriction naming card types, as in "cannot play events," reads each
  card's current characteristics as it would be played.
- "Choose a card in the opponent's hand" is chosen like a [chosen
  discard](#zones): you choose as that effect resolves, and every card in that
  hand is shown privately to you for that choice. Both players then see which
  card was chosen. With an empty hand, nothing is chosen and the effect does
  nothing. "That card cannot be played" follows the card's identity across
  zones (see [Zone Changes](#zone-changes)): no player can play it, from any
  zone and whoever holds it, until the effect ends. If the restriction's
  duration is already over as it would begin, such as "while this character is
  in play" after its source has left play, the card is still chosen, but
  nothing is restricted (see [Durations](#durations)).
- "Players may only play one card per turn" applies to each player
  separately: a player who has played that many cards this turn cannot play
  another. It counts every card the player played this turn, by any route,
  including cards played before the ability began to apply and the card with
  the ability itself.

**Playing from the top of a deck.** A permission to play matching cards from
the top of your deck covers only the current top card you own. You must be
able to identify that card to announce it. The permission grants no look or
reveal, and covers no deeper card. Normal timing, capacity, restrictions,
energy and additional costs apply. Offering applies from hand; Reclaim
applies from the void.

**Continuously revealing a deck top.** While an applicable ability instructs
you to reveal the top card, both players identify the current top, and each
replacement top is revealed after its causal movement is announced. An empty
deck reveals nothing. A conditional reveal and a separately stated play
permission apply independently. A player keeps identifying a learned card
while its position remains tracked, even when the condition stops applying.
A new unknown top requires a proper look or reveal before it can be played.

While a card is being played or an ability activated, changes to the top and
to a reveal condition are disclosed after that operation completes, before
the next decision. Other effects reveal each changed top before their next
prompt or instruction that removes another card. Opening setup reveals the
remaining top after shuffling and dealing. Cancelling before commitment pays
nothing; published knowledge follows the ordinary position-tracking rules.

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

**Costs while resolving:** "You may X to Y" in a resolving effect, as in
"▸Materialized: You may discard a card to draw a card," offers the choice as
the effect resolves, not as the card is played. The player can choose to pay X
only if they can pay all of it, and Y happens only if X is paid. A player who
cannot pay X is not offered the choice, and nothing happens.

**Opposing resolving payments:** "Do Y unless the opponent pays N●" asks
the opponent of the ability's controller as that instruction resolves. They
may pay the full fixed energy amount to stop Y, or decline. A player who
cannot pay the whole amount declines automatically. Only that opponent's
energy pays the amount. If it is unpaid, Y resolves for the original ability's
controller and source; any modes or targets Y needs are chosen then. Paying
or declining does not restore a once-per-turn trigger already used by its
matching event.

For an optional energy payment to return named cards from a void to hand, the
choice is offered only if at least one of those cards is still in a void as
that part resolves. If none remains there, including a source that has ceased
to exist or already moved, that part offers no payment and spends no energy.
If some remain, the payment covers returning those remaining cards.

Other costs include spending counters stored on the card itself ("1⧗, ☾: …"),
banishing cards from your void, and revealing cards from your hand. A revealed
card stays in your hand.

**Returning a character as a cost:** "Return a character you control to hand"
chooses a matching character you control in either rank before commitment.
It may be the source of the activated ability, but cannot be a target already
chosen for that ability or a card reserved for another cost. The chosen
character returns to its owner's hand. An instruction explicitly putting a
card into "your hand" instead uses the named player's hand.

An ordinary return's zone replacements apply to a return cost: a created
character ceases to exist and a reclaimed character is banished instead.
The cost is paid through that replacement. Once activated, the ability is
independent of its source and resolves with its original controller and
ability, even if paying returned the source or made it cease to exist.
Payment choices are cancellable before commitment; payment and the
activation commit together, and a cancelled choice pays nothing.

Costs are paid in their stated order. Returning or abandoning the source
cannot precede a cost that exhausts that source or spends its positive
counters: leaving play clears those counters. Paying those source costs
first, then returning or abandoning it, is permitted. Spending zero counters
changes nothing and needs no source, so it may follow a created source
ceasing to exist. Alternatives and optional costs obey these same ordering
requirements; a character other than the source may pay an earlier departure
cost while the source remains available for later payments.

**Paying ⍟:** A cost such as "To play this character, pay 4⍟." is paid from
the player's own victory points. A player can pay it only with at least that
many ⍟, so their total never goes below 0 by paying: with fewer, they cannot
play the card, choose that alternative, or pay that optional cost. Paying
lowers the player's total by exactly the amount and is a loss of ⍟; no other
player gains or loses ⍟, so paying never wins the battle for anyone. Cost
changes change energy only, never a ⍟ cost.

**Cost changes:** Effects such as "Events cost you 1● more" and "The next
character you play this turn costs 2● less" change the energy a player pays to
play a card. Every increase applies first, then every reduction, and the cost
never goes below 0●. They change the card's whole energy cost, including X
and the energy of any alternative or optional cost the player chooses to pay:
with a 2● reduction, a card costing 1● plus X can be played with X = 3 for 2●.
A "next card" change applies to the next matching card its player plays and is
used up when that card's costs are paid, even if the cost was already 0●. A
card that is not played does not use it up. A card's cost for conditions such
as "≤2● cost character" or "with cost X●" is its copiable cost: its printed
cost after its variant and deck-entry modifications, with X in it counting as
0. Cost changes do not affect it.

**A card's own cost:** "It costs N●" and "It costs N● more", following an
instruction that puts a card into a hand, as in "Return an enemy to hand. It
costs 2● more" or "Draw a ≤2● cost card. It costs 0●," change that card's
energy cost whoever plays it. "It" is the card that instruction put into a
hand; when the instruction put no card there, because it had no target, the
deck was empty or held no match, or a created card ceased to exist instead,
nothing changes. "Reduce its cost by N●" makes the card a triggered ability
names cost N● less, whoever plays it, as in "When you return a character you
control to hand, reduce its cost by 2●": "its" is that card wherever it is as
the ability resolves, since a card keeps its identity across zones. "It costs N●" sets the card's normal ● base in place of its
copiable ● cost. Hand plays, play permissions and plain Reclaim use that base;
explicit printed or granted Reclaim and Offering replace it with their own
route costs. X and additional mandatory, optional or alternative-choice costs
are paid on top of the chosen base. An alternative within an additional cost
is distinct from choosing a full replacement play route. The route chosen for
the play determines both affordability and payment. If several changes set the
same card's normal base, the latest applies. Then every increase applies, then every
reduction, as for any cost change: a normal play of a card set to 0● costs 1●
while "Characters cost 1● more" applies to it. A card's own reductions add up,
and like its own increases they apply by every route of play, so a card with
"Reclaim 5●" whose cost was reduced by 2● is reclaimed for 3●. Like any effect, the change lasts until its
duration ends, wherever the card is, and with no stated duration it is
permanent: a card returned to hand costing 2● more still costs 2● more if it is
played and later returns to a hand again. The card's cost for conditions is
unchanged.

**Optional event base:** "You may play ❖ and ❖❖ events for 1●" offers an
alternative ● base for those events, alongside their normal costs. It
replaces the normal base, including a card's own base-setting change; other
cost increases, reductions, additional costs and timing restrictions apply.
A replaced printed X● has X = 0; a separate additional count-X still binds
normally. Several copies offer the same choice once. Offering, plain
Reclaim and explicit Reclaim are separate alternative routes and cannot be
combined with this base. The ability grants no permission to play from a
void or deck. An independent permission can supply that access and is used
up normally when its player chooses this alternative; a card with only
Reclaim uses its Reclaim route. Cancelling before commitment pays nothing.

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
no effect merely to increase a card count. An event that banishes an enemy with cost X● may choose X = 0 when it has a legal cost-zero enemy to banish. The minimum applies to the whole card, whatever
mode is then chosen: "Choose one: Gain X⍟ or dissolve an enemy with X✦" may be
played for X = 0, because dissolving a 0✦ enemy is meaningful, and its gain
mode is then also legal and gains nothing. A card written with two costs, such as
"2 X", requires paying 2● first and then X●. X is picked before the card's
targets, so a target bounded by X, as in "Return a character with cost X● to
hand", is chosen among the characters that match the picked X; that card may
be played for X = 0 to return a 0● character, such as a figment. A bound on
void targets works the same way: "Choose up to two ≤X● cost events in your
void to gain reclaim 0●" offers only events in your void whose copiable cost
is at most the picked X, so X = 0 offers only 0● events. Like any bound, it
is checked again as the effect resolves, and a chosen card whose copiable
cost is then above X is no longer a legal target.

A discard cost may restrict the card's current type or subtype. It chooses only
cards held in the paying player's hand, excluding the card being played and
cards already chosen as costs or targets. When an effect reads the discarded
card's cost, that value is captured before payment from its copiable values,
after variant transforms and deck-entry modifications, with an X energy part
counting as 0. The value persists with the stack item even if that card changes
zones or characteristics before resolution.

An abandon cost may likewise name the abandoned character's cost, as in
"Abandon a character: A player erodes X, where X is that character's cost."
That value is captured before payment from the character's copiable values in
the same way and persists with the stack item. "To play this card, abandon a
character. Materialize a random character with higher cost from your deck"
compares with that captured cost: "higher cost" means a copiable cost greater
than the abandoned character's. Playing the card by Reclaim pays the abandon
too, and captures its cost the same way. A figment, which ceases to exist
when abandoned, has a cost of 0●, and a figment copy has the cost it copied.
Any character the player controls can pay the cost, including the character
whose ability it is.

An abandon cost may name the paid character's spark. That value is captured
as its effective spark in play before any cost is paid: its current base
after variant and deck-entry changes, gained spark, unexpired changes, static
abilities and Support, with the result clamped at 0. A contribution from a
character used for another payment still counts in this snapshot. The value
persists with the stack item, including when the paid character ceases to
exist or its in-play contributions end. This capture spends no energy beyond
the separately printed energy costs; any other payment binding X, including
X● or a payment count, must use the same number. When immediate card-play or activation
targets or modes read that X, choose the paid character before those choices,
reserving it separately from all targets and other payments.

**Abandon X characters:** Choose X before the ability's targets, then choose
exactly X distinct matching characters you control to pay. A target or a
character used for another cost cannot also pay this cost. The chosen count
is limited by the characters available and travels with the stack item, even
when the abandoned figments cease to exist. This count spends no energy
beyond the ability's separately printed ● costs; if the ability also pays
X●, both payments use the same X. Under the contextual X rule, "1●, Abandon
X figments: Dissolve an enemy with X✦" may choose 0 when a legal 0✦ enemy
exists: pay 1●, abandon nothing, and dissolve that enemy. Cancellation or an
invalid answer before commitment pays nothing.

The engine's `abandonXCost` form is a mandatory top-level cost of a card or
activated ability. Alternative and optional payment lists accept fixed
abandon costs. A count-X payment selector can compare spark or cost with X;
its eligible characters are evaluated using each prospective count, before
targeting and payment. Direct catalog definitions with count-X abandonment
inside an alternative or optional payment list are unplayable and raise no
player choices.

**Discard X cards:** X is the number of cards chosen to pay this cost. Zero
is a legal X only when it has a meaningful effect under the contextual X
rule, such as drawing a fixed number of cards; otherwise X is at least 1, and
a player whose hand holds no card that could pay cannot play the card this
way. The card being played never pays its own cost. "Gain X⍟. / Reclaim –
Discard X cards." is played from hand for X● (at least 1●), or from the void
by Reclaim by discarding X cards (at least one) in place of its ● cost;
either way it gains the X it was played for. This X spends no energy beyond
the separately printed energy costs. When one ability also pays X●, every
reference to X uses that same value: the discard count or captured card cost
must agree with the chosen energy X.

**Discard your hand:** As a cost, as in "☾, Discard your hand, abandon this
character: Gain 3●," this discards every card in the paying player's hand
except the card being played and cards already chosen as its targets or for
its earlier costs. Nobody chooses the cards, and the player is not asked. The
cost can be paid with an empty hand, discarding nothing, so it never makes a
card or ability unplayable by itself. The cards are those in the hand as the
card is played or the ability activated: a card that an earlier cost of the
same ability returns to that hand stays there, and a later cost of the same
ability that needs a card from hand has none left, so it cannot be paid. Each
card is discarded as any other discard is: it is shown to both players as it
enters its owner's void and triggers "When you discard a card." It sets no X.

**Banish void cards as a cost:** The cost names the void or voids its payer
may use: their own, the opponent's, or either player's. Choose the full number
of matching, distinct physical cards before commitment; copies of the same
card are distinct when they are different physical cards. These payment choices
are not targets. A chosen target, the card being played (including one played
from a void), and cards reserved for earlier costs cannot also pay this
cost. The full energy and card payments must be payable together.

Payment sends each chosen card to its owner's Banished zone, regardless of
which player pays. Both voids are public; choosing or banishing a void card
discloses no unrelated hand or deck cards. Cancellation before commitment
pays nothing, and a committed payment happens once with the play or activation.

**Banish X cards from your void:** X is the number of cards the player chooses
from their own void to pay this additional cost, as in "To play this event,
banish X cards from your void. Look at the top X cards of your deck." X is at
least 1 under the contextual X rule, since looking at no cards does nothing: a
player whose void holds no card that could pay cannot play the card. The card
being played, even when it is played from the void, cannot pay its own cost. Like a discarded X, this X spends no energy and agrees with any X●
the same ability pays. A card banished this way is in the Banished zone, so it
can no longer be played from the void by Reclaim. The value travels with the
stack item, so the effect reads it even after the banished cards are gone.

**A character's X:** A character played with an X cost keeps the value of X
paid for it while it is in play, and its abilities that say X read that value:
"When you materialize a character with cost X●" matches characters whose cost
is exactly that X, the character itself included when its own cost equals it.
A character that enters play without being played, as from a void or as a
figment copy, has X = 0, and a character's X returns to 0 when it leaves play.

## Targeting

**Random characters.** "A random character" names one physical character in
play, chosen uniformly among all matching characters as that instruction
resolves. It includes characters either player controls and figments unless
the effect restricts them. Nobody chooses it, and it is not a target, so a
character that cannot be targeted still qualifies. With no matching character,
that instruction does nothing and consumes no random draw; other instructions
still happen. Each instruction reads the battlefield when it resolves.

Effects choose targets using ownership and type predicates. Ownership predicates
include characters you control, enemies (characters the opponent controls), any
card, or another card (not the source). Type predicates include
character, event, a specific subtype, characters with a minimum spark, or cards
with a specific energy cost.

**Targets are chosen before costs are paid.** Because of this, a card used to
pay a cost cannot also be chosen as the target of the same ability — for
example, "Abandon a character: Return a character from your void to hand" cannot
target the character abandoned to pay the cost: the target is chosen while that
character is still in play, not in the void, and a card chosen as a target is
never also chosen to pay a cost of the same card or ability.

**Cards in a void** are targeted like characters. "Return a character from your
void to your hand" and "Banish up to three cards from the opponent's void"
choose cards in that void as targets when the card is played or the ability
activated (a triggered ability chooses as it resolves), and every rule of this
section applies to them. A chosen void card is still a legal target as the
effect resolves only while it is in that void and still matches; one that left
the void and came back is still the same card (see [Zone
Changes](#zone-changes)).

**Bounds that count.** A target restriction that reads a number, as in
"Dissolve an enemy with ✦ less than or equal to the number of cards in your
void", reads it each time it is checked: as targets are chosen, and again as
the effect resolves. A chosen enemy whose ✦ is then above the number, because
the void lost cards or the enemy gained ✦, is no longer a legal target. A
bound by [this character's ✦](#spark) is read the same way, from the spark
that value names when it is checked.

**Payment-dependent restrictions.** When an optional additional cost changes
one target's restriction, choose whether to pay before choosing that physical
target. Choose a payable cost and a target under the corresponding restriction;
a card reserved for payment cannot be that target. Costs are paid after targets
are chosen. The restriction reads the actual payment decision again as the
effect resolves. A copy keeps that decision while choosing its own target,
without paying the cost again.

**Conditional restrictions.** When mutually exclusive normal conditions
change the restriction on one target, choose one physical card using the
restriction that holds before costs are paid. Check the condition and its
restriction again as that effect resolves. The originally chosen card is
retained; if it is then illegal, that part does nothing. For example,
"If you control 3 or more warriors, dissolve an enemy. Otherwise, dissolve a
≤2✦ enemy" chooses one enemy, and rechecks the Warrior count and spark limit
on resolution.

Each [figment](#figments) is an independent character and is targeted
individually.

A card that "cannot be targeted by effects" cannot be chosen as a target by any
effect, including effects its own controller controls. Effects that do not
target, such as "Dissolve all characters", still affect it. A chosen target that
cannot be targeted by effects when the card or ability resolves, such as a
character that gained this after it was chosen, is no longer a legal target: the
effect does not affect it, and a part of the effect left with no legal target
does nothing.

**Required choices with no legal option:** A card cannot be played, and an
ability cannot be activated, if a choice it requires when it is played — such
as a target — has no legal option. If a required choice has no legal option when
the card or ability resolves, that part of its effect does nothing; the rest of
the effect still happens. A choice of a set number of targets, such as "two
enemies", has no legal option while fewer than that many are available; a
choice of "up to" a number always has one.

## Keywords and Effects

**Dissolve** — Move a target character from play to the void.

"Dissolve each ≤X✦ character" does not target. As the effect resolves, it
dissolves every character in play whose spark is at most the paid X, the
characters of the player who played it included. X may be 0, which dissolves
each 0✦ character.

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

Banish also reaches cards in a hand, a deck, or a void. "Banish your hand and
void" banishes every card there, and "Banish up to two cards from the
opponent's void" chooses those void cards as targets (see
[Targeting](#targeting)). A card banished from a hand or a deck is shown to
both players as it enters the Banished zone, and a created card ceases to exist
instead (see [Created Cards](#created-cards)).

"Banish this card" on an event moves that event from the stack to its owner's
Banished zone as that instruction resolves, in printed order, so "Each player
shuffles their hand and void into their deck, then draws 5 cards. Banish this
card." banishes it after the draws. Until then it is on the stack, never in the
void, so its own "shuffle your void" does not move it, and once banished it does
not go to the void as it finishes resolving. A Prevented event never resolves
and goes where the Prevent sends it, the void unless stated otherwise. A copy
ceases to exist instead (see [Created Cards](#created-cards)), and a reclaimed
event is banished either way (see Reclaim).

"Banish a chosen character from the opponent's hand" is chosen like a [chosen
discard](#zones): you choose as that effect resolves, and only the cards that
match its restriction are shown privately to you for that choice. The chosen
card goes to its owner's Banished zone. It is not a discard, so it fires no
"When you discard a card" abilities. If the hand has no matching card, that
part of the effect does nothing.

A card banished from a hand with a duration returns to its owner's hand when
that duration ends, whether it is an event or a character and whoever held it
before it was banished. This return is a return to hand, not a materialize.
It returns only if it has remained in the Banished zone since that banishment;
moving it out and banishing it again does not restore the earlier return.
A created card ceases to exist instead of being banished and does not return.
For "until this character leaves play", the source must be in play when the
effect would begin, before the private choice; otherwise nothing happens.
Its departure ends every return registered during that stay in play. If it
returns to play, a new trigger can register a fresh banishment independently.

**Return to hand** — Move a character from play to its owner's hand. "Return a
character to hand" and "Return a character to its controller's hand" are the
same effect: a character you control that the opponent owns (see [Gain
control](#keywords-and-effects)) goes to the opponent's hand. Only an
instruction that names "your hand" puts the card into yours.

**Returning a played card** — An instruction to return a played card to the
opponent's hand targets a card on the stack and puts it into the hand of the
opponent of the instruction's controller, even if that player does not own it.
The card's owner stays the same. It leaves the stack without resolving. This
is not Prevent, so a card that cannot be prevented may be returned. The
ordinary created-card and Reclaim replacements apply.

"Return all but one character you control to hand" does not target. As it
resolves, you choose one character you control to keep, which may be one that
cannot be targeted by effects. Every other character you controlled as you
chose then returns to its owner's hand, one after another: the back rank
before the front rank, each left to right. With one character or none,
nothing returns and you choose nothing. "Draw a card for each character
returned" then draws once for each of those characters that reached a hand,
including one the opponent owns that went to their hand. A character a
replacement sent elsewhere instead (see [Zone Changes](#zone-changes)), such
as a created character that ceased to exist or a reclaimed character that
was banished, was not returned and draws nothing.

**Materialize** — Put a character into play. This covers a character entering
play from hand (played normally), from the void, from the deck, as a created
figment, or returned "to play" by an effect. A materialized character enters the
leftmost open back-rank position exhausted (unless awakened). If there is not
enough room, use [Battlefield Capacity](#battlefield-capacity). A character that
enters fires its ▸Materialized trigger and any "When you materialize" triggers.
Putting a character directly into play (for example "return to play" or
"materialize from your void") is not "playing" it: it costs no energy, does not
use the stack, cannot be Prevented, and does not fire "when you play" triggers.

"Discover a character and materialize it" completes the Discover first: the
chosen card enters your hand and your deck is shuffled. That same character
then enters play under your control. If the back rank is full when it would
enter, it stays in your hand. If Discover finds no matching card, nothing is
materialized. The discovered card is not a target.

"Materialize up to two characters from your void" chooses those void cards as
targets (see [Targeting](#targeting)). Characters enter under the effect
controller's control, in their source zone's order, each taking the leftmost
open back-rank position. Their owner stays the same. A selected character
that cannot enter because the back rank has filled stays in its source zone.

"Materialize each ≤X● cost character in your void. Banish them at end of
turn" compares X with each void character's copiable cost (see [Cost
changes](#costs-requirements-and-x)) as the effect resolves; X may be 0, which
materializes each 0● cost character there. "Them" names exactly the
characters that materialize put into play, never one that stayed in its zone,
one already in play, or one another part of the effect put into play. A later part of the same effect, or a floating
or delayed trigger it creates, acts on each of them that is in play as it
resolves, whoever controls it then. Card identity persists across zones (see
[Zone Changes](#zone-changes)), so one that left play and has entered play
again is affected, while one in another zone is not. If none entered play, or
none is in play then, that part does nothing. "Materialize two figments.
Abandon them at end of turn" likewise names exactly the new figments that
entered play, including each new figment that received the group's combined
spark at capacity. It does not name a figment already in play. The delayed
ability keeps the controller who created it, even if its source changes
control, and abandons only members that controller still controls in play,
one at a time in their materialization order (see [Abandon](#keywords-and-effects)).

"Return this character to play with awakened," and likewise "Materialize this
character from your void with awakened," puts the character into play as an
awakened character enters: without the exhausted status from the moment it
enters, so it can challenge, block, and pay ☾ costs that turn. It does not
gain the Awakened keyword. Only
a character that this effect puts into play is awakened: if the character is
no longer in your void as the effect resolves, or the back rank is full, the
effect does nothing, and it does not awaken that character when another
effect has already put it into play.

**Rematerialize** — Trigger an in-play character's materialization again, firing
its ▸Materialized trigger and any "When you materialize" triggers.

**Phasing** — ▸Materialized: Return another character you control to hand, then
move this character to that character's position. Phasing is resolved through the normal
return-to-hand and repositioning tools. The move is part of the effect, so it
can put an exhausted character in the front rank; it happens only if this
character is still in play and the position is open.

**Awakened** — A character with this keyword enters play without the exhausted
status. See [Exhaust and Awaken](#exhaust-and-awaken). The keyword is checked
once, as the character takes its position: gaining or losing Awakened while
in play neither readies nor exhausts it. A character that gains awakened only
while a condition holds, as in "If there are 3 or more events in your void,
this character has +4✦ and gains awakened," enters play without the
exhausted status if that condition holds as it enters, and otherwise enters
exhausted and stays so until it is awakened or the exhausted status clears.

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
"Reclaim N●" it is played from the void for N●. With "Reclaim – " followed by
costs, as in "Reclaim – 2●, Abandon two characters", it is played from the
void for exactly those costs in place of its ● cost: "Reclaim – Abandon a
character" costs no energy, only the abandon. Explicit Reclaim replaces the
normal base, including any "It costs N●" setter. Additional costs and energy
increases or reductions still apply to the chosen Reclaim costs.
A card played this way becomes
**reclaimed**: when a reclaimed card would leave play, it is banished instead.
The reclaimed status replaces all other zone changes for that card (for example,
an effect that would banish and then materialize a reclaimed character does not
bring it back). A reclaimed character does not fire ▸Dissolved triggers when it
is dissolved, because the move to the void is replaced by banishment.

"Cards you reclaim are not banished when they leave play" removes the
reclaimed status from the cards you own — only a card's owner can play it from
the void by Reclaim — while the ability applies and the card is in play or on
the stack. Such a card goes where it normally would as it leaves, and is not
reclaimed afterwards, wherever it went: a character to your void when it is
dissolved, firing its ▸Dissolved abilities; an event to your void as it
resolves or is Prevented, or where the Prevent sends it; any card to a hand, a
deck, or the Banished zone as an effect directs, so a card banished until end
of turn returns. It covers your cards whoever controls them, and an opposing
player's reclaimed cards are never covered by your ability. Whether a card is
banished is decided as it would leave: the ability covers a card reclaimed
before its source entered play, a source leaving play covers its own
departure, and a card that leaves after the source has left play is banished,
even one dissolved later by the effect that dissolved the source. A card the
reclaimed status already banished stays in the Banished zone.

A card can **gain Reclaim** from an effect, as in "Choose a card in your void to
gain reclaim" or "Erode 1. That card gains reclaim 0●." "Choose a card in your
void" chooses that card as a target (see [Targeting](#targeting)); "that card"
after Erode is the card the Erode put into your void, and names no card when
Erode caused Fatigue instead. "When you discard a card, it gains reclaim" gives
the discarded card Reclaim in the void it entered, its owner's, and gives
nothing to a card that left the void before the ability resolves or ceased to
exist instead of entering it. Gained Reclaim works exactly like printed Reclaim.
With no stated duration it is permanent and travels with the card across zones
(see [Zone Changes](#zone-changes)); "until end of turn" ends it then, wherever
the card is. A grant to a group, as in "Until end of turn, events in
your void gain reclaim," gives Reclaim to the cards that match as it resolves,
as with [values fixed as an effect resolves](#spark): an event put into your
void later that turn does not gain it, and neither does the card whose effect
it is, which is still on the stack as it resolves. A gained "Reclaim N●" is played from the void for N● in place of
any printed Reclaim cost; if a card gains several, the most recent applies.
Gaining plain Reclaim keeps the cost the card already had: a card with
"Reclaim 2●" that gains reclaim is still played from the void for 2●. A card
that loses Reclaim loses every Reclaim cost it gained before.

When a play trigger says the played card gains Reclaim, it names that physical
card wherever it exists as the trigger resolves. The card gains the stated
Reclaim cost on the stack and keeps it as it changes zones. If an earlier
trigger moved it to another zone, it still gains Reclaim there; a card that
ceased to exist gains nothing. Only a card in its owner’s void can be played
by Reclaim.

**Was reclaimed:** An effect that checks whether its source card was reclaimed
checks whether that card's latest actual committed play used Reclaim. Removing
the reclaimed status does not change how the card was played. Playing the card
again records that new play's method. The recorded method persists across zone
changes; materializing the card without playing it keeps that method. A created
copy on the stack is not played
and does not inherit the original's Reclaim play method.

**Draw a matching card** — An instruction such as "Draw a ≤2● cost
character" or "Draw an event" draws the first card in your deck, in deck
order, that matches the stated type, subtype, and cost. Compare current type
and subtype and copiable cost, with X in a cost counting as 0. You do not
choose a card, look at the skipped cards, or shuffle the deck. Every other
card stays in its existing order. The matching card is an ordinary draw:
it counts as a card drawn this turn and fires "when you draw" abilities.

The drawn card's identity is private to you except when the opponent already
knows it. Known positions of cards left in the deck are retained only when
public information determines their new positions. An identifiable source's
ability with one fixed matching criterion makes that criterion public; a
hidden source or a choice between different hidden criteria supplies no
criterion for the opponent's position tracking. If the drawn card was
already known, its exact removal determines the remaining positions.

If a nonempty deck contains no matching card, this instruction does nothing.
If the deck is empty, the instruction causes ordinary Fatigue.

**Erode N** — Put the top N cards of your deck into your void; those cards are
the **eroded** cards. Erode can also be directed at a player, as in "The opponent
erodes 2." Eroding with an empty deck causes Fatigue.

An effect that goes on to put a card "from among those cards" into your hand,
as in "Erode 3. You may put a ≤2● cost character from among those cards into
your hand," chooses one of the cards that Erode just put into the void, all of
which both players see. A card that was already in the void, or that Fatigue
kept from being eroded, is not among them. A cost criterion compares the
card's copiable cost, with X in its cost counting as 0, as for Discover. With
"You may" you can choose none. If no eroded card matches, nothing is chosen.
"Return … to your hand" works the same way. Putting the card into your hand is
not a draw.

An effect that names a number of those cards, as in "Erode 4. You may put two
of those cards into your hand," puts exactly that many: with "You may" you
first decide whether to put any, then choose that many of the eroded cards, so
you put either none or the full number, never fewer. If fewer matching cards
were eroded than the number, such as when Fatigue kept some from being eroded,
you put all of them. Without "You may" you choose that many, or put all of
them when fewer match.

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
as to any play. Offering replaces the normal base, including any "It costs
N●" setter; increases, reductions and additional costs still apply.
Offering sets a printed energy-X binding to 0. A mandatory abandon-X cost
without printed energy-X chooses its count before targets and pays no energy
for that count. Its additional costs and Offering's hand banish still apply.

A card that has Offering from another ability, as with "Cards in your hand
have Offering," can be played this way while it has the keyword in hand. A
card played from the void is never played by Offering (see [Playing from the
void](#playing-cards-and-the-stack)). Once
the player chooses Offering, the card is played by Offering even if it loses the
keyword while its costs are paid, for example by abandoning the character that
gave it.

**Ephemeral** — A card drawn with Ephemeral is banished at the end of the turn if
it is still in hand, so it must be played the turn it is drawn. It is no longer
Ephemeral once it leaves the hand. A card drawn with Ephemeral during the
Ending phase after its banishment step, as by a "When you discard a card"
ability that the hand-limit discard triggers, is banished in the next turn's
Ending phase instead, if it is still in hand.

**Vengeful** — When this character loses a challenge, it dissolves the opposing
enemy character. In effect both characters in the challenge are dissolved.

**Prevent** — Counter a card on the stack, sending it to its owner's void
without resolving. Prevent effects are always Interrupts. Variants include
conditional forms such as "Prevent an event unless the opponent pays 2●," and
forms that send the card elsewhere: on top or on the bottom of its owner's
deck, into its owner's hand, or into your hand (see [Zones](#zones) → Hand).
A deck destination uses the card's owner, even when another player played
the card. The rest of that deck keeps its order, and both players know the
prevented card's new position.

In a conditional form, "the opponent" is the opponent of the Prevent's
controller, and the played card it prevents is one that opponent played. They
decide as the Prevent resolves, and the decision is public. "Unless the
opponent pays 2●" lets them pay the energy or decline; a player who cannot pay
declines. "Unless the opponent abandons a non-figment character" lets them
accept or decline, and on accepting they choose which matching character they
control to abandon. That choice does not target, so a character that cannot be
targeted can be chosen. A player who controls no matching character cannot
accept, and the card is Prevented without a choice. Paying or abandoning keeps
the card on the stack, where it later resolves as usual; declining Prevents it.
If the card has left the stack by the time the Prevent resolves, nobody is
asked and nothing is paid or abandoned.

**Abandon** — Move one of your own characters from play to the void. When an
effect tells a player to abandon a character, that player chooses a matching
character they control as the effect resolves. This choice does not target,
so a character that cannot be targeted by effects can be abandoned. With no
matching character, that part does nothing and the rest of the effect still
happens. Abandon cannot be prevented, and it fires the character's ▸Dissolved
trigger and "When you abandon" abilities, its own included (see [Ability
Types](#ability-types)). It is frequently used as a cost. A figment that is abandoned ceases
to exist after firing its dissolved triggers. An instruction naming specific
characters, such as "Abandon them", makes no choice: it abandons each named
character the instructed player controls in play as that instruction resolves,
skipping a character in another zone, one that ceased to exist, or one that
player does not control. Each abandonment fires its own departure triggers.

**Foresee N** — Look at the top N cards of your deck, reorder them in any order,
and optionally send any of them to the void. Only you see the cards you look
at; your opponent sees how many you looked at, how many you put back on top,
and which cards you sent to the void.

A positive Foresee instruction is one Foresee operation, completed after you
choose where the cards go, even if you keep every card in the same order or
your deck is empty. "When you foresee" triggers once when that operation
completes, regardless of how many cards you looked at or sent to the void.
Foresee 0 does nothing and does not trigger "when you foresee". Foresee itself
does not cause Fatigue or shuffle cards from the void into an empty deck.

**Discover** — Look at 3 cards chosen at random from the cards in your deck
that match a stated criterion, put one of them into your hand, then shuffle your
deck. Only you see the cards you look at; your opponent sees that you put a
card into your hand, but not which. If fewer than 3 cards match, look at
all of them; if none match, nothing happens and your deck is not shuffled.
Putting the card into your hand is not a draw.

A ✦ criterion, as in "Discover a ≤2✦ character," compares the card's spark
in your deck (see [Spark outside play](#spark)).

A cost criterion compares the card's copiable cost (see [Cost
changes](#costs-requirements-and-x)). “Cost X●” means exactly X●, and
“cost greater than X●” means more than X●. When the
effect says “Choose a value of X” solely for this Discover criterion, choose
X as the effect resolves and pay no energy for the choice. The canonical
choices are the integers from 0 through the public card catalog's greatest
fixed cost plus one. That last value represents all larger values, which have
the same no-match outcome. The range depends on the public catalog, rather
than the cards in a hidden deck or the player's available energy. A paid X
used solely for this cost criterion can be 0 because a zero-cost discovery
is meaningful.

"Discover a character … and put it on top of your deck" looks and chooses the
same way, then shuffles your deck and puts the chosen card on top of it. The
card never enters your hand. Your opponent sees that a card from your deck was
put on top of it, but not which; you keep knowing it there.

**Choose a character type** — As the instruction resolves, its controller
openly chooses one character type, and both players see the choice. Any
character type in the game may be chosen, whether or not a card in any zone
has it: every subtype printed on a character or a figment type, except the
placeholders printed on characters that have all character types ("*" and
"X"). A following instruction that names "that character type", as in "Choose
a character type. Discover a character of that type", uses the chosen type.

"This character is that character type" makes the character the chosen type
in place of its printed subtype for as long as it stays in play. It is
a change to its types (see **Order of continuous effects**). That choice is
the character's **chosen type**, which its own abilities name as "the chosen
type": "Characters of the chosen type have +1✦" gives +1✦ to every character
of that type, both players' and the character itself included. Until a type
is chosen, and once the character leaves play, it has no chosen type, so the
ability changes nothing. A character that has all character types gains the
bonus only once a type is chosen. If the character is not in play as the
ability resolves, no type is chosen. If it chooses again while it stays in
play, the latest choice replaces the earlier one. A copy of the character
makes its own choice as it enters play.

**Look at the top N cards** — Look at the top N cards of your deck, or all of
them if fewer remain. Only you see the cards you look at. You keep knowing the
position of each one that stays in your deck while visible movement determines
it; ambiguous movement can make you lose track of it, and shuffling ends all
position tracking (see **Put on top or on the bottom of a deck** below). Your
opponent sees how many you looked at.
With an empty deck nothing happens, and there is no Fatigue.

"Banish one," after looking at the top cards, has you choose one of the
cards you looked at as the ability resolves. That card enters the public
Banished zone. The other cards stay on top of your deck in the same order,
and only you learn their identities. With no card to choose, nothing is
banished.

**Linked banishment** — A pair of abilities on one character may banish a
card and later refer to "the banished card." The later ability names the
cards that paired ability banished during that character's same stay in
play, each only while it remains in the Banished visit created by that
ability. A card that leaves Banished and is banished again is outside the
link. If the paired ability triggers several times during that stay, "the
banished card" names each of the cards it banished.

Each copy of the character, and each separately acquired pair of abilities,
has its own link. A character that leaves play and enters again starts a
fresh link. An ability already queued keeps the link of the source object
that triggered it, even if the source leaves play, returns, or ceases to
exist before it resolves. A preceding queued ability can add cards to that
same link after the source leaves. "Put the banished card into your hand"
puts those linked cards into the resolving ability's controller's hand;
it is not a draw.

"Draw K of the cards," as in "Look at the top 4 cards of your deck. Choose one:
Draw 1 of the cards, or draw 2 of the cards and they gain ephemeral," draws the K
looked-at cards you choose. Each is a draw: it fires "when you draw" abilities
and counts toward the cards you drew this turn. If you looked at fewer than K
cards, draw all of them. "They gain ephemeral" makes each drawn card Ephemeral.
The cards you look at and do not draw stay on top of your deck in the same
order.

"Put one on top of your deck, one on the bottom of your deck, and one into
your hand," as in "Look at the top 3 cards of your deck. Put one on top of
your deck, one on the bottom of your deck, and one into your hand," has you
decide where each card you looked at goes, as that effect resolves: each
place gets exactly the number of cards it names, and "the rest," as in "Put
the rest into your void," gets every card left over. You choose the order of
the cards you put on top of or on the bottom of your deck together. If you
looked at fewer cards than the named places take, you choose which places
get them, each getting at most its number, and "the rest" gets none. Putting
a card into your hand this way is not a draw. Your opponent sees how many
cards went to each place and which cards went into your void, but not the
others.

**Shuffle into a deck** — "Shuffle up to 3 cards from your void into your deck"
or "Shuffle your hand and void into your deck" puts each of those cards into
its owner's deck, then shuffles that deck. Your deck is shuffled even when no
card moves, such as when you choose no cards for "up to 3" or your hand and
void are empty. "Draw one of them and shuffle the rest back," after looking at
the top cards of your deck, shuffles your whole deck: the rest never left it.

"Shuffle 2 cards from your hand into your deck" has you choose the cards as
that part of the effect resolves, after any earlier part such as "Draw 3
cards"; they are not targets. With fewer cards in your hand, shuffle all of
them. A card the opponent owns goes into the opponent's deck, which is
shuffled too, and a created card ceases to exist instead (see [Created
Cards](#created-cards)).

Once a deck is shuffled, neither player knows where any card in it is, even
the cards they looked at. Both players see how many cards entered the deck
and from which zones. A card from a void is shown to both players; a card
from a hand is shown only to a player who could see it there.

**Put on top or on the bottom of a deck** — "Put an enemy on top of the
opponent's deck" or "Put all cards in a player's void on the bottom of their
deck" puts each of those cards on top of, or on the bottom of, its owner's
deck. The deck is not shuffled. Several cards put there at once keep their
order, the first of them nearest the top; cards from a void go in the order
they entered it, the most recent first, so the card that has been in the
void longest ends up nearest the bottom. A created card ceases to exist
instead, and a reclaimed card is banished instead (see [Zone
Changes](#zone-changes)).

A player who saw a card go into a deck this way knows its new position,
including a card that stays on top of your deck after you look at it. A card
from a void or from play is seen by both players, and a card from the top of
your deck you looked at only by you. Both players see how many cards move,
their source zones, and their ordered places in the group; the identities
they cannot identify stay hidden.

When cards move within an unshuffled deck, a player keeps knowing a card's
position only when the positions they knew and the visible movement determine
it. A moved card they could identify has a known new position from its place
in the ordered group, even when other movers are unidentified. For a card
that stays in the deck, knowing how many cards were removed before it can
determine its new position. If the visible movement permits different
positions for that card, the player loses track of it. Moving an exact
unfiltered top group keeps the other known positions inferable. Shuffling
the deck ends all position tracking in it.

**Copy** — Create a duplicate of a card or effect. Variants include copying a
character in play and copying the next card played. Copies of cards on the stack
follow [Copies on the stack](#playing-cards-and-the-stack); figment copies of
characters follow [Figment Copies](#figment-copies).

"When you copy an event" triggers for each successful copy on the stack or
created in a hand, by the copied card's copiable values as the copy is made.
"It" names the original physical card. An in-play controlled source with
"When you copy an event, copy it an additional time" modifies each successful
individual copy attempt: the requested copy gains one additional physical copy
for each currently active occurrence of that ability. These modifiers contribute
additively once to that attempt, including when a fixed count requests several
independent copies. They do not apply again to its bonus copies. A copy-operation modifier is a
passive ability, not a triggered or activated ability. Suppressing triggered
abilities does not suppress it; losing the modifier ability removes its
contribution. Each copy has
independent legal modes and targets and uses the same destination. A hand copy keeps that copy action's
Ephemeral flag and the original's captured copiable printing and variant,
even if a created original has ceased to exist. Separately addressed changes,
such as making one created copy cost 0●, affect only that copy. Additional
copies are successful copy occasions observed by ordinary triggered abilities.
A trigger that copies a card makes a fresh copying attempt, with its applicable
modifiers, and can produce a genuine [Mandatory Loop](#mandatory-loops).

**Gain control** — Move an opponent's character to the leftmost open back
position on the receiving side. It preserves its state and is exhausted through
this turn's Ending, even if Awakened; this is not materialization. If the rank
is full, the effect fails. Player-initiated Gain Control effects warn before
costs are paid. After a successful move, recalculate Support, controller-based
effects, subtype counts, and challenger or blocker status before resolving
resulting triggers.

**Gaining abilities** — "This character gains the abilities of that
character" gives the character every ability printed on that card for its
variant, such as an amplified card's amplified text: its keywords and its
triggered, activated, and static abilities, after the character's own. It
gains none of the changes other effects made to that card, such as gained
spark. A gained ability that works only from a hand or a void, such as
Reclaim, does nothing while the character is in play. Each gained ability is
an ability of the character: it activates a gained activated ability itself,
paying its costs, ☾ included, and a gained "Once per turn" ability counts only
its own uses by this character. Gained keywords and static abilities apply
with the other continuous effects in the [order of continuous
effects](#ability-types), as of when the character gained them.

A character keeps the abilities it gained while it stays in play, whoever
controls it, and loses them as it leaves play: if it returns, it has only its
own abilities, and a "Once per turn" ability it gains later in that turn is
unused. A gained ability that triggers as the character leaves play, such as
"When this character leaves play", sees it as it was just before it left. So
do the gained abilities that trigger on its own dissolve or abandon, a gained
▸Dissolved ability, a gained "When a character you control is dissolved",
and a gained "When you abandon a character" among them: they trigger as it is
dissolved or abandoned, though the gains have ended. A gained ability that
works only from a void does not see its own character dissolved or
abandoned. A
gained activated ability already on the stack, or a gained triggered ability
already waiting to resolve, still resolves after the character leaves play.

"Banish a character from a player's void. This character gains the abilities
of that character" chooses a player as it resolves, then a character in that
player's void as its target; with no character there, nothing is banished and
nothing is gained. The character with the ability gains the abilities of the
card it banished only if it is still in play as the ability resolves; the card
is banished either way.

**Losing abilities** — "An enemy loses all abilities" takes every ability the
character has away from it: its keywords and its triggered, activated, and
static abilities, those printed on its card (or its figment's) and those it
gained. It keeps its spark, character type, and statuses; what its own static
abilities did, such as giving it or other characters spark, stops. The loss applies with the other continuous
effects in the [order of continuous effects](#ability-types), as of when it
began: an ability or keyword the character gains after the loss, from a
resolving effect or from a static ability whose card entered its zone later,
works; one it had before the loss does not, until the loss ends.

A character loses its abilities only while it stays in play, whoever controls
it: the loss ends as it leaves play, whatever its duration, and it has all its
abilities wherever it goes. Having no abilities as it leaves, it triggers
none of its own "When this character leaves play" or ▸Dissolved abilities. An
"until the opponent pays N●" loss whose character leaves play ends with it,
so nothing is left to pay for. An ability of the character already on the
stack, or a triggered ability already waiting to resolve, still resolves.

"An enemy loses all abilities. This character gains those abilities" then
gives the character with the ability the abilities the enemy had as it lost
them: every ability of its card for its variant, or of its figment's type, and
of each card or figment whose abilities it had gained and not lost, in that
order (see Gaining abilities). It gains none of the keywords other effects
gave the enemy or took from it. It keeps them while it stays in play, whatever
then happens to the enemy, and gains nothing if it is no longer in play as
the ability resolves; the enemy loses its abilities either way.

**Each player** — "Each player draws two cards" and "Each player discards a
card" happen once for each player, the active player first, then the opposing
player, whoever controls the effect. Within each player's part, "you" and
"they" mean that player: they make its choices, such as which card to discard,
from their own hand, and the opposing player does not see those choices until
the cards become public. One player's part, its choices included, finishes
before the next player's part begins. "Each player discards their hand, then
draws 6 cards" has every player discard first, then every player draw. An "each
player" effect never asks for targets or modes, since one player would choose
them for everyone.

## Ability Types

**Event abilities** — Effects printed on event cards. They resolve when the event
resolves from the stack, then the event moves to the void unless they moved it
(see Banish).

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
only as your first turn of the battle begins. "At end of turn" abilities
trigger as the Ending phase of each turn begins, and "At the end of your turn"
abilities as the Ending phase of each of your turns begins, extra turns
included; they resolve before the rest of the Ending phase (see [Turn
Structure](#turn-structure)). A delayed "at end of turn" trigger, as in
"Banish them at end of turn", triggers at the end of the turn it was created
in. One created during the Ending phase, after that turn's "at end of turn"
abilities triggered, triggers at the end of the next turn instead, and a
character that enters play then does not trigger "At the end of your turn"
that turn.

**When your hand becomes empty:** This triggers once when the hand you hold
changes from one or more cards to zero cards. Playing, discarding, banishing,
moving the last card elsewhere, and a created card ceasing to exist can each
cause it. The hand belongs to its holder, even when another player owns its
cards. Moving a card within the same hand does not cause it, and a hand that
is already empty does not trigger it. The move or removal finishes before
abilities check whether they work in their current zones. Drawing later in
the same effect does not cancel the occasion. The occasion is public and
names no card. Its abilities wait for the whole effect or action to finish,
then resolve in the usual trigger order. The occasion follows the completed
move of the last card and precedes that move's own announcement. An ordinary
last card's discard is announced after it enters the void, so its "When you
discard" abilities follow the hand-empty abilities. A created last card's discard is
announced while it still exists, before it ceases to exist, so its "When you
discard" abilities precede the hand-empty abilities. When several cards are
discarded together, earlier cards' discard abilities precede the hand-empty
abilities, and abilities for the completed discard of one or more cards follow
all of them.

**Counting ▸Dawn abilities:** "If 3 or more ▸Dawn abilities trigger during
your Dawn phase, draw a card" counts actual successful admissions during
that phase, including either player's abilities. A named-Dawn ability
counts whenever it triggers then: through its Dawn branch, another branch
of a combined trigger, or an instruction that triggers its named ability.
Each admission counts once, including repeated admissions of the same
ability. A floating or delayed named-Dawn trigger also counts. A disabled
ability, a failed intervening condition or an already-used once-per-turn
ability does not trigger and contributes nothing. Resolving an ability does
not count it again.

When the count first reaches 3 that turn, each applicable copy of the draw
rule queues one draw. These reactions follow all simultaneous abilities
admitted by the causing event or the complete source list of one named-trigger
instruction. A source gained
after that crossing does not react retroactively; losing and reacquiring it
does not cause another crossing. A queued reaction resolves even after its
source loses the rule. The count starts fresh each turn. Observing an
identifiable reaction establishes that its threshold was met, including when
its source becomes public later. This knowledge persists if the source is
hidden again. A hidden
source's trigger does not otherwise reveal its named-trigger classification.

**When a named ability triggers:** An ability that watches you trigger a
named ability sees each successful admission of an ability you control that
has that named trigger, including combined triggers admitted through another
branch, explicit instructions, and floating or delayed abilities. Disabled,
already-used once-per-turn, failed-condition, and wrong-zone candidates do
not trigger it. Resolving an ability does not trigger it again. The occasion
concerns the ability and names no card. An identifiable observer reaction
establishes that an ability with the watched named trigger was successfully
admitted, including when its source is hidden, without identifying that hidden
physical source. Its reactions follow the whole
causing admission batch and any Dawn-count threshold reactions. Each admitted
occasion is observed in the causing admissions' FIFO order, with observers
in the usual simultaneous trigger order. Reactions that themselves have a named trigger can cause
further reactions. If these admissions repeat unavoidably before any body
can resolve or any player can choose, the battle ends in a mandatory-loop
draw; an optional instruction in a waiting body cannot stop that sequence.

Each player sees a triggered ability trigger and resolve when they can see its
card, avatar, or dreamsign, but not a hidden card the triggering event
concerns: when "When you draw a card" triggers, the opponent learns that it
triggered, not which card was drawn, even once that card enters a zone they can
see.

**Where triggered abilities work:** A triggered ability works while its card is
in play. An ability that names another zone, such as "▸Dawn: If this card is in
your void, …", works while the card is in that zone instead, and so does an
ability that returns its own character from your void to play, such as "When
you play a card from your void, return this character to play." Avatar and
dreamsign abilities always work. A ▸Dissolved ability triggers from wherever
the dissolved card went, and "When you reclaim this character" from the stack. It triggers for the player who controlled the character
as it left play, among that player's abilities, ordered by the zone it went to.
A card dissolved into its owner's void is controlled by its owner there; this
does not change who controls its ▸Dissolved ability. A dissolved figment or
other created character triggers before it ceases to exist. Abilities that trigger
when a card leaves play or leaves your void see that card as it was just before
it left. Nothing triggers
while the opening hands are dealt.

**When a character is dissolved:** An ability such as "When a character you
control is dissolved" triggers once for each matching character that is
dissolved, abandoned characters included. It sees that character as it was
just before it left play: who controlled it, its types, and whether it was a
figment. "A character you control" includes the character with the ability,
which triggers on its own dissolve; "another character you control" does not.
The ability triggers only if it worked where its card was as that character
left play, so an ability that works in play sees its own card dissolved, and
one that works from the void does not. Whether its card's triggered
abilities were disabled, and whether a "Once per turn" ability had already
triggered that turn, are read then too, so the character leaving play
neither stops nor frees the ability. It triggers for the player who
controlled its card as that character left play, among that player's
abilities, even when its card is the dissolved character and goes to its
owner's void. A floating or delayed trigger that existed as the character left
play triggers even if its duration ended as the character left, so one lasting
while its source is in play sees that source's own dissolve. A character that
leaves play without being dissolved — banished, returned to hand, or ceasing
to exist without a dissolve — does not trigger it, nor does a dissolve that
Veil turns into losing Veil or that Reclaim turns into a banish.
"Non-figment" excludes figments and figment copies. A clause about that
character in the same ability, such as "If it was a survivor, create two
instead", reads it the same way, as it was just before it left play: a
character that was a survivor only through an effect in play counts as one,
though it is not a survivor in its owner's void, and a character with all
character types is a survivor.

An effect that dissolves several characters dissolves them one at a time: the
characters it targets in the order they were chosen, and the others, as in
"dissolve each character you control", in the fixed order — the effect
controller's characters first, back rank `B0` through `B9`, then front rank
`F0` through `F8`, then the opposing player's in the same order. Each dissolve
triggers abilities on its own, so a card dissolved earlier by the same effect
is in the void when the later ones are dissolved, and its "when … is
dissolved" ability does not see them.

**When you abandon a character:** An ability such as "When you abandon a
character, draw a card" triggers once for each matching character you
abandon, whatever makes you abandon it: your own effect, the opponent's
effect, as in "The opponent abandons a character," a cost, or keeping your
card from being Prevented. "You" is the player who abandons, who controls
the character, so the opponent's ability does not see the characters you
abandon. It sees that character as it was just before it left play: its
types, including a type it had only through an effect in play, and its other
characteristics there. "A character" includes the character with the
ability, which triggers on its own abandon. The ability triggers only if it
worked where its card was as that character left play, so an ability that
works in play sees its own card abandoned, with the abilities its card had
in play, and one that works from the void does not. Whether its card's
triggered abilities were disabled, and whether a "Once per turn" ability had
already triggered that turn, are read then too, so the character leaving
play neither stops nor frees the ability. It triggers for the
player who controlled its card as that character left play, among that
player's abilities, even when its card is the abandoned character and goes
to its owner's void. A floating or delayed trigger that existed as the
character left play triggers even if its duration ended as the character
left, so one lasting while its source is in play sees that source's own
abandon. A figment or other created character that is abandoned ceases to
exist instead of entering a void, and a reclaimed one is banished instead,
but each is still abandoned and triggers the ability. "This character" in
the ability names its card only while that card is in play, so an ability
that triggered on its own abandon, as in "When you abandon a character, draw
a card and this character gains +1✦," draws a card and gives no ✦. Several
characters abandoned together, as in "Abandon two characters," are abandoned
one at a time: a character abandoned earlier is in the void when the later
ones are abandoned, and its ability does not see them.

**When a card is put into a void:** An ability such as "When a ≤2● cost
character is put into your void" triggers once for each matching card that
enters that void, by any route and from any zone: dissolved or abandoned from
play, discarded from a hand, eroded or otherwise put there from a deck,
prevented or resolved from the stack, or put there by any other effect. "Your
void" is the void of the player who controls the ability. A card always goes
to its owner's void, so a character you own that the opponent controls enters
your void when it is dissolved, and an opponent's character you control
enters theirs. The ability sees the card as it is once it is in the void: its
type, subtype, and cost there, not types or other changes it had only in play.
The cost it reads is the card's cost for conditions ([Cost
changes](#costs-requirements-and-x)), which effects that change what a card
costs to play do not affect. The ability triggers only if it works where its
card is as the card enters the void, so an ability that works in play never
sees its own card put into a void, and one that works in the void sees its
own card arrive. A card that is banished, returned to a hand, or put into a
deck does not trigger it, nor does a figment or other created card, which
ceases to exist instead of entering a void, or a reclaimed card, which is
banished instead. An effect that puts several cards into a void puts them
there one at a time, and each triggers the ability on its own; a card with
the ability that enters the void partway through no longer sees the rest
from play. Both players see which card entered the void, even one eroded
from a hidden deck or discarded from a hidden hand.

**When you discard this card:** An ability such as "When you discard this
card, it gains reclaim 0●" works from the void. It triggers once its card has
been discarded from your hand into your void, whatever made you discard it,
as with "When you discard a card": your own effect, the opponent's effect,
including one where the opponent chooses the card, a cost, or the hand-limit
discard during the Ending phase. "You" is the card's owner, whose void it
goes to, so a card you own that the opponent discards from their hand does
not trigger it, nor does a created card, which ceases to exist instead of
entering the void. A card that enters the void any other way, such as by
being dissolved or eroded, does not trigger it, and a card already in the void
does not see other cards discarded. "It" and "this card" name the card while
it is in your void: if it leaves the void before the ability resolves, the
ability does nothing to it. Both players see the card and the ability
trigger, even when it was discarded from a hidden hand.

**When you erode a card:** An ability such as "When you erode a card, a
random character you control gains +1✦" triggers once for each card that
Erode puts from your deck into your void, whatever made you erode: your own
effect, or the opponent's, as in "The opponent erodes 2." An
Erode puts its cards into the void one at a time, and each triggers the
ability on its own. The ability sees the eroded card as it is in the void.
Only Erode erodes: a card sent to the void by Foresee, discarded, or
dissolved is not eroded, and an Erode that causes Fatigue instead erodes no
card. "When the opponent erodes a card" works the same way with the
opponent's deck and void.

**When you discard or erode this card:** An ability such as "When you
discard or erode this card, it gains reclaim 3●" works from the void and
triggers on each occasion: once its card has been discarded from your hand
into your void, as for "When you discard this card," and once Erode has put
it from your deck into your void, whatever made you erode. A card already in
the void does not see other cards discarded or eroded, and only the card
itself triggers its ability. "It" and "this card" name the card while it is
in your void: if it leaves the void before the ability resolves, the ability
does nothing to it. Both players see the card and the ability trigger, even
when it was eroded from a hidden deck.

**When you reclaim a card:** An ability such as "Once per turn, when you
reclaim a card, gain X⍟ where X is this character's ✦" triggers once for each
card you play from your void by Reclaim, printed or gained (see [Reclaim](#keywords-and-effects)),
as that play is announced, with the card on the stack. Only Reclaim reclaims:
a card played from a hand, or from the void by an effect that lets you play
it from there, is not reclaimed, and when both that effect and Reclaim cover a
card in your void, only playing it by Reclaim triggers the ability. The
ability matches the card by its type and subtype as it was played, as "when
you play" abilities do. An ability that works in play does not see its own
card reclaimed, since that card is on the stack. "When the opponent reclaims
a card" works the same way with the opponent's plays.

**When you reclaim this character:** An ability such as "When you reclaim
this character, it gains +1✦" triggers when you play its card from your void
by Reclaim, and only then, not when you play it from a hand or by another
effect. It works from the stack, where its card is as the play is announced,
and only the card itself triggers it, never another card reclaimed while it
waits on the stack. Like every triggered ability, it resolves before the
opponent receives priority, while the card is still on the stack: "it" and
"this character" name the card there, and the spark it gains is gained spark,
which the card keeps as it resolves and enters play and, like all gained
spark, across zones (see [Spark](#spark)). A reclaimed card that is not
banished as it leaves play, as with "Cards you reclaim are not banished when
they leave play," gains again each time it is reclaimed. If the card leaves
the stack before the ability resolves, as when an earlier ability prevents
it, the ability does nothing to it. Abilities that trigger "when a character
gains ✦" see only characters in play, so they do not see this gain.

**When you play a card from your void:** An ability such as "When you play a
card from your void, return this character to play" triggers once for each
card you play from your void, by Reclaim, printed or gained, or by an effect
that lets you play it from there (see [Playing from the
void](#playing-cards-and-the-stack)), as that play is announced, with the card
on the stack. A card played from a hand does not trigger it, nor does a card
put into play or onto the stack without being played, such as a materialized
character or a copy. The ability matches the card by its type and subtype as
it was played, as "when you play" abilities do. "Return this character to
play" names the character's own card in your void, so that ability works
while its card is in your void, the zone it returns from, and does nothing in
play or in any other zone. It never sees its own card played from your void,
since that card is then on the stack. "This character" is its card in your
void as the ability resolves: if the card has left the void by then, as when
an earlier ability returned it to play or to your hand, the ability does
nothing, and with the back rank full the card stays in your void (see
[Battlefield Capacity](#battlefield-capacity)). "When the opponent plays a
card from their void" works the same way with the opponent's plays.

**When you return a character to hand:** An ability such as "When you return
a character you control to hand, reduce its cost by 2●" triggers once for each
character you control that leaves play for a hand, whatever effect or cost
moved it, the opponent's included. It sees that character as it was just
before it left play: who controlled it and its types. "A character you
control" includes the character with the ability, which sees its own return;
"another character" does not. "To your hand" adds that the card goes to your
hand, so a character you control that the opponent owns, which goes to their
hand, does not trigger it. A character that leaves play for anywhere else does
not trigger it, nor does a card returned to a hand from a void, nor a
character a replacement sends elsewhere instead (see [Zone
Changes](#zone-changes)): a created character that ceases to exist and a
reclaimed character that is banished are not returned. When several
characters leave play one after another, as with "Return each character you
control to hand," the ability sees those that leave while it still works. "It"
is the returned card, wherever it is as the ability resolves (see [A card's own
cost](#costs-requirements-and-x)).

**When you materialize a character:** An ability such as "When you
materialize a character, awaken each other character you control" triggers
for each character you materialize, once it is in play. "A character"
includes the character with the ability, which sees its own materialization;
"another character" does not. "Each other character you control" is every
character you control except the one with the ability, so the character that
just materialized is one of them.

**Counting materializations:** An ability such as "When you materialize your
second spirit animal in a turn, draw a spirit animal" counts the matching
characters you have materialized this turn, including the one just
materialized, and triggers only for the one that brings the count to exactly
two. Every materialization of a character under your control counts, each
time it happens: a character played from a hand, put into play from any
zone, created as a figment or figment copy, or rematerialized while in play.
Characters that have since left play or ceased to exist still count, and so
do characters materialized before the ability's card entered play, so a card
with the ability that is itself the second spirit animal you materialize
sees its own materialization. Characters put into play by one effect are
counted one at a time, in the order they enter. Each materialization matches
by the character's type as it materialized: a character that has all
character types as it materializes is a spirit animal, and a later change to
its types does not change what that materialization counted toward. "When
you materialize a spirit animal, if it is not the first spirit animal you
have materialized this turn, …" counts the same way and triggers for every
matching materialization after the first. The count only grows during a
turn, so a materialization that was not the first is still not the first
as the ability resolves.

**When you draw a matching card:** An ability such as "When you draw a
character" matches the card by its characteristics as it arrives in hand.
A nonmatching draw does not use that ability's once-per-turn allowance. A
matching draw uses the allowance when the ability triggers, so another
matching card drawn in the same instruction does not trigger it again.
"It" refers to that same physical card as the ability resolves. A numbered
draw is counted among all of that player's cards drawn this turn; a stated
card restriction is an additional requirement on that draw.

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

**Triggering that ability again:** An instruction to trigger the ability that
caused it names exactly that admitted ability, with its original controller,
definition, subject and captured bindings. It admits one further occurrence,
which joins the end of the waiting line and counts as a named ability
triggering. Losing the ability, changing its source's zone or definition, or
its source ceasing to exist does not replace that referent. A current disable
of the original character's triggered abilities prevents a fresh ordinary
occurrence. Its intervening condition must hold again, both when repeated and
when it resolves. A once-per-turn original has spent its allowance, even if
its gained definition's records have ended; a delayed one-shot original has
spent its sole occasion. Neither triggers again. A repeating floating ability
retains its own captured context. Each successful occurrence chooses its own
modes and targets when it resolves. An instruction without a causing admitted
ability does nothing.

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
  cards were created for the battle, then the cards they control on the stack,
  bottom first — and then their floating and delayed
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

**Disabled abilities:** An effect disabling triggered abilities prevents new
triggers. When it also disables activated abilities, the affected character
cannot begin an activation. An ability already triggered or activated still
resolves. Keywords and static abilities remain active. A disabling effect
lasting while its source is in play ends when that source leaves play;
returning the source does not restore that effect.

**Where activated abilities work:** A card's activated ability works while its
card is in play. An ability that moves its own card out of your void, such as
"Abandon a character: Materialize this character from your void," works while
its card is in your void instead, and only there: it cannot be activated while
the card is in play or in any other zone. The card's owner activates it, since
a card in a void is controlled by its owner, under the ability's usual timing
and once-per-turn limit. ☾ and other costs that only a character in play can
pay, such as "Abandon this character," cannot be paid from the void, so an
ability with one of them cannot be activated there. Any other cost is paid as
usual; a cost that banishes cards from your void may banish the ability's own
card. An ability that would put a character into play cannot be activated
while your back rank is full (see [Battlefield
Capacity](#battlefield-capacity)), even if its cost would abandon a
character. When several cards in your void have such abilities, they come
after your avatar, dreamsigns, and characters in play, in the order the cards
were created for the battle. Once activated, the ability resolves like any
other: "this character" is its card in your void as the ability resolves, so
if the card has left the void by then, as when the opponent banishes it in
response or a cost banished it, the ability does nothing to it, and the rest
of the ability still resolves. A card's "you win the game" ability never works
from the void (see [Objective](#objective)).

**Static abilities** — Always-on rule modifications that apply while their source
is in play, such as cost reductions, spark bonuses for matching characters, or
other rule changes. Avatar and dreamsign static abilities work throughout the
battle. A conditional static ability applies only while its condition holds,
read live as the game changes. A hand or deck count in such a condition
counts every card there; a void count may count only matching public cards.

**Where static abilities work:** A card's static ability that names another
zone, such as "If this card is in your void, characters you control have
+1✦", applies while the card is in that zone instead, and stops as the card
leaves it. Its controller is the player whose void, hand, or deck the card is
in. A static ability that works from your hand or deck does not reveal its
card: the opponent sees what the ability changes, but not which card it comes
from.

A static ability can also change cards in a hand, a deck, or a void, as in
"Cards in your hand have Offering." "Your hand" is the hand you hold; "your
deck" and "your void" are the ones you own. Each card that matches has the
change only while it is in that zone and the ability applies: it loses the
change as it leaves the zone or as the ability's source leaves play. Which cards
match is decided from their types after any type changes, as for characters in
play. On a dreamsign, a static ability's "your deck" means every card that came
from your journey deck, wherever it is during the battle; created cards and
figments never match it.

**Order of continuous effects:** When several static abilities and effects
with a duration change the same card, they apply in this order: changes to its
types ("has all character types", "this character is that character type"), then keywords it gains or loses, then base
spark it is given, then changes to its spark, then changes to its cost. Within
each step, effects apply in the order they began: a static ability when its
source entered play, or the zone the ability works from (an avatar's or
dreamsign's at the start of the battle),
and any other effect when it resolved. Among effects that began at the same
moment, static abilities apply first — avatars and dreamsigns, then cards in
the order they were created for the battle — then the other effects, in the
order they were created. Where effects conflict, such as one that gives a
keyword and one that removes it, the one applied last wins. An effect
that sets a character's type replaces all character types earlier effects
gave it: after "has all character types" then "is a Mage", it is only a
Mage. If "has all character types" applies after "is a Mage", it has every
character type. A static ability decides whether its condition holds, which characters it
changes, and by how much, from what the earlier steps produced: an ability that changes spark reads types, keywords, and base
spark, but not other spark changes. A ✦ criterion on a card outside play is
the exception: it reads that card's spark with every change applied, even in
an ability of an earlier step, as "Cards in your hand with ≤2✦ have Offering"
reads the spark a hand card gained. Static abilities never change the spark of
a card outside play, so no ability reads a spark it changes itself.

**Modal abilities** — Abilities that present multiple options, written as "Choose
one:" followed by the available effects (each with its own cost where relevant). A card or activated ability's mode is chosen as it is played, before its
targets; a triggered ability's as it resolves (see Choices above). The mode is
chosen first even when the text puts another instruction before "Choose one:":
for "Look at the top 4 cards of your deck. Choose one: …", the mode is chosen
as the card is played, and the look happens as it resolves.

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
- Only a card in play stores counters. If the card is not in play as an
  instruction to store counters resolves, nothing is stored. So "Abandon a
  character: Store 1⧗." paid by abandoning the card itself stores nothing, and
  neither does a store whose card an opponent's response removed from play.

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
   longer a dissolve, unless an ability such as "Cards you reclaim are not
   banished when they leave play" removes its reclaimed status (see Reclaim).
3. A dissolve by an effect the opponent controls removes Veil instead (see
   Veil).

So a figment with Veil that the opponent dissolves only loses Veil, while a
reclaimed character with Veil that the opponent dissolves is banished.

**Causing an enemy's removal:** "When you dissolve or banish an enemy" fires
once for each opposing character in play actually dissolved or banished by
an effect you control or by a character you control in a challenge. The
character's controller is read immediately before departure. A Reclaim
replacement of an effect's dissolve, return, or deck movement is a banishment
by that effect's controller. A delayed printed banishment belongs to the
controller who created that delayed ability, with opposition read when it
resolves. A created character dissolved or explicitly banished counts even
though it ceases to exist. Veil preventing a dissolve, an ordinary return or
deck movement, pile-card banishment, abandon, Offering or Ephemeral cleanup,
and unrelated cessation do not count.

"When a character you control dissolves an enemy in a challenge" names the
opposing character in that lane as the cause of each actual dissolve, ties
and Vengeful included. Both lane participants and their controllers are
captured before either leaves. "It" names the removing character; if it is
absent from play when a spark gain resolves, it gains nothing. A replacement
banishment is not a challenge dissolve. The removed character's copiable
cost is captured immediately before its departure; the removing character's
cost is captured before either lane participant departs.

Gained spark and persistent statuses (such as reclaimed and Offering) travel
with the card across zones, while spark or keywords a card merely _has_ from a static
ability, and any counters on the card, do not (see [Spark](#spark) and
[Counters](#counters)).

**Cards an effect moved:** When a resolving effect refers back to a card one
of its own parts moved, as in "You may discard a card to discover a character
with cost greater than that card's cost," it reads that card's cost as it was
just before the move: its copiable cost (see [Cost
changes](#costs-requirements-and-x)). A card that ceased to exist instead of
moving, such as a created card discarded from a hand, still has that cost.

When an effect counts events or characters discarded by one of its own
instructions, it counts only the cards actually discarded by that instruction,
matching their type immediately before they leave the hand. A card whose type
changed matches by its new type. Created cards that cease to exist and cards
banished by a replacement count too. Separate instructions and payments stay
separate; later draws or moves do not change the captured count.

## Created Cards

A **created card** is produced by an effect rather than drawn from a deck — for
example, an effect that creates a token event in your hand. A created card can
be played and otherwise used like a normal card, but it ceases to exist whenever
it would move to a deck, a hand, the void, or the Banished zone. A created event,
for instance, ceases to exist on resolution rather than moving to the void, and
a created character that would return to hand ceases to exist instead. A
created card that ceases to exist is gone from the battle and is not in any
zone.

An effect that creates a named card in a hand, such as "create 'Contemplation'
in your hand", puts a new created card with that card's printed
characteristics into that hand, which holds it like any other card. Its
holder sees which card it is. The opponent sees the hand grow and the ability
that created it, but no card in that hand is revealed to them.

**Figments** are a character-typed subset of created cards.

**Creating from the card pool:** "Add a random card from the card pool to your
hand" creates one matching card from the fixed run multiset retained in the
resolved Avatar package. An opponent uses their generated fixed pool. Each eligible copy in that multiset is
equally likely, and creation does not spend it. A missing, empty, or unmatched
pool adds nothing. The created card has its printed base characteristics.
Its intrinsic variant is base; statuses and continuous effects still apply normally.
Cost conditions count X as 0. Both players may know the non-zone pool's UUIDs
and copy counts, but the created card's physical identity in a hand remains
private to its holder. Sampling retains the eligible-copy choices captured
at creation as anonymous hand constraints, without revealing the selected
printing, physical card, or hand position. An existing anonymous observed
member can retain those immutable choices; created lifecycle already makes
its surviving hidden location a hand. Legacy saves without captured choices
use their declared pool and deck information as an approximation.

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

A figment named by its type, such as a **shadow figment** or a **warrior
figment**, is a figment, figment copies included, whose current subtype is that
type: a figment copy of a Shadow character is a shadow figment, and a Shadow
character that is not a figment is not. "If you control no shadow figments"
holds only while no character you control is a shadow figment, whoever
controls other shadow figments.

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
and void, how many cards each player has played and drawn this turn, and the
characters each player has materialized this turn — and those differences
gained something for that player and nothing for the opponent, the player is
offered a shortcut:

- **Repeat ×N** performs the sequence N more times, for any N up to 10,000.
- **Repeat until victory** performs it until the battle ends.

A difference is a gain for a player when their victory points, current or
maximum ●, counters on cards they control, gained spark on cards they control,
or cards in their deck increase. A player's cards in their void may change in
either direction, and the cards played and drawn and the characters
materialized this turn may grow, without counting as a gain or a loss. The
sequence qualifies only if none of the player's own values fell, none of the
opponent's rose, and at least one changed. A sequence in which the opponent had a decision — a legal response
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
leave the sequence by playing a card, activating an ability, repositioning,
passing, or choosing a legal prompt answer. Independent choices of a copy's
targets or modes can leave every continuation unavoidable. Nobody can stop
such a loop, so:

- If the battle returns to exactly the same state during such a sequence, the
  battle ends in a draw. The order in which cards entered their zones is part
  of the state, but not when they did. The repeat may be noticed a few cycles
  after it first happens, and a loop more than 4,096 game actions long is
  ended by the limit below instead; the result is the same.
- If such a sequence runs for more than 100,000 consecutive automatic game
  actions without repeating, the battle also ends in a draw.
- A proved closed copy continuation ends in a draw at the mandatory-check
  threshold (64 consecutive automatic actions). Every legal answer must
  preserve its continuing trigger queue, its relevant characteristics and
  its victory conditions. Growing physical copies remain distinct cards,
  with every creation and triggered occasion recorded before the draw.

A legal stopping choice, such as declining a "you may" effect, starts a new
run of consecutive automatic actions. Independent copy choices preserve a
run only when both the state before the choice and its completed state prove
the continuation unavoidable; choosing to enter such a continuation starts
its count at zero. Choices whose continuations the engine cannot prove
unavoidable also start a new run. A forced choice preserves the count.
Repetitions of an optional loop are the player's own actions, so they never
make a mandatory loop either.

## Journey Transfiguration Effects

A journey transfiguration applies one applicable form to a concrete deck entry
that has no form. A transfiguration occurrence belongs to that original entry,
identified independently of other entries with the same card identity. Gaining
an already-transfigured card or copying one is a gain or copy, respectively.
Developer edits and loading a saved journey provide no occurrence.

A copy granted when an Event is transfigured is added after the successful
operation, once for each source copy held after that operation. The original
card's current type, including its permanent type change, determines whether it
is an Event. The copy has a fresh deck-entry identity and carries the original's
form and permanent entry modifications. Copies granted by this operation do not
provide further transfiguration occurrences.

A replacement of a Transfiguration site's allowance with two cards is prepared
with the site's initial offers and prices. Multiple copies set the same two-card
allowance. Each accepted choice uses a distinct offered entry and its quoted
price. The prepared allowance survives source loss and reload; gaining a source
after preparation does not change it. The player may finish the visit before
using the whole allowance.

An optional random transfiguration after each battle is earned for each held
source copy in held order, including victory, final victory, defeat, and draw.
Each copy permits zero through its printed maximum of distinct current entries
with an applicable form, without an Essence cost. The player chooses the entries;
one random applicable form is applied to each when the choice succeeds. Choosing
zero entries consumes no random draw. The earned permission survives source loss
and reload; a source gained afterward grants no additional permission. Earned
purge and transfiguration windows share their original held order. Finishing them
restores the battle's exact Atlas, completed, or failed route, preserving its
committed reward and failure summary. Rejected choices change neither cards,
Essence, the earned cursor, nor modifier rewards.

## Journey Purge Effects

A journey card purge is an authored purge operation on a concrete deck entry.
Bane cards are eligible unless the effect restricts them. Purging multiple
entries with the same card UUID counts once for each entry. A purge inside a
compound effect counts even when that effect subsequently grants another card;
its original entry and card identity determine the purge. Replacing a card
without a purge clause, removing a card through the debug editor, replacing a
Dreamsign, and expiry of temporary deck grants are distinct operations.

A gain of Essence when a card is purged applies after the validated purge and
its costs, once per purged entry for each source copy held after that change.
The prospective gain cannot pay the purge's upfront cost. A rejected intent
purges nothing and provides no gain.

An optional purge after each battle is earned for each held source copy in
held order, including after a victory, final victory, defeat, or draw. Each
copy offers zero through its printed maximum of distinct current deck entries
without an Essence cost. The earned permission persists through loss of its
source and reload. A source gained after that battle grants no additional
permission. Finishing the windows restores the battle's exact Atlas, completed,
or failed route and preserves its committed reward and failure summary.

An option to forgo an Essence site's reward is prepared with that site's
initial Essence quote. It exchanges the whole collection for exactly its
printed number of distinct current deck entries, without an Essence cost.
With too few entries, collection remains available and the exchange is
unavailable. Multiple copies offer one exchange of that collection, attributed
to the first held source. The prepared option persists through source loss;
acquiring a source after preparation does not change the quote. A mandatory
Dreamsign replacement is prepared first and supplies its ordinary Dreamsign
reward instead of this Essence exchange. Collecting a prepared Essence quote
uses the collection-time Essence multipliers. Essence earned from a purge is
an independent gain.

## Journey Essence Effects

An Essence-site multiplier applies to the positive Essence collected from that
site, once for each copy held when collection succeeds. The prepared base amount
is immutable; the displayed collection amount derives from the current holdings.
Opening, navigation, and unrelated Essence gains do not collect the quote.

A replacement of an Essence site's reward prepares one Dreamsign instead of
Essence when that site's initial reward is prepared. The first held replacement
source supplies the single reward, including when collection is submitted before
opening. An already prepared reward persists through later gains or losses of
Dreamsigns. A replacement is collected through the ordinary free Dreamsign reward
flow; at the collection limit, the player can replace a held Dreamsign or decline.
If a valid Dreamsign cannot be prepared, the intent bounces and consumes nothing.

A percentage of current Essence on entering a new dreamscape applies after a
successful journey start or travel changes the current dreamscape. It uses the
current balance at each held copy's turn, including prior copies' gains. Currency
supports fractional values; the percentage is the printed numerator divided by
its denominator, without rounding. Same-node reentry, navigation, rerolls, replay,
and administrative state loading do not independently award an entry gain.

## Journey Deck Entry Effects

Starting-deck assembly constructs the initial deck. Subsequent validated gameplay
gains and copies add concrete entries, each identified independently of other
entries with the same card identity. Administrative loads and exact state edits
provide no added-card occurrence.

A prohibition on adding Nightmare prevents each new Nightmare entry, including a
copy of an existing Nightmare. Existing entries remain. The validated transaction
preserves its paid Essence, other rewards, permanent modifications, and site
continuation. Its saved result distinguishes actual gains from prevented
attempts. Sources held after the domain change apply, so protection gained or
lost by that same compound reward uses those final holdings.

Each addition wave excludes prohibited additions before checking a deck-size
requirement. The printed minimum is inclusive: an addition bringing the deck
from twenty-nine to thirty qualifies. Entries gained together use the same
resulting count. A later modifier-produced addition is a fresh wave; earlier
gains retain their result. Each held copy grants its printed bonus to each
qualifying new physical entry once. Current type and subtype, including permanent
entry changes, determine whether that entry is a warrior. A copy retains its
inherited modifications and receives its own added-card bonuses.

An eligible unformed entry gains one uniformly chosen applicable transfiguration.
An entry carrying a form retains it and consumes no draw. Multiple sources cannot
replace that form. Applying a new random form is a transfiguration operation and
can trigger an Event copy once per held source. Receiving a copy or reward that
already carries a form provides no further transfiguration occurrence. Domain
random draws keep their indices; modifier draws continue after the last index the
domain consumed.
