# Reclaim Combo — Deep Dive

Reclaim Combo is a character combo built on a single rules interaction: the
**reclaimed** status and the static that strips it. A card played from the void
with Reclaim becomes reclaimed, and a reclaimed card is banished the moment it
leaves play rather than going to the void — so on its own a Reclaim 0● body can
be replayed for free exactly once, then it is gone for good. The engine puts a
static into play that reads "Cards you reclaim are not banished when they leave
play," which removes the reclaimed status entirely. With that static down, a
reclaimed character abandoned to the void lands back in the void, ready to be
reclaimed for 0● again, and the loop never stops.

What makes the deck so resilient is that almost every piece is a perfectly good
card on its own. The Reclaim 0● bodies are cheap characters you would happily
play in a fair game, the abandon outlets generate energy and points without the
combo, and the payoffs win on their own. You assemble the loop out of cards that
were already pulling their weight, so a single piece of disruption rarely
collapses the deck — it just turns the engine back into a value pile.

## The Static

- Reclaimer of Lost Paths
- Titan of Forgotten Echoes

These two characters are the heart of the archetype, and both carry the same
line: "Cards you reclaim are not banished when they leave play." That sentence
is the entire combo. Without it, a Reclaim 0● body is a one-shot — you play it
from the void for free, and when it leaves play it is banished out of reach.
With it, the reclaimed status is removed, so the body follows the ordinary rule
for characters and goes to the void when it is abandoned or dissolved. That puts
it right back where you can reclaim it again.

Reclaimer of Lost Paths is the one to prioritize. At 2● for a 2✦ body it carries
the static and also reads "2●, ☾: A character in your void gains reclaim until
end of turn," which lets it hand reclaim to a void card that does not have the
keyword printed on it — a second way to feed the loop and a fine value play on
its own. Titan of Forgotten Echoes is the redundant copy of the static, a 2● 1✦
character that does nothing but turn off the reclaimed banishment. Running both
makes the deck far more consistent, since drawing either one is enough to start
the engine.

## The Reclaim 0● Bodies

- Starrunner
- Torn Circuit Feeder
- Enginespeaker
- Nocturne

These are the loop pieces — characters with **Reclaim 0●**, meaning you can
replay them from your void for free as many times as you can get them there.

Starrunner is the best of them because it is a self-contained engine. It carries
"Abandon this character: Gain 1●" and "▸Dawn: Gain 1●" alongside Reclaim 0●, so
with the static in play you can reclaim it for 0●, abandon it to its own ability
for 1●, watch it return to the void, and reclaim it again — a net +1● every
cycle with no other outlet required. That free energy is the fuel that powers
the rest of the turn.

Torn Circuit Feeder is a 2● 2✦ Synth with Reclaim 0● and "When you reclaim this
character, it gains -1✦." The shrinking spark is irrelevant to the loop, since
the body exists only to be abandoned and reclaimed — its spark never gets a
chance to matter. It is pure looping fuel.

