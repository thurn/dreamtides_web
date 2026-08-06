# Gravok’s Casino: Gamble Site Mechanics

## Game lineup

Gravok’s Casino offers five games. Each name combines the decision the player
makes with the casino’s otherworldly character.

| Game | Core decision |
| --- | --- |
| **Gravok’s Three-Gate Wager** | Choose one of three rank thresholds before each draw. |
| **Tidemark Ladder Climb** | Buy increasingly favorable attempts at one strong Dreamsign. |
| **Starway Stairs** | Bank an Essence prize or risk it on the next tier. |
| **Four-Suit Reprise** | Risk up to three different deck cards on one suit draw apiece. |
| **Twenty-One** | Hit or stand to finish from 17 through 21 without busting. |

## Casino-wide rules

### Simplicity rules

- Farpoint Station changes exactly one cost rule in each game. It does not also
  improve the odds, increase the prize, soften a penalty, or add another
  reward.
- Gravok’s Three-Gate Wager’s hardest tier grants both 200 Essence and a random
  Dreamsign. Tidemark Ladder Climb grants both 25 Essence and its displayed
  Dreamsign. Every other resolved wager grants one reward whenever possible.
- There is no casino-wide table fee. Every required payment is shown on the
  button that commits it.
- The player can leave before the first paid commitment and complete the site
  without paying anything.
- An unaffordable choice is disabled with its price visible. Essence never
  falls below 0.

### The playing-card deck

- Every game uses a standard 52-card deck: ranks 2 through Ace in clubs,
  diamonds, hearts, and spades, with no jokers.
- Cards are drawn without replacement during a hand or round. When a rule says
  **reassemble and reshuffle**, all 52 cards return before the next draw.
- Aces are high except in Twenty-One, where an Ace is worth 1 or 11.
- Rank thresholds are inclusive. For example, 6+ contains ranks 6 through Ace,
  or 36 of the 52 cards.
- The UI shows the exact relevant odds before every paid choice.

### Dreamsign preparation

The casino uses two Dreamsign selection methods:

- **Random Dreamsign:** select uniformly from all eligible, unheld Dreamsigns.
  Gravok’s Three-Gate Wager uses this method.
- **Strong Dreamsign pool:** score every eligible, unheld Dreamsign against the
  current deck with the existing Dreamsign match model, sort by descending
  score with UUID as the tiebreaker, and retain the best 50, or all eligible
  Dreamsigns when fewer than 50 remain. Select uniformly from that pool.
  Tidemark Ladder Climb and Twenty-One use this method. This preserves
  variety while making the reward meaningfully better than unrestricted random
  selection.

The encounter’s deterministic content seed makes either selection and locks
the result before the player commits. The UI displays the selected Dreamsign’s
name and effect before play. A game that requires a Dreamsign is unavailable
when it cannot prepare one; Gravok’s Three-Gate Wager may still offer its two
Essence-only tiers when its Dreamsign tier is unavailable. If the player is at
the 12-Dreamsign limit when a Dreamsign is won, use the existing replacement
flow.

### Farpoint Station summary

| Game | Ordinary cost | Farpoint Station’s only change |
| --- | --- | --- |
| Gravok’s Three-Gate Wager | Each wager costs 50 Essence. | Each wager costs 45 Essence. |
| Tidemark Ladder Climb | Attempts cost 0/5/10/15 Essence. | Every attempt is free. |
| Starway Stairs | Each tier draw costs 30 Essence. | Each tier draw costs 20 Essence. |
| Four-Suit Reprise | Each draw costs 25 Essence. | Each draw costs 15 Essence. |
| Twenty-One | The deal costs 50 Essence; each hit costs 10 Essence. | Hits cost 0 Essence. |

All odds, rewards, thresholds, outcome mappings, and limits are identical at
ordinary and Farpoint Station sites.

### Balance reference

Assuming ordinary Dreamsigns are worth 50 Essence, Farpoint strong Dreamsigns
are worth 100 Essence, sufficient bankroll, and optimal use of every available
replay, the net values are:

| Game | Ordinary EV | Farpoint EV |
| --- | ---: | ---: |
| Gravok’s Three-Gate Wager | +65.38 Essence | +104.29 Essence |
| Tidemark Ladder Climb | +58.10 Essence | +116.60 Essence |
| Starway Stairs | +73.68 Essence | +124.03 Essence |

## 1. Gravok’s Three-Gate Wager

