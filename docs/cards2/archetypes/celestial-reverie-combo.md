# Celestial Reverie Combo — Deep Dive

Celestial Reverie Combo is a creature-storm engine in which characters are both
the cards and the energy. The plan is to install a draw trigger keyed to playing
characters, make your cheap characters free to play, and then loop a single
self-bouncing body back to hand again and again — each replay drawing a card and
refilling the pool — until your deck is empty or your hand is a wall of bodies.
It can be drafted as a fair value list that simply floods the board with cheap
characters and grinds out card advantage, or assembled into a deterministic
go-off that draws its whole deck and closes on Terminus, buries the opponent
under Fatigue with Hatching Ground, or builds a lethal board in one turn. It
overlaps strongly with Spirit Animals, which supplies most of the cheap bodies
the loop runs on, and with Storm, which shares the same character-draw trigger
and the same finishers.

## The engine: draw-on-play

Everything starts with a trigger that turns playing a character into a card.
Celestial Reverie is the cheap version: a 1● event reading "Until end of turn,
when you play a character, draw a card." For the rest of the turn every character
you play replaces itself, so a hand of cheap characters becomes a hand that never
shrinks as you empty it. Luminous Ascent is the broader, sturdier version — a 2●
event reading "Until end of turn, when you materialize a character, draw a card,"
which fires not only on characters you play from hand but on figments and
returned bodies that enter play any other way — and it carries Reclaim 4● so it
can be bought back from the void for a second go-off turn.

The distinction between the two triggers matters for sequencing. Celestial
Reverie reads "when you **play** a character," so it fires on a hard cast from
hand but not on a character put directly into play; Luminous Ascent reads "when
you **materialize** a character," so it fires on every body that enters play,
including figments. A loop built on replaying a self-bouncing character from hand
satisfies both, so either trigger drives it, but a board that also produces
figments draws extra cards only under Luminous Ascent.

A single draw trigger turns a board of cheap characters into a value engine on
its own. The deck wants to deploy the trigger, then unload the hand: every
character is a cantrip, and Spirit Animals' density of 1● bodies keeps the chain
going. That alone is a "fair" Celestial Reverie deck — no loop required, just a
hand full of characters that all replace themselves.

## Making the characters free

The draw trigger refills your hand, but each character still costs energy, and a
hand that draws itself empty still stalls when the pool runs dry. The free-cast
enablers solve both problems by dropping the cost of cheap characters to nothing.

Nexus Wayfinder is the strongest and most general: a 4● explorer reading
"Characters with cost 2● or less cost you 0●." Once it resolves, every 2●-or-less
character in your hand is free, so you can pour the whole hand onto the board for
no energy at all — each one drawing a card off the active draw trigger. It is the
clearest signal that the combo is online, and because it asks nothing of the rest
of your board it slots into any cheap-character shell.

Heavenward Penitent is the cheaper, narrower enabler: a 1● explorer reading "The
first character with cost 2● or less you play each turn costs you 0●." It frees
one character per turn rather than the whole hand, so on its own it is a tempo
discount rather than a loop, but it carries Veil 2● to survive removal and stacks
with a real energy source to extend a chain. Both enablers want a deck built
almost entirely of 2●-or-less characters so that "cost 2● or less" reaches every
body in hand — the same low curve the Spirit Animals deck already runs.

Melodist of the Finale supplies energy from the other direction. A 2● musician
with Veil 2● reading "When you play a character, gain 1●," it refunds a point
every time you play a character, so a chain of cheap bodies pays for itself even
without a cost-reducer. Pair it with the draw trigger and each character you play
is now a card **and** a point; pair it with Nexus Wayfinder and the free
characters generate pure profit.

## The loop: self-bouncing bodies

The free-cast enablers and the draw trigger turn cheap characters into cards and
energy, but a finite hand still runs out. The loop closes that gap with a
character that returns itself to hand every time it enters play, so a single body
can be replayed indefinitely.

Still Dreamer is the core piece: a 2● visitor reading "▸Materialized: Return an
ally to hand." Because Still Dreamer is itself an ally the moment it enters play,
its ▸Materialized trigger can return Still Dreamer to your hand — and with Nexus
Wayfinder making it free, you replay it for 0●, it materializes, returns itself,
and you replay it again. With Celestial Reverie active, every replay draws a
card; with Melodist of the Finale in play, every replay gains 1●. The loop is
net-positive on both axes: each cycle is +1 card and (with Melodist) +1 energy,
for zero net cost. It runs until you choose to stop — typically when your deck is
empty or your hand is too full to hold the next draw.

