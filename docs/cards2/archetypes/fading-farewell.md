# Fading Farewell — Deep Dive

It is unusual for an archetype to be named after a single card, but Fading
Farewell earns it. The card is one line — "Until end of turn, when an ally is
dissolved, return it to your hand" — and that line is built to go infinite. Once
Fading Farewell resolves, every ally that dies this turn comes straight back to
your hand, so any body you can dissolve cheaply becomes a body you can replay and
dissolve again. Pair that with a character that can dissolve itself for free, or
a free abandon outlet, and you have a loop of plays, dissolves, and triggers that
runs until a payoff has won the game. The rest of the time Fading Farewell is a
fine value card that protects your board from a turn of attrition, but the deck
that drafts it on purpose is looking to assemble a loop that ends the battle on
the spot. Hold it until you are ready to go off, then point it at a free engine.

The mechanic it runs on is Abandon. Abandon moves one of your own characters from
play to the void, cannot be prevented, targets only your own side, and — this is
the load-bearing detail — fires that character's ▸Dissolved trigger. Because
abandoning a character dissolves it, Fading Farewell's return clause sees the
abandon and pulls the body back to your hand. A character that abandons itself for
energy therefore reads, with Fading Farewell on the table, as "Gain energy,
return to hand, do it again."

## The centerpiece

- Fading Farewell

