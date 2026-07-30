# Gravok’s Casino: Gamble Site Mechanics

The retained 22-candidate working set is in
[Gravok Gamble: Brainstorm Longlist](gravok-gamble-brainstorm.md).

## Signature suggestions

- **Three-Way Wager:** click `Safe`, `Risky`, or `Long Shot`, each showing its odds and reward; one card then wins that reward or loses the 50-Essence stake.
- **Progressive Draw:** click `Draw` or `Leave`; after each loss, the next draw costs more but has better odds of winning the shown Dreamsign.
- **Cash-Out Ladder:** a safe draw creates a prize and offers `Cash Out` or `Risk It`; a later bust erases that prize and adds the shown Bane.
- **Red-or-Black Insurance:** gain the shown Dreamsign, but choose whether to pay to protect clubs or spades from an otherwise 50% chance to add a disclosed Bane.
- **Four-Suit Escrow:** select a deck card to remove, then one equally likely suit determines when and how it returns—or whether it is purged.
- **High–Low:** call `Higher` or `Lower` with exact live odds, then cash out an increasing payout or risk losing it on another call.
- **Twenty-One:** choose `Hit — 10 Essence` or `Stand`; the final blackjack total loses, refunds, or upgrades the payout shown on screen.
- **Five-Card Draw:** toggle which playing cards to hold while the exact payout chances update, then replace the rest and resolve the poker hand.
- **Odds Auction:** assign three possible prices to three unequal rank bands, then one card chooses the single price paid for a fixed reward.
- **Challenge Bet:** choose standard or doubled next-battle effects, then one card randomly selects the exact handicap and victory reward from the displayed tables.

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

The screen shows one Dreamsign, a card to Transfigure, and three wager buttons.
Each button states the same 50-Essence stake, its exact chance to win, and its
complete reward. The player may change the selected deck card before choosing
`Safe`, `Risky`, or `Long Shot`, or choose `Leave` for free. Choosing a wager
pays the table fee and stake, immediately draws one playing card, and either
grants that button’s reward or loses the stake.

| Button | Winning draw | Chance | Reward on a win |
| --- | --- | ---: | --- |
| `Safe — 50 Essence` | ranks 6–A | 36 / 52 = 69.23% | gain the shown Dreamsign |
| `Risky — 50 Essence` | ranks 9–A | 24 / 52 = 46.15% | gain the Dreamsign and apply the previewed Transfiguration |
| `Long Shot — 50 Essence` | ranks J–A | 16 / 52 = 30.77% | gain the Dreamsign, apply the Transfiguration, and add a copy of that entry |

The drawn card and winning ranks remain visible on the result screen; suit has
no effect. If no non-Bane entry can be Transfigured, `Risky` instead awards 100
Essence and `Long Shot` 200 Essence in place of their deck rewards.

### Farpoint Station

The table fee is waived. `Safe`, `Risky`, and `Long Shot` wins also grant 50,
100, and 150 Essence respectively. The rank thresholds and stake remain
unchanged.

## 2. Progressive Draw

The screen shows the Dreamsign being chased, all four draw costs and win
chances, and buttons for `Draw — 15 Essence` and `Leave`. Clicking `Draw`
pays the table fee plus its listed cost and reveals a card. A winning rank
grants the Dreamsign and ends the game. After a loss, the screen keeps the
failed card and total spent visible, then offers `Draw Again` at the next row’s
higher price and better odds, or `Leave` with no reward. Four losses end the
game.

| Draw | Cost for this draw | Cumulative cost | Win cards | Exact win chance |
| --- | ---: | ---: | --- | ---: |
| 1 | 15 Essence | 15 | ranks Q–A | 12 / 52 = 23.08% |
| 2 | 25 Essence | 40 | ranks 10–A | 20 / 52 = 38.46% |
| 3 | 40 Essence | 80 | ranks 8–A | 28 / 52 = 53.85% |
| 4 | 60 Essence | 140 | ranks 6–A | 36 / 52 = 69.23% |

The deck is reassembled and reshuffled before each purchase, so every displayed
fraction uses 52 cards. Buying all four draws costs 140 Essence and has a
93.28% chance to win at least once; the remaining 6.72% grants nothing.

### Farpoint Station

The costs are 10/20/30/45 Essence, for a maximum of 105 Essence. A win also
grants 50 Essence. The odds are unchanged.

## 3. Cash-Out Ladder

The opening screen shows the three-step ladder, the Dreamsign at its top, and
the exact Bane added by any bust. Its buttons are `Draw` and `Leave`. The first
draw costs only the table fee. A safe card creates a 60-Essence bank and
replaces the controls with `Cash Out — 60 Essence` and `Risk It`.

`Cash Out` immediately grants the displayed bank. `Risk It` draws again with
the next row’s larger bust band: a safe card replaces the bank with the next
prize, while a bust erases the entire unclaimed bank, adds the shown Bane, and
ends the game. The third safe draw cashes out automatically. The deck is
reassembled and reshuffled for every draw.