Forgotten Factory Titan is the same loop with a body that can also fight: a 2●
synth that is Awakened and reads "▸Materialized: Return an ally to hand." Awakened
means it enters ready to challenge, so if you stop the loop with it on the board
it is an immediate threat rather than a do-nothing. Nomad of Endless Paths is the
high-spark variant — a 2● explorer with "▸Materialized: Return
another ally to hand." It returns **another** ally rather than itself, so it does
not self-loop, but it re-buys a second body's ▸Materialized trigger each time and
leaves a 5✦ threat behind when the loop ends. Stoneborn Eternal is
the Spirit Animal engine on the same idea: a 1● spirit animal reading "When you
play a spirit animal, return this character to hand. It costs 0● this turn," so
in a board of spirit animals it bounces itself for free every time you play
another one, chaining draws off the trigger with no enabler at all.

## Closing the loop: empty-deck and Fatigue

A loop that draws net-positive cards eventually draws your whole deck, and an
infinite engine needs a finish that does not require an opponent to cooperate.
Two events convert "I have drawn my deck" directly into a win.

Terminus is the deterministic close: a 1● event reading "If you have no cards
in your deck, you win the game." A Celestial Reverie loop that draws net-positive
every cycle empties the deck on its own; once the last card is in hand, Worlds
Await wins on the spot. The discipline is in the timing — a draw trigger that
fires with an empty deck causes Fatigue and hands the opponent points, so you
want to stop the loop on the last card, hold Terminus, and cast it before the
next forced draw.

Hatching Ground is the Fatigue close, shared with Storm. An X-cost event reading
"For each card you've played this turn, chosen player erodes X," it turns a long
loop — every replay of Still Dreamer is a card played — into a pile of erosion
aimed at the opponent's deck. Once their deck is empty, every further eroded card
is Fatigue, scoring an escalating 1⍟, 2⍟, 4⍟, and so on. A loop that plays
twenty-plus characters in a turn makes Hatching Ground's multiplier enormous, so
even a modest X buries a deck already low on cards.

Both finishes care about the loop's length, so the right line is usually to run
the loop as far as it safely goes, then cash it — Terminus if your own deck is
empty, Hatching Ground if you would rather mill theirs.

## The board payoffs

The loop does not have to end on a dedicated combo card. A Celestial Reverie turn
naturally builds a wide board and a flooded hand, and several payoffs convert that
into ⍟ directly.

Standard Bearer is the go-wide engine: a 3● warrior reading "When you play a
character, materialize a 1✦ warrior figment." Every character you play during the
loop drops a warrior figment, and because they share a type they form a single
stack whose total spark is the sum of every figment — a deep stack that trades up
against the opponent's front rank. Endless Projection does the same with ethereal
figments ("When you play a character, materialize a 1✦ ethereal figment"), and
Dreamborne Leviathan adds a spirit animal figment once per turn on each spirit
animal you play. Call of the Lost is the storm-style capstone: a 3● event that
materializes a 1✦ ember figment with Awakened for each card you've played this
turn, so a long loop drops a full stack of awakened embers ready to challenge the
same turn, and it carries Reclaim 2● for a second wave.

A wide figment board needs a way to push spark onto the front rank. Field Reverent
is the converter: a 3● warrior whose "X●: Each allied character's ✦ becomes X
until end of turn" sets the whole board — figments included — to a single high
value, turning a stack of 1✦ figments into a lethal challenger. Spirit Bond is the
finishing pump, a 7● event reading "Until end of turn, allied characters have
+X✦ where X is the number of allied characters," so a wide board attacks with a
large spark bonus. Intermezzo Balladeer scores as the loop runs — a 3● musician
reading "When you play a card, gain 1⍟ for each other card you've played this
turn," so each replay during a long loop hands you a growing pile of points
without needing a separate finisher at all.

## The Spirit Animals overlap

Celestial Reverie Combo and Spirit Animals are nearly the same deck drafted with
different priorities. Spirit Animals supplies the dense base of 1● bodies the loop
runs on, and several spirit animals are themselves engine pieces. Dreamvale
Monarch is a 2● spirit animal with "▸Materialized: Draw a card," so it is a body
that draws even without a Celestial Reverie active — and draws twice with one up.
Stoneborn Eternal self-bounces on every spirit animal you play, looping draws for
free. Dawnprowler Panther gains 1● on the second and later spirit animal you
materialize each turn, and Sunshadow Eagle stores 1⧗ on each spirit animal
materialized, spending 3⧗ for 3● — both turning a flurry of cheap bodies into
energy that feeds the next replay.

