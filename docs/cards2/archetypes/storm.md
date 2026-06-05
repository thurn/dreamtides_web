# Storm — Deep Dive

Storm is the pool's premier combo archetype, and one of its most confusing to
pilot. The plan is to play a long chain of cheap cards in a single turn and then
cash that chain out with a "for each card you've played this turn" payoff. The
count is everything: each card you play raises a counter that several payoffs
read, so a turn that resolves eight or ten cards can convert into a flood of
victory points, a wide figment board, or enough erosion to push the opponent
into Fatigue. The deck is largely about accumulating energy and copy effects out
of control, then turning them loose on a single explosive turn. The pool
deliberately supports many storm variants rather than one fixed combo, so the
right line changes from game to game depending on which payoffs and enablers you
have assembled.

## The storm count is the deck

Every payoff in this archetype scales off the same hidden number: how many cards
you have played so far this turn. There is no printed counter for it — the cards
simply look back over the turn and ask "how many?" — but that count is the
resource the whole deck is built to inflate. A turn that plays a single removal
spell does almost nothing; a turn that plays a ritual, a copy enabler, three
cheap events, and a payoff can be lethal. The difficulty, and the fun, is in
sequencing: you want every cheap card resolved before the payoff so the count is
as high as possible when you finally cash it.

Three things drive the count up. Cheap cards keep the chain going for almost no
energy. Energy rituals refund the energy you spend so the chain does not stall.
And copy effects let a single card register as several plays at once. The payoffs
do not care how a card got onto the stack, only that you played it, so a copied
event and an original event both add to the count.

## The payoffs

The marquee payoff is Broadcast Array, a 4● event that cannot be prevented and
gains 2⍟ for each card you have played this turn. After a busy chain this is a
huge lump of points in one card, and because it cannot be prevented the opponent
cannot stop the go-off once the chain is set up. It is the storm deck's Tendrils:
the card you build the whole turn toward.

Intermezzo Balladeer plays the count from the other direction. A 3● musician that
reads "When you play a card, gain 1⍟ for each other card you've played this
turn," it does not need to be the last card in the chain — it scores *as you go*.
Resolve it early in a long turn and every subsequent cheap card hands you a
growing pile of points; the back half of a storm turn can score dozens of ⍟ off
the Balladeer alone. Because it triggers on *every* card, even rituals and copy
enablers that produce no points themselves are paying you while they set up.

Call of the Lost is the go-wide payoff. For 3● it materializes a 1✦ ember figment
with awakened for each card you've played this turn, so a long chain drops a full
stack of awakened embers onto the back rank in one card. Awakened means they can
move to the front rank and challenge the turn they arrive, and because they are
the same type they form a single stack whose total spark is the sum of every
figment — a deep stack absorbs spark top-down and trades up against the
opponent's front rank. It also carries Reclaim 2●, so after the chain empties
your hand you can replay it from the void for a second wave.

Hatching Ground is the Fatigue payoff. An X-cost event reading "For each card
you've played this turn, chosen player erodes X," it pushes the opponent's deck
into the void in proportion to the chain — and once their deck is empty, every
further eroded card is Fatigue, scoring an escalating 1⍟, 2⍟, 4⍟, and so on for
you. Against a deck already low on cards this is the fastest possible close;
against a fresh deck it sets up a Fatigue kill a turn or two later.

These four are not exclusive. A storm turn frequently chains toward whichever
payoff is in hand, and several can fire on the same turn — Intermezzo Balladeer
scoring throughout, then Broadcast Array as the capstone, with Call of the Lost
left over to flood the board.

## The enablers: energy rituals

A long chain costs energy, and the rituals are how the deck keeps going.
Genesis Burst doubles your current ●, the single most explosive ritual in the
deck once you have a real pool to double. Flash of Power gains 5●, Arc Gate
Opening gains 4●, Glimpse of Infinity gains 3● for 0●, and Canopy of Stars gains
2● for 1●. Nebula's Wake gains 5● but can be played only if there are 3 or more
events in your void — trivially true once a storm turn is underway, since spent
events pile up fast. Each of these is itself a card played, so it raises the
count even as it refills the pool to play the next card.

Two utility events double as rituals and chain fuel. Data Pulse gains 2● and
draws a card, replacing itself while it adds energy. Starfall gains 3● flat for
1●. A New Adventure draws two, discards two, and gains 3●, smoothing the hand
while paying for the next several plays. Pulse of Sacrifice is the all-in ritual:
discard your hand and gain 3● for 0●, dumping cards into the void to power a final
burst (and feeding void-recursion like Path to Redemption afterward). Reunion
shuffles your hand and void into your deck, draws 5, and gains 5● — a mid-chain
reload that refills a hand you have emptied.

