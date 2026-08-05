# Cindermarch / Shadow Soloist Combo — Deep Dive

This is the pool's awaken-engine archetype: a family of loops built on
characters that re-awaken your board over and over within a single turn. A
character enters play exhausted and stays that way until your next Dawn phase,
so it cannot challenge, defend, or pay a ☪ cost the turn it arrives. The two
backbone cards rip that restriction open. Cindermarch awakens your whole board
every time a character materializes; Shadow Soloist awakens it every time you
play an event. Once the board keeps refreshing, a ☪ ability that nets energy becomes
a faucet you can open as many times as you can trigger the awakener. Built around the right free producers, that faucet
runs without end, and the overflow pours into Storm counts, Abandon drains, and
deterministic finishes. Neither backbone is a deck on its own; both are the
awaken layer that several combo shells share.

## Two awakeners, two triggers

The two pieces look alike but key off opposite events, and that difference
decides which producers each one wants.

Cindermarch, a 4● monster, reads "When you materialize a character, awaken each
other allied character." Every body that enters play — a card played from hand,
a figment created by an effect, a character returned from the void — refreshes
the rest of your team. It cares only that a character materialized, so it does
not matter how the body got there or how much it cost. The cheaper and more
repeatable the producer, the better.

Shadow Soloist, a 3● musician, reads "When you play a character, awaken each
allied character" — that is, it fires on events: "When you play an event, awaken
each allied character." A chain of cheap events leaves your entire board
awakened and able to challenge the same turn it was assembled. Because it keys
off plays rather than materializations, it pairs with the events package and the
Offering events the pool is full of, and it is the natural awaken layer for a
Storm turn that is already chaining cheap cards.

A third card bridges the two by re-running ▸Dawn rather than clearing exhaust.
Conduit of Resonance, a 4● super, reads "When you play a character, trigger the
'▸Dawn' ability of each other allied character." Every character you play
re-fires every ▸Dawn ability you have in play. That converts a board of small
▸Dawn engines — energy producers, figment makers, erode bodies — into per-play
triggers, which is its own kind of loop fuel and stacks with the awaken plan
underneath it.

## The Cindermarch energy loop

Cindermarch awakens the board on each materialize, so the engine wants a
character producer you can fire repeatedly and a ☪ ability that produces more
energy than the cycle costs.

The net-energy ☪ abilities are the payoff. Wolfbond Chieftain is a 1● visitor
that enters awakened and reads "☪: Gain 1● for each allied warrior." Crescendo
Channeler is a 4● warrior with "▸Dawn: Materialize a 1✦ warrior figment" and
"2●, ☪: Gain 1● for each allied warrior" — it both widens the board on Dawn and
taps for a pile of energy once a few warriors are down. Each is a one-shot
faucet on a normal turn, because tapping exhausts it. Cindermarch is what turns
the faucet back on.

The repeatable producer closes the loop. Dreaming Obelisk, a 2● warrior, reads
"☪, Abandon a warrior: Materialize a warrior from your void." Pit Descender does
the same with a floor on cost: "☪, Abandon a warrior: Materialize a warrior with
cost 2● or less from your void." Each activation materializes a character, which
fires Cindermarch and re-awakens every *other* ally — including a second
producer and the energy taps. With two such producers down, they ping-pong: tap
Obelisk A to materialize a warrior → Cindermarch awakens Obelisk B and Wolfbond
Chieftain → tap Wolfbond for energy and tap Obelisk B to materialize again →
Cindermarch awakens Obelisk A and Wolfbond once more → repeat. The abandon-and-
return keeps body count level, the materializes loop the ▸Materialized and
▸Dissolved triggers without end, and Wolfbond Chieftain nets energy every cycle.
The result is unbounded energy plus an unbounded stream of enter-play and
leave-play triggers, which is exactly what the drains and the deterministic
finishes want to consume.

Free and near-free bodies feed the same engine more cheaply. Aspiring Guardian
is a 0● warrior with no text — a body whose only job is to materialize and so
trigger the awakener. Glimpse of Infinity gains 3● for 0●, a free ritual that
refills the pool between materializes. Conduit of Ashes, a 0● spirit animal,
reads "Abandon this character: Gain 1●," a free body that materializes (one
Cindermarch trigger) and then converts itself back to energy. Inferno's Herald
is a 2● warrior whose ▸Dissolved makes "a 1✦ warrior figment for each ✦ this
character has," so feeding it to an abandon outlet floods the board with
figments — each figment a fresh materialize that re-awakens the team.

## The figment producers

