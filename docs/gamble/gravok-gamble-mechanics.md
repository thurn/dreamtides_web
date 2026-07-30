# Gravok’s Casino: Gamble Site Mechanics

The retained 22-candidate working set is in
[Gravok Gamble: Brainstorm Longlist](gravok-gamble-brainstorm.md).

## Signature suggestions

- **Three-Way Wager** offers 69.23%, 46.15%, and 30.77% win bands, letting the player trade probability for a shown Dreamsign plus increasingly valuable deck rewards.
- **Progressive Draw** offers up to four separately purchased draws whose winning top-rank bands expand from Q–A to 6–A after each failure.
- **Cash-Out Ladder** banks a larger prize after each safe draw, then asks whether to keep it or risk the entire bank against a widening low-rank bust band.
- **Red-or-Black Insurance** guarantees a shown Dreamsign, then lets the player pay to protect either clubs or spades from an otherwise exact 50% Bane rider.
- **Four-Suit Escrow** lets the player choose which deck card to remove for two battles before a suit determines its disclosed return contract.
- **High–Low** is a four-call higher/lower game with ace-high card ordering, live card-counting odds, escalating cash-out values, and total loss of the unbanked payout on one wrong call.
- **Twenty-One** combines blackjack with Cursed Tome and Knowing Skull: each hit costs Essence, while totals of 19, 20, and 21 earn explicitly different prizes.
- **Five-Card Draw** lets the player choose which cards to hold, publishes exact outcome counts for that hold, and pays loss, push, Essence, Transfiguration, and Dreamsign tiers.
- **Odds Auction** asks the player to assign three different assets to unequal rank bands before one card determines which posted price buys a fixed premium reward.
- **Challenge Bet** lets the player choose standard or double stakes before a card discloses the exact next-battle handicap and victory reward.

## Design position

Dream Augury and Gamble should create different kinds of agency. Dream Augury
is a safe, deck-aware reward choice. Gamble asks the player to select a stake,
an odds profile, a stopping point, or a temporary rule, then uses visible
playing cards to resolve the commitment.

The ten signature games deliberately span five risk textures:

| Texture | Signature games |
| --- | --- |
| Pick an odds tier up front | Three-Way Wager; Challenge Bet |
| Pay repeatedly and stop after a failure | Progressive Draw |
| Risk an accumulated bank | Cash-Out Ladder; High–Low |
| Price or insure a probabilistic rider | Red-or-Black Insurance; Odds Auction |
| Risk a card or a future battle state | Four-Suit Escrow; Challenge Bet |
| Make decisions inside a familiar card game | High–Low; Twenty-One; Five-Card Draw |

## Current Dream Augury reward generation

The current implementation is spread across
[`generateMerchantEncounter.ts`](../../src/journey_v2/encounter/generateMerchantEncounter.ts),
the builders in [`src/journey_v2/archetypes`](../../src/journey_v2/archetypes),
[`buildMerchantContext.ts`](../../src/journey_v2/context/buildMerchantContext.ts),
and the Cumulus adapter in
[`dream-augury-view-model.ts`](../../src/screens/cumulus_adapters/dream-augury-view-model.ts).
Its relevant contracts are:

1. A Dream Augury always generates exactly two offers.
2. Offer B must come from a different family than offer A.
3. The eligible archetypes are weighted as follows:

| Family | Archetype weights |
| --- | --- |
| Card grant | fit card gift 10; fit-card draft 10; doubled draft 6; strong card 8; category draft 10; card bundle 8; transfigured draft 6 |
| Card improvement | Transfiguration 10; starter Transfiguration 6; Reclaim reduction 8; subtype change 6 |
| Removal | purge 8; purge-and-replace 8 |
| Duplication | duplicate 8 |
| Dreamsign | direct Dreamsign 8; Dreamsign draft 6 |
| Site | add a site 6 |

These weights are conditional, not final encounter percentages. Ineligible
archetypes are removed before the roll, a builder that cannot produce a valid
target is removed and redrawn, and Offer B excludes Offer A’s entire family.

4. Card grants are restricted to unowned, non-starter cards in the resolved
   draft pool when that pool exists. Fit-driven offers require at least six
   deck cards. The standard selection band is the top 25% with a minimum of
   five candidates; the strong-card band is 15%.