| Draw | Bust cards | Bust chance | Safe chance | Bank after a safe draw |
| --- | --- | ---: | ---: | --- |
| 1 | Twos | 4 / 52 = 7.69% | 48 / 52 = 92.31% | 60 Essence |
| 2 | ranks 2–4 | 12 / 52 = 23.08% | 40 / 52 = 76.92% | 140 Essence |
| 3 | ranks 2–7 | 24 / 52 = 46.15% | 28 / 52 = 53.85% | 140 Essence plus the shown Dreamsign |

The chance of reaching and collecting the top prize is 38.23%.

### Farpoint Station

The bust sets are Twos, 2–3, and 2–5:

| Draw | Enhanced bust chance | Enhanced bank |
| --- | ---: | --- |
| 1 | 4 / 52 = 7.69% | 75 Essence |
| 2 | 8 / 52 = 15.38% | 175 Essence |
| 3 | 16 / 52 = 30.77% | 175 Essence plus the shown Dreamsign |

The probability of surviving all three enhanced draws is 54.07%. Farpoint also
waives the table fee.

## 4. Red-or-Black Insurance

The screen shows the guaranteed Dreamsign and previews two Banes: the one added
by clubs and the one added by spades. The player has four buttons:
`Play Uninsured`, `Insure Clubs — 40 Essence`, `Insure Spades — 40 Essence`,
and `Leave`. Each play button shows its exact clean-card chance and immediately
draws one card after charging the table fee and any listed premium. The
Dreamsign is granted on every draw; insurance only changes which black suit can
add its displayed Bane.

| Button | Premium | Clean draw | Bane draw |
| --- | ---: | --- | --- |
| `Play Uninsured` | 0 | hearts or diamonds: 50% | clubs add the club Bane; spades add the spade Bane |
| `Insure Clubs` | 40 Essence | hearts, diamonds, or clubs: 75% | spades add the spade Bane |
| `Insure Spades` | 40 Essence | hearts, diamonds, or spades: 75% | clubs add the club Bane |

If the Dreamsign is replaced with its 150-Essence fallback, the Bane and
insurance rules stay the same.

### Farpoint Station

Every outcome also grants 75 Essence, and either insurance premium is 25
Essence. The uninsured 50% Bane chance and insured 25% Bane chance are
unchanged.

## 5. Four-Suit Escrow

The screen lets the player select one non-starter, non-Bane deck card and shows
all four equally likely contracts below. Its controls are `Place in Escrow` and
`Leave`. Clicking `Place in Escrow` pays the table fee, immediately removes the
selected card from the deck, and draws one playing card. The suit locks the
card’s contract; rank has no effect.

| Suit | Chance | Contract |
| --- | ---: | --- |
| Hearts | 13 / 52 = 25% | After one completed battle, return the original entry with its deterministic best eligible Transfiguration. |
| Diamonds | 13 / 52 = 25% | After two completed battles, return the original entry and add one exact duplicate. |
| Clubs | 13 / 52 = 25% | After two completed battles, return the original unchanged and grant 150 Essence. |
| Spades | 13 / 52 = 25% | After two completed battles, permanently purge the entry. |

The result screen shows the drawn suit, the locked contract, and the number of
battles remaining. Completed battles tick the counter after their rewards; a
returning card is restored before the next dreamscape becomes interactive. If
the run ends first, the contract has no further effect.

### Farpoint Station

- Hearts returns the Transfigured card as the Gamble site completes, so it is
  available for the upcoming battle.
- Diamonds returns two copies and both have the best eligible
  Transfiguration.
- Clubs pays 225 Essence.
- Spades returns the card unchanged after two battles.

## 6. High–Low

The opening screen shows the payout ladder and offers
`Play — 25 Essence` or `Leave`. Playing pays the table fee and stake, shuffles
once, and reveals a starting card. The screen then shows two buttons such as
`Higher — 32/51 (62.75%)` and `Lower — 19/51 (37.25%)`; their odds update from
the cards still in the deck.

Clicking a direction reveals the next card without replacement. A wrong call
loses the 25-Essence stake and every unclaimed payout. After a correct call,
the new card becomes the reference and the screen offers `Cash Out` for the
current payout or new `Higher` and `Lower` calls. Four correct calls cash out
automatically.

| Consecutive correct calls | Total cash-out payout | Profit after the 25-Essence stake |
| ---: | ---: | ---: |
| 1 | 50 Essence | 25 |
| 2 | 100 Essence | 75 |
| 3 | 200 Essence | 175 |
| 4 | 400 Essence | 375 |

Cards use the unique order 2♣ < 2♦ < 2♥ < 2♠ < … < A♠, so calls never tie.

### Farpoint Station

The table fee is waived. Total payouts are 60/125/250/500 Essence. The
25-Essence stake and card-order rules are unchanged.

## 7. Twenty-One

The opening screen shows the payout table, the Dreamsign awarded for 21, and
buttons for `Deal — 50 Essence` and `Leave`. Dealing pays the table fee and
stake, then shows two face-up cards and their blackjack total. The player then
chooses `Stand` or `Hit — 10 Essence`. Above those buttons, the UI counts how
many remaining cards would leave the hand at 15 or less, 16–18, 19–20, exactly
21, or bust.