Several characters turn a play into a materialize, which is the event Cindermarch
wants. Voidsire, a 3● ancient, reads "When you play a warrior, materialize a 1✦
warrior figment," so every warrior you cast drops a figment and fires Cindermarch
an extra time. Twilight Troubadour, a 2● musician, does the same off events:
"When you play an event, materialize a 1✦ warrior figment." Forge-Twin, a 3●
warrior, materializes a figment copy of 'Blade of Unity' on ▸Materialized — a 2●
warrior with "This character has +1✦ for each allied warrior" — turning a single
play into two materializes and a growing front-rank threat at once. Each of these
makes the awakener trigger more often per card spent, which both deepens the
energy loop and widens a figment stack that can convert to ⍟.

Figments enter the back rank and stack by type, so the warrior figments these
make pile into one shared position whose total spark is the sum of every figment.
A deep stack absorbs opposing spark top-down and trades up against a single
front-rank defender, and once Cindermarch awakens the stack it can move to the
front rank and challenge the turn it was built.

## The Shadow Soloist event loop

Shadow Soloist keys off events, so its engine runs on cheap and Offering events
plus the producers that turn an event into more energy or more bodies.

Melodist of the Finale, a 2● musician with Veil 2●, reads "When you play a
character, gain 1●" — energy on each character you deploy, refilling the pool a
chain spends. Driftcaller Sovereign (1● spirit animal, "▸Dawn: Gain 1●";
"4●, ☪: This character gains +1✦") and Cloudmantle Ray (1● spirit animal,
"▸Dawn: Gain 1●", Reclaim 3●) are cheap producers whose ▸Dawn energy is
re-triggered by Conduit of Resonance on every character you play, so the event
shell and the materialize shell feed each other. Seedling Sage, a 1● child,
reads "When you play a character, store 1⧗" and "2⧗: Gain 1●," banking energy
across a long turn that Shadow Soloist keeps the board awake through.

The events themselves are the chain. Glimpse of Infinity gains 3● for 0●, so it
is a free play that refills the pool and still counts as an event for Shadow
Soloist. The Power Within and Ecliptic Vantage are cheap card-smoothers — look,
reorder, and draw — that keep the chain fed while each one awakens the board.
Conjured Zenith materializes two ethereal figments for 2● (Reclaim 2●), pairing
the event trigger with two materializes. Call of the Lost, the Storm payoff,
materializes a 1✦ ember figment with awakened for each card you've played this
turn (Reclaim 2●) — a board-flooding event that Shadow Soloist would already have
left awakened anyway. Fleeting Reunion gains X⍟ and reclaims by discarding X
cards, converting a flooded late-chain hand straight into points.

Two more event-on-play bodies share the layer. Gearwright, a 2● tinkerer, reads
"When you play an event, draw a card, then discard a card" — a loot on every
event that filters the chain toward its payoffs and feeds the discard and void
packages. Moonlit Dancer, a 3● visitor, reads "When you play an event, allied
characters gain +1✦ until end of turn," so a flurry of cheap events also pushes
spark across the whole front rank, turning the awakened board into scored ⍟. The
three event-trigger musicians and visitors — Shadow Soloist, Gearwright, Moonlit
Dancer, Twilight Troubadour — stack: one chain of events can awaken the team,
loot toward the finish, widen the figment count, and pump the front rank all at
once.

## The standing-awaken pieces

Some cards grant awakened as a static rather than re-applying it on a trigger,
and they form the quiet backbone under both loops. Pyrestone Avatar (4● avatar,
Offering) and Pinnacle Ascendant (5● tinkerer) both read "Allied characters have
awakened," so every body you deploy arrives ready to challenge and ready to pay
its ☪ cost the same turn. Pinnacle Ascendant also reads "When you discard or
erode this card, it gains reclaim 0●," so the loot and erode engines can throw it
away and replay it for free. Pyrestone Avatar's Offering line lets you bank it
for 0● by banishing a card from hand for a single explosive awakened turn.

Lanternhearted, a 3● explorer, is the spot awakener: it enters awakened and reads
"☪: Awaken an ally," with Reclaim 1●. It hands the awakened status to one
character on demand — enough to awaken a single energy producer or push one
exhausted body to the front rank — and it can be bought back from the void for
1● when it is spent. Scrap Reclaimer (0● tinkerer, Awakened, Veil 2●) is a free
awakened body that also recurs cheap characters from the void to refuel the loop.

Two characters re-fire ▸Dawn alongside Conduit of Resonance. Unquenched, a 3●
monster, reads "When you materialize an ally, trigger its '▸Dawn' ability," so
every body that enters immediately runs its own Dawn engine — a materialized
Crescendo Channeler makes its figment on the spot, a materialized Driftcaller
Sovereign banks its energy at once. Soulkindler, a 4● visitor, reads "If this
card is in your void, allied characters have +1✦," a passive team pump that turns
a wide awakened board into more scored spark from the void.