Gravok’s Three-Gate Wager is a sequence of one-card bets. For each wager, the
player chooses the minimum rank that will win, pays 50 Essence, and draws once.
A losing draw awards nothing. Suit has no effect.

The controls are `Six Gate — 50 Essence`, `Nine Gate — 50 Essence`,
`Jack Gate — 50 Essence`, and `Leave`. Each wager button shows its winning
ranks, exact chance, and complete reward.

| Gate | Winning draw | Chance | Reward on a win |
| --- | --- | ---: | --- |
| `Six Gate` | ranks 6–A | 36 / 52 = 69.23% | 100 Essence |
| `Nine Gate` | ranks 9–A | 24 / 52 = 46.15% | 150 Essence |
| `Jack Gate` | ranks J–A | 16 / 52 = 30.77% | 200 Essence and the displayed random Dreamsign |

The result shows the drawn card, the chosen gate, and whether the rank crossed
the threshold. After a loss or a win from either of the two smaller gates, the
controls are `Play Again` and `Leave`. Winning the Jack Gate's largest prize
offers only `Leave`. Playing again prepares a new random Dreamsign reward and
reassembles and reshuffles all 52 cards before the next wager. The player may
retry twice, for a maximum of three wagers during the visit.

### Farpoint Station

The chosen wager costs 45 Essence. The thresholds, odds, and rewards are
unchanged.

## 2. Tidemark Ladder Climb

Tidemark Ladder Climb offers up to four separately purchased attempts to win
25 Essence and one displayed Dreamsign from the strong Dreamsign pool. Each
miss unlocks a more expensive attempt with a broader winning range. The player
may leave after any miss. A win grants both rewards and ends the game; leaving
or missing all four attempts grants nothing.

The prize card displays `Draw Q–A` above `Win [Dreamsign name]` before the
first draw. Hovering, focusing, or touch-holding the prize reveals the displayed
Dreamsign. After a miss settles, the same prize card advances to the next rank
target and the controls offer the next draw or `Leave`.

| Attempt | Cost | Cumulative cost | Winning ranks | Chance |
| --- | ---: | ---: | --- | ---: |
| 1 | 0 Essence | 0 Essence | Q–A | 12 / 52 = 23.08% |
| 2 | 5 Essence | 5 Essence | 10–A | 20 / 52 = 38.46% |
| 3 | 10 Essence | 15 Essence | 8–A | 28 / 52 = 53.85% |
| 4 | 15 Essence | 30 Essence | 6–A | 36 / 52 = 69.23% |

Reassemble and reshuffle before every attempt, so every listed chance uses a
full deck. Buying all four attempts produces a 93.28% chance of winning at
least once.

### Farpoint Station

All four attempts are free. The odds and rewards are unchanged.

## 3. Starway Stairs

Starway Stairs is a three-tier push-your-luck game. Each tier draw costs 30
Essence. A safe draw earns the prize for that tier. After the first or second
safe draw, the player may take that prize or risk it on the next tier. A bust
loses the unclaimed prize and ends the game. The third safe draw pays
automatically. A bust offers `Play Again` beside `Leave` while a retry remains.
Taking a prize or reaching the top offers only `Leave`. The player may retry
twice, for a maximum of three independent rounds during one visit. A complete
three-tier climb costs 90 Essence.

The UI lists all three tier squircles before play, each showing its inclusive
safe-draw range (`Draw 3-A`, `Draw 5-A`, or `Draw 8-A`) and prize. The current tier uses
the same purple soft-wash and bright rim as an accent button. Other tiers mute
their foreground content while retaining the full-strength glass background.
During a draw, the previous tier keeps its accent until the complete result
animation finishes. These wager objects reserve fixed grid positions throughout
every draw and result announcement. The centered action row beneath the cards
presents `Bet` and `Leave` before play, then `Climb` and `Take [current prize]`
after a safe draw. Wager and prize values use the Essence glyph directly beside
the number without cost punctuation.

| Tier | Ranks that bust | Bust chance | Prize after a safe draw |
| --- | --- | ---: | ---: |
| 1 | Twos | 4 / 52 = 7.69% | 60 Essence |
| 2 | ranks 2–4 | 12 / 52 = 23.08% | 140 Essence |
| 3 | ranks 2–7 | 24 / 52 = 46.15% | 300 Essence |

Reassemble and reshuffle before every rung. The chance of reaching the top
without a bust is 38.23%. Busting has no additional penalty beyond losing the
unclaimed prize.

