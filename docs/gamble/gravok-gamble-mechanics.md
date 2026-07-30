# Gravok’s Casino: Gamble Site Mechanics

## Signature suggestions

- **The Two Champions** turns The Joust’s safe-versus-long-shot decision into a 69.23% Dreamsign wager or a 30.77% Dreamsign-plus-duplication wager.
- **Reach into the Shoe** recreates Scrap Ooze as a four-step attrition game whose cost and exact chance of winning a shown Dreamsign rise after every failure.
- **Cut Deeper** combines Clipped Wings, Dead Adventurer, and The Colosseum into a three-cut game where each success grows the bank and each failure collapses it.
- **The Black Ribbon** adapts The Mausoleum into a guaranteed shown Dreamsign with an exactly 50% chance of also receiving a disclosed Bane.
- **The Vaulted Ace** turns Monster Train’s deferred event chains into a wager where a selected deck card leaves for two battles and returns improved, duplicated, compensated, or not at all.
- **High–Low at Farpoint** is a four-call higher/lower game with live card-counting odds, escalating cash-out values, and total loss of the unbanked payout on one wrong call.
- **Twenty-One Pages** combines blackjack with Cursed Tome and Knowing Skull: each hit costs Essence, while totals of 19, 20, and 21 earn explicitly different prizes.
- **Five-Card Futures** uses the exact standard five-card poker distribution to assign loss, push, Essence, Transfiguration, and Dreamsign payout tiers.
- **Match and Keep: House Deck** uses a shuffled twelve-card memory-game subset, five attempts, and six face-up rank rewards that test memory instead of only risk appetite.
- **The Dealer’s Challenge** draws one card to impose a suit-based rule on the next battle and a rank-based reward if the player wins it.

## Design position

Dream Augury and Gamble should create different kinds of agency. Dream Augury
is a safe, deck-aware reward choice. Gamble asks the player to select a stake,
an odds profile, a stopping point, or a temporary rule, then uses visible
playing cards to resolve the commitment.

The ten signature games deliberately span five risk textures:

| Texture | Signature games |
| --- | --- |
| Pick an odds tier up front | The Two Champions |
| Pay repeatedly and stop after a failure | Reach into the Shoe |
| Risk an accumulated bank | Cut Deeper; High–Low at Farpoint |
| Receive value with a probabilistic rider | The Black Ribbon |
| Risk a card or a future battle state | The Vaulted Ace; The Dealer’s Challenge |
| Play a familiar casino or parlor game | High–Low; Twenty-One Pages; Five-Card Futures; Match and Keep |

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

- Every started game creates a fresh standard 52-card deck with ranks A through
  K in clubs, diamonds, hearts, and spades. There are no jokers.
- The deck exists only inside that Gamble encounter. It is discarded when the
  site completes. A delayed effect stores an already-resolved result and never
  stores an undealt playing-card deck.
- Cards are drawn without replacement unless a game explicitly says
  **reassemble and reshuffle**. That instruction returns all 52 cards before
  deriving the next permutation.
- Rank thresholds include all four suits. For example, ranks A–9 contain
  36 cards, so their exact probability is `36 / 52 = 69.23%`.
- High–Low uses the total order A♣ < A♦ < A♥ < A♠ < 2♣ … < K♠. The unique
  order prevents ties.
- Blackjack values A as 1 or 11, number cards at face value, and J/Q/K as 10.
- Poker uses standard five-card hand categories. Ace may be low only in the
  A-2-3-4-5 straight.

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
- current bank, attempt, hand total, or memory-grid state;
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

## 1. The Two Champions

### Player-facing promise

Choose between a `36 / 52 = 69.23%` chance at one shown Dreamsign and a
`16 / 52 = 30.77%` chance at that Dreamsign plus a duplicate of a selected
card. Both lanes risk 50 Essence.

### Inspiration and playing-card translation

The Joust offers a safer, lower-payout combatant and a riskier, higher-payout
combatant. The supplied corpus describes those relative lanes but does not state
their numerical odds. The prompt’s illustrative design target supplies 70% and
30%. A full deck approximates those values with the closest complementary
four-card rank bands: 36 winners and 16 winners.

### Setup and eligibility

