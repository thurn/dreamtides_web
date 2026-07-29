# Gravok's Casino: Gamble Site Design Proposal

Status: concrete rules and first-playtest tuning proposal.

Gravok owns the casino aboard Farpoint Station. When Gamble appears elsewhere,
he runs a compact traveling table; in Farpoint, the player enters his full
casino floor and plays the enhanced version of that table.

This document specifies the wager, exact odds, exact payouts, eligibility, and
Farpoint variant for every proposed table. The listed values are the v0 balance
values to implement and test. Changing one requires a new tuning version so a
production log can always reconstruct the rules the player saw.

The supplied Monster Train and Slay the Spire event catalog informs the
structures: The Joust supplies the two-line bet, Scrap Ooze and Clipped Wings
supply the press-or-bank rhythm, Match and Keep supplies the memory table, and
Monster Train's follow-up events supply the deferred tickets.

## Portfolio decision

Build these five tables first:

| Table                | Casino fantasy                               | System proved                                    |
| -------------------- | -------------------------------------------- | ------------------------------------------------ |
| **Crystal Roll**     | craps pass line and hard way                 | stakes, published odds, deterministic resolution |
| **Pressure Vault**   | blackjack-style hit or stand                 | persisted pot, press, bank, and bust             |
| **Figment Reactor**  | double-or-nothing collateral table           | selected deck-entry custody and atomic mutation  |
| **Contraband Array** | three-card monte with purchasable peeks      | frozen hidden information                        |
| **Deck Cut**         | betting on the composition of one's own deck | exact state-derived odds                         |

This is the launch roster. **Escrow Orbit** is the first expansion table after
the journey supports custody across battles. **The Orbit Book** follows when
Gamble can consume the full Dream Augury prize generator. The remaining tables
are authored expansion content, not launch dependencies.

## House rules shared by every table

### Published terms

- A **buy-in** is removed when the player commits. The player can leave for free
  until that point.
- An essence **payout** is the total essence granted after a win. It does not
  include a separately returned buy-in.
- A percentage roll uses a deterministic integer from 1 through 100. A listed
  35% result occupies 1–35; the other result occupies 36–100. A table with
  equal discrete outcomes, such as the Sixfold Wheel, draws a uniform outcome
  index instead.
- Every random table shows all outcome classes and their exact probabilities
  before commitment. A deck-derived table shows both the matching entry count
  and the reduced fraction, such as `6 / 20 = 30%`.
- A table's wager manifest freezes its offered objects, odds, liabilities, and
  resolved rolls. Reloading or reconnecting cannot reroll it.
- **Farpoint table** means the replacement rules used when the Gamble site is
  enhanced in Farpoint Station. It does not stack with the traveling-table
  values.
- If the player lacks the essence, target, pool inventory, deck room, or legal
  battle modifier required by a table, that table is ineligible for the visit.
  The generator does not shrink a chooser or substitute an unlisted reward.

### Exact reward recipes

Several tables refer to one of these frozen reward recipes. These names specify
both the candidate generator and the player-facing choice:

| Recipe                      | Exact effect                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Card draft**              | Generate exactly 3 distinct, unowned, non-starter cards from the resolved draft pool with the Dream Augury `fit_card_draft` scorer; show all 3 and add the player's choice. |
| **Strong card**             | Generate and show exactly 1 unowned, non-starter card with the Dream Augury `strong_card` scorer; add it when awarded.                                                      |
| **Transfiguration service** | Generate exactly 4 legal `(deck entry id, non-Perfected transfiguration)` pairs with the Dream Augury transfiguration scorer; show all 4 and apply the player's choice.     |
| **Duplication service**     | Generate exactly 4 legal deck entries with the Dream Augury duplication scorer; show all 4 and duplicate the player's choice once.                                          |
| **Purge service**           | Let the player choose and permanently remove exactly 1 legal deck entry. Banes are legal; the deck floor still applies.                                                     |
| **Dreamsign draft**         | Generate exactly 3 distinct, unheld Dreamsigns with the Dream Augury dreamsign-match scorer; show all 3 and grant the player's choice.                                      |

Candidates are frozen by UUID and, for owned cards, deck entry id. Names are
resolved only for display. If a recipe requires three or four candidates, the
table is eligible only when that full count can be generated.