## Closing the loop

The loops generate energy and triggers without bound, but a battle is won at
25⍟, so the engine needs an outlet that converts the loop into points or a deck-
out. The drains turn the materialize-and-abandon cycle into ⍟ directly: a build
that loops Dreaming Obelisk and an abandon outlet drips points off every body
that leaves play, and the Storm and Abandon payoffs read the same churn. Fleeting
Reunion and Call of the Lost cash a long awakened turn into points or a wide
ember board respectively.

The deterministic finishes close it outright. Terminus, a 1● event, reads "If
you have no cards in your deck, you win the game," so a loop that draws or erodes
your own deck to empty — Echo Technician erodes 4 on ▸Materialized and lets you
replay events from the void, and Speaker for the Forgotten erodes and hands back
a free reclaim — wins on the spot. Paradox Enforcer, a 1● visitor with 7✦,
costs "banish 7 cards from your void" and can be played from the void; a loop
that floods the void with spent bodies and events deploys a large threat cheaply.
Wandering Archivist (2●, ☪: loot; "When you discard a card, gain 1⍟") and Rubble
Diviner turn the loot triggers from Gearwright into a slow drain while the engine
assembles.

## The Storm, Abandon, and recursion overlaps

This archetype is a layer more than a deck, and it bolts onto several others.

The Storm overlap is the tightest on the Shadow Soloist side: a Storm turn is
already a chain of cheap events, and Shadow Soloist, Gearwright, and Moonlit
Dancer leave that chain's whole board awakened, looted, and pumped as a side
effect. Call of the Lost and Fleeting Reunion are shared payoffs, and the energy
producers — Melodist of the Finale, Driftcaller Sovereign, Glimpse of Infinity —
double as Storm rituals. Twilight Troubadour and Voidsire feed the count by
turning each play into an extra materialize.

The Abandon overlap runs through the Cindermarch side. The materialize-and-
return producers — Dreaming Obelisk, Pit Descender — pay their cost by abandoning
a warrior, which fires ▸Dissolved triggers, and Conduit of Ashes, Inferno's
Herald, and Forsworn Champion all want to be abandoned for energy, spark, or a
figment flood. Forsworn Champion, a 2● warrior, reads "❖❖ – Abandon a warrior:
This character gains +1✦," and Colossal Convergence, a 4● warrior, reads
"❖❖ – ☪, Abandon a character: Give an ally +X✦ where X is the abandoned
character's ✦" — both turn the loop's expendable bodies into front-rank spark.
An awaken loop that keeps refreshing the board supplies the steady stream of
bodies an Abandon drain wants to eat.

The recursion engines give the loops their fuel without spending a card from
hand each turn. Starbound Striker and Tranquil Duelist return a warrior from the
void to hand when they are dissolved, recurring bodies into the next cycle.
Dreaming Obelisk and Pit Descender materialize warriors straight from the void.
Echo Technician and Dream Garden Visitor replay events and warriors from the
void, refilling a chain that has emptied the hand. Simulacra, a 3● synth, reads
"2●, ☪: Materialize a figment copy of an ally until end of turn," a repeatable
materialize the awakened board can keep firing for fresh Cindermarch triggers.

## How to draft and play it

Take a backbone first. Cindermarch and Conduit of Resonance anchor the
materialize loop; Shadow Soloist anchors the event loop, with Gearwright and
Moonlit Dancer as its strong support. Then secure the net-energy ☪ abilities —
Wolfbond Chieftain and Crescendo Channeler — and at least one repeatable producer
in Dreaming Obelisk or Pit Descender, since those are what turn a single awaken
into an unbounded one. Round out with free bodies (Aspiring Guardian, Conduit of
Ashes), figment producers (Voidsire, Twilight Troubadour, Forge-Twin), and the
standing-awaken statics (Pyrestone Avatar, Pinnacle Ascendant, Lanternhearted) so
the board arrives ready to act even when the full loop is not assembled. Finally,
lock in a close — a drain off the abandon churn, a Storm payoff in Call of the
Lost or Fleeting Reunion, or a deterministic finish in Terminus or Paradox
Enforcer.

The deck plays as an engine that snowballs: drop an awakener, deploy a producer
and an energy tap, and start cycling materializes or events to refresh the board.
Early turns can lean on the cheap bodies and loots to develop and trade while you
assemble the pieces, since every awaken builds a real front rank as a byproduct.
The win comes from a turn where the loop turns over enough times to bury the
opponent — unbounded energy poured into a Storm count, a wide awakened figment
board pushed across the front rank for ⍟, a drain dripping points off every
abandoned body, or a deck-out into Terminus. Stay flexible about which close
you ride; the awaken layer is the constant, and the payoff is whichever shell you
drafted around it.