1. Prepare and display the shown Dreamsign.
2. If the player has an eligible non-starter deck entry, let them select and
   lock one as the long-shot duplication target.
3. Display both lanes, all rewards, the 50-Essence stake, and the exact win/loss
   cards.
4. The player chooses one lane, pays the table fee and stake, then draws one
   card.

### Resolution

| Lane | Win cards | Exact win chance | Win | Loss |
| --- | --- | ---: | --- | --- |
| Back the House | ranks A–9 | 36 / 52 = 69.23% | gain the shown Dreamsign | lose the 50-Essence stake |
| Back the Stranger | ranks A–4 | 16 / 52 = 30.77% | gain the shown Dreamsign and duplicate the locked entry | lose the 50-Essence stake |

The long-shot lane is hidden when no legal duplication target exists; the safe
lane remains playable. The drawn suit has no mechanical effect.

### Farpoint Station

The table fee is waived. Back the House also pays 50 Essence on a win. Back the
Stranger also pays 150 Essence on a win. The rank thresholds and stake remain
unchanged.

### Why it belongs

This is the fastest Gravok encounter: one meaningful decision, one card, one
result. It establishes the casino’s core language before the more elaborate
games appear.

## 2. Reach into the Shoe

### Player-facing promise

Try up to four times to win one shown Dreamsign. Every failure reveals a card,
then offers a more expensive attempt with better published odds.

### Inspiration and playing-card translation

Scrap Ooze charges increasing HP while its relic chance rises by ten percentage
points per reach. Tablet of Truth similarly invites repeated permanent payment
for incremental gain. Here each attempt increases both the Essence cost and the
size of the winning rank band. Reassembling the deck after a failure keeps each
published fraction fixed and auditable.

### Setup and sequence

1. Prepare and show the Dreamsign.
2. The player may pay for Reach 1 or decline.
3. On a failure, show the drawn card, the cumulative Essence spent, and the next
   attempt’s exact cost and odds.
4. The player may stop with no reward or pay for the next reach.
5. Before each paid reach, reassemble all 52 cards and derive a new shuffle.
6. The first win grants the Dreamsign and completes the site. Four failures
   complete the site with no reward.

### Resolution table

| Reach | Cost for this reach | Cumulative cost | Win cards | Exact win chance |
| --- | ---: | ---: | --- | ---: |
| 1 | 15 Essence | 15 | ranks A–3 | 12 / 52 = 23.08% |
| 2 | 25 Essence | 40 | ranks A–5 | 20 / 52 = 38.46% |
| 3 | 40 Essence | 80 | ranks A–7 | 28 / 52 = 53.85% |
| 4 | 60 Essence | 140 | ranks A–9 | 36 / 52 = 69.23% |

If the player buys all four reaches, the probability of at least one win is

`1 − (40/52 × 32/52 × 24/52 × 16/52) = 93.28%`.

The 6.72% four-failure tail grants nothing; the player knowingly bought four
separate chances rather than a guaranteed Dreamsign.

### Farpoint Station

The costs are 10/20/30/45 Essence, for a maximum of 105 Essence. A win also
grants 50 Essence. The odds are unchanged.

### Why it belongs

This is the pure attrition model. Failure never erases an accumulated reward or
adds a Bane; the risk is deciding how much Essence to bleed into improving odds.

## 3. Cut Deeper

### Player-facing promise

Survive a cut, bank a prize, and choose whether to cash out or expose the whole
bank to a more dangerous cut.

### Inspiration and playing-card translation

Clipped Wings escalates from a safe reward toward rarer wings while collapse
odds rise. Dead Adventurer increases the danger of each search. The Colosseum
asks the player to leave with current rewards or continue into a harder second
fight. Cut Deeper expresses that shared mechanical result with three published
losing rank bands.

### Setup and sequence

1. Starting the game pays only the ordinary table fee.
2. Each cut reassembles and reshuffles the deck.
3. A collapse card ends the game, forfeits the entire unclaimed bank, and adds
   one disclosed Bane.
4. A surviving card replaces the bank with the value in the table.
5. After Cut 1 or Cut 2, the player may cash out or cut deeper.
6. Surviving Cut 3 automatically cashes out.

