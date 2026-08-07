# Gravok Gamble: Brainstorm Longlist

This retained working document records the 22-candidate longlist considered
before the signature set in
[Gravok’s Casino: Gamble Site Mechanics](gravok-gamble-mechanics.md). It keeps
alternate and rejected directions visible so future iteration can recover an
idea without treating every candidate as a recommendation.

## Shared assumptions

- Every game uses a fresh standard 52-card deck and discards it when the Gamble
  encounter ends.
- Aces are high. Blackjack may value an Ace as 1 or 11, and poker permits the
  A-2-3-4-5 low straight.
- Cards are drawn without replacement unless the rules explicitly reassemble
  and reshuffle all 52 cards.
- The player sees exact costs, reward payloads, winning cards, and probabilities
  before each commitment.
- The player must be able to afford the fee or stake for the decision being
  committed. A later optional step does not need to be affordable when the
  game starts.
- Playing cards are the only source of random variation. Reward preparation,
  target selection, ties, and game selection are deterministic or
  player-chosen.
- Every active candidate contains a choice about odds, assets, play, or a
  stopping point. A free decline by itself does not qualify as that choice.

## Review record

The independent review identified two issues in the initial draft:

1. The source description of The Joust says only that one outcome is safer and
   another is riskier. The 70%/30% figures came from the request’s illustrative
   example, so proposals using those targets attribute the two-payout structure
   to The Joust and the numerical targets to the request.
2. Affordability is checked at each committed step. Multi-attempt games do not
   require enough Essence for every possible future step at entry.

The memory-pair direction is recorded only as a rejected branch. The
choice-free five-card deal is represented by its player-directed Five-Card Draw
revision.

## Candidate index

| # | Candidate | Disposition | Primary choice |
| ---: | --- | --- | --- |
| 1 | Three-Way Wager | Signature | choose one of three odds/reward tiers |
| 2 | Ladder Climb | Signature | stop or buy the next improving draw |
| 3 | Odds Ladder | Alternate | choose Essence or a temporary card lock as each stake |
| 4 | Cash-Out Ladder | Signature | bank the current prize or risk it |
| 5 | Red-or-Black Insurance | Signature | choose coverage and which Nightmare card remains exposed |
| 6 | Wheel of 52 | Alternate | choose a low-variance or jackpot payout table |
| 7 | Four-Suit Escrow | Signature | choose the exact card placed at risk |
| 8 | High–Low | Signature | call a direction and choose when to cash out |
| 9 | Blackjack | Signature | hit or stand using live deck odds |
| 10 | Five-Card Draw | Signature | choose which cards to hold |
| 11 | Memory Pairs | Rejected | excluded from the Gamble design |
| 12 | Bottom-Card Exchange | Alternate | choose a stack, then take or expose its rider |
| 13 | Suit Exchange | Alternate | choose a hedge or speculative contract and its targets |
| 14 | Challenge Bet | Signature | choose standard or double next-battle stakes |
| 15 | Burn Card | Alternate | accept the current payout or pay to replace it |
| 16 | Three-Card Buy-In | Alternate | keep the current best reward or buy another card |
| 17 | Three-Stage Side Bet | Alternate | assign rewards to escalating risk stages |
| 18 | Four-Choice Table | Alternate | choose which cost, odds, and reward to pursue |
| 19 | Three-Card Poker | Alternate | fold or play after seeing the player hand |
| 20 | Red Line | Alternate | call a color and choose when to cash out |
| 21 | Odds Auction | Signature | assign unlike prices to unequal rank bands |
| 22 | Sealed Wager | Alternate | bank the revealed prize or expose a second card |

## 1. Three-Way Wager

**Inspiration:** The Joust’s safer/lower-payout versus riskier/higher-payout
choice. The request supplies the approximate 70% and 30% endpoints.

The player risks 50 Essence and chooses one of three top-rank win bands:

| Tier | Win ranks | Chance | Reward |
| --- | --- | ---: | --- |
| Low payout | 6–A | 36 / 52 = 69.23% | shown Dreamsign |
| Medium payout | 9–A | 24 / 52 = 46.15% | shown Dreamsign plus previewed Transfiguration |
| High payout | J–A | 16 / 52 = 30.77% | shown Dreamsign plus Transfiguration and a copy of the result |

A losing card forfeits the stake. The player selects the Transfiguration target
before choosing a tier. Deterministic Essence replacements keep all three tiers
available when there is no eligible target.

## 2. Ladder Climb

**Inspiration:** Scrap Ooze’s increasing cost and success chance, plus Tablet of
Truth’s repeated payment for incremental gain.

The player buys one draw at a time for a shown Dreamsign. After a failure they
may stop or buy the next draw. Each attempt reassembles and reshuffles the deck.