The spirit-animal "mana dorks" double as the loop's energy backbone. Spirit of
the Greenwood is a 1● Awakened spirit animal with "1●, ☪: Gain 1● for each allied
character," Blazing Emberwing is a 3● spirit animal with "☪: Gain 1● for each
allied character," and Mountainwatch Alpha taps for 1● per allied spirit animal —
on a wide board each is a large energy refund that can restart a stalled loop.
Verdant Pilgrim ("☪: Awaken an ally") and Moonbound Wolf ("☪, Return an ally to
hand: Trigger the 'Dawn' ability of an allied spirit animal") add bounce and
awaken effects that re-buy materialization and ▸Dawn triggers, extending the
chain. The payoffs carry over too: Mystic Runefish sets each allied spirit
animal's ✦ to 7, Spiritbound Alpha gives them +3✦ and Vengeful, and Field Reverent
and Spirit Bond convert the wide board either build leaves behind. A Spirit
Animals draft that picks up Celestial Reverie, Nexus Wayfinder, and Still Dreamer
simply gains a combo finish on top of its fair plan.

## The awaken and trigger-replay overlap

The loop also overlaps with the awaken engines, because a self-bouncing board and
a materialize-heavy turn both feed cards that re-fire on each character entering
play. Cindermarch is a 4● monster reading "When you materialize a character,
awaken each other allied character," so each replay in the loop wakes the rest of
the board — by the time the loop ends, the whole team is awakened and ready to
challenge. Conduit of Resonance reads "When you play a character, trigger the
'▸Dawn' ability of each other allied character," so every character you play
re-fires every ▸Dawn on the board: Lunar Hart's "▸Materialized, Dawn: Gain 2●"
becomes a repeating energy source, and any ▸Dawn value engine pays you on each
loop cycle. These pieces turn the loop's stream of plays into awakens, energy, and
re-fired triggers rather than only cards, which is what bridges the combo into a
board that can actually close the game the turn it goes off.

## Refilling and digging

A loop that has not yet found its enabler still wants to dig, and the deck runs
several cheap characters that draw or fetch while they hold the board. Winterbough
Monk is a 3● explorer with "▸Materialized: Return a card from your void to your
hand," so it buys back a spent Celestial Reverie or a looped body — and with a
draw trigger up, it is itself a cantrip. Call to the Unknown discovers a character
with 2✦ or less on ▸Materialized, digging for the missing loop piece while adding
a body to the count. Beacon of Tomorrow is the toolbox tutor: a 1● event reading
"Choose a value of X. Discover a character with cost X●," which finds Nexus
Wayfinder, Still Dreamer, or whichever piece the loop is missing. Key to the
Moment is the reload — a 3● event reading "Return all but one allied character to
hand. Draw a card for each character returned" — which scoops a wide board back
into hand for a pile of cards and re-buys every ▸Materialized trigger when those
bodies are replayed, a one-card refill that also restarts the chain.

## The drain and erosion finishes

A combo turn that builds and trades a board can close through the same drain and
erosion payoffs the Abandon and Storm decks use. Silent Avenger is a 3● visitor
reading "When a character is dissolved, gain 1⍟," so a loop that trades a wide
figment board into the opponent's front rank drips points the whole time.
Soulrender turns the wide board into Fatigue from the abandon side — a 3● warrior
reading "Abandon a character: Chosen player erodes X, where X is that character's
cost" — feeding the same empty-deck Fatigue plan as Hatching Ground. Sunset
Chronicler and Soulreaver draw on each ally dissolved, refilling the hand as a
board trades so a stalled loop reloads off combat rather than off the draw
trigger.

## How to draft and play it

Take the engine pieces first. Celestial Reverie and Luminous Ascent are the draw
triggers, Nexus Wayfinder and Heavenward Penitent are the free-cast enablers, and
Still Dreamer, Forgotten Factory Titan, and Stoneborn Eternal are the
self-bouncing bodies — these are the combo, and the loop wants at least one of
each axis. Melodist of the Finale is the energy that makes the loop net-positive,
and a dedicated finish (Terminus for the empty-deck win, Hatching Ground for
Fatigue, or a board payoff like Standard Bearer plus Field Reverent and Spirit
Bond) closes it. Round out the deck with the densest cheap-character base you can
find — almost everything from Spirit Animals qualifies, and the spirit-animal
energy dorks (Spirit of the Greenwood, Blazing Emberwing, Mountainwatch Alpha)
keep the loop fueled. Add the dig package (Beacon of Tomorrow, Call to the
Unknown, Winterbough Monk, Key to the Moment) so a hand without the loop can find
it.

The deck can win a fair game on speed alone: a low curve of cheap characters
under a single Celestial Reverie grinds out enough card advantage and board to
close like an aggro deck, no loop required. The combo turn comes when you have
both a draw trigger and a free-cast enabler online — install Nexus Wayfinder, cast
Celestial Reverie, deploy Melodist of the Finale, and loop Still Dreamer to draw
your deck and flood the pool, then cash the turn with Terminus if your deck is
empty, Hatching Ground if you would rather mill theirs, or a board payoff if you
would rather attack. Mind the empty-deck timing on the draw trigger so a forced
draw does not Fatigue you before Terminus resolves. Stay flexible — the right
finish is whichever piece you have drawn, and the same cheap-character base
supports the fair plan and the combo equally well.