### Casino presentation

Gravok calls essence **chips**, a commit is a **bet**, a result is a **call**,
and leaving is **stepping away from the table**. Each table has a physical
centerpiece—crystal dice, a wheel, cards, cargo cases, or a betting terminal.
The rules panel reads like a casino placard: buy-in, winning calls, losing
calls, and payout. Gravok announces the result as a dealer; he does not describe
the underlying random-number generator.

Farpoint surrounds the same game with a permanent pit, spectators, illuminated
odds boards, and a gold **HOME TABLE** plaque. Its mechanical advantage is
written on that plaque so the player can compare it directly with the traveling
version.

## Immediate and press-your-luck tables

### 1. Crystal Roll — the craps table

Gravok rolls two faceted crystals down a zero-gravity rail. The player buys one
50-essence chip and places it on one line:

| Bet           | Win |      Payout |           Lose |
| ------------- | --: | ----------: | -------------: |
| **Pass line** | 65% | 130 essence | 35%: no payout |
| **Hard way**  | 25% | 330 essence | 75%: no payout |

Exactly one roll resolves the visit. The two bets have the same buy-in and only
the chosen line is rolled.

**Farpoint table — House Chip.** The buy-in is 0. The pass line wins 70% and
pays 150 essence; the hard way wins 30% and pays 360 essence.

### 2. The Orbit Book — the sportsbook

A holographic tote board presents three face-up prize tickets. The player buys
one ticket for 50 essence:

| Ticket                | Win | Payout                                 |           Lose |
| --------------------- | --: | -------------------------------------- | -------------: |
| **Low orbit**         | 70% | Card draft                             | 30%: no payout |
| **Transfer orbit**    | 42% | Transfiguration service and 50 essence | 58%: no payout |
| **Escape trajectory** | 20% | Dreamsign draft and 120 essence        | 80%: no payout |

The prize manifests are frozen and previewable before the player chooses a
ticket. One ticket receives one roll.

**Farpoint table — Chairman's Book.** The buy-in is 0. Low orbit wins 80% and
pays a Card draft plus 40 essence; transfer orbit wins 52% and pays a
Transfiguration service plus 80 essence; escape trajectory wins 28% and pays a
Dreamsign draft plus 150 essence.

### 3. Loaded Blessing — the comp desk

Gravok offers a guaranteed Dreamsign draft as a casino comp, then asks the
player which liability the house may attach. The player chooses one row before
the Dreamsign:

| Marker                | Clean call | Liability call                                        |
| --------------------- | ---------: | ----------------------------------------------------- |
| **Credit marker**     |        70% | 30%: lose 100 essence                                 |
| **Nightmare marker**  |        80% | 20%: gain 1 Nightmare Bane                            |
| **Collateral marker** |        90% | 10%: purge the chosen eligible non-starter deck entry |

The Dreamsign is granted on either call. Credit is available only with at least
100 essence. Collateral is selected and frozen before commitment.

**Farpoint table — Owner's Comp.** The reward is a Dreamsign draft plus 50
essence. The clean-call chances are 80% for Credit, 90% for Nightmare, and 95%
for Collateral; the listed liabilities are unchanged.

### 4. Pressure Vault — hit or stand

The player pays a 30-essence buy-in. Gravok deals pressure cards against a
sealed chip vault. Lock 1 opens automatically. After each open lock the player
may **stand** and take the current pot, or **hit** the next lock:

| Lock attempted |               Pot after success | Bust chance |
| -------------- | ------------------------------: | ----------: |
| 1              |                      60 essence |          0% |
| 2              |                     150 essence |         15% |
| 3              |                     270 essence |         35% |
| 4              | 450 essence and Dreamsign draft |         60% |

A bust awards no essence and adds exactly 1 Nightmare Bane. A successful lock
replaces the pot with the listed amount; it does not add that amount to the
previous pot.

**Farpoint table — Gravok Stands Soft.** The buy-in is 0. Pots are
80/180/310/500 essence and the four bust chances are 0%/10%/25%/45%. Lock 4
also grants a Dreamsign draft. A bust still awards no essence and adds 1
Nightmare.

### 5. Salvage Lock — the progressive slots