## The enablers: copy effects

Copy effects are the heart of the engine, because each copy registers as another
card played and so multiplies the count. **The main purpose of this archetype is
to accumulate copy effects out of control.** Stacked together they accumulate
favorably, turning a single cheap event into several plays at once.

Cascade of Reflections is the dedicated go-off enabler: until end of turn, when
you play an event, copy it. With it active every ritual, every cantrip, and every
payoff resolves twice — doubling the energy, the draws, and crucially the storm
count. Echo Architect does the same thing passively and permanently: events cost
you 1● more, but when you play an event, copy it. The tax is real, but doubling a
ritual or a payoff more than pays for it, and an Echo Architect that survives a
turn turns the whole following turn into a storm turn for free.

The single-shot copy effects set up one big multiplication. Cascading Detonation
makes the next event you play this turn copy twice — point it at a ritual to
triple your energy, or at Broadcast Array to triple the payoff; it carries Reclaim
5● for a second use. Cosmonaut of Tides, on ▸Materialized, makes the next event
with cost 2● or less you play this turn copy twice. The Ringleader, on
▸Materialized, creates a 0● ephemeral copy of the next event you play this turn in
your hand, so you get the original plus a free recast — and the free copy is yet
another card played. Stacked, these effects compound: a Cascade of Reflections
plus a Cascading Detonation plus a payoff is a turn that gets badly out of
control.

## Refilling the chain

The chain stalls when your hand runs out, so the deck wants free draws keyed to
the count. Echoes of the Journey is the dedicated refill: for each card you have
played this turn, draw a card with ephemeral, and they cost 0● this turn. Cast
late in a chain it reloads your hand for free, and because the drawn cards cost 0●
they keep the count climbing without draining the pool — frequently it is the
card that bridges a chain that was about to fizzle into a second, larger burst.
The ephemeral status means you must spend them this turn, which is exactly the
plan.

The void-recursion package lets a storm turn replay everything it has already
spent. Path to Redemption gives every card in your void reclaim until end of turn,
so the rituals, copy effects, and cantrips you already cast can all be played
again — each replay another card on the count. From the Barrow does the same for
events specifically and carries its own reclaim 3● when discarded or eroded, so
it survives a Pulse of Sacrifice. Archive of the Forgotten gives up to 2 events
with cost X● or less in your void reclaim 0● until end of turn, handing back two
cheap rituals or cantrips for free. Dreadwood Emissary, on ▸Materialized, gives a
single void event reclaim until end of turn — a cheap body that buys back the
exact piece you need. With a recursion engine online, the chain can loop the same
handful of cheap events several times, and each loop adds to the count.

## The points-and-removal variant

The cleanest build leans on cheap point and removal events that double as chain
fuel. Derelict Voyage gains 3⍟ for 1● (6⍟ if reclaimed, with Reclaim 4●), so it
is both a cheap play for the count and a payoff in its own right. Fleeting Reunion
gains X⍟ and can be reclaimed by discarding X cards, converting a flooded hand
straight into points late in a chain. Burst of Obliteration is the X-cost
finisher: gain X⍟ or dissolve an enemy with X✦, so a pile of leftover energy at
the end of a storm turn becomes a direct points dump.

The removal events keep the front rank clear while the chain assembles and still
count toward storm. Molten Duel dissolves a character with 3✦ or less for 1●,
Shattering Gambit banishes an enemy (the opponent gains 5⍟, a real cost), and
Vertiginous Leap strips a chosen card from the opponent's hand. Epiphany Unfolded
draws 3 for 1● — three-for-one card advantage that also fires three cards' worth
of "when you play a card" triggers when copied. Each of these is a cheap,
useful card that the deck was happy to play anyway, and every one of them nudges
the count higher.

## The Abandon / drain variant

Storm overlaps with the Abandon package through a shared "go off in one turn"
mindset and a set of payoffs that convert a busy board into points. Silent Avenger
gains 1⍟ whenever any character is dissolved, so a turn that trades a wide ember
board from Call of the Lost into the opponent's front rank — or that abandons its
own characters for resources — drips points the whole time. Fathomless Maw gains
1⍟ each time you abandon a character; Kindlehorn stores 1⧗ on each abandon and
spends X⧗ to dissolve an enemy with X✦. Infernal Ascendant turns abandons into
energy (abandon another character: gain 1●), and Spirit Reaping does the same off
warriors (abandon a warrior: gain 2●), feeding both the count and the ritual
chain. Pulse of Sacrifice, the discard-your-hand ritual, slots here too: empty
the hand for energy, then recur the spent cards with Path to Redemption.

