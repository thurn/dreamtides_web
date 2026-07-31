# Gravok’s Casino: Gamble Site Mechanics

The retained 22-candidate working set is in
[Gravok Gamble: Brainstorm Longlist](gravok-gamble-brainstorm.md).

## Signature suggestions

- **Three-Way Wager:** click `Safe`, `Risky`, or `Long Shot`, each showing its odds and reward; one card then wins that reward or loses the 50-Essence stake.
- **Progressive Draw:** buy up to four attempts to win a specific Dreamsign; after each miss, the player can leave or pay more for an attempt with better odds.
- **Cash-Out Ladder:** draw up to three cards; after each non-bust result, take the current prize or risk it on a round with more losing ranks.
- **Red-or-Black Insurance:** every draw awards a specific Dreamsign, but the player can pay to prevent either clubs or spades from also adding a Bane.
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
12. Essence exists on the merchant context but does not affect archetype
    eligibility, weights, targets, or payouts. The chosen Augury reward has no
    fee or stake.
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

Three-Way Wager is a one-card bet. The player chooses one of three
50-Essence wagers, then the game draws a playing card. A wager wins when the
drawn rank falls within its listed range. The easier ranges pay smaller rewards;
the harder ranges add upgrades for one card in the player’s deck. A losing draw
awards nothing and the 50-Essence stake is lost. Suit has no effect.

Before the choice, the game selects the unheld Dreamsign with the highest match
score for the current deck and displays its name and effect. The player must
also select an eligible card from their deck before choosing a wager. The UI
shows exactly how the two harder wagers would Transfigure or duplicate that
card. The controls are `Safe`, `Risky`, `Long Shot`, and `Leave`; each wager
button shows its cost, chance, winning ranks, and complete reward.

| Button | Winning draw | Chance | Reward on a win |
| --- | --- | ---: | --- |
| `Safe — 50 Essence` | ranks 6–A | 36 / 52 = 69.23% | gain the displayed Dreamsign |
| `Risky — 50 Essence` | ranks 9–A | 24 / 52 = 46.15% | gain the displayed Dreamsign and apply the previewed Transfiguration |
| `Long Shot — 50 Essence` | ranks J–A | 16 / 52 = 30.77% | gain the displayed Dreamsign, apply the Transfiguration, and add a copy of that entry |

Choosing a wager pays the 10-Essence table fee and the stake, draws the card,
and shows why it won or lost. If no non-Bane entry can be Transfigured,
`Risky` instead awards 100 Essence and `Long Shot` 200 Essence in place of
their deck rewards.

### Farpoint Station

The table fee is waived. `Safe`, `Risky`, and `Long Shot` wins also grant 50,
100, and 150 Essence respectively. The rank thresholds and stake remain
unchanged.

## 2. Progressive Draw

Progressive Draw offers up to four separately purchased attempts to win one
specific Dreamsign. The first attempt is cheap but wins only on Q–A. After a
miss, the player can leave or buy the next attempt; each later attempt costs
more but accepts a wider range of ranks. A win grants the Dreamsign and ends
the game. Leaving or missing all four attempts grants nothing.

Before the first attempt, the game selects the unheld Dreamsign with the highest
match score for the current deck and displays its name and effect. The UI lists
all four attempts below, including each price and its winning ranks. The
initial buttons are `Draw — 15 Essence` and `Leave`. After a miss, the drawn
card and cumulative draw cost remain visible beside
`Draw Again — [next cost]` and `Leave`.

| Draw | Cost for this draw | Cumulative cost | Win cards | Exact win chance |
| --- | ---: | ---: | --- | ---: |
| 1 | 15 Essence | 15 | ranks Q–A | 12 / 52 = 23.08% |
| 2 | 25 Essence | 40 | ranks 10–A | 20 / 52 = 38.46% |
| 3 | 40 Essence | 80 | ranks 8–A | 28 / 52 = 53.85% |
| 4 | 60 Essence | 140 | ranks 6–A | 36 / 52 = 69.23% |

