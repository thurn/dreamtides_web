# Gravok's Casino: Space Tarot Mechanics v2

Status: concrete shared-deck rules and first-playtest tuning proposal.

Gravok owns the casino aboard Farpoint Station. When Gamble appears elsewhere,
he brings a compact traveling table and the same **Space Tarot** shoe used
throughout the journey. In Farpoint, the player enters his full casino floor and
plays enhanced home-table rules.

The Space Tarot is a forty-card, run-persistent deck. It is the primary source
of randomness for Gravok's games: eighteen of the thirty-one tables in this
proposal draw, deal, seal, inspect, or build hands from it. The other tables
retain dice, a physical wheel, the player's journey deck, hidden-information
fixtures, or battle performance where those sources create the table's actual
identity.

This document specifies the deck, shared shoe behavior, wager, odds, payout,
eligibility, and Farpoint variant for every proposed table. Values are v0
playtest tuning. A tuning change receives a new version so production logs can
reconstruct the exact reading and rules presented to the player.

## Design decision

The Space Tarot uses a **four-by-ten matrix**:

- four constellations: **Suns**, **Moons**, **Comets**, and **Voids**;
- nine numbered orbits in each constellation;
- one named **Sign** in each constellation, with numeric value 10;
- a fixed **Radiant** or **Umbral** aspect printed on every card.

This gives every card three legible properties:

1. **Constellation** supports suit bets, recipe assignment, matching, and
   25/50 splits.
2. **Orbit value** supports thresholds, totals, runs, pressure limits, and
   clean 10% increments.
3. **Aspect** supports an exact 50/50 split while remaining countable as cards
   leave the shoe.

The four Signs add named, memorable cards and a natural 10% event class without
breaking the grid. A Sign belongs to its constellation, has value 10, and keeps
its printed aspect unless a table explicitly reads “any Sign.”

### Candidate decks considered

| Candidate                                     | What it does well                                                                       | What breaks under repeated games                                                                                                       | Decision |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **One hundred numbered cards**                | expresses any whole percentage directly                                                 | every game becomes a renamed percentile roll; there are no hands, matches, suits, or memorable reveals; the discard is tedious to read | reject   |
| **Twenty-two unique named arcana**            | strongest individual art and fortune-telling flavor                                     | coarse and irregular odds; every table needs a bespoke lookup; poker, runs, pairs, and threshold play are weak                         | reject   |
| **Thirty-six cards: four suits × nine ranks** | compact, countable, and good for set play                                               | common casino odds such as 10%, 20%, 30%, 70%, and 90% require mixed exceptions; it lacks a small named trump class                    | reject   |
| **Forty cards: four suits × ten values**      | clean deciles, quarters, halves, thresholds, totals, sets, runs, and four special cards | needs careful presentation so three card properties do not compete for attention                                                       | choose   |
| **Tarot reversals randomized when dealt**     | familiar tarot ritual and another binary result                                         | adds a coin flip outside the finite deck, cannot be counted from the discard, and weakens the shared-shoe premise                      | reject   |

Three shoe models were also considered:

| Shoe model                                               | Strategic result                                                                                                                            | Decision        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| shuffle all forty cards before every table               | each table has stable baseline odds, but one table teaches nothing about the next and the shared deck is cosmetic                           | reject          |
| let rewards permanently add and remove Space Tarot cards | creates run-building around the casino deck, but favorable edits compound into extreme odds and compete with the journey deck for attention | defer beyond v2 |
| carry one finite shoe and public discard across the run  | every reveal matters later, counting is supported without external notes, and sealed cards connect visits across battles                    | choose          |

The chosen deck is the smallest candidate that gives both a broad probability
vocabulary and real card-game structure. Its most useful fresh-shoe partitions
are:

| Reading                          |   Cards | Probability |
| -------------------------------- | ------: | ----------: |
| one exact card                   |  1 / 40 |        2.5% |
| one orbit value or all Signs     |  4 / 40 |         10% |
| two orbit values                 |  8 / 40 |         20% |
| one constellation                | 10 / 40 |         25% |
| three orbit values               | 12 / 40 |         30% |
| one aspect or two constellations | 20 / 40 |         50% |
| values 1–7                       | 28 / 40 |         70% |
| values 1–8                       | 32 / 40 |         80% |
| numbered cards                   | 36 / 40 |         90% |

Those are baseline probabilities. The actual fraction changes as known cards
are revealed. Hidden table and sealed cards remain in the public unseen pool
until their properties become known, and the table publishes the exact
posterior fraction.

### Why the same cards stay interesting

The deck is reused, but the operation performed on it changes:

- **Orbit Book** asks the player to choose a numeric threshold before one draw.
- **Pressure Vault** adds card values toward a visible limit and offers
  hit-or-stand decisions after every safe draw.
- **Figment Reactor** reads aspect first, then a combined orbit/Sign class on a
  press.
- **Contraband Array** deals a positional spread, sells information, and reads
  constellation as prize plus orbit as liability.
- **Quantum Hand** uses the complete cards for pairs, runs, constellations, and
  a hold/redraw decision.
- **Bane Bond** seals one card now and lets the player choose later how strict
  a threshold to read against it.
- **Running Jackpot** makes the four Signs a coveted jackpot class.
- **Fivefold Mirror** makes the same Signs the dangerous maturity class.

For example, **The Door** is a Void, a Sign, value 10, and Radiant. It is a
high-pressure card in Pressure Vault, a jackpot in Running Jackpot, a
Void-recipe card in Signal Auction, and the top card of a Void constellation or
value-10 pair in Quantum Hand. The identity is stable; each game chooses which
part of that identity matters.

### Candidate stress tests

The forty-card structure was tested against the four operations most likely to
expose a weak deck:

1. **Single-card thresholds.** Values 1–7, 1–4, and 1–2 give Orbit Book three
   immediately readable 70%/40%/20% lines. The table needs no arbitrary list of
   winning card names.
2. **Sequential pressure.** Dealing two cards and hitting against a total of 21
   produces fresh-shoe conditional bust rates of 15.830%, 44.749%, and 64.054%
   on cards three through five. The curve rises sharply enough to create three
   distinct stand decisions without stage-specific random tables.
3. **Five-card hands.** The deck has `C(40, 5) = 658,008` initial hands,
   including pairs, repeated values, same-constellation hands, and six possible
   five-value runs per constellation. Quantum Hand is a native use of the deck
   rather than a lookup layered on one-card odds.
4. **A mixed journey sequence.** Orbit Book, Salvage Lock through reel three,
   Contraband Array, Running Jackpot, and an initial Quantum Hand expose
   thirteen cards. That is enough information for later tables to move
   meaningfully away from baseline while leaving most identities uncertain. A
   recycle restores the full available composition before the count becomes
   trivial.