5. The strong-card score is quality-only before six deck cards, then
   `0.7 × normalized fit + 0.3 × normalized quality`.
6. Purge becomes eligible at eight deck cards. It considers non-Bane starters
   plus the bottom 20% of corpus-scored non-starters by leave-one-out fit.
7. Duplication ranks non-starter deck entries with an equal blend of normalized
   corpus quality and leave-one-out fit, then shows up to three choices.
8. Dreamsign offers exclude held Dreamsign ids, prefer profiles with actual
   deck coverage, and sample from a 40% match band. A Dreamsign draft displays
   two to four choices.
9. The encounter is deterministic for the journey seed, site id, pinned journey
   content, resolved draft pool, current deck, held Dreamsign ids, and debug
   reroll state. Accept and decline regenerate the encounter and verify its
   signature before resolving.
10. The UI exposes both reward tiles before commitment, exposes every inner
    choice after inspecting a tile, and permits a free decline.
11. The logs record eligible archetypes, failed build attempts, selection
    bands, candidate scores, deck snapshots, offer targets, and the accepted or
    declined result.
12. Essence and Essence cap exist on the merchant context but do not affect
    archetype eligibility, weights, targets, or payouts. The chosen Augury
    reward has no fee or stake.
13. `isEnhanced` is recorded in the screen logs. The Augury generator currently
    applies the same reward rules to ordinary and enhanced Augury sites.

Gravok can reuse Dream Augury’s card previews, Dreamsign displays,
Transfiguration previews, target validation, deterministic scoring signals, and
reward payloads. The Gamble runtime needs its own wager, deck, draw, cash-out,
and delayed-contract states.

## Casino-wide rules

### The deck

- Every started game creates a fresh standard 52-card deck with ranks 2 through
  Ace in clubs, diamonds, hearts, and spades. There are no jokers.
- The deck exists only inside that Gamble encounter. It is discarded when the
  site completes. A delayed effect stores an already-resolved result and never
  stores an undealt playing-card deck.
- Cards are drawn without replacement unless a game explicitly says
  **reassemble and reshuffle**. That instruction returns all 52 cards before
  deriving the next permutation.
- Aces are high unless a game explicitly states the standard blackjack or
  poker exception. Rank thresholds include all four suits. For example, ranks
  6–A contain 36 cards, so their exact probability is
  `36 / 52 = 69.23%`.
- High–Low uses the total order 2♣ < 2♦ < 2♥ < 2♠ < 3♣ … < A♠. The unique
  order prevents ties.
- Blackjack values A as 1 or 11, number cards at face value, and J/Q/K as 10.
- Poker ranks Ace high, with A-2-3-4-5 as the standard low-straight exception.

### Randomness and co-op authority

The reducer derives each permutation from the room’s deterministic event
context. Player events contain intent only: game id, stake, selected UUIDs or
entry ids, hit/stand, higher/lower, or cash out. React state controls only local
presentation such as hover and animation.

For a multi-step game, the folded Gamble runtime holds:

- game id and site id;
- ordinary or enhanced rules;
- paid table fee and committed stakes;
- deck permutation or a replay-equivalent deterministic shuffle key;
- revealed cards and current deck cursor;
- current bank, attempt, hand total, held-card mask, or assigned stake bands;
- locked target UUIDs and entry ids;
- completed, declined, won, or lost status.

Every log record includes the game id, site id, enhancement state, rule version,
shuffle commitment hash, revealed playing cards, cards remaining, displayed
odds numerator and denominator, stake changes, bank changes, reward payload,
and terminal reason. Replaying the room log must reproduce the same permutation,
odds, and rewards without `Math.random`.

### Fees, affordability, and eligibility

- An ordinary Gamble charges a 10-Essence table fee when the player starts a
  game. Declining before play costs nothing and completes the site.
- Farpoint Station’s enhanced Gamble charges no table fee.
- A player must be able to pay the fee or stake for the specific decision they
  are committing now. Later optional steps do not need to be affordable when
  the game starts.
- An unaffordable next step is disabled, its amount remains visible, and cash
  out or leave remains available.
- Essence never falls below 0. Essence winnings stop at the current cap unless
  the reward explicitly raises that cap.
- A game with required card targets is eligible only when every target can be
  locked before the shuffle. A target remains identified by entry id and card
  UUID throughout resolution.