## The Celestial Reverie overlap

The character-side of storm runs through Celestial Reverie: until end of turn,
when you play a character, draw a card. In a chain heavy on cheap characters it
behaves like a copy enabler for the count, replacing each character you play and
keeping the hand full so the chain never stops. It is the bridge to the
Celestial Reverie Combo deck, which uses self-bouncing characters and free-cast
enablers to loop materializations into cards and energy — a creature-storm that
shares the same payoffs. Terminus is the shared deterministic finish: if you
have no cards in your deck, you win the game, so a chain that mills or draws your
deck to empty (often via Reunion shuffling everything back and then drawing it
out, or repeated card draw) closes on the spot. Keeper of Forgotten Light draws a
card with ephemeral whenever you materialize a non-figment character with cost 2●
or less, turning a wide cheap-character turn into a stream of fuel.

## The awaken overlap

The same chain-of-plays that powers storm also powers the Cindermarch / Shadow
Soloist awaken loops, so a storm build overlaps with those engines. Shadow Soloist
awakens each allied character whenever you play an event, so a chain of cheap
events leaves your whole board awakened and ready to challenge the turn it is
built. Gearwright loots — draw a card, then discard a card — on every event,
smoothing the chain while it filters toward payoffs, and Moonlit Dancer gives
allied characters +1✦ until end of turn on each event, so a flurry of cheap plays
also pushes spark onto the front rank to convert the awakened board into ⍟. Field
Reverent and Boundless Wanderer turn a wide figment board into a real clock:
Field Reverent's X● ability sets each allied character's ✦ to X until end of turn,
and Boundless Wanderer grants all character types so type-payoffs reach the whole
team. Signal Resonant, a 1✦ synth with all character types and a Fast reposition
ability, is a cheap body that slots into any of these counts. These pieces are the
awaken backbone shared with the Abandon and Celestial Reverie loops rather than a
standalone plan, but they show how a storm turn naturally builds a board as a
side effect of chaining cheap cards.

## The recursion engines

A few characters give the storm deck repeatable fuel without spending a card from
hand each turn. Silent Gatherer returns itself from the void to your hand on
▸Dawn, so it is a recurring cheap play that never runs out. Dreaming Obelisk
materializes a warrior from your void on ☪ and an abandon, recurring bodies into
the chain. Searcher in the Mists erodes 4 on ▸Materialized and again when
dissolved, filling your own void to fuel reclaim engines (and, pointed correctly,
helping toward an empty-deck Terminus or a Fatigue close). The Ringleader and
Cosmonaut of Tides, covered above, are characters whose ▸Materialized triggers
set up a copy, so deploying them is itself part of the chain.

## How to draft and play it

Take the enablers first. The rituals (Genesis Burst, Flash of Power, Arc Gate
Opening, Glimpse of Infinity, Canopy of Stars, Nebula's Wake) and the copy
effects (Cascade of Reflections, Echo Architect, Cascading Detonation, Cosmonaut
of Tides, The Ringleader) are the engine, and they are individually playable in
any events-matter shell, so they wheel poorly and should be picked early. Then
secure at least one payoff — Broadcast Array as the unpreventable capstone,
Intermezzo Balladeer as the scores-as-you-go engine, Call of the Lost for a wide
board, Hatching Ground for the Fatigue plan. Round out the count with cheap,
useful cards: removal (Molten Duel, Shattering Gambit), card draw (Epiphany
Unfolded, Data Pulse, A New Adventure), and point events (Derelict Voyage,
Fleeting Reunion, Burst of Obliteration). Add the recursion package (Path to
Redemption, From the Barrow, Archive of the Forgotten, Echoes of the Journey) so
a chain that runs dry can reload.

The deck can play slow and controlling for the first several turns, leaning on
its glut of cheap removal and hand disruption to trade one-for-one while it
assembles energy and finds a payoff. The win comes from a single explosive turn:
chain the cheap cards and rituals to inflate the count, multiply it with copy
effects, refill with Echoes of the Journey or the void-recursion package when the
hand empties, and finally cash the whole turn into points with Broadcast Array
and Intermezzo Balladeer, a wide board with Call of the Lost, or Fatigue with
Hatching Ground. Stay flexible — the right line is whichever payoffs and enablers
you have drawn, and the pool rewards improvising a go-off out of the pieces in
front of you rather than forcing one fixed combo.