The player pays 20 essence to pull a bank of four cargo reels. A successful
reel stages its prize in the unbanked tray. The player may collect the entire
tray or pull the next reel:

| Reel | Bust chance | Prize added after success |
| ---- | ----------: | ------------------------- |
| 1    |          0% | 60 essence                |
| 2    |         20% | Card draft                |
| 3    |         40% | Transfiguration service   |
| 4    |         60% | Dreamsign draft           |

A bust discards every staged prize and ends the visit. It does not affect
assets the player owned before entering. Rewards with a choice are selected
only after the player collects the tray.

**Farpoint table — Locked First Reel.** The buy-in is 0 and bust chances are
0%/10%/25%/45%. The 60 essence from reel 1 enters a locked tray immediately;
later busts discard reels 2–4 but still pay those 60 essence. A successful
fourth reel also adds 80 essence to the unbanked tray.

### 6. Guaranteed Burn — the progressive ticket

Gravok sells up to four attempts at the same frozen prize: one Dreamsign draft
and one Transfiguration service. The player pays before each attempt and may
leave after a miss:

| Attempt |        Cost | Win on this attempt |
| ------- | ----------: | ------------------: |
| 1       |  30 essence |                 20% |
| 2       |  50 essence |                 35% |
| 3       |  80 essence |                 55% |
| 4       | 120 essence |                100% |

A win grants both rewards and ends the visit. Earlier misses do not change the
prize.

**Farpoint table — Progressive Guarantee.** Attempt costs are 0/40/70/100
essence and win chances are 25%/45%/70%/100%. The prize also includes 100
essence.

### 7. The Sixfold Wheel — roulette

The player pays 20 essence and spins one wheel. Resolution draws a uniform
integer from 1 through 6, so every wedge is exactly one outcome:

| Wedge           | Probability | Call                           |
| --------------- | ----------: | ------------------------------ |
| Crystal jackpot |        16⅔% | gain 180 essence               |
| Card cage       |        16⅔% | gain a Card draft              |
| Forge light     |        16⅔% | gain a Transfiguration service |
| Clean break     |        16⅔% | gain a Purge service           |
| Black crystal   |        16⅔% | gain 1 Nightmare Bane          |
| House sweep     |        16⅔% | lose 100 essence               |

Before spinning, the player may buy **wheel insurance** for 30 essence. It
changes Black Crystal to “no effect,” House Sweep to “lose 40 essence,” and
Crystal Jackpot to “gain 120 essence.” The other wedges stay fixed.

**Farpoint table — Complimentary Insurance.** The buy-in and wheel insurance
both cost 0. Insurance leaves Crystal Jackpot at 180 essence and changes both
liability wedges to “no effect.”

### 8. The Conveyor — the cash-out ladder

Four face-up cases move past the betting window. Each purchase immediately
grants its reward and reveals the next price; the player may cash out after any
case:

| Case |        Cost | Guaranteed contents               |
| ---- | ----------: | --------------------------------- |
| 1    |  30 essence | 50 essence                        |
| 2    |  60 essence | Card draft                        |
| 3    | 100 essence | Transfiguration service           |
| 4    | 150 essence | Dreamsign draft and Purge service |

All four manifests and prices are visible before case 1. There is no random
roll; the wager is how much of a 340-essence ladder the player can afford to
climb.

**Farpoint table — Casino Credit.** Case 1 is free. Cases 2–4 retain their
costs. Case 4 also contains 100 essence.

### 9. Overclock Wager — the marker ladder

The player pays 20 essence to light an 80-essence pot. Each **double** adds the
listed Bane immediately and replaces the available cash-out:

| Stop after     | Bane added by that double |    Cash-out |
| -------------- | ------------------------- | ----------: |
| Opening marker | none                      |  80 essence |
| Double 1       | Nightmare                 | 170 essence |
| Double 2       | Despair                   | 300 essence |
| Double 3       | Oblivion                  | 500 essence |

The Banes remain even if the player continues. There is no random roll; the
player is betting that future deck strength is worth the accumulating markers.

**Farpoint table — First Marker on the House.** The 20-essence opening cost is
waived, Double 1 adds no Bane, and the Double 3 cash-out grants a Dreamsign
draft in addition to 500 essence.

## Collateral tables

### 10. Figment Reactor — double or nothing