- The player can hold at most 12 Dreamsigns. A won Dreamsign uses the existing
  replacement flow if the player is already at that limit.

### Deterministic reward preparation

Playing cards are the only source of random variation. Rewards shown before a
wager are prepared without a random sampler:

- **Shown Dreamsign:** highest current Dreamsign match score among unheld
  Dreamsign ids, ties by UUID code-unit order. If none is eligible, replace the
  Dreamsign everywhere in that game with exactly 150 Essence before the player
  commits.
- **Best-fit card:** highest fit score among eligible, unowned cards in the
  resolved draft pool, ties by UUID. If the fit model is unavailable, use
  corpus quality, then UUID.
- **Transfiguration:** the eligible non-Perfected Transfiguration with the
  highest current benefit score, ties by Transfiguration id.
- **Banes:** disclose the exact Bane id or ids before commitment. When two are
  required, use the two eligible Bane ids first in UUID order.

If a game itself is selected from a larger content pool, that selection must be
authored, player-chosen, or performed by a disclosed playing-card draw. A
general-purpose RNG may not choose the game.

## 1. Three-Way Wager

### Player-facing promise

Choose a `36 / 52 = 69.23%`, `24 / 52 = 46.15%`, or
`16 / 52 = 30.77%` win band. Every tier awards one shown Dreamsign, while the
two narrower bands add progressively stronger deck rewards. Every tier risks
50 Essence.

### Inspiration and playing-card translation

The Joust offers a safer, lower-payout combatant and a riskier, higher-payout
combatant. The supplied corpus describes those relative lanes but does not state
their numerical odds. The prompt’s illustrative design target supplies 70% and
30%. A full deck approximates those endpoints with top-rank bands of 36 and 16
cards. A 24-card middle band adds the requested third reward tier without
changing the same “lower probability buys a larger payout” result.

### Setup and eligibility

1. Prepare and display the shown Dreamsign.
2. Let the player select and lock one eligible non-Bane deck entry with an
   eligible Transfiguration. Show its Transfiguration preview and the copy the
   top tier would create.
3. When no such target exists, keep all three tiers available: replace the
   middle tier’s card reward with 100 Essence and the top tier’s card rewards
   with 200 Essence.
4. Display all three tiers, every reward, the 50-Essence stake, and the exact
   winning ranks.
5. The player chooses one tier, pays the table fee and stake, then draws one
   card.

### Resolution

| Tier | Win cards | Exact win chance | Win | Loss |
| --- | --- | ---: | --- | --- |
| Low payout | ranks 6–A | 36 / 52 = 69.23% | gain the shown Dreamsign | lose the 50-Essence stake |
| Medium payout | ranks 9–A | 24 / 52 = 46.15% | gain the shown Dreamsign and apply the previewed Transfiguration | lose the 50-Essence stake |
| High payout | ranks J–A | 16 / 52 = 30.77% | gain the shown Dreamsign, apply the previewed Transfiguration, and add one copy of the resulting entry | lose the 50-Essence stake |

The drawn suit has no mechanical effect. Any Essence fallback described during
setup replaces only the deck reward in the corresponding row.

### Farpoint Station

The table fee is waived. Low, medium, and high payout wins also grant 50, 100,
and 150 Essence respectively. The rank thresholds and stake remain unchanged.

### Why it belongs

This is the fastest Gravok encounter: one meaningful decision, one card, one
result. The three published bands teach that a narrower ace-high interval buys
a more valuable prize.

## 2. Progressive Draw

### Player-facing promise

Buy up to four draws to win one shown Dreamsign. Every failure reveals a card,
then offers a more expensive draw with a wider published top-rank band.

### Inspiration and playing-card translation

Scrap Ooze charges increasing HP while its relic chance rises by ten percentage
points per attempt. Tablet of Truth similarly invites repeated permanent
payment for incremental gain. Here each purchase increases both the Essence
cost and the size of an ace-high winning band. Reassembling the deck after a
failure keeps each published fraction fixed and auditable.

### Setup and sequence

1. Prepare and show the Dreamsign.
2. The player may buy Draw 1 or decline.
3. On a failure, show the drawn card, the cumulative Essence spent, and the next
   draw’s exact cost and odds.