| Draw | Cost | Winning ranks | Chance |
| ---: | ---: | --- | ---: |
| 1 | 15 Essence | Q–A | 12 / 52 = 23.08% |
| 2 | 25 Essence | 10–A | 20 / 52 = 38.46% |
| 3 | 40 Essence | 8–A | 28 / 52 = 53.85% |
| 4 | 60 Essence | 6–A | 36 / 52 = 69.23% |

Buying all four gives a `93.28%` chance of at least one win and costs 140
Essence if every draw is needed.

## 3. Odds Ladder

**Inspiration:** Cave of a Thousand Eyes’ shared 10%/25%/50%/75% retry ladder.

The card deck approximates that ladder with 5, 13, 26, and 39 winners:

| Attempt | Winning cards | Chance |
| ---: | --- | ---: |
| 1 | Aces plus K♠ | 5 / 52 = 9.62% |
| 2 | all spades | 13 / 52 = 25.00% |
| 3 | all red cards | 26 / 52 = 50.00% |
| 4 | hearts, diamonds, or clubs | 39 / 52 = 75.00% |

Before each attempt the player chooses one of two payments: 20/30/45/65
Essence for attempts 1–4, or lock a selected non-Nightmare card out of the next
battle. Multiple card-lock payments extend the same lock by one additional
battle. A success grants the shown Dreamsign; a failure offers the next row.
Each attempt uses a reassembled deck so its displayed fraction is exact.

## 4. Cash-Out Ladder

**Inspiration:** Clipped Wings, Dead Adventurer, and The Colosseum, all of which
ask whether a current result should be exposed to a more dangerous continuation.

Each safe draw establishes a new bank. After the first two safe draws, the
player cashes out or continues. Each stage reassembles the deck.

| Draw | Bust ranks | Bust chance | New bank |
| ---: | --- | ---: | --- |
| 1 | 2 | 4 / 52 = 7.69% | 60 Essence |
| 2 | 2–4 | 12 / 52 = 23.08% | 140 Essence |
| 3 | 2–7 | 24 / 52 = 46.15% | 140 Essence plus shown Dreamsign |

A bust forfeits the unclaimed bank and adds one disclosed Nightmare card. Surviving all
three has probability `48/52 × 40/52 × 28/52 = 38.23%`.

## 5. Red-or-Black Insurance

**Inspiration:** The Mausoleum’s guaranteed relic with a 50% curse rider and
Golden Shrine’s larger reward with lasting deck pollution.

The player receives the shown Dreamsign in every outcome. Before drawing they
choose:

- uninsured: no premium; 26 red cards are clean and 26 black cards add a
  Nightmare card;
- insure clubs: pay 40 Essence; 39 cards are clean and only spades add a Nightmare card;
- insure spades: pay 40 Essence; 39 cards are clean and only clubs add a Nightmare card.

The player chooses which black suit to insure after considering the premium,
leaving the other suit exposed to the same Nightmare penalty.

## 6. Wheel of 52

**Inspiration:** Wheel of Change’s one random result across beneficial and
harmful outcomes.

The player chooses a payout table before one card is drawn:

| Table | Card result | Chance | Payout |
| --- | --- | ---: | --- |
| Low variance | red | 26 / 52 = 50.00% | 100 Essence |
| Low variance | black | 26 / 52 = 50.00% | 50 Essence |
| Jackpot | 2–9 | 32 / 52 = 61.54% | lose a 40-Essence stake |
| Jackpot | 10–K | 16 / 52 = 30.77% | 160 Essence total |
| Jackpot | A | 4 / 52 = 7.69% | shown Dreamsign plus 160 Essence |

The low-variance table costs 20 Essence; the jackpot table costs 40. The
selection is a risk-profile decision, while the drawn card is the only random
input.

## 7. Four-Suit Escrow

**Inspiration:** Abandoned Winged and its delayed return events, Armageddon
Battlefield’s keep-for-two-battles contract, and Lifemother’s Remnant’s
immediate-versus-delayed value.

The player selects one non-starter, non-Nightmare entry and places it in escrow, then
draws one card:

| Suit | Chance | Contract |
| --- | ---: | --- |
| Hearts | 25% | return after one battle with the previewed Transfiguration |
| Diamonds | 25% | return after two battles with one exact copy |
| Clubs | 25% | return unchanged after two battles and gain 150 Essence |
| Spades | 25% | purge the entry after two battles |

The card choice changes the weakness of the next deck and the value of every
possible return, so it is a material decision before the suit draw.

## 8. High–Low

**Inspiration:** Gremlin Looter’s repeated haggle-until-failure structure and
Clipped Wings’ risk to accumulated value.