The first draw also charges the ordinary table fee. The deck is reassembled and
reshuffled before every attempt, so all four chances are calculated from a full
52-card deck. Buying all four attempts costs 140 Essence in draw fees and has a
93.28% chance to win at least once; the remaining 6.72% grants nothing.

### Farpoint Station

The costs are 10/20/30/45 Essence, for a maximum of 105 Essence. A win also
grants 50 Essence. The odds are unchanged.

## 3. Cash-Out Ladder

Cash-Out Ladder is a three-round push-your-luck game. Each round draws one
playing card. The low ranks listed below cause a bust; every other rank earns
that round’s prize. After the first or second non-bust draw, the player can take
the current prize and end the game or risk that entire prize on the next round.
A bust awards no prize and adds one Bane card to the player’s deck. The third
non-bust draw awards the final prize automatically.

Before the first draw, the game selects and displays the exact Bane that a bust
would add. It also selects a specific unheld Dreamsign, displays its effect, and
includes it in the third-round prize. The UI lists all three rounds below. Its
initial controls are `Draw — 10 Essence Table Fee` and `Leave`. After the first
non-bust draw, for example, the controls become `Take 60 Essence` and
`Draw Round 2 — 23.08% Bust`; the second button also warns that a bust loses
the 60 Essence and adds the displayed Bane.

| Round | Ranks that bust | Bust chance | Prize after any other rank |
| --- | --- | ---: | --- |
| 1 | Twos | 4 / 52 = 7.69% | 60 Essence |
| 2 | ranks 2–4 | 12 / 52 = 23.08% | 140 Essence |
| 3 | ranks 2–7 | 24 / 52 = 46.15% | 140 Essence plus the displayed Dreamsign |

The deck is reassembled and reshuffled for every round. The chance of drawing
no busts and collecting the final prize is 38.23%.

### Farpoint Station

The bust sets are Twos, 2–3, and 2–5:

| Round | Enhanced bust chance | Enhanced prize |
| --- | ---: | --- |
| 1 | 4 / 52 = 7.69% | 75 Essence |
| 2 | 8 / 52 = 15.38% | 175 Essence |
| 3 | 16 / 52 = 30.77% | 175 Essence plus the displayed Dreamsign |

The probability of drawing no busts in all three rounds is 54.07%. Farpoint
also waives the table fee.

## 4. Red-or-Black Insurance

Red-or-Black Insurance is a one-card game with a guaranteed reward and a
possible deck penalty. Every draw grants one specific Dreamsign. A red card
(hearts or diamonds) has no penalty. A club adds one specific Bane card to the
player’s deck, while a spade adds a different Bane. The player can accept both
black-suit risks for free or pay 40 Essence to make either clubs or spades
penalty-free.

Before the player chooses, the game selects and displays the exact Dreamsign
reward and its effect. It also displays both possible Banes and their effects.
The controls are `Play Uninsured`, `Insure Clubs — 40 Essence`,
`Insure Spades — 40 Essence`, and `Leave`. Each play button states which suits
add no Bane and which Bane can still be added. Clicking one pays the 10-Essence
table fee and any listed insurance premium, then immediately draws the card.

| Button | Premium | Draws that add no Bane | Draws that add a Bane |
| --- | ---: | --- | --- |
| `Play Uninsured` | 0 | hearts or diamonds: 50% | clubs add the club Bane; spades add the spade Bane |
| `Insure Clubs` | 40 Essence | hearts, diamonds, or clubs: 75% | spades add the spade Bane |
| `Insure Spades` | 40 Essence | hearts, diamonds, or spades: 75% | clubs add the club Bane |

Every result screen shows the drawn card, grants the displayed Dreamsign, and
states whether a Bane was added. If no Dreamsign is eligible, every outcome
instead grants 150 Essence; the Bane and insurance rules stay the same.

### Farpoint Station

Every outcome also grants 75 Essence, and either insurance premium is 25
Essence. The uninsured 50% Bane chance and insured 25% Bane chance are
unchanged.

## 5. Four-Suit Escrow

Four-Suit Escrow asks the player to remove one card from their deck now in
exchange for one of four possible future outcomes. The selected card might
return Transfigured after one battle, return with a duplicate after two
battles, return with Essence after two battles, or be permanently purged. All
four outcomes are equally likely.