## Exact deck inventory

Space Tarot cards are casino objects, not Dreamtides journey cards. They never
enter the player's journey deck, cannot be drafted or transfigured, and use
stable UUIDs stored as `spaceTarotCardId` values for identity. Display names are
resolved only at presentation time.

| Constellation | Numbered cards | Sign (value 10)  | Radiant cards    | Umbral cards     |
| ------------- | -------------- | ---------------- | ---------------- | ---------------- |
| **Suns**      | values 1–9     | **The Eclipse**  | 1, 3, 5, 7, 9    | 2, 4, 6, 8, Sign |
| **Moons**     | values 1–9     | **The Tide**     | 2, 4, 6, 8, Sign | 1, 3, 5, 7, 9    |
| **Comets**    | values 1–9     | **The Wanderer** | 1, 3, 5, 7, 9    | 2, 4, 6, 8, Sign |
| **Voids**     | values 1–9     | **The Door**     | 2, 4, 6, 8, Sign | 1, 3, 5, 7, 9    |

The aspect pattern produces exactly five Radiant and five Umbral cards in each
constellation, twenty of each in the full deck, and two Radiant and two Umbral
Signs. Aspect is printed and fixed; card rotation is animation only.
Radiant and Umbral are polarities, not universal good and bad outcomes. Signal
Auction, for example, pays the larger kicker on Umbral.

Each face emphasizes all three properties through redundant cues:

- constellation name and unique glyph;
- large numeric orbit or the word `SIGN` with a smaller `10`;
- the words `RADIANT` or `UMBRAL` plus a distinct border treatment;
- unique title and illustration.

Color may reinforce these cues but never carries rules by itself. During a
game, the table visually raises the property it reads and subdues the other
two. Pressure Vault makes values dominant; Figment Reactor makes aspect
dominant; Signal Auction makes constellation dominant.

## The shared shoe

### Journey-persistent state

The first card-driven Gamble visit initializes one deterministic shuffle of all
forty card ids. The run then has four zones:

- **shoe:** ordered, face-down cards available to deal;
- **table:** cards currently in a wager;
- **sealed:** face-down cards held by deferred contracts;
- **discard:** face-up cards in reveal order.

All card-driven tables in the run use these zones. The zone state carries into
every subsequent Gamble visit. The player can open the Space Tarot tray at any
time a wager is visible to inspect the discard, counts by constellation, value,
and aspect, the number of unknown sealed cards, and the number left in the
shoe.

A table declares its maximum draw budget. Before its first deal, if the shoe
contains fewer cards than that budget, the wager previews a **new orbit**
ceremony. On commitment, every card in the remaining shoe and discard is
combined and deterministically shuffled into a replacement shoe before any
card is dealt. Cards already on a table or sealed by a contract remain outside
the shuffle. If the combined shoe and discard cannot meet the budget, that
table is ineligible.

There is no mid-hand recycle. Quantum Hand therefore reserves a ten-card draw
budget before its initial five-card deal even though the player may hold cards
and redraw fewer than five.

### Hidden cards and public odds

A face-down table or sealed card is unknown to the player and absent from the
shoe. Its identity is not leaked through the odds panel. Published odds are the
exact posterior odds from public information: known discard, known cards in
play, visible hand cards, counts of hidden cards, and the deterministic rules
of the wager.

When a hidden card is revealed, every affected fraction updates. A Bane Bond
can therefore become more or less attractive as other Space Tarot cards appear
elsewhere during its lifetime. The sealed identity remains fixed throughout;
only the player's information changes.

Every card that affected a resolved wager is turned face-up before entering the
discard. Contraband Array reveals unchosen crates when the table closes, and an
early-recalled contract reveals its sealed tarot card before discarding it.
This keeps the public count complete.

### Commitment and concurrency

Generating a table freezes its authored terms, reward manifests, current public
odds, recycle requirement, and draw budget. The first action that exposes or
seals a card is a commitment. A free Contraband scan and a free Farpoint deal
therefore commit the visit even when no essence changes hands. A commit based
on a different shoe-zone revision is stale, bounces without dealing, and
regenerates the table from the authoritative fold.

Only the deterministic journey reducer draws cards. In co-op, a player submits
an intent through `src/coop/actions.ts`; the resulting room event moves exact
card ids between zones and applies the wager atomically. Two clients cannot
draw the same top card or observe different shoe states.

## Portfolio decision

Build these six tables first:

| Table                | Casino fantasy               | Space Tarot operation or system proved                       |
| -------------------- | ---------------------------- | ------------------------------------------------------------ |
| **Pressure Vault**   | blackjack-style hit or stand | visible values, live conditional odds, persisted pot         |
| **Figment Reactor**  | double-or-nothing collateral | aspect reading, selected deck-entry custody, atomic mutation |
| **Contraband Array** | three-crate monte            | hidden spread, paid information, two-property reading        |
| **Quantum Hand**     | five-card poker              | hands, hold/redraw enumeration, large draw budget            |
| **Bane Bond**        | run-spanning junk bond       | sealed card, posterior odds, deferred resolution             |
| **Deck Cut**         | bet on the player's own deck | exact state-derived odds outside Space Tarot                 |

This launch set demonstrates five materially different uses of the shared deck
and keeps one player-deck table as a contrast. **Escrow Orbit** follows when the
journey supports custody across battles. **The Orbit Book** follows when Gamble
can consume the full Dream Augury prize generator. The remaining tables are
authored expansion content.

## House rules shared by every table

### Published terms

- A **buy-in** is removed when the player commits. The player can leave for free
  until that point.
- An essence **payout** is the total essence granted after a win. It does not
  include a separately returned buy-in.
- Every table shows its relevant Space Tarot reading in plain language, the
  matching public card count, the reduced fraction, and the percentage before
  commitment. Multi-draw tables also show conditional odds after each reveal.
- Fresh-shoe percentages in this document explain the tuning target. The live
  shoe fraction is the probability the player acts on.
- Fixed payouts remain fixed as the shoe changes. Counting cards is allowed to
  create favorable and unfavorable visits; dynamic payout scaling would erase
  the strategic value of the shared shoe.
- A table is eligible only when every required outcome class remains possible
  under public information and its draw budget can be met. It does not silently
  recycle merely to improve the house's odds.
- A wager manifest freezes offered objects, public odds, liabilities, draw
  budget, and rules. Reloading or reconnecting cannot change the deal.
- **Farpoint table** means the replacement rules used when Gamble is enhanced
  in Farpoint Station. It does not stack with traveling-table values.
- If the player lacks the essence, target, pool inventory, deck room, remaining
  battles, or legal modifier required by a table, that table is ineligible.
  The generator does not shrink a chooser or substitute an unlisted reward.