### Farpoint Station

Every tier draw costs 20 Essence. The bust ranges, odds, and prizes are
unchanged.

## 4. Four-Suit Reprise

Four-Suit Reprise asks the player to select one eligible card from their deck,
pay for one draw, and let the suit determine that card's fate. The selected
entry is locked by entry id and card UUID. It must be a non-Nightmare card with
an eligible Transfiguration so all four outcomes can resolve.

Each draw costs 25 Essence and resolves its outcome. After the result, the
player may leave or play again with a different eligible card UUID and deck
entry. A visit permits up to three paid rounds using three different cards.
Reassemble and reshuffle before every draw so the four outcomes remain equally
likely.

| Suit | Chance | Final effect on the selected entry |
| --- | ---: | --- |
| Spades | 13 / 52 = 25% | Apply an eligible Transfiguration of the player's choice for free. |
| Diamonds | 13 / 52 = 25% | Leave it unchanged and gain 50 Essence. |
| Hearts | 13 / 52 = 25% | Duplicate it. |
| Clubs | 13 / 52 = 25% | Purge it. |

Before every draw, the UI previews all four suit outcomes, their exact 25%
chances, the selected card, and the draw cost. A Spades result opens the shared
Transfiguration form chooser with every eligible form priced at 0 Essence.
After a resolved round, the controls are `Play Again` and `Leave` while an
unused eligible card and a round remain; playing again returns every connected
player to the card choice.

### Farpoint Station

Every draw costs 15 Essence, for a maximum total of 45 Essence. The suit
outcomes, replay limit, and odds are unchanged.

## 5. Twenty-One

Twenty-One is a solo blackjack game with no dealer. The player pays 50 Essence
and receives two cards, then chooses `Stand` or `Hit — 10 Essence`. The goal is
to finish from 17 through 21. A total in that range grants one displayed
Dreamsign from the strong Dreamsign pool. Standing at 16 or less or going over
21 grants nothing. Exactly 21 and any bust resolve immediately.

The UI shows the current total and, after every card, how many cards remaining
would produce a winning total or a bust. Aces count as 1 or 11 to make the
highest total at or below 21; J, Q, and K count as 10.

| Terminal total | Result |
| --- | --- |
| 16 or less by standing | No reward. |
| 17–21 | Gain the displayed strong-pool Dreamsign. |
| Above 21 | No reward. |

For the objective of winning the Dreamsign, the optimal policy is simple: hit
on 16 or less and stand on 17 or more. Exact enumeration of the 52-card deck
without replacement gives that policy a 71.64% chance to win the Dreamsign,
comfortably above the 60% target.

### Farpoint Station

Hits cost 0 Essence. The 50-Essence deal cost, winning totals, odds, and
Dreamsign reward are unchanged.

## Determinism, co-op authority, and logging

The folded room event log owns all Gamble state. Player events contain intent
only: game id, selected wager, selected card UUID and entry id, draw again,
cash out, hit, stand, accept, or leave. React state controls presentation only.

Each active game records the site id, ordinary or Farpoint rules, locked reward
and target ids, deterministic shuffle commitment, revealed playing cards,
deck cursor, payments, current bank or pending card-effect choice, decisions
remaining, and terminal state. Replaying the room log must reproduce every
draw, displayed probability, payment, and reward without `Math.random`.

Logs must make a production game reconstructable. Record:

- the game name and rules version;
- whether Farpoint’s cost rule applied;
- Dreamsign candidate ids, scores, strong-pool cutoff when applicable, and the
  selected Dreamsign UUID;
- the selected deck entry id and card UUID for Four-Suit Reprise;
- every displayed odds numerator and denominator;
- each payment, revealed playing card, player decision, bank change, and
  revealed suit outcome;
- the final reward or card effect and terminal reason.

## Recommended implementation order

1. **Gravok’s Three-Gate Wager** establishes deterministic shuffling, exact
   odds, Essence costs and payouts, Dreamsign preparation, Farpoint cost
   changes, co-op replay, and Gamble logging with one draw.
2. **Tidemark Ladder Climb** and **Starway Stairs** add repeated
   decisions, stop conditions, and cumulative costs or banks.
3. **Four-Suit Reprise** adds locked deck targets, suit-driven card effects,
   and repeated rounds.
4. **Twenty-One** adds a persistent hand, Ace valuation, and dynamic remaining
   deck counts.