### Resolution table

| Cut | Collapse cards | Collapse chance | Survival chance | Bank after survival |
| --- | --- | ---: | ---: | --- |
| 1 | Aces | 4 / 52 = 7.69% | 48 / 52 = 92.31% | 60 Essence |
| 2 | ranks A–3 | 12 / 52 = 23.08% | 40 / 52 = 76.92% | 140 Essence |
| 3 | ranks A–6 | 24 / 52 = 46.15% | 28 / 52 = 53.85% | 140 Essence plus the shown Dreamsign |

The probability of surviving all three cuts is

`48/52 × 40/52 × 28/52 = 38.23%`.

The player can instead lock the 92.31% first-cut result or the 71.01% chance of
surviving through Cut 2.

### Farpoint Station

The collapse sets are Aces, A–2, and A–4:

| Cut | Enhanced collapse chance | Enhanced bank |
| --- | ---: | --- |
| 1 | 4 / 52 = 7.69% | 75 Essence |
| 2 | 8 / 52 = 15.38% | 175 Essence |
| 3 | 16 / 52 = 30.77% | 175 Essence plus the shown Dreamsign |

The probability of surviving all three enhanced cuts is 54.07%. Farpoint also
waives the table fee.

### Why it belongs

Reach into the Shoe risks only additional spend. Cut Deeper risks a prize the
player already feels they own. That loss texture creates a different emotional
decision despite both games having escalating odds.

## 4. The Black Ribbon

### Player-facing promise

Take one shown Dreamsign now. A single red/black draw decides whether a
disclosed Bane is attached.

### Inspiration and playing-card translation

The Mausoleum guarantees a relic and has a 50% chance to add Writhe. The Black
Ribbon recreates that mechanical result exactly: the 26 red cards are clean and
the 26 black cards carry a rider. Golden Shrine contributes the broader idea of
accepting a larger reward with a lasting deck-pollution cost.

### Setup and resolution

1. Display the shown Dreamsign.
2. Display the exact club Bane id and spade Bane id.
3. The player accepts and pays the ordinary table fee, or declines for free.
4. Draw one card:

| Draw | Cards | Exact chance | Result |
| --- | ---: | ---: | --- |
| Hearts or diamonds | 26 | 50.00% | gain the shown Dreamsign |
| Clubs | 13 | 25.00% | gain the Dreamsign and the disclosed club Bane |
| Spades | 13 | 25.00% | gain the Dreamsign and the disclosed spade Bane |

The Dreamsign is always gained. If the Dreamsign has fallen back to 150 Essence,
the Bane rider remains unchanged.

### Farpoint Station

Every outcome also grants 75 Essence. Clubs join the clean outcomes, so the
Bane chance is only `13 / 52 = 25%`, always using the disclosed spade Bane.

### Why it belongs

This is a compact “guaranteed upside, uncertain contamination” event. It also
makes Bane tolerance and access to a future Purge site matter at the wager
screen.

## 5. The Vaulted Ace

### Player-facing promise

Lock one selected card out of the deck, then draw its contract: early
Transfiguration, delayed duplication, delayed compensation, or permanent loss.

### Inspiration and playing-card translation

Abandoned Winged removes a card and returns it upgraded through Heaven’s Aid;
waiting again produces Heaven’s Finest. Armageddon Battlefield rewards keeping
a special card through two battles. Lifemother’s Remnant trades immediate value
against a stronger delayed version. The Vaulted Ace keeps their run-spanning
commitment but lets a four-suit draw select the exact contract.

### Setup and eligibility

- Select one non-starter, non-Bane deck entry.
- The player sees all four suit contracts before accepting.
- Accepting pays the ordinary table fee and moves the entry into a
  `vaultedCard` state immediately.
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
two battles even before the random contract pays off, and the playing-card deck
still disappears immediately after determining the persistent rule.

## 6. High–Low at Farpoint

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
   A♣ < A♦ < A♥ < A♠ < … < K♠.
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
removed card. A♣ guarantees a first higher call; K♠ guarantees a first lower
call. Those rare edges are part of the game rather than silently corrected by
the house.

### Farpoint Station

The table fee is waived. Total payouts are 60/125/250/500 Essence. The
25-Essence stake and card-order rules are unchanged.