Gravok shows exactly four legal non-starter deck entries. The player stakes one
entry, frozen by UUID and deck entry id:

| First call | Probability | Resolution                                        |
| ---------- | ----------: | ------------------------------------------------- |
| Double     |         50% | return the original and add 1 permanent duplicate |
| Nothing    |         50% | permanently remove the original                   |

After Double, the player may collect both cards or press. Pressing has a 35%
chance to add a second permanent duplicate and apply one frozen, legal
non-Perfected transfiguration to all three copies. On the 65% miss, the added
copy is removed and the unchanged original remains.

**Farpoint table — Original Protected.** The first call is 70% Double and 30%
return the original unchanged. The press call is 50% win and 50% miss, with the
same win and miss effects.

### 11. Collateral Auction — the high-roller cage

The player selects one of exactly four shown, legal non-starter deck entries as
collateral. A frozen Dreamsign draft is displayed across the cage:

| Call           | Probability | Resolution                                    |
| -------------- | ----------: | --------------------------------------------- |
| House bonus    |         45% | return the card and grant the Dreamsign draft |
| Fair exchange  |         40% | purge the card and grant the Dreamsign draft  |
| Reserve missed |         15% | return the card; grant nothing                |

**Farpoint table — Crystal Member Rate.** The calls are 60% House Bonus, 30%
Fair Exchange, and 10% Reserve Missed. Reserve Missed returns the card and
grants 60 essence.

### 12. Fivefold Mirror — the multiplier booth

The player selects one legal deck entry and chooses a line. This table is
eligible only when at least two future battles remain:

- **Even money:** pay 40 essence and add 1 permanent duplicate.
- **Fivefold:** pay 40 essence; add 5 temporary copies for the next 2 battles.
  After the second battle, the temporary copies vanish and a single roll adds
  2 permanent copies on 35%, 1 permanent copy on 50%, or 1 Nightmare Bane and
  no permanent copy on 15%.

The original is never at risk.

**Farpoint table — Mirrored Suite.** Both lines cost 0. Fivefold adds 3
permanent copies on 35%, 2 on 50%, and 1 on 15%; it cannot add a Bane.

### 13. The House Chooses the Category — the face-down discard

The player chooses one eligible category. Gravok then uniformly draws one of
the listed deck entries in that category and purges it. The UI shows every
possible entry and its exact `1 / N` chance:

| Chosen category | Eligible entries       | Guaranteed payout                      |
| --------------- | ---------------------- | -------------------------------------- |
| Starter         | starter cards          | 150 essence                            |
| Event           | non-starter Events     | Transfiguration service and 50 essence |
| Character       | non-starter Characters | Dreamsign draft                        |

Only categories containing at least two legal entries are offered.

**Farpoint table — Two-Card Burn.** Gravok draws two distinct entries uniformly
from the chosen category and the player chooses which one is purged. Starter
pays 200 essence; Event pays a Transfiguration service and 100 essence;
Character pays a Dreamsign draft and 80 essence.

## Information and tabletop games

### 14. Contraband Array — three-crate monte

Three face-down crates receive exactly one prize each: a Card draft, a
Transfiguration service, and a Dreamsign draft. Independently, the three
liability cards—Clean, gain 1 Nightmare Bane, and lose 80 essence—are shuffled
one per crate. Thus every prize appears once and every liability appears once.

The player scans one crate for free, revealing both its prize and liability.
Scanning one additional crate costs 30 essence. The player then takes one crate
or leaves. Taking applies both printed cards.

**Farpoint table — Security Override.** Two scans are free. The shuffled
liability cards are Clean, Clean, and gain 1 Nightmare; the prizes are
unchanged.

### 15. Match and Keep — the memory table

Twelve face-down tokens form six exact pairs. The pairs pay: 80 essence, Card
draft, Transfiguration service, Purge service, Duplication service, and gain 1
Nightmare Bane. Their positions are deterministically shuffled.

The player receives five attempts. An attempt reveals two tokens; a match
applies that pair immediately and removes it, while a miss turns both tokens
face-down. The player may collect and leave after any matched pair or continue
until the fifth attempt. Previously matched rewards cannot be lost.

**Farpoint table — Seven Hands.** The player receives seven attempts. The
Nightmare pair is replaced by a Dreamsign draft pair.