Everything starts with the card itself. Fading Farewell ("Until end of turn, when
an ally is dissolved, return it to your hand") is a 3● event with no spark — its
entire job is to install the return clause for the turn. The clause is broad: it
catches any ally dissolved by any means this turn, whether you abandoned it to an
outlet, it traded in a challenge, or an opposing dissolve took it. The combo deck
cares about exactly one of those — the abandon you control — but the breadth is
why the card also plays as fair insurance. Resolve it before a Challenge phase you
expect to lose and your front rank comes home to hand instead of staying in the
void.

The one constraint that shapes the whole deck is that Fading Farewell returns the
body to **hand**, not to play. A looped body has to be replayable, and replayable
cheaply, or the loop costs energy every lap. That single requirement is why the
combo is built around 0● bodies and energy-positive abandons: the loop only runs
forever if the replay is free or the abandon refunds more than the replay costs.

## Free bodies and free outlets

- Conduit of Ashes
- Infernal Ascendant
- Aspiring Guardian

The cleanest engine is a body that is both the fuel and the outlet. Conduit of
Ashes ("Abandon this character: Gain 1●") is a 0● 0✦ Spirit Animal that abandons
itself for energy. With Fading Farewell active, activating Conduit gains you 1●,
dissolves Conduit, and returns it to your hand; you replay it for 0● and abandon
it again. Each lap is +1● net, costs nothing to repeat, and fires every "when an
ally is dissolved" trigger on the board. Conduit alone, plus Fading Farewell,
plus any death payoff, is the entire combo — a two-card loop that generates
infinite energy and infinite dissolve triggers.

When the loop runs on a separate outlet, the energy has to come out ahead of the
replay. Infernal Ascendant ("Abandon another character: Gain 1●") is the
workhorse: it abandons a *different* character for 1●, with no energy cost on the
ability and no cap on uses. Feed it a 0● body and the math is the same as Conduit
— gain 1●, the body returns to hand, replay it for 0●, abandon it again, net +1●
per lap. Aspiring Guardian ("(no ability)") is the ideal passenger: a 0● 1✦
Warrior with no text, it exists to be the free body shuttled between hand and the
outlet. Arc Disciple ("Abandon another character: Gain 2●") is the accelerated
version of the outlet, banking 2● per abandon, and Spirit Reaping ("Abandon a
warrior: Gain 2●") does the same for the warrior bodies the deck tends to run.

The reason to route through a separate outlet rather than Conduit is redundancy
and protection. If the opponent answers your only free body, a second 0● body and
a standalone outlet keep the loop alive — and because every body you loop returns
to hand the moment it dissolves, spot removal aimed at your engine simply hands
the card back to you. The combo deck wants two or three free bodies and at least
one free outlet so that no single answer collapses the turn.

## Energy to keep the turn going

- Volcanic Channeler
- Arc Disciple
- Infernal Ascendant

A loop that is exactly energy-neutral is enough to fire its payoffs forever, but
the deck likes a margin so it can spend energy on the closing play. Volcanic
Channeler ("When an ally is dissolved, gain 1●") turns the deck's defining event
— an ally dissolving — into energy: with Fading Farewell active, every lap of any
loop pays you 1● off Channeler on top of whatever the outlet gives. Stack it under
Conduit of Ashes and each lap nets 2●. Arc Disciple's 2●-per-abandon and Infernal
Ascendant's 1● are the on-demand producers, so a board with Channeler and an
outlet ramps hard while it loops, leaving plenty of energy to deploy a drain or an
erosion outlet mid-turn.

## Death-trigger payoffs

- Silent Avenger
- Nineborn Specter
- Scrapyard Custodian

The loop produces nothing but plays and dissolves on its own; a payoff converts
them into a win. The premier closer is Silent Avenger ("When a character is
dissolved, gain 1⍟"). Every abandon in the loop is a character dissolving, so
every lap is a point — Conduit of Ashes plus Fading Farewell plus Silent Avenger
gains 1⍟ per cycle and runs to the 25⍟ threshold in a single turn. Because Silent
Avenger counts *any* character dissolving, not just allies, it banks the
opponent's losses too, but the loop is what makes it lethal.

Nineborn Specter ("▸Dissolved: Gain 2⍟") is a body that pays you directly for its
own death: with Fading Farewell returning it to hand each time, loop the Specter
itself — abandon it for 2⍟, it comes back, replay it, abandon it again. At 0●
replay cost it would be a self-contained point engine, but at 2● it wants an
energy-positive outlet underneath it to keep the replays paid; Conduit and
Volcanic Channeler supply that. Scrapyard Custodian ("▸Materialized: Gain 1⍟.
Abandon a spirit animal: Materialize this character from your void") rewards the
*entry* half of the loop instead — every replay of Custodian is another 1⍟ — and
its second ability lets a spare spirit-animal abandon (Conduit of Ashes is one)
recur Custodian straight out of the void without needing the return spell at all.

## Erosion and figment finishers

- Soulrender
- Inferno's Herald
- Eclipse Herald

Points are not the only way to close. Soulrender ("Abandon a character: Chosen
player erodes X, where X is that character's cost") points the loop's attrition at
the opponent's deck. It is also an outlet, so it drives the loop and finishes it
at once: abandon a body, the opponent erodes that body's cost, Fading Farewell
returns the body, replay and abandon again. With a 0● body the erosion per lap is
0, so the erosion finish wants a slightly more expensive looped body — abandon a
2● body each lap and the opponent erodes 2 every time, draining their deck to
empty and then into Fatigue as the erosions keep coming off an empty library.

The deck can also bury the opponent under a board. Inferno's Herald ("▸Dawn: This
character gains +1✦. ▸Dissolved: Materialize a 1✦ warrior figment for each ✦ this
character has") makes warrior figments every time it dies, and its spark — and so
its figment count — only grows. Loop Inferno's Herald through Fading Farewell and
each abandon spits out a stack of warrior figments; because same-type figments
share one position and absorb spark from the top down, the stack becomes a real
board presence that scores its spark in an unpaired lane. Eclipse Herald ("3●:
Store 1⧗. X⧗: Dissolve an enemy with ✦ X or less") and Horizon Follower ("4●:
Gain 1⍟") are the energy sinks that turn the loop's surplus ● into removal and
points respectively — Eclipse Herald clears the opposing front rank so the figment
army connects, Horizon Follower simply converts every 4● the loop banks into a
point.

## Recursion and tutoring overlap

- Burning Revenant
- Ashen Harbinger
- Scrapyard Custodian

The warrior and void themes supply pieces that keep the engine fed when Fading
Farewell itself is not in play. Burning Revenant ("When an allied warrior is
dissolved, return a warrior with lesser cost from your void to hand") is a
poor-man's Fading Farewell scoped to warriors — abandon a warrior and a cheaper
warrior comes back to hand, so a chain of descending-cost warriors loops itself
for a turn even before the centerpiece lands. Scrapyard Custodian's "Abandon a
spirit animal: Materialize this character from your void" is a second self-recurring
body that needs only a spirit-animal abandon, which Conduit of Ashes supplies.

Ashen Harbinger ("This character has all character types") is the deck's flex
body. Because it counts as every subtype at once, it is a legal target for any
tribally restricted outlet or payoff — it is a warrior for Spirit Reaping and
Burning Revenant, a spirit animal for Scrapyard Custodian, and so on. Played as a
small X-cost body it slots into whatever loop the table leaves open, and a 0● copy
is another free passenger to shuttle through an outlet.

## The fair build

Fading Farewell does not have to be all-in. Drafted alongside an outlet, a death
payoff, and a board of cheap bodies, it plays as a tempo-positive value card:
resolve it on a turn you expect to trade in challenges and your characters come
back to hand instead of dying for good, then replay the cheap ones and feed the
doomed ones to Infernal Ascendant for a point off Silent Avenger. Volcanic
Channeler turns each loss into energy, and Inferno's Herald rebuilds the board
with figments every time it dies. Played this way the deck grinds: it abandons a
body or two a turn, the payoffs tick up points, and the figment-makers leave the
board no smaller than it started. The combo turn is just the same pieces pointed
at a single explosive sequence rather than spread across many turns.

## Overlap with other archetypes

Fading Farewell shares almost its entire core with the Abandon deck, which runs
the same Infernal Ascendant, Arc Disciple, Spirit Reaping, Silent Avenger, and
Volcanic Channeler around outlets and drains; the difference is only whether you
spend the loop across many turns or all at once. Conduit of Ashes and Aspiring
Guardian are the cheap free bodies the Characters with Cost 2● or Less deck wants
too, and Soulrender's erosion finish is shared with every list that drafts it as a
combination outlet and Fatigue clock. Burning Revenant, Spirit Reaping, and the
warrior figments tie the deck to the Warrior Combo shell, while Scrapyard
Custodian and Nineborn Specter pull it toward the ▸Dissolved-payoff core of the
void decks. Whatever the table leaves open, a free body, a free outlet, and a
drain are all Fading Farewell needs to turn one resolved event into a finished
game.