Before committing, the player selects one non-starter, non-Bane card from their
deck and can read all four possible outcomes below. The controls are
`Place in Escrow` and `Leave`. Clicking `Place in Escrow` pays the 10-Essence
table fee and removes the selected card immediately, so it cannot be used in
the next battle. The game then draws one playing card: its suit chooses the
outcome, while its rank has no effect.

| Suit | Chance | Contract |
| --- | ---: | --- |
| Hearts | 13 / 52 = 25% | After one completed battle, return the original entry with its deterministic best eligible Transfiguration. |
| Diamonds | 13 / 52 = 25% | After two completed battles, return the original entry and add one exact duplicate. |
| Clubs | 13 / 52 = 25% | After two completed battles, return the original unchanged and grant 150 Essence. |
| Spades | 13 / 52 = 25% | After two completed battles, permanently purge the entry. |

The result screen names the selected deck card, the drawn suit, the resulting
outcome, and the number of battles before it resolves. Completed battles tick
the counter after their rewards; a returning card is restored before the next
dreamscape becomes interactive. If the run ends first, nothing else happens.

### Farpoint Station

- Hearts returns the Transfigured card as the Gamble site completes, so it is
  available for the upcoming battle.
- Diamonds returns two copies and both have the best eligible
  Transfiguration.
- Clubs pays 225 Essence.
- Spades returns the card unchanged after two battles.

## 6. High–Low

High–Low is a sequence of up to four higher-or-lower guesses. After paying a
25-Essence stake, the game reveals one playing card. The player guesses whether
the next card will be higher or lower. A correct guess creates an Essence
payout that can be collected immediately or risked on another guess. A wrong
guess loses the stake and any payout that has not been collected. Four correct
guesses award the largest payout automatically.

The initial controls are `Play — 25 Essence` and `Leave`; playing also charges
the 10-Essence table fee. Once the first card appears, the controls become
`Higher` and `Lower`. Each button includes the exact current odds—for example,
`Higher — 32/51 (62.75%)`—calculated from the cards that remain in the deck.
After a correct guess, the UI displays the new card and current payout, then
offers `Cash Out — [current payout]`, `Higher`, and `Lower`.

| Consecutive correct calls | Total cash-out payout | Profit after the 25-Essence stake |
| ---: | ---: | ---: |
| 1 | 50 Essence | 25 |
| 2 | 100 Essence | 75 |
| 3 | 200 Essence | 175 |
| 4 | 400 Essence | 375 |

The game draws without replacement and uses the unique order
2♣ < 2♦ < 2♥ < 2♠ < … < A♠, so two cards never tie.

### Farpoint Station

The table fee is waived. Total payouts are 60/125/250/500 Essence. The
25-Essence stake and card-order rules are unchanged.

## 7. Twenty-One

Twenty-One is a solo blackjack game with no dealer. The player pays a
50-Essence stake and receives two playing cards, then tries to finish as close
to 21 as possible. `Stand` ends the game at the current total.
`Hit — 10 Essence` buys another card. Standing at 15 or less or going above 21
loses the stake and all hit fees. Standing at 16–18 refunds the stake; standing
at 19–20 earns Essence; reaching exactly 21 earns Essence and a specific
Dreamsign.

Before the deal, the game selects the unheld Dreamsign with the highest match
score for the current deck and displays its name and effect beside the result
table below. The initial controls are `Deal — 50 Essence` and `Leave`; dealing
also charges the 10-Essence table fee. After every card, the UI shows the
current total and counts how many cards remaining in the deck would produce
each result range or a bust. The available controls are `Stand` and
`Hit — 10 Essence`. Exactly 21 or a bust resolves immediately without another
choice.

| Terminal total | Result |
| --- | --- |
| Above 21 | lose the 50-Essence stake and every hit fee |
| 15 or less by standing | lose the 50-Essence stake and every hit fee |
| 16–18 by standing | refund the 50-Essence stake; hit fees remain spent |
| 19–20 by standing | receive 150 Essence total |
| Exactly 21 | receive 150 Essence and the displayed Dreamsign |