### 16. Signal Auction — the blind prize window

Two sealed envelopes contain two different recipes drawn uniformly without
replacement from Card draft, Transfiguration service, Duplication service, and
Dreamsign draft. The player can claim one envelope at any information level:

| Information purchased          | Total scan cost | Bonus added to claimed prize |
| ------------------------------ | --------------: | ---------------------------: |
| no scan                        |               0 |                  120 essence |
| reveal both recipe names       |      20 essence |                   70 essence |
| reveal both complete manifests |      50 essence |                   20 essence |

The complete-manifest scan includes the exact candidate UUIDs and previews.
Each later scan includes the earlier information.

**Farpoint table — Host's Tell.** The recipe-name scan is free and the complete
manifest costs 20 essence. Bonuses are 150 essence with no scan, 100 after the
recipe-name scan, and 50 after the complete-manifest scan.

### 17. Quantum Hand — five-card crystal poker

The house deck has exactly 20 tokens: four suits
(`Event`, `Character`, `Fast`, `Reclaim`) crossed with ranks 0–4. The player
pays 40 essence, receives five tokens without replacement, may hold any number,
and may pay 30 essence once to redraw every unheld token.

The best final hand pays:

| Hand                                             | Initial combinations | Initial probability |      Payout |
| ------------------------------------------------ | -------------------: | ------------------: | ----------: |
| Constellation: all five ranks in one suit        |                    4 |              0.026% | 500 essence |
| Four of a rank                                   |                   80 |              0.516% | 400 essence |
| Orbit straight: all five ranks, mixed suits      |                1,020 |              6.579% | 300 essence |
| Full array: three of one rank and two of another |                  480 |              3.096% | 220 essence |
| Three of a rank                                  |                1,920 |             12.384% | 150 essence |
| Two pair                                         |                4,320 |             27.864% | 100 essence |
| One pair                                         |                7,680 |             49.536% |  50 essence |

The denominator is `C(20, 5) = 15,504`. After the initial deal and after every
hold selection, the UI computes and shows exact redraw probabilities from the
remaining token identities.

**Farpoint table — Owner's Poker Room.** The 40-essence buy-in and the redraw
cost are both waived. Every essence payout increases by 50; a Constellation
also grants a Dreamsign draft.

## Deferred and performance tickets

### 18. Escrow Orbit — the futures window

The player escrows one untransfigured, non-starter deck entry that has at least
one legal non-Perfected transfiguration. The card is absent from the next two
battles. The table is eligible only when at least two battles remain.

- After one completed battle, the player may recall it unchanged and gain 50
  essence.
- After two completed battles, the card returns and one roll grants: one frozen
  transfiguration on 50%; one permanent duplicate on 30%; or 120 essence on
  20%.
- Before either battle, the player may pay 40 essence to return the unchanged
  card and close the ticket.

**Farpoint table — Preferred Futures.** One-battle recall pays 80 essence and
early return is free. At two battles, 50% returns a transfigured card plus one
duplicate, 30% returns a transfigured card, and 20% returns a duplicate plus
120 essence.

### 19. The Bane Bond — the junk-bond counter

Gravok adds 1 Nightmare Bane and issues a bond. The table is eligible only when
at least three battles remain. After each victory, the player may redeem it or
carry it into another battle:

| Victories carried | Redemption success | Successful payout | Default   |
| ----------------- | -----------------: | ----------------: | --------- |
| 1                 |                80% |       100 essence | no payout |
| 2                 |                65% |       220 essence | no payout |
| 3                 |                50% |   Dreamsign draft | no payout |

Redemption removes the Nightmare on either success or default and closes the
bond. Purging the Nightmare before redemption closes the bond with no payout.

**Farpoint table — Investment-Grade Bane.** Success chances are 90%/75%/60%.
Successful payouts are 140 essence, 280 essence, and a Dreamsign draft plus
100 essence.

### 20. Borrowed Victory — the advance window

The player receives 180 essence immediately. Gravok takes 50% of the essence
reward from each of the next two completed battles, rounded down and capped at
100 essence per battle. A battle paying 150 therefore sends 75 to Gravok; a
battle paying 260 sends 100. The table is eligible only when at least two
battles remain.