4. The player may stop with no reward or pay for the next draw.
5. Before each paid draw, reassemble all 52 cards and derive a new shuffle.
6. The first win grants the Dreamsign and completes the site. Four failures
   complete the site with no reward.

### Resolution table

| Draw | Cost for this draw | Cumulative cost | Win cards | Exact win chance |
| --- | ---: | ---: | --- | ---: |
| 1 | 15 Essence | 15 | ranks Q–A | 12 / 52 = 23.08% |
| 2 | 25 Essence | 40 | ranks 10–A | 20 / 52 = 38.46% |
| 3 | 40 Essence | 80 | ranks 8–A | 28 / 52 = 53.85% |
| 4 | 60 Essence | 140 | ranks 6–A | 36 / 52 = 69.23% |

If the player buys all four draws, the probability of at least one win is

`1 − (40/52 × 32/52 × 24/52 × 16/52) = 93.28%`.

The 6.72% four-failure tail grants nothing; the player knowingly bought four
separate chances rather than a guaranteed Dreamsign.

### Farpoint Station

The costs are 10/20/30/45 Essence, for a maximum of 105 Essence. A win also
grants 50 Essence. The odds are unchanged.

### Why it belongs

This is the pure attrition model. Failure never erases an accumulated reward or
adds a Bane; the risk is deciding how much Essence to bleed into improving odds.

## 3. Cash-Out Ladder

### Player-facing promise

Avoid the bust band, bank a prize, and choose whether to cash out or expose the
whole bank to a more dangerous draw.

### Inspiration and playing-card translation

Clipped Wings escalates from a safe reward toward rarer wings while collapse
odds rise. Dead Adventurer increases the danger of each search. The Colosseum
asks the player to leave with current rewards or continue into a harder second
fight. Cash-Out Ladder expresses that shared mechanical result with three
published low-rank bust bands.

### Setup and sequence

1. Starting the game pays only the ordinary table fee.
2. Each draw reassembles and reshuffles the deck.
3. A bust card ends the game, forfeits the entire unclaimed bank, and adds
   one disclosed Bane.
4. A surviving card replaces the bank with the value in the table.
5. After Draw 1 or Draw 2, the player may cash out or continue.
6. Surviving Draw 3 automatically cashes out.

### Resolution table

| Draw | Bust cards | Bust chance | Safe chance | Bank after a safe draw |
| --- | --- | ---: | ---: | --- |
| 1 | Twos | 4 / 52 = 7.69% | 48 / 52 = 92.31% | 60 Essence |
| 2 | ranks 2–4 | 12 / 52 = 23.08% | 40 / 52 = 76.92% | 140 Essence |
| 3 | ranks 2–7 | 24 / 52 = 46.15% | 28 / 52 = 53.85% | 140 Essence plus the shown Dreamsign |

The probability of surviving all three draws is

`48/52 × 40/52 × 28/52 = 38.23%`.

The player can instead lock the 92.31% first-draw result or the 71.01% chance of
surviving through Draw 2.

### Farpoint Station

The bust sets are Twos, 2–3, and 2–5:

| Draw | Enhanced bust chance | Enhanced bank |
| --- | ---: | --- |
| 1 | 4 / 52 = 7.69% | 75 Essence |
| 2 | 8 / 52 = 15.38% | 175 Essence |
| 3 | 16 / 52 = 30.77% | 175 Essence plus the shown Dreamsign |

The probability of surviving all three enhanced draws is 54.07%. Farpoint also
waives the table fee.

### Why it belongs

Progressive Draw risks only additional spend. Cash-Out Ladder risks a prize the
player already feels they own. That loss texture creates a different emotional
decision despite both games having escalating odds.

## 4. Red-or-Black Insurance

### Player-facing promise

Take one shown Dreamsign, then choose whether to accept an exact 50% Bane risk
or pay 40 Essence to insure either clubs or spades.

### Inspiration and playing-card translation

The Mausoleum guarantees a relic and has a 50% chance to add Writhe. The
uninsured wager recreates that mechanical result exactly: the 26 red cards are
clean and the 26 black cards carry a rider. Golden Shrine contributes the
broader idea of accepting a larger reward with a lasting deck-pollution cost.
The insurance decision adds agency without changing the source event’s baseline
odds.

### Setup and resolution