### Why it belongs

This is the clearest skill-expressive casino game. Randomness creates the shoe;
visible composition, risk tolerance, and the player’s stopping decision
determine how to use it.

## 7. Twenty-One Pages

### Player-facing promise

Build a blackjack total toward 21. Every hit costs 10 Essence; a bust or timid
stand loses the stake, while 19, 20, and 21 pay explicit reward tiers.

### Inspiration and playing-card translation

Cursed Tome asks the player to endure escalating pages of damage for a rare
relic. Knowing Skull sells repeated answers at increasing HP cost, and Sensory
Stone raises reward quality with deeper touches. Twenty-One Pages converts
“read another costly page or stop” into a solo blackjack decision. The next-card
danger is computed from the remaining physical deck.

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

## 8. Five-Card Futures

### Player-facing promise

Stake 50 Essence on a single five-card poker deal. Better hands cross known
reward tiers, culminating in a shown Dreamsign and a Transfiguration.

### Inspiration and playing-card translation

Wheel of Change maps one random result across several good and bad outcomes.
The Joust asks for a stake against a payout tier. Five-Card Futures uses the
canonical poker distribution as the outcome table, providing casino flavor and
fully auditable rarity without a bespoke probability generator.

### Setup

1. Select one eligible non-Bane deck entry with at least one eligible
   Transfiguration.
2. Display its resulting Transfiguration preview and the shown Dreamsign.
3. Pay the ordinary table fee and a 50-Essence stake.
4. Deal five cards without replacement. There is no discard or draw phase.
5. Evaluate the best standard five-card poker category.

### Exact outcome distribution

| Hand category | Combination count | Exact chance | Result |
| --- | ---: | ---: | --- |
| High card | 1,302,540 | 50.1177% | lose the 50-Essence stake |
| Exactly one pair | 1,098,240 | 42.2569% | refund the 50-Essence stake |
| Two pair or three of a kind | 178,464 | 6.8667% | receive 150 Essence total |
| Straight or flush | 15,308 | 0.5890% | receive 150 Essence and Transfigure the selected entry |
| Full house, four of a kind, or straight flush | 4,408 | 0.1696% | receive 150 Essence, Transfigure the selected entry, and gain the shown Dreamsign |
| **Total** | **2,598,960** | **100.0000%** | |

“Straight or flush” excludes straight flushes. “High card” excludes straights
and flushes. The final tier includes all 40 straight flushes, including the four
royal flushes.

### Farpoint Station

Every 150-Essence total becomes 200 Essence. A full house or better also
duplicates the Transfigured entry. The stake and hand probabilities are
unchanged.

### Why it belongs

This is primarily a spectacle and rarity game rather than a stopping game. Its
strength is that every probability comes from a familiar, mathematically exact
five-card hand space.

## 9. Match and Keep: House Deck

### Player-facing promise

Pay for five attempts at a twelve-card memory grid. Matching equal ranks claims
their disclosed prizes; a mismatch spends an attempt but reveals information
that can improve later choices.

### Inspiration and playing-card translation

Slay the Spire’s Match and Keep uses six pairs and five attempts, with every
matched game card—including curses—entering the deck. The House Deck preserves
the six-pair/five-attempt skill structure while using the actual playing cards
A–6 of hearts and spades. Rank, rather than a hidden game-card identity,
determines the prize.

### Setup

1. Use the twelve-card subset A♥–6♥ and A♠–6♠.
2. Lock a purge target and a different Transfiguration target before paying.
3. Display all six rank rewards.
4. Pay the ordinary table fee and a 100-Essence stake.
5. Shuffle the subset and lay it face down in a 3×4 grid.

If the required purge or Transfiguration target is unavailable, replace that
rank’s prize with 100 Essence before the player commits.

### Attempts and rewards

An attempt flips two face-down cards:

- Equal ranks remain face up and immediately grant that rank’s prize.
- Unequal ranks remain visible until acknowledged, then flip back down.
- Either result consumes exactly one attempt.
- The game ends after five attempts or when fewer than two face-down cards
  remain.