There is no RNG. The wager is whether the next two battle rewards total less or
more than the advance's break-even point.

**Farpoint table — Host's Advance.** The player receives 240 essence. Gravok
takes 35% of each of the next two battle rewards, rounded down and capped at 80
per battle.

### 21. Next-Battle Contract — the challenge book

The player pays a 30-essence entry fee and signs one contract for the next
battle. The table is eligible only when a battle remains:

| Contract         | Temporary battle condition                               | Payout on victory                      |
| ---------------- | -------------------------------------------------------- | -------------------------------------- |
| **Short Deal**   | opening hand has 2 fewer cards                           | 200 essence                            |
| **Dirty Shoe**   | shuffle 2 temporary Nightmare Banes into the battle deck | Dreamsign draft                        |
| **Point Spread** | win by at least 8 points                                 | Transfiguration service and 80 essence |

The entry fee is lost and no payout is granted if the player loses or misses
the Point Spread. Temporary changes expire after the battle.

**Farpoint table — Comped Challenge.** The entry fee is 0. Short Deal pays 260
essence; Dirty Shoe pays a Dreamsign draft plus 80 essence; Point Spread pays a
Transfiguration service plus 140 essence.

### 22. Open-Deck Parlay — the proposition board

Gravok generates exactly three achievable, observable legs from this authored
library. The table is eligible only when a battle remains:

- play three distinct Events by card UUID;
- materialize three distinct Characters by card UUID;
- reclaim two cards;
- play cards with three different printed energy costs;
- end a turn with at least four cards in the void;
- win without a Bane remaining in hand.

The player pays 50 essence and selects one, two, or all three offered legs. All
selected legs must occur in the next battle:

| Legs selected | Successful payout |
| ------------- | ----------------: |
| 1             |       110 essence |
| 2             |       240 essence |
| 3             |       420 essence |

The wager manifest stores referenced cards by UUID and deck entry id. A leg is
eligible only when the current deck can satisfy it.

**Farpoint table — Parlay Boost.** The entry fee is 0 and payouts are
140/290/500 essence.

## Rules and route tables

### 23. House Rules — the private salon

The player pays 30 essence and selects one fully authored rule contract for the
next battle. The table is eligible only when a battle remains:

| Salon             | Rule in force                                                                             | Condition                | Payout                                  |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- |
| **Double Draw**   | both players draw 1 additional card each turn; the player hand limit is reduced by 2      | win by at least 5 points | Card draft and 80 essence               |
| **Figment Floor** | each Character materializes with 1 additional Figment; the opponent starts 5 points ahead | win                      | Dreamsign draft                         |
| **Fast Events**   | every Event is Fast; reclaiming an Event costs 1 additional energy                        | reclaim 2 Events and win | Transfiguration service and 100 essence |

All temporary rules expire after the battle. The wager fails if either the win
or the listed performance condition fails.

**Farpoint table — Salon Comp.** The entry fee is 0 and every successful
contract adds 100 essence to its listed payout.

### 24. Gravity Sling — the route book

Gravok chooses two currently reachable next-dreamscape nodes and labels them:

- **Red route:** lock the next Atlas move to this node and add one known
  Dreamsign Reward site displaying its exact Dreamsign.
- **Black route:** lock the next Atlas move to this node, then roll 50% to add a
  Duplication site or 50% to add a Purge site whose first purge costs 0.

The player sees both destination nodes, the Red Dreamsign, and the Black
50/50 table before committing.

**Farpoint table — First-Class Sling.** Red also adds an Essence site worth 100
essence. Black adds both the Duplication site and the first-purge-free Purge
site; it has no random roll.

### 25. Pilot and Navigator — the co-op pit

In a two-player room, the Pilot chooses one of two pressure tables and the
Navigator decides stand or hit after each successful lock. Roles swap after
every successful hit:

| Table        |     Buy-in | Pots       | Bust chances |
| ------------ | ---------: | ---------- | ------------ |
| **Cautious** | 30 essence | 60/140/240 | 0%/15%/35%   |
| **Bold**     | 30 essence | 90/230/450 | 10%/30%/55%  |

A bust loses the pot and adds 1 Nightmare Bane. Either player may stand when it
is their Navigator turn. Solo players make both decisions.