1. Display the shown Dreamsign.
2. Display the exact club Bane id and spade Bane id.
3. The player chooses one of three coverage options, pays the ordinary table
   fee and any premium, or declines for free.
4. Draw one card. The Dreamsign is always gained.

| Coverage choice | Premium | Clean cards | Exact clean chance | Bane result |
| --- | ---: | --- | ---: | --- |
| Uninsured | 0 | hearts or diamonds | 26 / 52 = 50.00% | clubs add the disclosed club Bane; spades add the disclosed spade Bane |
| Insure clubs | 40 Essence | hearts, diamonds, or clubs | 39 / 52 = 75.00% | spades add the disclosed spade Bane |
| Insure spades | 40 Essence | hearts, diamonds, or spades | 39 / 52 = 75.00% | clubs add the disclosed club Bane |

The insured options have equal probabilities but expose different Banes. Their
choice therefore depends on which disclosed Bane is less damaging to the
current deck. If the Dreamsign has fallen back to 150 Essence, the Bane and
insurance rules remain unchanged.

### Farpoint Station

Every outcome also grants 75 Essence, and either insurance premium is 25
Essence. The uninsured 50% Bane chance and insured 25% Bane chance are
unchanged.

### Why it belongs

This is a compact “guaranteed upside, uncertain contamination” event. The
player prices that contamination using two disclosed Banes, current Essence,
and access to a future Purge site.

## 5. Four-Suit Escrow

### Player-facing promise

Place one selected card in escrow, then draw its contract: early
Transfiguration, delayed duplication, delayed compensation, or permanent loss.

### Inspiration and playing-card translation

Abandoned Winged removes a card and returns it upgraded through Heaven’s Aid;
waiting again produces Heaven’s Finest. Armageddon Battlefield rewards keeping
a special card through two battles. Lifemother’s Remnant trades immediate value
against a stronger delayed version. Four-Suit Escrow keeps their run-spanning
commitment but lets a four-suit draw select the exact contract.

### Setup and eligibility

- Select one non-starter, non-Bane deck entry.
- The player sees all four suit contracts before accepting.
- Accepting pays the ordinary table fee and moves the entry into an escrow
  state immediately.
- Draw one card. Its rank is cosmetic; its suit has exactly 25% probability.
- Store the resolved suit, entry id, card UUID, and battles remaining. Discard
  the playing-card deck.

### Contracts

| Suit | Chance | Contract |
| --- | ---: | --- |
| Hearts | 13 / 52 = 25% | After one completed battle, return the original entry with its deterministic best eligible Transfiguration. |
| Diamonds | 13 / 52 = 25% | After two completed battles, return the original entry and add one exact duplicate. |
| Clubs | 13 / 52 = 25% | After two completed battles, return the original unchanged and grant 150 Essence. |
| Spades | 13 / 52 = 25% | After two completed battles, permanently purge the entry. |

A completed battle decrements the countdown after its reward is resolved. The
card returns before the next dreamscape becomes interactive when the countdown
reaches zero. Loading the room or save state preserves the contract. If the run
ends first, no further effect resolves.

### Farpoint Station

- Hearts returns the Transfigured card as the Gamble site completes, so it is
  available for the upcoming battle.
- Diamonds returns two copies and both have the best eligible
  Transfiguration.
- Clubs pays 225 Essence.
- Spades returns the card unchanged after two battles.

### Why it belongs

This is the strongest Monster Train-style proposal. Its stake changes the next
two battles even before the random contract pays off. Choosing the exact card
at risk changes both the short-term deck weakness and the value of every
possible contract.

## 6. High–Low

### Player-facing promise

Call whether the next card is higher or lower, then cash out or press the whole
bank through as many as four correct calls.

### Inspiration and playing-card translation

Gremlin Looter grants a reward, then tempts the player to haggle again until a
failed roll ends the chain. Clipped Wings exposes accumulated value to repeated
collapse. High–Low turns those structures into a recognizable casino game
whose conditional odds can be counted exactly from the visible shoe.

### Setup and sequence

1. Pay the ordinary table fee and a 25-Essence stake.
2. Shuffle once and reveal the first card.
3. Count every undealt card higher and lower under the total order
   2♣ < 2♦ < 2♥ < 2♠ < … < A♠.