### Exact reward recipes

Several tables use these frozen reward recipes:

| Recipe                      | Exact effect                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Card draft**              | Generate exactly 3 distinct, unowned, non-starter Dreamtides cards from the resolved draft pool with the Dream Augury `fit_card_draft` scorer; show all 3 and add the player's choice. |
| **Strong card**             | Generate and show exactly 1 unowned, non-starter Dreamtides card with the Dream Augury `strong_card` scorer; add it when awarded.                                                      |
| **Transfiguration service** | Generate exactly 4 legal `(deck entry id, non-Perfected transfiguration)` pairs with the Dream Augury transfiguration scorer; show all 4 and apply the player's choice.                |
| **Duplication service**     | Generate exactly 4 legal deck entries with the Dream Augury duplication scorer; show all 4 and duplicate the player's choice once.                                                     |
| **Purge service**           | Let the player choose and permanently remove exactly 1 legal deck entry. Banes are legal; the deck floor still applies.                                                                |
| **Dreamsign draft**         | Generate exactly 3 distinct, unheld Dreamsigns with the Dream Augury dreamsign-match scorer; show all 3 and grant the player's choice.                                                 |

Candidates are frozen by UUID and, for owned cards, deck entry id. Names are
resolved only for display. A recipe is eligible only when its full candidate
count can be generated.

### Casino presentation

Gravok calls essence **chips**, a commit a **bet**, a result a **reading**, and
leaving **stepping away from the table**. He deals Space Tarot with his crystal
fingers, names the revealed card, and then announces the table-specific call:
“The Wanderer, Umbral. The reactor takes it.”

The rules placard shows:

1. the buy-in and optional fees;
2. which card property this table reads;
3. the current matching cards and exact odds;
4. winning, losing, and liability calls;
5. the payout.

Farpoint surrounds the same game with a permanent pit, spectators, an
illuminated shoe-history board, and a gold **HOME TABLE** plaque. The replacement
rule is written on the plaque.

## Resolution-source map

|   # | Table                          | Source                         | Space Tarot lens                 |
| --: | ------------------------------ | ------------------------------ | -------------------------------- |
|   1 | Crystal Roll                   | crystal dice                   | —                                |
|   2 | The Orbit Book                 | Space Tarot                    | value threshold                  |
|   3 | Loaded Blessing                | Space Tarot                    | value and named Signs            |
|   4 | Pressure Vault                 | Space Tarot                    | cumulative value                 |
|   5 | Salvage Lock                   | Space Tarot                    | escalating value threshold       |
|   6 | Guaranteed Burn                | Space Tarot                    | expanding value range            |
|   7 | The Sixfold Wheel              | physical wheel                 | —                                |
|   8 | The Conveyor                   | deterministic ladder           | —                                |
|   9 | Overclock Wager                | deterministic liability ladder | —                                |
|  10 | Figment Reactor                | Space Tarot                    | aspect, then value/Sign          |
|  11 | Collateral Auction             | Space Tarot                    | aspect/Sign or value             |
|  12 | Fivefold Mirror                | sealed Space Tarot             | value band                       |
|  13 | The House Chooses the Category | journey deck                   | entry identity                   |
|  14 | Contraband Array               | Space Tarot spread             | constellation and value          |
|  15 | Match and Keep                 | paired memory tokens           | token identity                   |
|  16 | Signal Auction                 | Space Tarot spread             | constellation and aspect         |
|  17 | Quantum Hand                   | Space Tarot hand               | constellation and value patterns |
|  18 | Escrow Orbit                   | sealed Space Tarot             | constellation                    |
|  19 | The Bane Bond                  | sealed Space Tarot             | tightening value threshold       |
|  20 | Borrowed Victory               | future battle rewards          | —                                |
|  21 | Next-Battle Contract           | battle performance             | —                                |
|  22 | Open-Deck Parlay               | battle performance             | —                                |
|  23 | House Rules                    | battle performance             | —                                |
|  24 | Gravity Sling                  | Space Tarot                    | constellation pair               |
|  25 | Pilot and Navigator            | Space Tarot                    | cumulative value                 |
|  26 | Gravok's Running Jackpot       | Space Tarot                    | Sign/value class                 |
|  27 | The Algorithm's Tell           | Dream Augury claims            | —                                |
|  28 | Deck Cut                       | journey deck                   | entry predicate                  |
|  29 | Sealed Reserve                 | Space Tarot                    | constellation or value band      |
|  30 | Bad-Omen Hedge                 | battle trigger                 | —                                |
|  31 | Buyback                        | Space Tarot                    | value band                       |

## Immediate and press-your-luck tables

### 1. Crystal Roll — the dice table

Crystal Roll keeps physical dice so Gravok's casino has one immediate,
kinetic game whose outcome is not a card reveal. He rolls two faceted crystals
down a zero-gravity rail. The player buys one 50-essence chip and places it on
one line:

| Bet           | Win |      Payout |           Lose |
| ------------- | --: | ----------: | -------------: |
| **Pass line** | 65% | 130 essence | 35%: no payout |
| **Hard way**  | 25% | 330 essence | 75%: no payout |

Exactly one deterministic percentile roll resolves the visit.

**Farpoint table — House Chip.** The buy-in is 0. Pass Line wins 70% and
pays 150 essence; Hard Way wins 30% and pays 360 essence.

### 2. The Orbit Book — the threshold book

The player buys one ticket for 50 essence, chooses a line, and receives one
Space Tarot card. The selected line wins when the card's value is at or below
its limit:

| Ticket                | Fresh-shoe win class |      Baseline | Payout                                 |
| --------------------- | -------------------- | ------------: | -------------------------------------- |
| **Low orbit**         | values 1–7           | 28 / 40 = 70% | Card draft                             |
| **Transfer orbit**    | values 1–4           | 16 / 40 = 40% | Transfiguration service and 50 essence |
| **Escape trajectory** | values 1–2           |  8 / 40 = 20% | Dreamsign draft and 120 essence        |

The prize manifests and live fractions are visible before the player chooses.
One card resolves the selected line and then enters the discard.

**Farpoint table — Chairman's Book.** The buy-in is 0. Limits are 8, 5, and 3,
giving fresh-shoe baselines of 80%, 50%, and 30%. Low Orbit pays a Card draft
plus 40 essence; Transfer Orbit pays a Transfiguration service plus 80 essence;
Escape Trajectory pays a Dreamsign draft plus 150 essence.

### 3. Loaded Blessing — the comp desk

Gravok grants a guaranteed Dreamsign draft, then the player chooses which
liability class the house may attach. One card is dealt after commitment:

| Marker                | Liability class | Fresh baseline | Liability                                          |
| --------------------- | --------------- | -------------: | -------------------------------------------------- |
| **Credit marker**     | value 8–10      |  12 / 40 = 30% | lose 100 essence                                   |
| **Nightmare marker**  | value 9–10      |   8 / 40 = 20% | gain 1 Nightmare Bane                              |
| **Collateral marker** | any Sign        |   4 / 40 = 10% | purge the selected eligible non-starter deck entry |

The Dreamsign is granted on either reading. Credit requires at least 100
essence. Collateral is selected and frozen before the card is dealt.

**Farpoint table — Owner's Comp.** The reward is a Dreamsign draft plus 50
essence. Credit triggers on values 9–10, Nightmare on any Sign, and Collateral
only on the two Umbral Signs, The Eclipse and The Wanderer. Their fresh
liability baselines are 20%, 10%, and 5%.

### 4. Pressure Vault — twenty-one pressure

The player pays 30 essence. Gravok deals two cards face-up and adds their
values. A Sign is worth 10. The two-card total cannot exceed 20, so Lock 1 opens
and the player may stand for 60 essence.

Each hit deals one more card. A running total above 21 busts the vault:

| Safe state               |                   Available pot |
| ------------------------ | ------------------------------: |
| initial two-card deal    |                      60 essence |
| after a safe third card  |                     150 essence |
| after a safe fourth card |                     270 essence |
| after a safe fifth card  | 450 essence and Dreamsign draft |

A bust awards no essence and adds exactly 1 Nightmare Bane. After every safe
card, the UI enumerates the remaining public possibilities and shows the exact
bust fraction for the next hit.

For tuning reference, a fresh full shoe has a 15.830% bust chance on card three,
a 44.749% conditional bust chance on card four, and a 64.054% conditional bust
chance on card five. These are baseline curve checks, not the odds displayed
after a particular hand.

**Farpoint table — Gravok Stands Soft.** The buy-in is 0, the pressure limit is
24, and pots are 80/180/310/500 essence; the last also grants a Dreamsign draft.
Fresh-shoe conditional bust baselines are 5.101%, 29.497%, and 52.785%. A bust
still awards no essence and adds 1 Nightmare.

### 5. Salvage Lock — the progressive reels

The player pays 20 essence. Each reel deals one card. A card above that reel's
safe value busts and discards every unbanked reward:

| Reel | Safe values | Fresh bust | Prize added after success |
| ---: | ----------- | ---------: | ------------------------- |
|    1 | any card    |         0% | 60 essence                |
|    2 | 1–8         |        20% | Card draft                |
|    3 | 1–6         |        40% | Transfiguration service   |
|    4 | 1–4         |        60% | Dreamsign draft           |

After every successful reel, the player may collect the complete tray or pull
again. Rewards with a choice are selected only after collection.

**Farpoint table — Locked First Reel.** The buy-in is 0. Reels 2–4 are safe on
1–9, 1–7, and 1–5, with fresh bust baselines of 10%, 30%, and 50%. Reel 1's
60 essence is locked immediately; a later bust discards only reels 2–4. A
successful fourth reel adds 80 essence.

### 6. Guaranteed Burn — the expanding ticket

Gravok freezes one prize containing a Dreamsign draft and a Transfiguration
service. The player may buy up to four attempts, leaving after any miss. Each
attempt deals a new card:

| Attempt |        Cost | Winning values | Fresh baseline |
| ------: | ----------: | -------------- | -------------: |
|       1 |  30 essence | 1–2            |            20% |
|       2 |  50 essence | 1–4            |            40% |
|       3 |  80 essence | 1–6            |            60% |
|       4 | 120 essence | any card       |           100% |

Missed cards enter the discard, so the exact conditional chance for the next
attempt can differ materially from its fresh baseline. A win grants both
rewards and closes the table.

**Farpoint table — Progressive Guarantee.** Costs are 0/40/70/100 essence.
Winning values are 1–3, 1–5, 1–7, and any card, for fresh baselines of
30%/50%/70%/100%. The prize also includes 100 essence.

### 7. The Sixfold Wheel — roulette

The player pays 20 essence and spins a physical six-wedge wheel. Every wedge is
one uniform deterministic outcome:

| Wedge           | Probability | Call                           |
| --------------- | ----------: | ------------------------------ |
| Crystal jackpot |        16⅔% | gain 180 essence               |
| Card cage       |        16⅔% | gain a Card draft              |
| Forge light     |        16⅔% | gain a Transfiguration service |
| Clean break     |        16⅔% | gain a Purge service           |
| Black crystal   |        16⅔% | gain 1 Nightmare Bane          |
| House sweep     |        16⅔% | lose 100 essence               |

Wheel insurance costs 30 essence. It changes Black Crystal to no effect, House
Sweep to lose 40 essence, and Crystal Jackpot to gain 120 essence. Other wedges
stay fixed.

**Farpoint table — Complimentary Insurance.** Buy-in and insurance cost 0.
Insurance leaves Crystal Jackpot at 180 essence and changes both liability
wedges to no effect.

### 8. The Conveyor — the cash-out ladder

Four face-up cases move past the betting window. Each purchase immediately
grants its reward:

| Case |        Cost | Guaranteed contents               |
| ---: | ----------: | --------------------------------- |
|    1 |  30 essence | 50 essence                        |
|    2 |  60 essence | Card draft                        |
|    3 | 100 essence | Transfiguration service           |
|    4 | 150 essence | Dreamsign draft and Purge service |

All manifests and prices are visible before case 1. The wager is how much of
the 340-essence ladder the player can afford and chooses to climb.

**Farpoint table — Casino Credit.** Case 1 is free. Cases 2–4 keep their costs.
Case 4 also contains 100 essence.

### 9. Overclock Wager — the marker ladder

The player pays 20 essence to light an 80-essence pot. Each double adds its Bane
immediately and replaces the available cash-out:

| Stop after     | Bane added by that double |    Cash-out |
| -------------- | ------------------------- | ----------: |
| Opening marker | none                      |  80 essence |
| Double 1       | Nightmare                 | 170 essence |
| Double 2       | Despair                   | 300 essence |
| Double 3       | Oblivion                  | 500 essence |

The Banes remain when the player continues. The decision is a known trade
between present deck quality and essence.

**Farpoint table — First Marker on the House.** The opening cost is waived,
Double 1 adds no Bane, and Double 3 also grants a Dreamsign draft.

## Collateral tables

### 10. Figment Reactor — double or nothing

Gravok shows exactly four legal non-starter deck entries. The player stakes one,
frozen by UUID and deck entry id, and one Space Tarot card is dealt:

| First reading | Class   | Fresh baseline | Resolution                                        |
| ------------- | ------- | -------------: | ------------------------------------------------- |
| **Double**    | Radiant |            50% | return the original and add 1 permanent duplicate |
| **Nothing**   | Umbral  |            50% | permanently remove the original                   |

After Double, the player may collect both copies or press. Pressing deals
another card. An inner-orbit card with value 1–3 or either Radiant Sign wins;
that class contains 14 / 40 cards = 35% in a fresh shoe. A win adds a second
permanent duplicate and applies one frozen legal non-Perfected transfiguration
to all three copies. A miss removes the added copy and leaves the unchanged
original.

Both draws use live shoe fractions. The first card is already absent when the
press odds are computed.

**Farpoint table — Original Protected.** Radiant doubles the card; Umbral
returns the original unchanged. A press wins on any Radiant card, a fresh-shoe
50% class, with the same win and miss effects.

### 11. Collateral Auction — the high-roller cage

The player selects one of exactly four shown legal non-starter deck entries as
collateral. A frozen Dreamsign draft is displayed, then Gravok deals one card:

| Reading            | Class                 | Fresh baseline | Resolution                                    |
| ------------------ | --------------------- | -------------: | --------------------------------------------- |
| **House bonus**    | Radiant numbered card |            45% | return the card and grant the Dreamsign draft |
| **Fair exchange**  | Umbral numbered card  |            45% | purge the card and grant the Dreamsign draft  |
| **Reserve missed** | any Sign              |            10% | return the card; grant nothing                |

Signs form their own class regardless of printed aspect.

**Farpoint table — Crystal Member Rate.** The home table reads values: 1–6 is
House Bonus, 7–9 is Fair Exchange, and a Sign is Reserve Missed, giving fresh
baselines of 60%/30%/10%. Reserve Missed returns the card and grants 60 essence.

### 12. Fivefold Mirror — the sealed multiplier

The player selects one legal deck entry and chooses a line. At least two future
battles must remain:

- **Even money:** pay 40 essence and add 1 permanent duplicate.
- **Fivefold:** pay 40 essence, add 5 temporary copies for the next 2 battles,
  and seal one face-down Space Tarot card.

After the second battle, temporary copies vanish and the sealed card is read:

| Value | Fresh baseline | Maturity                                   |
| ----- | -------------: | ------------------------------------------ |
| 1–3   |            30% | add 2 permanent copies                     |
| 4–9   |            60% | add 1 permanent copy                       |
| Sign  |            10% | add 1 Nightmare Bane and no permanent copy |

The original is never at risk. The player can inspect live posterior odds for
the sealed card as other cards are revealed during the two battles.

**Farpoint table — Mirrored Suite.** Both lines cost 0. Fivefold adds 3
permanent copies on 1–3, 2 on 4–9, and 1 on a Sign; it cannot add a Bane.

### 13. The House Chooses the Category — the face-down discard

This table draws from the player's journey deck because choosing which owned
category to expose is its core wager. The player chooses one eligible category;
Gravok uniformly draws and purges one listed deck entry:

| Chosen category | Eligible entries       | Guaranteed payout                      |
| --------------- | ---------------------- | -------------------------------------- |
| Starter         | starter cards          | 150 essence                            |
| Event           | non-starter Events     | Transfiguration service and 50 essence |
| Character       | non-starter Characters | Dreamsign draft                        |

The UI shows every possible entry and its exact `1 / N` chance. Only categories
with at least two legal entries are offered.

**Farpoint table — Two-Card Burn.** Gravok draws two distinct entries from the
chosen category and the player chooses which is purged. Starter pays 200
essence; Event pays a Transfiguration service and 100 essence; Character pays a
Dreamsign draft and 80 essence.

## Information and tabletop games

### 14. Contraband Array — three-card monte

The first scan commits the visit and deals three Space Tarot cards face-down,
one under each crate. Constellation defines the prize:

| Constellation | Prize                   |
| ------------- | ----------------------- |
| Suns          | 180 essence             |
| Moons         | Card draft              |
| Comets        | Transfiguration service |
| Voids         | Dreamsign draft         |

Value defines the rider:

| Value | Fresh baseline | Rider                                 |
| ----- | -------------: | ------------------------------------- |
| 1–5   |            50% | Clean                                 |
| 6–8   |            30% | lose 60 essence                       |
| 9     |            10% | gain 1 Nightmare Bane                 |
| Sign  |            10% | Clean and add 80 essence to the prize |

The player scans one crate for free, revealing its complete card. Scanning one
additional crate costs 30 essence. The player takes one crate or leaves; closing
reveals all three cards and discards them.

**Farpoint table — Security Override.** Two scans are free. Values 1–8 are
Clean, value 9 loses 40 essence, and Signs are Clean and add 100 essence.

### 15. Match and Keep — the memory table

Twelve face-down tokens form six exact pairs. The pairs pay 80 essence, Card
draft, Transfiguration service, Purge service, Duplication service, and gain 1
Nightmare Bane. Their positions are deterministically shuffled.

The player receives five attempts. An attempt reveals two tokens; a match
applies and removes the pair, while a miss turns both face-down. The player may
leave after any match or continue through the fifth attempt. Matched rewards
cannot be lost.

This table uses guaranteed pairs rather than consuming twelve arbitrary tarot
cards, which could produce a memory board with few or no matches.

**Farpoint table — Seven Hands.** The player receives seven attempts. The
Nightmare pair becomes a Dreamsign draft pair.

### 16. Signal Auction — the blind prize window

Choosing an information level commits the visit and deals two Space Tarot cards
into sealed envelopes. Their constellations map to reward recipes:

| Constellation | Recipe                  |
| ------------- | ----------------------- |
| Suns          | Card draft              |
| Moons         | Dreamsign draft         |
| Comets        | Transfiguration service |
| Voids         | Duplication service     |

A Radiant card adds 20 essence to its recipe; an Umbral card adds 80. Any Sign
adds 120 essence instead of its aspect kicker.

The player chooses one envelope at an information level:

| Information purchased                           | Total scan cost | Blind-choice bonus |
| ----------------------------------------------- | --------------: | -----------------: |
| no scan                                         |               0 |        120 essence |
| reveal both constellation names                 |      20 essence |         70 essence |
| reveal both complete cards and reward manifests |      50 essence |         20 essence |

The chosen envelope grants its recipe, card kicker, and blind-choice bonus.
Both cards reveal and enter the discard when the table closes.

**Farpoint table — Host's Tell.** Constellation names are free and complete
cards cost 20 essence. Bonuses are 150 with no scan, 100 after constellation
names, and 50 after complete cards.

### 17. Quantum Hand — five-card Space Tarot poker