| Matched rank | Reward |
| --- | --- |
| Aces | gain 75 Essence |
| Twos | raise the Essence cap by 50 |
| Threes | gain the deterministic best-fit card |
| Fours | purge the locked non-Bane entry |
| Fives | apply the previewed Transfiguration to the locked entry |
| Sixes | gain the shown Dreamsign |

At most five pairs can be matched because a match consumes an attempt. There is
no random prize assignment after the grid is shuffled.

### Farpoint Station

The table fee and 100-Essence stake are both waived, and the player receives six
attempts. All rank rewards remain unchanged. A perfect-memory line can
therefore claim all six prizes if it finds a match on every attempt.

### Why it belongs

This is the signature non-probability challenge. The shuffle is random, but
observation and memory convert revealed information into value.

## 10. The Dealer’s Challenge

### Player-facing promise

Commit to a harder next battle. One card discloses both the exact handicap,
from its suit, and the exact victory reward, from its rank.

### Inspiration and playing-card translation

Battleworn Dummy lets the player choose a harder combat target for a stronger
reward. The Colosseum risks a second elite fight after the player could leave
with existing loot. Divine Shards trades a dangerous Pyre state for an
artifact. The Dealer’s Challenge compresses those structures into one
52-outcome contract: four equally likely battle rules crossed with thirteen
reward ranks.

### Setup and commitment

1. Display the four possible battle handicaps and two reward bands.
2. The player accepts and pays the ordinary table fee, or declines freely.
3. Draw one card and discard the rest of the playing-card deck.
4. Store the revealed card, its battle modifier, and its victory reward.
5. Apply the modifier to the Battle site in the current dreamscape.
6. A victory grants the stored reward after the ordinary battle reward. A
   defeat ends the run under the normal journey rule, so the stored reward is
   never granted.

### Suit-based battle rule

| Suit | Chance | Next-battle rule |
| --- | ---: | --- |
| Hearts | 13 / 52 = 25% | the opponent starts with +1 maximum energy and +1 current energy |
| Diamonds | 13 / 52 = 25% | the opponent draws one additional card on each of its first two turns |
| Clubs | 13 / 52 = 25% | every opposing character enters play with +1 spark |
| Spades | 13 / 52 = 25% | the opponent begins with +2 score |

### Rank-based victory reward

| Rank | Cards | Chance | Victory reward |
| --- | ---: | ---: | --- |
| A–8 | 32 | 32 / 52 = 61.54% | 175 Essence |
| 9–K | 20 | 20 / 52 = 38.46% | the shown Dreamsign and 100 Essence |

Suit and rank are independent in a complete deck, so each individual
rule-and-rank combination has probability `1 / 52 = 1.92%`.

### Farpoint Station

The table fee is waived, the victory rewards become 225 Essence or the shown
Dreamsign plus 150 Essence, and the handicaps become:

- Hearts: the opponent gains +1 current energy on turn one; maximum energy is
  unchanged.
- Diamonds: the opponent draws one additional card only on its first turn.
- Clubs: only the first opposing character to enter gains +1 spark.
- Spades: the opponent begins with +1 score.

### Why it belongs

This is the most systemically ambitious event. The draw is resolved and logged
at Gravok’s table, while its consequence changes a later battle rule without
persisting the playing-card deck itself.

## Recommended content mix

For an initial implementation, use four complexity bands:

| Band | Games | Runtime needs |
| --- | --- | --- |
| Small event | The Two Champions; The Black Ribbon | one commitment and one draw |
| Repeated wager | Reach into the Shoe; Cut Deeper; High–Low | encounter runtime, multiple player intents, cash-out state |
| Card-game surface | Twenty-One Pages; Five-Card Futures; Match and Keep | hand evaluation or grid presentation |
| Cross-site contract | The Vaulted Ace; The Dealer’s Challenge | delayed journey state, battle integration, expiry and replay rules |

The Two Champions is the best first vertical slice because it proves the
playing-card deck, exact odds display, target locking, reward application,
Farpoint enhancement, co-op replay, and logging with the smallest state
machine. High–Low is the strongest second slice because it proves a persistent
shoe and cash-out decisions. The Vaulted Ace and The Dealer’s Challenge should
follow only after the Gamble runtime can carry deterministic effects across
site and battle boundaries.