4. Display both exact fractions. The player calls one direction.
5. Reveal the next card without replacement.
6. A correct call advances the bank. The player may cash out or call again.
7. A wrong call loses the stake and the entire unclaimed bank.
8. Four correct calls automatically cash out.

### Payout ladder

| Consecutive correct calls | Total cash-out payout | Profit after the 25-Essence stake |
| ---: | ---: | ---: |
| 1 | 50 Essence | 25 |
| 2 | 100 Essence | 75 |
| 3 | 200 Essence | 175 |
| 4 | 400 Essence | 375 |

There are no ties because all cards have a unique position. Suppose 49 cards
remain, with 31 higher and 18 lower than the visible card. The buttons must read
`Higher: 31 / 49 = 63.27%` and `Lower: 18 / 49 = 36.73%`.

The player may always choose the larger set, but the odds evolve with every
removed card. 2♣ guarantees a first higher call; A♠ guarantees a first lower
call. Those rare edges are part of the game rather than silently corrected by
the house.

### Farpoint Station

The table fee is waived. Total payouts are 60/125/250/500 Essence. The
25-Essence stake and card-order rules are unchanged.

### Why it belongs

This is the clearest skill-expressive casino game. Randomness creates the shoe;
visible composition, risk tolerance, and the player’s stopping decision
determine how to use it.

## 7. Twenty-One

### Player-facing promise

Build a blackjack total toward 21. Every hit costs 10 Essence; a bust or timid
stand loses the stake, while 19, 20, and 21 pay explicit reward tiers.

### Inspiration and playing-card translation

Cursed Tome asks the player to endure escalating damage for a rare relic.
Knowing Skull sells repeated answers at increasing HP cost, and Sensory Stone
raises reward quality with additional payments. Twenty-One converts “pay again
or stop” into a solo blackjack decision. The next-card danger is computed from
the remaining physical deck.

### Setup and hand rules

1. Pay the ordinary table fee and a 50-Essence stake.
2. Deal two cards face up without replacement.
3. J/Q/K count as 10. Each Ace takes the value 1 or 11 that yields the highest
   total at or below 21; if every assignment busts, use the lowest total.
4. At totals below 21, the player may stand or pay 10 Essence to hit.
5. Exactly 21 resolves immediately without another decision.
6. Before a hit, enumerate every remaining card and display the exact number
   that would produce 15 or less, 16–18, 19–20, 21, or a bust after Ace
   optimization.

### Resolution

| Terminal total | Result |
| --- | --- |
| Above 21 | lose the 50-Essence stake and every hit fee |
| 15 or less by standing | lose the 50-Essence stake and every hit fee |
| 16–18 by standing | refund the 50-Essence stake; hit fees remain spent |
| 19–20 by standing | receive 150 Essence total |
| Exactly 21 | receive 150 Essence and the shown Dreamsign |

The payout is total returned value, not profit: standing on 19–20 produces a
100-Essence profit before hit fees and the ordinary table fee.

### Farpoint Station

Hits cost 0 Essence. Totals 19–20 pay 200 Essence. Exactly 21 pays 200 Essence
plus the shown Dreamsign. The 50-Essence stake remains.

### Why it belongs

The player never needs a vague “bust risk” label. The UI can derive the exact
next-card distribution from the current hand and remaining deck, turning a
familiar casino decision into transparent roguelike resource management.

## 8. Five-Card Draw

### Player-facing promise

Stake 50 Essence, deal five cards, then choose which cards to hold and replace.
Before the draw is confirmed, see the exact payout distribution produced by
that specific hold.

### Inspiration and playing-card translation

Wheel of Change maps one random result across several good and bad outcomes.
The Joust asks for a stake against a payout tier. Five-Card Draw uses standard
poker categories for the outcome table, then adds a hold/discard decision so
the player can reshape the exact distribution instead of merely watching a
random payout.

### Setup and player decision

1. Select one eligible non-Bane deck entry with at least one eligible
   Transfiguration.
2. Display its resulting Transfiguration preview and the shown Dreamsign.
3. Pay the ordinary table fee and a 50-Essence stake.
4. Deal five cards face up without replacement.
5. The player marks any zero to five cards as held. Unheld cards will be
   discarded and cannot return.
6. If `d` cards will be replaced, the remaining 47-card deck has
   `C(47, d)` equally likely replacement sets. Enumerate every set, evaluate
   the resulting hand, and display the exact count and percentage for each
   payout row.