**Farpoint table — Partner Rate.** The buy-in is 0. Cautious pots are
80/180/300 with 0%/10%/25% bust; Bold pots are 120/280/500 with 5%/20%/40%
bust.

### 26. Gravok's Running Jackpot — the progressive meter

Whenever an essence buy-in at a Gamble table produces zero payout, 25% of that
buy-in, rounded up, enters a run-local jackpot capped at 250 essence. Liability
payments and optional scan or insurance fees do not contribute.

At a later Gamble visit, the player may buy one jackpot side ticket for 20
essence. The ticket has a 10% chance to pay the entire meter and reset it to
zero; on a miss, the 20 essence joins the meter subject to the cap. If the meter
remains at journey completion, 25% of it, rounded down, is paid as essence.

**Farpoint table — Progressive Lounge.** Failed buy-ins contribute 50%, the
meter cap is 350 essence, the side ticket is free, and its claim chance is 20%.
The journey-completion payout remains 25%.

### 27. The Algorithm's Tell — liar's poker

Gravok deals three distinct face-up Strong card prizes, sampled without
replacement from the Strong-card score band, and three plain-language claims
about why the Dream Augury scorer selected them. Exactly two claims accurately
describe logged score components and one is fabricated.

- Pick the fabricated claim correctly: choose and gain 1 of the 3 cards.
- Pick a true claim: gain the card beside that claim and 1 Nightmare Bane.
- Before answering, pay 40 essence to mark and remove one of the two true
  claims, selected uniformly at 50% each, leaving one true and one fabricated
  claim.

**Farpoint table — Gravok Blinks.** One true claim is marked and removed for
free. A correct answer grants the chosen card plus 100 essence; an incorrect
answer grants the adjacent card with no Bane.

### 28. Deck Cut — the player's shoe

The house generates exactly three valid predicates from:

- Event;
- Character;
- Fast;
- Reclaim;
- printed energy cost 0, 1, 2, or 3+;
- one subtype present in the deck.

A predicate is valid when at least one and fewer than all legal deck entries
match it. The player selects one predicate and pays 50 essence. Gravok
deterministically shuffles every legal deck entry, including individual copies,
and reveals one entry.

If `M` of `N` entries match, the UI publishes `p = M / N`. A hit pays
`min(400, ceil-to-next-10(55 / p))` essence; a miss pays nothing. For example,
`6 / 20 = 30%` pays 190 essence. The payout is frozen before commitment.

**Farpoint table — Deep Cut.** The buy-in is 0 and a hit pays
`min(450, ceil-to-next-10(70 / p))` essence.

### 29. Sealed Reserve — the auction table

One exact Dreamsign from the Dreamsign-draft scorer is shown face-up. Its hidden
reserve is drawn from this public distribution:

| Reserve     | Probability |
| ----------- | ----------: |
| 40 essence  |         25% |
| 80 essence  |         25% |
| 120 essence |         25% |
| 160 essence |         25% |

The player bids exactly 40, 80, 120, or 160 essence. A bid meeting the reserve
pays the bid and grants the shown Dreamsign. A bid below reserve loses a
20-essence listing fee instead of the bid and reveals the reserve. Before
bidding, the player may pay 30 essence for an appraisal that reveals whether
the reserve is in the `40/80` half or the `120/160` half.

**Farpoint table — Open Reserve.** Listing and appraisal fees are 0. Reserve
probabilities are 40 essence at 40%, 80 at 30%, 120 at 20%, and 160 at 10%.
Winning also pays 50 essence.

### 30. Bad-Omen Hedge — the insurance desk

The player pays 40 essence and insures one undesirable event in the next
battle. The table is eligible only when a battle remains:

| Policy                 | Trigger                                               | Payout when triggered |
| ---------------------- | ----------------------------------------------------- | --------------------: |
| **Opponent hot start** | opponent reaches 8 points before the player reaches 8 |           130 essence |
| **Long night**         | turn 9 begins                                         |           160 essence |
| **Bad draw**           | player draws a Bane during turns 1–3                  |           120 essence |

Bad Draw is offered only if the journey deck contains a Bane. The policy pays
when its trigger occurs whether the player later wins or loses. If the trigger
does not occur, the premium is lost.