The player pays 40 essence and receives five cards from the shared shoe. They
may hold any number and pay 30 essence once to discard and redraw every unheld
card. A Sign has value 10. Aspect does not affect hand rank.

The best final hand pays:

| Hand                                                            | Fresh full-deck combinations | Baseline probability |                          Payout |
| --------------------------------------------------------------- | ---------------------------: | -------------------: | ------------------------------: |
| Constellation run: five consecutive values in one constellation |                           24 |               0.004% | 700 essence and Dreamsign draft |
| Four of an orbit                                                |                          360 |               0.055% |                     600 essence |
| Constellation: five cards in one constellation                  |                          984 |               0.150% |                     500 essence |
| Full array: three of one value and two of another               |                        2,160 |               0.328% |                     450 essence |
| Orbit run: five consecutive values, mixed constellations        |                        6,120 |               0.930% |                     300 essence |
| Three of an orbit                                               |                       23,040 |               3.501% |                     220 essence |
| Two pair                                                        |                       51,840 |               7.878% |                     130 essence |
| One pair                                                        |                      322,560 |              49.021% |                      60 essence |
| High card                                                       |                      250,920 |              38.133% |                       no payout |

The denominator is `C(40, 5) = 658,008`. Counts are exclusive: a Constellation
Run is not also counted as a Constellation or Orbit Run. After the initial deal
and every hold selection, the UI enumerates exact redraw outcomes from the
current public unseen pool.

**Farpoint table — Owner's Poker Room.** Buy-in and redraw cost are waived.
Every essence payout increases by 50; a Constellation Run grants its Dreamsign
draft plus 100 additional essence.

## Deferred and performance tickets

### 18. Escrow Orbit — the futures window

The player escrows one untransfigured, non-starter deck entry with at least one
legal non-Perfected transfiguration. The card is absent from the next two
battles, and one Space Tarot card is sealed face-down with the contract.

- After one completed battle, the player may recall the journey card unchanged,
  gain 50 essence, reveal the tarot card, and close the contract.
- After two completed battles, the tarot card resolves by constellation:
  Suns or Moons returns the journey card with one frozen transfiguration;
  Comets returns it with one permanent duplicate; Voids returns it unchanged
  and grants 120 essence.
- Before either battle, the player may pay 40 essence to return the journey
  card unchanged. The tarot card reveals and enters the discard.

The fresh maturity classes are 50%/25%/25%; the live posterior remains visible.

**Farpoint table — Preferred Futures.** One-battle recall pays 80 essence and
early return is free. Suns or Moons returns a transfigured card plus one
duplicate; Comets returns a transfigured card; Voids returns a duplicate plus
120 essence.

### 19. The Bane Bond — the sealed junk bond

Gravok adds 1 Nightmare Bane and seals one face-down Space Tarot card into a
bond. At least three battles must remain. After each victory, the player may
redeem or carry:

| Victories carried | Successful sealed values | Fresh baseline | Successful payout |
| ----------------: | ------------------------ | -------------: | ----------------: |
|                 1 | 1–8                      |            80% |       100 essence |
|                 2 | 1–6                      |            60% |       220 essence |
|                 3 | 1–5                      |            50% |   Dreamsign draft |

Redemption reveals the same sealed card. It removes the Nightmare and closes
the bond on success or default. Purging the Nightmare before redemption reveals
and discards the tarot card, then closes the bond with no payout.

The rising reward is paired with a tightening threshold. Other public Space
Tarot reveals can update the posterior probability of the sealed value, giving
the player information to use when choosing when to redeem.

**Farpoint table — Investment-Grade Bane.** Successful values are 1–9, 1–7,
and 1–6, with fresh baselines of 90%/70%/60%. Payouts are 140 essence, 280
essence, and a Dreamsign draft plus 100 essence.

### 20. Borrowed Victory — the advance window

The player receives 180 essence immediately. Gravok takes 50% of the essence
reward from each of the next two completed battles, rounded down and capped at
100 essence per battle. A battle paying 150 sends 75 to Gravok; a battle paying
260 sends 100. At least two battles must remain.

The wager is whether the next two battle rewards total less or more than the
advance's break-even point.

**Farpoint table — Host's Advance.** The player receives 240 essence. Gravok
takes 35% of each of the next two battle rewards, rounded down and capped at 80
per battle.

### 21. Next-Battle Contract — the challenge book

The player pays 30 essence and signs one contract for the next battle:

| Contract         | Temporary battle condition                               | Payout on victory                      |
| ---------------- | -------------------------------------------------------- | -------------------------------------- |
| **Short Deal**   | opening hand has 2 fewer cards                           | 200 essence                            |
| **Dirty Shoe**   | shuffle 2 temporary Nightmare Banes into the battle deck | Dreamsign draft                        |
| **Point Spread** | win by at least 8 points                                 | Transfiguration service and 80 essence |

The fee is lost and no payout is granted if the player loses or misses Point
Spread. Temporary changes expire after the battle.

**Farpoint table — Comped Challenge.** The entry fee is 0. Short Deal pays 260
essence; Dirty Shoe pays a Dreamsign draft plus 80 essence; Point Spread pays a
Transfiguration service plus 140 essence.

### 22. Open-Deck Parlay — the proposition board

Gravok generates exactly three achievable, observable legs:

- play three distinct Events by card UUID;
- materialize three distinct Characters by card UUID;
- reclaim two cards;
- play cards with three different printed energy costs;
- end a turn with at least four cards in the void;
- win without a Bane remaining in hand.

The player pays 50 essence and selects one, two, or three offered legs. Every
selected leg must occur in the next battle:

| Legs selected | Successful payout |
| ------------: | ----------------: |
|             1 |       110 essence |
|             2 |       240 essence |
|             3 |       420 essence |

The manifest stores referenced journey cards by UUID and deck entry id. A leg
is offered only when the current deck can satisfy it.

**Farpoint table — Parlay Boost.** The entry fee is 0 and payouts are
140/290/500 essence.

## Rules and route tables

### 23. House Rules — the private salon

The player pays 30 essence and selects one authored rule contract for the next
battle:

| Salon             | Rule in force                                                                         | Condition                | Payout                                  |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- |
| **Double Draw**   | both players draw 1 additional card each turn; player hand limit is reduced by 2      | win by at least 5 points | Card draft and 80 essence               |
| **Figment Floor** | each Character materializes with 1 additional Figment; opponent starts 5 points ahead | win                      | Dreamsign draft                         |
| **Fast Events**   | every Event is Fast; reclaiming an Event costs 1 additional energy                    | reclaim 2 Events and win | Transfiguration service and 100 essence |

Temporary rules expire after the battle. The wager fails unless the win and
listed performance condition both succeed.