Reveal one card, then use the ace-high total order
`2♣ < 2♦ < 2♥ < 2♠ < … < A♠`. The player calls higher or lower for the next
card. There are no ties. Before every call the UI counts the exact higher and
lower cards among the remaining shoe. Correct calls bank total payouts of
50/100/200/400 Essence; after calls one through three the player may cash out.
One wrong call loses the 25-Essence stake and the unclaimed bank.

## 9. Blackjack

**Inspiration:** Cursed Tome, Knowing Skull, and Sensory Stone, which exchange
additional cost or danger for deeper reward tiers.

Deal two cards. The player may stand or pay 10 Essence to hit. Before every hit,
enumerate the remaining deck and show exact counts for totals 15 or less,
16–18, 19–20, 21, and bust after optimal Ace valuation. Standing on 15 or less
or busting loses the 50-Essence stake; 16–18 refunds it; 19–20 pays 150 Essence
total; 21 pays 150 Essence plus the shown Dreamsign.

## 10. Five-Card Draw

**Inspiration:** Wheel of Change’s outcome table and The Joust’s stake against a
larger payout.

Deal five cards, then let the player hold any subset and replace the rest once.
For `d` replacements, enumerate the `C(47, d)` equally likely replacement sets
before confirmation. High card loses the 50-Essence stake; one pair refunds it;
two pair or trips pays 150 Essence; straight or flush adds a Transfiguration;
full house or better also grants the shown Dreamsign. Exact holding-dependent
counts appear in the signature specification.

## 11. Memory Pairs — rejected

**Inspiration:** Match and Keep’s six pairs and five attempts.

This branch used a shuffled 2–7 hearts/spades subset and rank-specific rewards
in a face-down pair-matching grid. The Gamble design explicitly excludes memory
grids, so this candidate is not eligible for implementation or future
shortlisting.

## 12. Bottom-Card Exchange

**Inspiration:** Wildfrost’s Gnome Traveller, where attractive cards may conceal
Junk, and Monster Train’s Trash Heap surface-versus-deep reward choice.

Deal three two-card stacks. Reveal each top card; its rank previews the stack’s
base reward:

- 2–7: 75 Essence (`24 / 52 = 46.15%` before any cards are seen);
- 8–J: deterministic best-fit card (`16 / 52 = 30.77%`);
- Q–A: shown Dreamsign (`12 / 52 = 23.08%`).

The player chooses one stack and takes its base reward. They then either leave
or expose that stack’s bottom card: red adds 100 Essence; black adds one
disclosed Nightmare card. If `r` of the three visible top cards are red, the chosen
bottom card is red with exact probability `(26 − r) / 49`; black probability is
the complementary `(23 + r) / 49`. The other two face-down bottom cards provide
no additional information.

## 13. Suit Exchange

**Inspiration:** Relic Trader’s exchange of an owned asset and Chaos Portal’s
purge-for-random-reward structure.

The player selects one valued non-starter card and one expendable non-Nightmare card,
then chooses:

- **Hedge:** red duplicates the valued card; black purges the expendable card.
  Each result has probability `26 / 52 = 50%`.
- **Speculate:** hearts Transfigure and duplicate the valued card; diamonds
  Transfigure it; clubs purge the expendable card and grant 150 Essence; spades
  purge the valued card. Each result has probability `13 / 52 = 25%`.

The two target choices and contract choice let the player shape both the floor
and ceiling before the suit draw.

## 14. Challenge Bet

**Inspiration:** Battleworn Dummy’s chosen difficulty/reward tiers, The
Colosseum’s harder follow-up fight, and Divine Shards’ dangerous persistent
state in exchange for value.

The player chooses standard or double stakes, then one card sets the next-battle
handicap by suit and the victory payout by rank. Suits are 25% each. Ranks 2–9
produce the Essence payout with probability `32 / 52 = 61.54%`; ranks 10–A
produce the shown Dreamsign payout with probability `20 / 52 = 38.46%`.
Double stakes doubles each suit’s handicap and raises the two rewards from 175
Essence / Dreamsign plus 100 Essence to 300 Essence / Dreamsign plus 200
Essence.

## 15. Burn Card

**Inspiration:** Dead Adventurer’s repeat-or-leave pressure and Endless
Conveyor’s paid repeatable pulls.

Reveal one card and offer its rank payout: 2–7 pays 50 Essence, 8–J pays 100,
Q–K pays 175, and Ace pays the shown Dreamsign. The player may accept or pay 20
Essence to burn it and reveal the next card, up to three burns. The next-card
UI shows exact remaining counts for the four payout bands. If the player cannot
pay or burns three cards, the current payout must be accepted.

## 16. Three-Card Buy-In

**Inspiration:** Sensory Stone’s improving reward quality across escalating
optional payments.

The first face-up card costs 10 Essence. The player may keep its reward or pay
25 Essence for a second card, then keep the better reward or pay 50 Essence for
a third. Cards stay out of the deck, so the UI displays the exact chance that
the next card improves the current best:

- 2–7: 50 Essence;
- 8–J: 100 Essence;
- Q–K: previewed Transfiguration;
- Ace: shown Dreamsign.

After the third card, the best revealed reward resolves automatically.

## 17. Three-Stage Side Bet

**Inspiration:** Doll Room’s three rewards with escalating risk for additional
picks.

Prepare three disclosed rewards: 75 Essence, a previewed Transfiguration, and
the shown Dreamsign. The player assigns one reward to each stage before
starting:

| Stage | Losing ranks | Loss chance |
| ---: | --- | ---: |
| 1 | 2 | 4 / 52 = 7.69% |
| 2 | 2–5 | 16 / 52 = 30.77% |
| 3 | black cards | 26 / 52 = 50.00% |

Each stage reassembles the deck. A win grants the assigned reward; after stages
one and two the player may leave with all claimed rewards or continue. A loss
adds one disclosed Nightmare card but does not revoke rewards already claimed. Assigning
the most valuable reward to a safer stage limits upside later, because each
reward can appear only once.

## 18. Four-Choice Table

**Inspiration:** Knowing Skull’s menu of differently priced answers and Cave of
a Thousand Eyes’ escalating chance ladder.

The player may make each of these wagers at most once, in any order, and may
leave after any result:

| Wager | Cost | Winning cards | Chance | Win |
| --- | ---: | --- | ---: | --- |
| Essence | 10 Essence | red | 26 / 52 = 50.00% | gain 100 Essence |
| Card | 25 Essence | 8–A | 28 / 52 = 53.85% | gain deterministic best-fit card |
| Transfigure | 40 Essence | 10–A | 20 / 52 = 38.46% | apply previewed Transfiguration |
| Dreamsign | 60 Essence | Q–A | 12 / 52 = 23.08% | gain shown Dreamsign |

Each wager reassembles the deck. A failure loses only that wager’s cost, so the
choice is which asset to pursue and when remaining Essence makes another bet
unwise.

## 19. Three-Card Poker

**Inspiration:** The Joust’s pay-to-back-an-outcome structure, translated into a
standard casino decision.

Pay a 30-Essence ante and deal three player cards. After seeing them, fold and
lose the ante or pay a second 30 Essence to play against a three-card dealer
hand. The dealer qualifies with Q-high or better. If the dealer fails to
qualify, return 90 Essence total; if qualified, a player loss pays zero, a tie
refunds 60, and a player win returns 120. A player straight or better also gains
the shown Dreamsign after choosing to play, independent of the dealer result.

For the displayed player hand, enumerate all `C(49, 3) = 18,424` dealer hands
and publish exact dealer-no-qualify, player-win, tie, and player-loss counts
before the fold/play choice. Three-card poker ranks straight above flush and
Ace high, with A-2-3 as the low-straight exception.

## 20. Red Line

**Inspiration:** Gremlin Looter’s repeated gamble and Clipped Wings’ exposed
bank.

The player chooses red or black for the next card. A correct call banks
40/80/160/320 Essence after one through four wins; after the first three, cash
out or call again. A wrong call loses the bank. Cards remain out of the shoe, so
after every reveal the UI shows the exact remaining red and black counts over
the remaining deck. This is a simpler, color-only alternative to High–Low.

## 21. Odds Auction

**Inspiration:** Wheel of Change’s one-card outcome map and Golden Shrine’s
lasting price for immediate value. This candidate is intentionally more
abstract than the direct event translations.

The fixed reward is the shown Dreamsign, 150 Essence, and one previewed
Transfiguration. This game requires at least one held Dreamsign and enough
Essence to pay the 100-Essence price. The player assigns these three prices to
the 2–7, 8–J, and Q–A bands:

- pay 100 Essence;
- surrender one selected held Dreamsign;
- add one selected Nightmare card from two disclosed Nightmare card ids.

The bands contain 24, 16, and 12 cards, for exact chances of 46.15%, 30.77%,
and 23.08%. One card selects exactly one price, then the complete reward
resolves.

## 22. Sealed Wager

**Inspiration:** Wondrous Boxes’ choice among packages and Gnome Traveller’s
hidden rider.

Deal three face-down two-card packets. The player chooses a packet and reveals
its first card:

- 2–7 banks 60 Essence;
- 8–J banks 120 Essence;
- Q–A banks the shown Dreamsign.

The player may take that prize or reveal the packet’s second card. A red second
card doubles an Essence prize or adds 150 Essence to the Dreamsign; a black
second card forfeits the first prize and adds one disclosed Nightmare card. After the
first card is known, the exact double-up chance is `25 / 51 = 49.02%` if it was
red and `26 / 51 = 50.98%` if it was black.

The two unchosen packets are revealed after resolution for audit but have no
mechanical effect.
