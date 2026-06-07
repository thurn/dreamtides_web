# Wake the Fallen / Shadow March Combo — Deep Dive

This is perhaps the strangest engine in the pool, so it merits its own writeup.
There are three key enablers to look for: Wake the Fallen, Shadow March, and
Heroic Rescue. All three read a variation on the same line — they materialize
characters in your void that *dissolved this turn*. A first read makes them look
like insurance against a wrath, a way to claw a board back after it trades away.
They do far more than that. Because Abandon sends one of your own characters to
the void and fires its ▸Dissolved trigger, every character you abandon on your
turn becomes a legal mass-return target. So a mass-return spell is not a defensive
card at all: it is the back half of a loop. Build a board of cheap fodder, abandon
all of it through outlets for energy and points, then return the whole board at
once — re-firing every ▸Materialized and ▸Dissolved trigger — and abandon it
again. The deck plays as a fair value grind that pulls ahead one return at a time,
or as a deterministic storm turn that returns and re-abandons a free board until a
drain has run away with the game.

## The mass-return enablers

- Wake the Fallen
- Shadow March
- Heroic Rescue

These three are the heart of the archetype, and the differences between them
matter. Wake the Fallen ("Materialize all characters in your void which dissolved
this turn") is the biggest. For 3● it brings back *everything* you abandoned this
turn with no cost ceiling, so it returns your engines, your fat ▸Dissolved bodies,
and your fodder all at once. Shadow March ("Materialize all characters with cost
2● or less in your void which dissolved this turn"), also 3●, returns only the
cheap half of what dissolved — which is exactly the half the deck is built from,
since almost every body it wants to loop is a one- or two-cost character. The
restriction barely bites in a dedicated list and Shadow March is functionally the
second copy of the effect. Heroic Rescue ("Materialize up to three chosen characters
in your void which dissolved this turn") is the cheap, surgical option at 1●: it
returns up to three specific bodies rather than the whole pile, which is enough to
re-arm a loop without paying full price, and the "up to three chosen" wording lets
you leave a character in the void on purpose when you do not want it back yet.

The thing all three give you is repetition of triggers. A returned character that
came in from hand fires only its ▸Materialized trigger, but the abandon that put
it in the void already fired its ▸Dissolved trigger, and abandoning it again after
the return fires that ▸Dissolved a second time. So a single mass-return is two
full passes of every "▸Dissolved" and "when an ally is dissolved" payoff on the
board, plus a fresh round of every ▸Materialized. The whole deck is about
maximizing what those passes are worth.

## Abandon outlets — the front half of the loop

- Infernal Ascendant
- Conduit of Ashes
- Spirit Reaping

Before a mass-return can do anything, characters have to be in the void, and the
only reliable way to put your own bodies there on your turn is an abandon outlet.
A dedicated list wants two or three. The workhorse is Infernal Ascendant ("Abandon
another character: Gain 1●") — no energy cost on the ability, no use limit, so it
chews through a board and turns each body into 1● plus a ▸Dissolved trigger.
Spirit Reaping ("Abandon a warrior: Gain 2●") does the same at a higher rate for
warriors, and Virtuoso of Harmony ("Abandon a character with cost 2● or less: Gain
1●") and Soulbinder ("Abandon a character: Store 1⧗. 2⧗: Gain 1●") round out the
energy outlets.

The free bodies double as their own outlets. Conduit of Ashes ("Abandon this
character: Gain 1●") is a 0● 0✦ character that abandons itself for energy — the
cleanest single thing to feed a loop, because it costs nothing to replay after a
return and pays you on the way to the void. Pyrewatcher ("Abandon this character:
Gain 3●") is the burst version, a 2● 2✦ body that cashes for 3● when you want a
ritual rather than a slow drip.

A few outlets convert the abandon into something other than energy. Ruptured
Dynamo ("Abandon a character: Return a character from your void to your hand")
fishes a body back out of the void so you can replay it without waiting on a
mass-return, and Stargazer Adrift ("Abandon another character: Foresee 1") turns
each abandon into deck sculpting toward the next piece. Whatever the rate, the
outlet's real product is the stream of ▸Dissolved triggers — the energy or card is
the side effect.

## Bodies that pay on the way through

- Conduit of Ashes
- Spent Courier
- Marrow Mimic

The void engine wants fodder that is cheap, happy to die, and ideally pays you on
both ends. The biggest drafting mistake is loading up on expensive bodies; you
want a board of one- and two-cost characters in play before the outlet lands, so a
single return brings the whole pile back.

The best fodder banks value through a ▸Dissolved trigger that fires every time it
hits the void — and a mass-return turn hits the void twice per body. Spent Courier
("▸Materialized, Dissolved: Draw a card with ephemeral") and Ossuary Overlord
("▸Materialized, Dissolved: Draw a card") replace themselves on both entry and
exit: abandon one, draw; mass-return it, draw on the materialize; abandon it
again, draw again. Marrow Mimic ("Abandon this character: Erode 1. ▸Dissolved:
Draw a card") is a one-card outlet-and-payoff in a 1● body that both fills the
void and cantrips on each death. Dread Arbiter ("Abandon this character: Reveal
the opponent's hand. Draw a card with ephemeral") is a 0● body that abandons
itself for information and a card.

Conduit of Ashes is the centerpiece because it is fodder, outlet, and a free
replay all at once. A free body that abandons itself, then comes back on a
mass-return, then abandons itself again, is the smallest complete loop the deck
has. Pyrewatcher fills the same slot when you want energy out of the cycle rather
than just a trigger.

## The engines — Zuran-Orb-style payoffs

- The Forsaker
- Ruptured Dynamo
- Keeper of Forgotten Light

The mass-return turns are at their best with an engine that converts the doubled
triggers into a runaway resource. The Forsaker ("Abandon a character with cost 2●
or less: Gain 1⍟") is the marquee one: it is both an outlet and a payoff, turning
every cheap body you feed it into a point. Abandon a board of five through The
Forsaker for 5⍟, mass-return them, abandon them again for another 5⍟. Each return
is the same haul over again, so a couple of laps is a stack of points with no
combat involved. Saltless Mariner ("Veil 2●. Abandon a character: Gain 1⍟") does
the same with no cost ceiling and protects itself behind Veil, and Junkfield
Renegade ("1●, Abandon this character: Choose one: Gain 2⍟. / Draw a card") cashes
a single body for two points or a card.

Keeper of Forgotten Light ("When you materialize a non-figment character with cost
2● or less, draw a card with ephemeral") is the dig engine that pays off the
*return* half. A mass-return that brings back six cheap bodies draws six cards off
Keeper, so a single Wake the Fallen refills your hand even as it re-arms the loop.
This is how the deck digs toward the next mass-return or the closing drain. Spent
Courier and Ossuary Overlord stack with Keeper, drawing on their own materialize
on top of his trigger.

Ruptured Dynamo doubles as an engine because returning a body to hand lets you
re-stage a loop without a mass-return at all — abandon, return to hand, replay,
abandon again — keeping the void primed between the bigger spells. Forsaken Pact
("To play this card, abandon a character with cost 2● or less: Discover a
character with cost 2● or less and materialize it") is a tutor that is itself an
abandon, trading a doomed body for the exact small character the loop is missing,
already on the board.

## Closing the turn

- Silent Avenger
- The Forsaker
- Obliterator of Worlds

The combo turn finishes itself once a payoff is on the board and the loop is
turning. Silent Avenger ("When a character is dissolved, gain 1⍟") is the cleanest
drain: every abandon, every return-and-abandon, every challenge trade is a point,
and it counts opposing dissolves too. A loop that abandons a board of five, returns
it, and abandons it again is ten points through one Silent Avenger before you even
add The Forsaker stacking another point per cheap body on top. With both down, a
single mass-return is often the game.

When the loop needs to clear the way instead of just scoring, Obliterator of
Worlds ("Abandon a character: Store 1⧗. X⧗: Dissolve an enemy with X✦") banks each
abandon as stored ⧗ and turns the pile into removal — feed it the whole board, then
machine down the opposing front rank so your surviving bodies score their spark in
unpaired lanes. Marrow Mimic's "Abandon this character: Erode 1" points the same
attrition at the opponent's deck, eroding them toward Fatigue one abandon at a
time.

## Doubling the return — the storm payoffs

- The Ringleader
- Cascade of Reflections
- Cascading Detonation

Because the enablers are events, the deck has access to copy effects that turn one
mass-return into several. The Ringleader ("▸Materialized: The next time you play an
event this turn, create a 0● ephemeral copy of that event in your hand") materializes
and then hands you a free copy of your next event — play Wake the Fallen, get a 0●
Wake the Fallen, and the second one returns whatever the first round re-abandoned.
Cascade of Reflections ("Until end of turn, when you play an event, copy it") makes
every event for the rest of the turn fire twice, so each mass-return resolves
doubled and the outlets and drains in between get two passes too. Cascading
Detonation ("The next time you play an event this turn, copy it twice. Reclaim 5●")
triples the next return outright and can come back from the void for another go.

The most explosive sequence chains the mass-return with The Ringleader: materialize
The Ringleader, play Shadow March to return your dissolved board and pick up a free
copy, abandon the returned board through The Forsaker and Silent Avenger, then play
the free copy to return it all again. Each lap is the full payoff doubled, and with
Cascade of Reflections underneath, every return in the chain resolves twice over.

## Energy to keep going

- Glimpse of Infinity
- Pulse of Sacrifice
- Pyrewatcher

A long mass-return turn burns through energy, so the deck packs rituals to keep
the chain alive. Glimpse of Infinity ("Gain 3●") is a 0● burst of energy that pays
for the next return, and Pulse of Sacrifice ("Discard your hand. Gain 3●") refuels
a stalled storm turn with cards you were planning to abandon for value anyway. The
free outlets feed the same need: Conduit of Ashes nets 1● per abandon, Pyrewatcher
3●, and Spirit Reaping 2● per warrior, so a board abandoned through them produces
more energy than the next return costs. The deck wants its laps to be at least
energy-neutral so they run as long as there is a payoff to point at.

## Recursion and tempo support

- Phantom Flotilla
- Borrowed Minutes
- Winterbough Monk

Even outside the dissolved-this-turn window, the deck wants ways to put a board
back. Phantom Flotilla ("Materialize up to two characters with cost 2● or less from
your void. Reclaim 5●") returns bodies regardless of when they died and comes back
from the void to do it again, so it re-arms a loop on a turn you did not abandon a
full board. Borrowed Minutes ("Materialize each character with cost X● or less in
your void. Banish them at end of turn") drops a temporary army you are glad to
abandon through your outlets before it banishes anyway — a one-turn board built
straight out of the void. Winterbough Monk ("▸Materialized: Return a card from your
void to your hand") is a recurring body that fishes a spent mass-return spell back
to hand, and because it is itself fodder, abandoning and returning it re-fires that
recovery each loop. Aftermath Bloom ("To play this event, abandon a warrior:
Discover a warrior with higher cost, then materialize it") trades a small warrior
up the curve while feeding the void, and Nightmare ("Gain 2●. Draw a card. If this
event was reclaimed, copy it. Reclaim 6●") is energy and a card that comes back
bigger from the void.

Vaultbreaker ("Abandon a character, reveal this card from your hand: Reduce the
cost of this card by 1●") is the deck's payoff for all that abandoning — each body
fed knocks 1● off an 8● 8✦ Ancient, so a single combo turn can deploy a finisher
for almost nothing on top of everything else the abandons did.

## The fair grind build

- Infernal Ascendant
- The Forsaker
- Keeper of Forgotten Light

The fair build does not try to win in one turn. It assembles an outlet, a payoff,
and a board of cheap fodder, then grinds: each turn it abandons a body or two for
energy and a point, fires the ▸Dissolved payoffs, and uses Heroic Rescue or a
mass-return every few turns to reset the board to where it started. Keeper of
Forgotten Light keeps the hand full through every return, Spent Courier and Ossuary
Overlord make the fodder card-neutral coming and going, and The Forsaker and Silent
Avenger tick up points off the steady attrition. Obliterator of Worlds clears the
opposing front rank with banked ⧗ while the void slowly refills, so the fair deck
plays at the intersection of attrition and tempo and pulls ahead a little every
turn it trades.

## The combo storm build

The combo build wants the same pieces but uses them to go as big as possible in a
single turn. The goal is to abandon a free or self-paying board, return all of it
with a mass-return, and abandon it again, firing a drain each pass until the game
is over.

The cleanest core is Conduit of Ashes, The Forsaker, and Silent Avenger under one
mass-return. Build a board of Conduits and other cheap bodies. Abandon each Conduit
through its own ability for 1●, abandoning the rest through The Forsaker for a point
apiece, with Silent Avenger banking a point on every dissolve. Play Shadow March to
return the whole dissolved board, drawing off Keeper of Forgotten Light on every
materialize. Then abandon it all again. Each lap is the full board's worth of
points twice over, and because the Conduits pay their own replay, the only limit is
the energy for the next mass-return — which Glimpse of Infinity, Pulse of Sacrifice,
and the energy outlets cover. The Ringleader and Cascade of Reflections turn one
return into several, so a single big turn loops the board until Silent Avenger and
The Forsaker have buried the opponent, with Obliterator of Worlds and Marrow Mimic
on hand to clear blockers or erode toward Fatigue if a point total is not enough.

## Overlap with other archetypes

The mass-return engine shares almost its entire core with the Characters with Cost
2● or Less deck — Shadow March, Heroic Rescue, Forsaken Pact, Phantom Flotilla, The
Forsaker, Keeper of Forgotten Light, and Ruptured Dynamo all care about cheap
bodies looping through the void, and Shadow March's own "cost 2● or less" clause is
written for exactly that pool. The Warrior Combo deck supplies a parallel set of
outlets and recursion: Spirit Reaping and Aftermath Bloom are warrior outlets, and
the warrior fodder feeds the same returns. And the broader Abandon deck shares
every outlet, every drain, and every piece of ▸Dissolved fodder, since a
mass-return is just the most explosive way to refill an abandon engine. Whatever
the table leaves open, a core of an outlet, a drain, a board of cheap bodies, and
a copy of Wake the Fallen will find a loop to turn.