**Farpoint table — Salon Comp.** The entry fee is 0 and every successful
contract adds 100 essence.

### 24. Gravity Sling — the route book

Gravok chooses two currently reachable next-dreamscape nodes:

- **Red route:** lock the next Atlas move to this node and add one known
  Dreamsign Reward site displaying its exact Dreamsign.
- **Black route:** lock the next Atlas move to this node and deal one Space
  Tarot card. Suns or Moons adds a Duplication site; Comets or Voids adds a
  Purge site whose first purge costs 0.

The player sees both destinations, the Red Dreamsign, and the current Black
constellation-pair fraction before committing.

**Farpoint table — First-Class Sling.** Red also adds an Essence site worth
100 essence. Black adds both the Duplication site and the first-purge-free Purge
site.

### 25. Pilot and Navigator — the co-op pressure pit

In a two-player room, the Pilot chooses one of two Space Tarot pressure limits.
Gravok deals two cards and totals their values. After a safe deal, the Navigator
stands or hits; roles swap after every successful hit. The hand ends after four
cards:

| Table        |     Buy-in | Limit | Pots after 2/3/4 safe cards | Fresh bust baselines       |
| ------------ | ---------: | ----: | --------------------------- | -------------------------- |
| **Cautious** | 30 essence |    24 | 60/140/240                  | 0% / 5.101% / 29.497%      |
| **Bold**     | 30 essence |    18 | 90/230/450                  | 2.821% / 32.927% / 58.577% |

A bust loses the pot and adds 1 Nightmare Bane. The UI shows exact live odds
before the Pilot chooses and before every Navigator hit. Solo players make both
decisions.

**Farpoint table — Partner Rate.** The buy-in is 0. Cautious uses limit 26 and
pots 80/180/300, with fresh baselines 0%/1.700%/20.110%. Bold uses limit 20 and
pots 120/280/500, with fresh baselines 0%/21.377%/49.557%.

### 26. Gravok's Running Jackpot — the Sign ticket

Whenever an essence buy-in at a Gamble table produces zero payout, 25% of that
buy-in, rounded up, enters a run-local jackpot capped at 250 essence. Liability
payments and optional scan or insurance fees do not contribute.

At a later visit, the player may buy one side ticket for 20 essence and deal one
Space Tarot card. Any Sign claims the meter and resets it to zero. The fresh
chance is 4 / 40 = 10%; the live Sign count is published. On a miss, the ticket
cost joins the meter subject to the cap. If the meter remains at journey
completion, 25% of it, rounded down, is paid as essence.

**Farpoint table — Progressive Lounge.** Failed buy-ins contribute 50%, the
cap is 350 essence, and the ticket is free. Value 9 or a Sign claims the meter,
a fresh 8 / 40 = 20% class. Journey-completion payout remains 25%.

### 27. The Algorithm's Tell — liar's poker

Gravok deals three distinct face-up Strong card prizes, sampled without
replacement from the Strong-card score band, and three plain-language claims
about why the Dream Augury scorer selected them. Exactly two claims accurately
describe logged score components and one is fabricated.

- Pick the fabricated claim: choose and gain 1 of the 3 cards.
- Pick a true claim: gain the card beside that claim and 1 Nightmare Bane.
- Pay 40 essence before answering: mark and remove one of the two true claims,
  selected uniformly, leaving one true and one fabricated claim.

This table's uncertainty belongs to the Dream Augury explanation puzzle; a
Space Tarot draw would add ceremony without creating another meaningful
decision.

**Farpoint table — Gravok Blinks.** One true claim is removed for free. A
correct answer grants the chosen card plus 100 essence; an incorrect answer
grants the adjacent card with no Bane.

### 28. Deck Cut — the player's shoe

The house generates exactly three valid predicates from:

- Event;
- Character;
- Fast;
- Reclaim;
- printed energy cost 0, 1, 2, or 3+;
- one subtype present in the deck.

A predicate is valid when at least one and fewer than all legal deck entries
match it. The player selects one and pays 50 essence. Gravok deterministically
shuffles every legal journey deck entry, including individual copies, and
reveals one.

If `M` of `N` entries match, the UI publishes `p = M / N`. A hit pays
`min(400, ceil-to-next-10(55 / p))` essence; a miss pays nothing. For example,
`6 / 20 = 30%` pays 190 essence. The payout is frozen before commitment.

This table keeps the journey deck as its shoe because deck construction and
copy count are the information being wagered on.

**Farpoint table — Deep Cut.** The buy-in is 0 and a hit pays
`min(450, ceil-to-next-10(70 / p))` essence.

### 29. Sealed Reserve — the auction table

One exact Dreamsign from the Dreamsign-draft scorer is shown face-up. One Space
Tarot card is dealt face-down as its reserve:

| Constellation | Fresh baseline |     Reserve |
| ------------- | -------------: | ----------: |
| Suns          |            25% |  40 essence |
| Moons         |            25% |  80 essence |
| Comets        |            25% | 120 essence |
| Voids         |            25% | 160 essence |

The player bids exactly 40, 80, 120, or 160 essence. A bid meeting the reserve
pays the bid and grants the Dreamsign. A lower bid loses a 20-essence listing
fee instead and reveals the card. Before bidding, a 30-essence appraisal reveals
whether the constellation is Suns/Moons or Comets/Voids.

**Farpoint table — Open Reserve.** Listing and appraisal fees are 0. The home
table reads value: 1–4 reserves 40, 5–7 reserves 80, 8–9 reserves 120, and a
Sign reserves 160, producing fresh 40%/30%/20%/10% classes. A winning bid also
pays 50 essence.

### 30. Bad-Omen Hedge — the insurance desk

The player pays 40 essence and insures one observable event in the next battle:

| Policy                 | Trigger                                               |      Payout |
| ---------------------- | ----------------------------------------------------- | ----------: |
| **Opponent hot start** | opponent reaches 8 points before the player reaches 8 | 130 essence |
| **Long night**         | turn 9 begins                                         | 160 essence |
| **Bad draw**           | player draws a Bane during turns 1–3                  | 120 essence |

Bad Draw is offered only when the journey deck contains a Bane. A policy pays
when its trigger occurs whether the player later wins or loses.

**Farpoint table — Host's Coverage.** The premium is 0 and payouts are
160/190/150 essence.

### 31. Buyback — the trade-up reading

The player selects one non-starter journey card gained earlier in the journey.
It must be untransfigured and have at least one legal non-Perfected
transfiguration. One applicable transfiguration is selected by UUID and shown
before the player pays 50 essence and receives one tarot card:

| Value     | Fresh baseline | Resolution                       |
| --------- | -------------: | -------------------------------- |
| 1–5       |            50% | apply the frozen transfiguration |
| 6–8       |            30% | add 1 permanent duplicate        |
| 9 or Sign |            20% | leave the card unchanged         |