J/Q/K count as 10. Aces use 1 or 11 to make the highest total at or below 21.
Payouts are total returns, so 150 Essence is 100 profit before hit fees and the
table fee.

### Farpoint Station

Hits cost 0 Essence. Totals 19–20 pay 200 Essence. Exactly 21 pays 200 Essence
plus the displayed Dreamsign. The 50-Essence stake remains.

## 8. Five-Card Draw

Five-Card Draw is a single hand of draw poker. The player pays a 50-Essence
stake and receives five playing cards. They choose any cards to keep, replace
all the others once, and receive a reward based on the final poker hand. A high
card loses the stake, one pair refunds it, and stronger hands award Essence,
improve a selected card in the player’s deck, or grant a specific Dreamsign.

Before the deal, the game selects and displays the Dreamsign that can be won.
The player also selects one eligible non-Bane card from their deck and sees
exactly how a winning Transfiguration would change it. The initial controls are
`Deal — 50 Essence` and `Leave`; dealing also charges the 10-Essence table fee.

After the deal, clicking a playing card toggles `Hold`. Cards marked `Hold`
remain in the hand; every other card will be replaced. As the selection
changes, the UI recomputes the exact probability of every result below. The
confirmation button reads `Draw N Cards`. Clicking it replaces the unheld
cards and resolves the final hand:

| Final category | Result |
| --- | --- |
| High card | lose the 50-Essence stake |
| Exactly one pair | refund the 50-Essence stake |
| Two pair or three of a kind | receive 150 Essence total |
| Straight or flush | receive 150 Essence and Transfigure the selected entry |
| Full house, four of a kind, or straight flush | receive 150 Essence, Transfigure the selected entry, and gain the displayed Dreamsign |

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

Odds Auction always grants the same large reward, but a playing-card draw
chooses which one of three prices the player must pay for it: 100 Essence, one
Dreamsign they already hold, or one new Bane added to their deck. The player
cannot choose which price is drawn, but can make an undesirable price less
likely by assigning it to a smaller rank range.

Before the player commits, the game selects and displays the new Dreamsign
included in the reward. The player chooses an eligible deck card and previews
its Transfiguration. Together, those items and 150 Essence form the complete
reward. The player must also select the held Dreamsign they might lose and
choose which of two displayed Banes might be added.

The UI presents three price tiles—`Pay 100 Essence`,
`Lose [selected Dreamsign]`, and `Add [selected Bane]`—and the three rank
ranges below. The player assigns one price to each range. Once all three prices
are assigned, the controls are `Accept & Draw` and `Leave`. Accepting pays the
10-Essence table fee and draws one card. Its rank chooses one price; the other
two prices are ignored. After paying the chosen price, the player receives the
complete reward.

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

Challenge Bet offers an extra reward for winning the next battle, but also
makes that battle harder. The player first chooses `Standard Challenge` or
`Double Challenge`. The double option applies a larger handicap and offers a
larger reward. After that choice, one playing card randomly determines the
details: its suit chooses one of four battle handicaps, while its rank chooses
one of two rewards. The 10-Essence table fee is the only upfront cost.

Before the choice, the game selects and displays the specific Dreamsign that
can appear in the higher reward. The UI presents the two challenge options and
`Leave`. Each option lists all four possible handicaps and both reward ranges
below, so the player knows every possible result. Choosing an option pays the
table fee and immediately draws the card.

The result screen states the complete condition in plain language—for example,
“Every opposing character enters with +2 spark. Win the next battle to gain
[Dreamsign name] and 200 Essence.” The modifier applies to the Battle site in
the current dreamscape. There are no more choices at the Gamble site. Winning
that battle grants the extra prize after the normal battle reward; losing ends
the run normally and grants no extra prize.

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
| 10–A | 20 | 20 / 52 = 38.46% | the displayed Dreamsign and 100 Essence |

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
| 10–A | 20 | 20 / 52 = 38.46% | the displayed Dreamsign and 200 Essence |

### Farpoint Station

The table fee is waived. Standard-stakes victory rewards become 225 Essence or
the displayed Dreamsign plus 150 Essence, and its handicaps become:

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