Enginespeaker is a 2● 1✦ body with Reclaim 0● and "This character has all
character types," which makes it count as any tribe you need while it cycles —
relevant if you are also leaning on type payoffs (see Momentum's Edge below).

Nocturne is the value loop piece: a 3● 2✦ body with Reclaim 0● and
"▸Materialized: Erode 1." Every time you reclaim it you materialize it and erode
1, so the loop itself is a finisher — each cycle chews another card off a deck
and refills your own void with fodder. Reclaiming Nocturne in a loop with the
static erodes the opponent toward Fatigue all by itself.

## Abandon Outlets

- Infernal Ascendant
- Arc Disciple
- Stargazer Adrift

The outlet is what sends a Reclaim 0● body from play back to the void so it can
be reclaimed again. Starrunner can do this for itself, but a dedicated outlet
lets you loop the bodies that cannot, and lets every cycle generate a resource.

Infernal Ascendant is the premier outlet: "Abandon another character: Gain 1●"
on a 3● 1✦ Monster. Reclaim a body for 0●, abandon it to Infernal Ascendant for
1●, the body returns to the void under the static, reclaim it again — that is
net +1● per loop and unlimited energy for the turn. Arc Disciple does the same
job harder, "Abandon another character: Gain 2●" for a 3● Warrior, doubling the
energy you bank each cycle. Stargazer Adrift trades the energy for selection,
"Abandon another character: Foresee 1," letting you sculpt the top of your deck
while you loop — useful when you want to set up a specific draw before you commit
to the kill.

Note the structural point: the static removes the reclaimed status, so an
abandoned body fires its ▸Dissolved trigger and lands in the void normally. That
is what makes the loop both repeatable and visible to your "when a character is
dissolved" payoffs.

## Payoffs

- Silent Avenger
- Soulrender
- Saltless Mariner
- Twilight Suppressor

The loop on its own makes energy and reclaims; the payoff converts that into a
win. There are two flavors: drains that score ⍟ off each abandon, and erosion
that mills the opponent into Fatigue.

Silent Avenger is the canonical drain — "When a character is dissolved, gain
1⍟." Because the static lets each looped body go to the void as a genuine
dissolve, every cycle scores 1⍟, and an unbounded loop is an unbounded number of
victory points. Saltless Mariner closes the same way through an activated
ability rather than a trigger: "Abandon a character: Gain 1⍟" on a 2● 2✦ body
with Veil 2● to protect it, so you can use it as the outlet and the payoff at
once. Twilight Suppressor banks the points across the turn, "When you play a
character, store 1⧗" plus "1⧗, Abandon a character: Gain 1⍟," so every reclaim
stores a counter you spend back for ⍟.

Soulrender is the erosion finish: "Abandon a character: Chosen player erodes X,
where X is that character's cost." Abandoning a 2● body erodes 2, and looping it
through the static grinds the opponent's deck away — once their deck is empty the
erosion converts straight into Fatigue, with the points doubling each time. It
pairs naturally with Nocturne, whose every reclaim already erodes 1. The void
characters Ashen Remnant ("Abandon another character: Erode 1") and Obliterator
of Worlds ("Abandon a character: Store 1⧗" into "X⧗: Dissolve an enemy with X✦")
do similar work, the latter doubling as repeatable removal.

## Support and Filtering

- Reclaimer of Lost Paths
- Door to Possibility
- Curio Dealer
- The Dread Sovereign

The engine wants to find its two halves — a static and a Reclaim 0● body in the
void — so selection earns its slot. Door to Possibility ("Choose a value of X.
Discover an event with cost X") and Curio Dealer ("1●, Discard a character with
cost X●: Discover a character with cost X●") dig toward missing pieces, and
discarding a Reclaim 0● body to Curio Dealer puts it straight into the void where
the loop wants it. The Dread Sovereign — "X●, ☾, Abandon another character:
Discover a character with cost X●, then materialize it" — is an outlet that also
tutors, abandoning a looping body to fetch and materialize whatever the turn
needs. Reclaimer of Lost Paths' own "2●, ☾: A character in your void gains
reclaim until end of turn" lets you turn an ordinary character in the void into a
loop piece in a pinch.

Borrowed Minutes ("Materialize each character with cost X● or less in your void.
Banish them at end of turn") is a mass re-entry that fires every ▸Materialized
trigger in the void at once — strong with a void full of Nocturnes for a burst of
erosion, and a fine fair-game value card.

## Bodies That Earn Their Place

The archetype's resilience comes from filling the deck with combo pieces that are
also good cards. Momentum's Edge is a 2● 2✦ Explorer that picks a type and gives
it +1✦, leaning on Enginespeaker and Ashen Harbinger ("This character has all
character types") for the anthem. Eclipse Herald and Horizon Follower are ⧗-based
threats that convert spare energy into removal or ⍟. Cloudmantle Ray is an energy
dork with ▸Dawn and Reclaim 3● — recurring, if not free. Selfless Rescuer and
Gateway Defender are Interrupt abandon outlets ("❖❖ – Abandon … : An ally cannot
be targeted by effects this turn") that double as protection for the static when
the opponent reaches for it. Volcanic Channeler ("When an ally is dissolved, gain
1●") banks energy off every looped abandon, a second free-energy source behind
Starrunner. Blade of Unity and Molten Duel round out the curve with a scaling
threat and cheap removal.

## Combos

The core loop, stated cleanly:

1. Have a static in play — Reclaimer of Lost Paths or Titan of Forgotten Echoes
   — and a Reclaim 0● body in your void.
2. Reclaim the body for 0●. It enters play; because the static removes the
   reclaimed status, it is an ordinary character.
3. Abandon it to an outlet — Infernal Ascendant for 1●, Arc Disciple for 2●, or
   the body's own ability in Starrunner's case. It fires its ▸Dissolved trigger
   and goes to the void.
4. It is back in the void with no reclaimed status, so go to step 2.

Each pass through the loop is free (Reclaim 0●) and net-positive on energy
through the outlet, so the loop is unbounded for the turn. With Starrunner the
loop even pays for itself with no second outlet — reclaim, self-abandon for 1●,
return, repeat. Drop in a payoff that reads off each abandon and the loop becomes
the win:

- **Infinite drain:** loop a body through Infernal Ascendant with Silent Avenger
  in play. Each abandon is a dissolve, each dissolve scores 1⍟. Add Saltless
  Mariner or Twilight Suppressor to score from the outlet side as well.
- **Infinite erosion:** loop a body through Soulrender, or simply reclaim
  Nocturne over and over for its ▸Materialized erosion. The opponent's deck
  empties and the loop converts to Fatigue, with points doubling each pass. Ashen
  Remnant and Obliterator of Worlds add to the erosion and removal.
- **Infinite energy first:** loop Starrunner or run Volcanic Channeler under the
  abandons to bank arbitrary energy, then spend it on Eclipse Herald or Horizon
  Follower to dump the engine straight into removal or ⍟.

A subtlety worth respecting: the static must be in play before the body leaves
play, because it is the static that removes the reclaimed status as the body
moves. If the opponent dissolves your static mid-loop, the body in play keeps the
status it entered with, but the next body you reclaim will banish on the way out
and the loop ends — which is exactly why running two copies of the static, and
holding Selfless Rescuer or Gateway Defender to protect them, matters.

## Winning the Game

Once the loop is assembled, winning is the easy part. Loop a body and let Silent
Avenger or Saltless Mariner pile up ⍟ until you cross the line, or loop Nocturne
and Soulrender to erode the opponent's deck into Fatigue. If you cannot close in
one turn, the deck does not fold — every piece is a real card, so you bank the
free energy from Starrunner and Infernal Ascendant, deploy Momentum's Edge and
the ⧗ threats, and grind a fair game until the engine comes back together. The
combo is the ceiling; the value floor is what keeps the deck standing through
disruption.