The selected journey card itself is never removed.

**Farpoint table — Loyalty Buyback.** The reading is free. Values 1–5
transfigure and duplicate the card; 6–8 transfigures it; 9 or a Sign adds 1
duplicate. Every reading is beneficial.

## Universal side bet

An immediate table with a paid buy-in and at least a 25% current chance of zero
payout may offer **House Cover** once. House Cover costs 20 essence. If the
wager's first committed resolution produces zero payout, it refunds 25 essence;
otherwise it pays nothing. It does not alter or redraw Space Tarot cards and
does not cover later presses.

At Farpoint, House Cover costs 0 and refunds 30 essence. A table whose Farpoint
buy-in is already 0 does not offer it.

## Balance consequences of a persistent deck

### Card counting is a feature

Payouts do not chase the changing shoe. If many high values are visible in the
discard, Pressure Vault and Orbit Book become safer; if Signs remain dense,
Running Jackpot becomes more attractive and Fivefold Mirror becomes more
dangerous. The player receives the count in the UI, so the skill is evaluating
the current opportunity rather than maintaining external notes.

The generator may present an unfavorable table. Declining is part of Gamble.
It may not present a table whose required success or failure class is publicly
impossible after its declared recycle preflight. For example, Running Jackpot
is ineligible when cards remain in the shoe, every Sign is already face-up in
the discard, and its one-card draw budget does not trigger a recycle.

### Recycle timing is strategically visible

Large-draw games cycle the shoe faster than single-card readings. Quantum Hand
can consume five to ten cards, while Orbit Book consumes one. The pre-deal draw
budget makes a recycle predictable before commitment. A table cannot discover
mid-wager that it lacks cards and reshuffle away a count the player acted on.

### Named Signs must change roles

Signs are valuable in Running Jackpot, high pressure in total games, a clean
bonus in Contraband Array, a miss in Collateral Auction, and dangerous in the
traveling Fivefold Mirror. This prevents “Sign equals good” from becoming a
universal shortcut.

### Complexity is table-local

The deck has three properties, but most tables read one. A rules placard says
“THIS TABLE READS VALUE,” “THIS TABLE READS ASPECT,” or “THIS TABLE READS
CONSTELLATION.” Two-property games reveal the mapping as two short rows:
constellation determines prize; value determines rider. Quantum Hand is the
advanced table that intentionally uses full-card structure.

## Site boundaries

Gamble owns decisions about variance, pressing, hidden information, chosen
collateral, card counting, or measurable performance bets.

- A fully known cost for a fully known immediate reward belongs to Tempting
  Offer unless repeated cash-out discipline is the game, as in The Conveyor or
  Overclock Wager.
- A delayed fixed reward belongs to Temporal Fork. Escrow Orbit, Fivefold
  Mirror, and Bane Bond stay at Gamble because they seal a hidden Space Tarot
  result and preserve a published wager.
- Dream Augury supplies state-aware reward manifests. Gamble supplies the
  buy-in, Space Tarot operation, odds, liabilities, phases, and resolution.

## Generation, persistence, and logging

The Space Tarot run state records:

- tuning version and complete forty-card inventory version;
- shuffle number, deterministic shuffle input, and ordered shoe card ids;
- ordered public discard card ids;
- exact table-zone and contract-zone card ids, with public visibility;
- every zone transition and the room event that caused it;
- public unseen-card model used to calculate displayed odds;
- recycle reason and declared draw budget.

Each wager records:

- table id and tuning version;
- base or Farpoint rules;
- exact buy-in, optional fee, and affordability check;
- frozen reward candidates by UUID and deck entry id;
- which card properties and classes the table reads;
- displayed matching count, denominator, fraction, and percentage at every
  decision;
- dealt or sealed `spaceTarotCardId` UUIDs in resolution order;
- which identities were public at each decision and which remained hidden;
- hand totals, held cards, press number, banked value, and unbanked value;
- collateral or escrow deck entry ids;
- future contract counters and trigger progress;
- every applied payout, liability, return, addition, removal, and deferred
  effect;
- completion state.

The table definitions, mappings, costs, thresholds, and payouts are authored as
versioned data rather than embedded in UI components.

Anything both players must agree on is a room event. Clients submit ids and
decisions, never a client-generated card or random result. Suggested intents
are initialize shoe, commit deal, select line, select collateral, buy scan,
reveal, hold cards, redraw, hit, stand, seal contract, recall, redeem, and
accept contract.

Production logs must answer:

1. Which shoe inventory, shuffle, base/Farpoint rules, and tuning version
   appeared?
2. Why was the table eligible and what draw budget was reserved?
3. Which public cards and hidden-card counts informed each displayed fraction?
4. Which exact stakes, outcome classes, and reward manifests were shown?
5. Which Space Tarot ids, journey-card UUIDs, and deck entry ids were involved?
6. Which player submitted every decision and at what room sequence number?
7. How did each card move through shoe, table, sealed, and discard zones?
8. What was paid, banked, lost, returned, added, removed, or deferred?
9. Which Dream Augury scoring trace produced every prize candidate?

## First playtest gates

The v0 tuning advances only when these directional gates are met:

1. At least 40% of eligible traveling-table visits receive a committed wager.
2. At least 75% of first-session players can correctly predict a highlighted
   table call from one example card after the rules placard is shown.
3. Pressure Vault players who survive card three stand before card five in at
   least 30% of hands.
4. Orbit Book receives bets on all three thresholds; no line receives fewer
   than 15% of committed tickets.
5. At least 20% of Contraband visits include a paid second scan and at least 20%
   take a crate after only one scan.
6. Quantum Hand records holds from at least four hand-shape strategies: keeping
   a pair, keeping a constellation draw, keeping an orbit-run draw, and
   redrawing all five.
7. Bane Bond redemptions occur after each of one, two, and three victories; no
   maturity receives fewer than 15% of redemptions.
8. Acceptance rates measurably respond to live shoe composition. In particular,
   Sign-dense jackpot tickets and low-value-dense Orbit Book tickets should be
   accepted more often than their inverse states.
9. No Sign is described as universally lucky or unlucky by a majority of
   playtesters; its role should be table-dependent.
10. Farpoint improves participation while leaving at least a 5% decline rate.
    A smaller decline rate indicates the home tables are automatic rewards
    rather than wagers.

These gates are playtest analysis, not CI assertions. Automated tests use
synthetic shoes and manifests to assert deterministic deals, exact boundary
values, posterior odds, recycle preflight, hidden-information discipline,
atomic effects, UUID identity, stale-action rejection, and Farpoint
substitution.