`Hit` pays 10 Essence and deals another card without replacement. The same
choice repeats below 21; exactly 21 or a bust resolves immediately. `Stand`
ends the hand at the current row:

| Terminal total | Result |
| --- | --- |
| Above 21 | lose the 50-Essence stake and every hit fee |
| 15 or less by standing | lose the 50-Essence stake and every hit fee |
| 16–18 by standing | refund the 50-Essence stake; hit fees remain spent |
| 19–20 by standing | receive 150 Essence total |
| Exactly 21 | receive 150 Essence and the shown Dreamsign |

J/Q/K count as 10. Aces use 1 or 11 to make the highest total at or below 21.
Payouts are total returns, so 150 Essence is 100 profit before hit fees and the
table fee.

### Farpoint Station

Hits cost 0 Essence. Totals 19–20 pay 200 Essence. Exactly 21 pays 200 Essence
plus the shown Dreamsign. The 50-Essence stake remains.

## 8. Five-Card Draw

The opening screen shows the Dreamsign, lets the player select one non-Bane
deck card to Transfigure, previews that change, and offers
`Deal — 50 Essence` or `Leave`. Dealing pays the table fee and stake, then
shows five face-up playing cards.

Clicking any dealt card toggles `Hold`; every unheld card will be replaced.
As the selection changes, the UI recomputes the exact chance of every payout
row. The confirmation button reads `Draw N Cards`. Clicking it discards the
unheld cards, deals replacements without replacement, and resolves the final
poker hand:

| Final category | Result |
| --- | --- |
| High card | lose the 50-Essence stake |
| Exactly one pair | refund the 50-Essence stake |
| Two pair or three of a kind | receive 150 Essence total |
| Straight or flush | receive 150 Essence and Transfigure the selected entry |
| Full house, four of a kind, or straight flush | receive 150 Essence, Transfigure the selected entry, and gain the shown Dreamsign |

“Straight or flush” excludes straight flushes. “High card” excludes straights
and flushes. Ace is high except in the A-2-3-4-5 straight.

If `d` cards are replaced, the UI enumerates all `C(47, d)` possible replacement
sets. For example, holding two Aces and replacing the other three cards yields
a 71.2858% chance of exactly one pair, 27.4191% of two pair or three of a kind,
and 1.2951% of a full house or four of a kind.

### Farpoint Station

Every 150-Essence total becomes 200 Essence. A full house or better also
duplicates the Transfigured entry. The stake and hold-dependent probabilities
are unchanged.

## 9. Odds Auction

The screen first shows the fixed reward: the shown Dreamsign, 150 Essence, and
a previewed Transfiguration for a player-selected deck card. It then asks the
player to select one held Dreamsign they could surrender and one of two
displayed Banes they could add.

The player assigns three price tiles—`Pay 100 Essence`, `Lose selected
Dreamsign`, and `Add selected Bane`—to the three rank bands below. The UI shows
each band’s chance throughout and allows all six arrangements. Once every price
has a band, the controls are `Accept & Draw` and `Leave`. Accepting pays the
table fee and reveals one card. The player pays only the single price assigned
to its rank band, then receives the entire fixed reward.

| Band | Cards | Exact chance |
| --- | ---: | ---: |
| ranks 2–7 | 24 | 24 / 52 = 46.15% |
| ranks 8–J | 16 | 16 / 52 = 30.77% |
| ranks Q–A | 12 | 12 / 52 = 23.08% |

Suit has no effect. The game appears only when the player holds a Dreamsign and
can afford the possible Essence price in addition to the table fee.

### Farpoint Station

The table fee is waived, the Essence price falls to 75, and the fixed reward
grants 225 Essence. The Dreamsign and Bane prices, rank bands, and
Transfiguration are unchanged.

## 10. Challenge Bet

The screen presents two contract panels, `Standard Challenge` and
`Double Challenge`, plus `Leave`. Each panel shows the four possible
next-battle handicaps and both possible victory rewards before the player
chooses. The table fee is the only upfront cost; “double” means doubled
handicap and larger reward.

Clicking a challenge pays the table fee and immediately draws one card. Its
suit selects the exact next-battle handicap; its rank selects the exact reward
for winning that battle. The result screen states both in one sentence—for
example, “Opposing characters enter with +2 spark. Win the next battle to gain
the shown Dreamsign and 200 Essence.” There are no further gamble choices.

The contract applies to the Battle site in the current dreamscape. Victory
grants the stored prize after the normal battle reward. A defeat ends the run
normally, so the stored prize is not granted.

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

### Double-stakes battle rule and reward

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

### Farpoint Station

The table fee is waived. Standard-stakes victory rewards become 225 Essence or
the shown Dreamsign plus 150 Essence, and its handicaps become:

- Hearts: the opponent gains +1 current energy on turn one; maximum energy is
  unchanged.
- Diamonds: the opponent draws one additional card only on its first turn.
- Clubs: only the first opposing character to enter gains +1 spark.
- Spades: the opponent begins with +1 score.

Double-stakes rewards and handicaps remain unchanged.

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