7. The player may change the hold freely while comparing those distributions,
   then confirms once. Deal `d` cards and evaluate the final hand.

### Final-hand payout table

| Final category | Result |
| --- | --- |
| High card | lose the 50-Essence stake |
| Exactly one pair | refund the 50-Essence stake |
| Two pair or three of a kind | receive 150 Essence total |
| Straight or flush | receive 150 Essence and Transfigure the selected entry |
| Full house, four of a kind, or straight flush | receive 150 Essence, Transfigure the selected entry, and gain the shown Dreamsign |

“Straight or flush” excludes straight flushes. “High card” excludes straights
and flushes. Ace is high except in the A-2-3-4-5 straight.

For example, suppose the deal is A♣, A♦, 7♠, 4♥, 2♣ and the player holds the
two Aces. Drawing three cards produces `C(47, 3) = 16,215` equally likely
replacement sets:

| Result tier | Replacement sets | Exact chance |
| --- | ---: | ---: |
| Exactly one pair | 11,559 | 11,559 / 16,215 = 71.2858% |
| Two pair or three of a kind | 4,446 | 4,446 / 16,215 = 27.4191% |
| Full house or four of a kind | 210 | 210 / 16,215 = 1.2951% |

The three counts total 16,215. This hand cannot finish as high card, straight,
flush, or straight flush while both Aces remain held, so those rows correctly
show zero.

### Farpoint Station

Every 150-Essence total becomes 200 Essence. A full house or better also
duplicates the Transfigured entry. The stake and hold-dependent probabilities
are unchanged.

### Why it belongs

Every initial deal poses a different optimization problem: preserve a modest
made hand, break it to chase a rarer payout, or hold cards that support a
straight or flush. The exact enumerator lets that be an informed risk decision.

## 9. Odds Auction

### Player-facing promise

Assign three disclosed prices to three unequal rank bands, then draw one card.
The selected band determines which single price is paid for a fixed premium
reward.

### Inspiration and playing-card translation

This is an original, more ambitious extension of Wheel of Change’s
one-draw/multiple-outcome structure and Golden Shrine’s exchange of immediate
value for lasting deck pollution. The player prices three unlike assets first,
then the deck uses a complete 24/16/12 partition to select exactly one payment.
The decision is strategic because Essence, a held Dreamsign, and a disclosed
Bane have run-dependent values.

### Setup

1. Prepare and display the fixed reward: gain the shown Dreamsign, gain 150
   Essence, and apply one previewed Transfiguration to a selected eligible
   deck entry.
2. This game is eligible only when the player holds at least one Dreamsign and
   can pay the largest possible Essence price in addition to the table fee:
   100 Essence at an ordinary site or 75 Essence at Farpoint Station.
3. Display the three prices:
   - pay 100 Essence;
   - surrender one player-selected held Dreamsign;
   - add one player-selected Bane from two disclosed Bane ids.
4. The player assigns each price to exactly one of the three rank bands below.
   All six assignments are legal and can be previewed.
5. After the assignment, pay the ordinary table fee and draw one card.
6. Pay only the price assigned to the drawn rank band, then gain the complete
   fixed reward.

### Rank bands

| Band | Cards | Exact chance |
| --- | ---: | ---: |
| ranks 2–7 | 24 | 24 / 52 = 46.15% |
| ranks 8–J | 16 | 16 / 52 = 30.77% |
| ranks Q–A | 12 | 12 / 52 = 23.08% |

The bands are exhaustive and mutually exclusive. Suit has no effect. The
assignment is locked before the shuffle, so the player cannot move a price
after seeing the card.

### Farpoint Station

The table fee is waived, the Essence price falls to 75, and the fixed reward
grants 225 Essence. The Dreamsign and Bane prices, rank bands, and
Transfiguration are unchanged.

### Why it belongs

This proposal asks the player to compare unlike assets rather than merely pick
the largest percentage. A strong deck may value the Bane as the worst price;
a Dreamsign-dependent deck may protect its held sign; an Essence-poor run may
put the 100-Essence payment in the narrowest band.

## 10. Challenge Bet

### Player-facing promise

Choose standard or double stakes for the next battle. One card then discloses
both the exact handicap, from its suit, and the exact victory reward, from its
rank.