**Farpoint table — Host's Coverage.** The premium is 0 and payouts are
160/190/150 essence.

### 31. Buyback — the trade-up wheel

The player selects one non-starter card gained earlier in the journey. It must
be untransfigured and have at least one legal non-Perfected transfiguration.
One applicable transfiguration is selected uniformly and shown before the
player pays 50 essence and spins:

| Call     | Probability | Resolution                                         |
| -------- | ----------: | -------------------------------------------------- |
| Trade up |         55% | apply one frozen legal transfiguration to the card |
| Pair it  |         25% | add 1 permanent duplicate                          |
| Push     |         20% | card is unchanged                                  |

The selected card itself is never removed.

**Farpoint table — Loyalty Buyback.** The spin is free. The calls are 50%
transfigure the card and add 1 duplicate, 35% transfigure it, and 15% add 1
duplicate.

## Universal side bet

An immediate table with a paid buy-in and at least a 25% chance of zero payout
may offer **House Cover** once. House Cover costs 20 essence. If the wager's
first committed roll produces zero payout, it refunds 25 essence; otherwise it
pays nothing. It does not change the published outcome roll and it does not
cover later presses.

At Farpoint, House Cover costs 0 and refunds 30 essence. Tables whose Farpoint
buy-in is already 0 do not offer it.

## Site boundaries

Gamble owns decisions about variance, pressing, hidden information, chosen
collateral, or a measurable performance bet.

- A fully known cost for a fully known immediate reward belongs to Tempting
  Offer unless repeated cash-out discipline is the entire game, as in The
  Conveyor or Overclock Wager.
- A delayed fixed reward belongs to Temporal Fork. Escrow Orbit and Bane Bond
  stay at Gamble because their maturity result includes a published random
  call.
- Dream Augury supplies state-aware prize manifests. Gamble supplies the
  buy-in, odds, liabilities, phases, and resolution.

## Generation, persistence, and logging

Each generated wager records:

- table id and tuning version;
- whether the Farpoint table is active;
- exact buy-in, optional fee, and affordability check;
- every frozen reward recipe, candidate UUID, and deck entry id;
- the displayed outcome table and integer roll ranges;
- phase, press number, banked value, and unbanked value;
- collateral or escrow entry ids;
- resolved random integers in resolution order;
- future contract counters and trigger progress;
- completion state.

The table definitions, tuning versions, odds, costs, and payouts are authored
as data rather than embedded in UI components.

Anything both players must agree on is a room event. Clients submit intent
events through `src/coop/actions.ts`; React state may hold only presentation
details such as hover, animation progress, or which crate is visually raised.
The deterministic reducer or provider performs every shuffle and roll and
applies each buy-in, liability, and reward atomically.

Suggested intent events are initialize table, select line, select collateral,
commit, buy scan, reveal, hit, stand, recall, and accept contract. An event
contains ids and decisions, never a client-generated random result.

Production logs must answer:

1. Which base or Farpoint rules and tuning version appeared?
2. Why was this table eligible?
3. Which exact stakes, odds, outcome classes, and reward manifests were shown?
4. Which UUIDs and deck entry ids were offered or committed?
5. Which player submitted each decision, and at what room sequence number?
6. Which deterministic draws resolved the table?
7. What was paid, banked, lost, returned, added, removed, or deferred?
8. Which Dream Augury scoring trace produced each prize candidate?

## First playtest gates

The v0 tuning advances only when all five launch tables satisfy these checks:

1. At least 40% of eligible traveling-table visits receive a committed wager.
2. Pass Line and Hard Way each receive at least 25% of Crystal Roll bets.
3. At least 30% of Pressure Vault players who open lock 2 stand before lock 4.
4. At least 20% of eligible Figment Reactor players stake a non-starter card.
5. In Contraband Array, both “scan twice” and “take after one scan” occur in at
   least 20% of committed visits.
6. Deck Cut receives bets across at least three predicate families.
7. Farpoint improves participation without pushing decline below 5%; a tiny
   decline rate indicates the home tables have become automatic rewards rather
   than bets.

These are directional playtest gates, not automated CI assertions. Automated
tests use synthetic manifests and assert deterministic resolution, exact
boundary rolls, atomic effects, UUID identity, stale-action rejection, and
Farpoint substitution.