### Inspiration and playing-card translation

Battleworn Dummy lets the player choose a harder combat target for a stronger
reward. The Colosseum risks a second elite fight after the player could leave
with existing loot. Divine Shards trades a dangerous Pyre state for an
artifact. Challenge Bet compresses those structures into a chosen difficulty
tier and one 52-outcome contract: four equally likely battle rules crossed with
thirteen reward ranks.

### Setup and commitment

1. Display the standard and double-stakes handicap tables and reward bands.
2. The player chooses a tier and pays the ordinary table fee, or declines
   freely.
3. Draw one card and discard the rest of the playing-card deck.
4. Store the chosen tier, revealed card, battle modifier, and victory reward.
5. Apply the modifier to the Battle site in the current dreamscape.
6. A victory grants the stored reward after the ordinary battle reward. A
   defeat ends the run under the normal journey rule, so the stored reward is
   never granted.

### Standard-stakes battle rule

| Suit | Chance | Next-battle rule |
| --- | ---: | --- |
| Hearts | 13 / 52 = 25% | the opponent starts with +1 maximum energy and +1 current energy |
| Diamonds | 13 / 52 = 25% | the opponent draws one additional card on each of its first two turns |
| Clubs | 13 / 52 = 25% | every opposing character enters play with +1 spark |
| Spades | 13 / 52 = 25% | the opponent begins with +2 score |

### Rank-based victory reward

| Rank | Cards | Chance | Standard-stakes victory reward |
| --- | ---: | ---: | --- |
| 2–9 | 32 | 32 / 52 = 61.54% | 175 Essence |
| 10–A | 20 | 20 / 52 = 38.46% | the shown Dreamsign and 100 Essence |

### Double-stakes battle rule

| Suit | Chance | Next-battle rule |
| --- | ---: | --- |
| Hearts | 13 / 52 = 25% | the opponent starts with +2 maximum energy and +2 current energy |
| Diamonds | 13 / 52 = 25% | the opponent draws two additional cards on each of its first two turns |
| Clubs | 13 / 52 = 25% | every opposing character enters play with +2 spark |
| Spades | 13 / 52 = 25% | the opponent begins with +4 score |

| Rank | Cards | Chance | Double-stakes victory reward |
| --- | ---: | ---: | --- |
| 2–9 | 32 | 32 / 52 = 61.54% | 300 Essence |
| 10–A | 20 | 20 / 52 = 38.46% | the shown Dreamsign and 200 Essence |

Suit and rank are independent in a complete deck, so each individual
rule-and-rank combination has probability `1 / 52 = 1.92%`.

### Farpoint Station

The table fee is waived. Standard-stakes victory rewards become 225 Essence or
the shown Dreamsign plus 150 Essence, and its handicaps become:

- Hearts: the opponent gains +1 current energy on turn one; maximum energy is
  unchanged.
- Diamonds: the opponent draws one additional card only on its first turn.
- Clubs: only the first opposing character to enter gains +1 spark.
- Spades: the opponent begins with +1 score.

Double-stakes rewards and handicaps remain unchanged.

### Why it belongs

This is the most systemically ambitious event. The draw is resolved and logged
at Gravok’s table, while its consequence changes a later battle rule without
persisting the playing-card deck itself.

## Recommended content mix

For an initial implementation, use four complexity bands:

| Band | Games | Runtime needs |
| --- | --- | --- |
| Small event | Three-Way Wager; Red-or-Black Insurance | one commitment and one draw |
| Repeated wager | Progressive Draw; Cash-Out Ladder; High–Low | encounter runtime, multiple player intents, cash-out state |
| Card-game surface | Twenty-One; Five-Card Draw; Odds Auction | hand evaluation, dynamic odds, or asset assignment |
| Cross-site contract | Four-Suit Escrow; Challenge Bet | delayed journey state, battle integration, expiry and replay rules |

Three-Way Wager is the best first vertical slice because it proves the
playing-card deck, exact odds display, target locking, reward application,
Farpoint enhancement, co-op replay, and logging with the smallest state
machine. High–Low is the strongest second slice because it proves a persistent
shoe and cash-out decisions. Four-Suit Escrow and Challenge Bet should follow
only after the Gamble runtime can carry deterministic effects across site and
battle boundaries.
