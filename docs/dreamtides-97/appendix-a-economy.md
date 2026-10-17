# Appendix A: Economy algorithms

This appendix specifies every D97 economy algorithm: how cards, Dreamsigns,
Essence, amulets and keys enter and leave the player's possession. Values are
catalog tunables. Where D97 keeps a Shandalar rule, the section names its
origin in the decompilation (`~/shandalar-decomp/src/shandalar/src/`) and says
where D97 departs from it.

[Back to the design overview](README.md)

## A1. Notation

- `d` — the difficulty level, 0 to 3; 1 is the default (A18).
- `U{a..b}` — a uniform random integer from `a` to `b` inclusive. Every random
  draw is a seeded event-log draw, so reload and replay reproduce it.
- `a` — a dream's **act number**: 1–5 for act dreams, 6 for Limbo and key
  dreams.
- `b` — a dream's **price band**: 1 in Acts 1–2, 2 in Acts 3–4, 3 in Act 5,
  Limbo and key dreams. It plays the role of Shandalar's settlement tier.
- `B` — the current Avatar's reward bag (A2). `w(c)` is card `c`'s copy count
  in `B`.
- `T` — an opponent's tier (Appendix B §B9).
- `cost(card)` — rarity cost points: Common 1, Uncommon 2, Rare 3, Legendary 4.
- **Eligible cards** are Common, Uncommon and Rare supply cards. Legendary,
  Starter, Special and Tutorial cards never come from bags, shops or
  merchants.
- **A bag draw** picks card `c` with probability proportional to `w(c)`.
- **The collection floor** is the minimum deck size, 25. No sale, delivery,
  purge cost or lost ante takes the collection below it.
- Integer arithmetic truncates toward zero, in the order written.

## A2. The reward bag

**Tide sets.** Each Avatar has an authored **tide set**, stored in a D97
catalog module keyed by Avatar UUID:

- **Signature tide.** The Avatar's own signature tide. Each of the 12 Avatars
  without one has a fixed borrowed signature tide; each signature tide is lent
  to at most one other Avatar.
- **Three facets,** chosen by hand from the 32 facet tides and not limited to
  the facets the Avatar's journey tide pool lists. Each chosen facet adds at
  least 25 eligible cards outside the signature tide, and each facet serves two
  to four Avatars, so the 32 tide sets cover the card pool evenly.

Neutral tides are not part of any tide set. The player never sees tide sets;
they shape rewards only.

**Rings.** Ring 1 is the eligible cards of the signature tide. Ring 2 is the
eligible cards of the three facets that aren't in ring 1.

**Capacity.** A card's capacity is the number of copies its bag can ever
supply, and it rises as the campaign advances:

| Stage | Opens when | Ring 1 capacity | Ring 2 capacity |
| --- | --- | --- | --- |
| 1 | The run starts | 1 | 0 |
| 2 | The player first enters Act 2 | 1 | 1 |
| 3 | The player first enters Act 3 | 2 | 1 |
| 4 | The player first enters Act 4 | 2 | 2 |
| 5 | The player first enters Act 5 | 3 | 3 |
| 6 | Apollyon falls | 4 | 4 |

**Contents.** `w(c) = capacity(c) − drawn(c)`, where `drawn(c)` counts the
copies of `c` the player has acquired from this Avatar's bag. Copies acquired
through other channels never change `w`.

**Draws and offers.**

- A bag draw that pays a card at once (a bundle card, a chest card) removes
  that copy.
- An offer (shop stock, a card-choice offer, prize duel prizes) samples from
  `B` without removing. One offer never shows a card more times than `w(c)`.
  Acquiring an offered card removes one copy, if the bag still holds one.
- A draw restricted by a filter (a rarity ceiling, Rares only) that finds the
  bag empty falls back to the eligible cards of the tide set.

**Rolled at first reveal.** Bag-drawn contents are rolled from the current
bag when they're first revealed, then fixed:

| Content | Rolled when |
| --- | --- |
| Shop stock | The shop is first opened, and on each restock |
| Victory bundle | The battle is won |
| Chest card | The chest is opened |
| Prize duel prizes | The duelist is first previewed |
| Trial picks | The trial is won |
| Card-choice offers | The offer opens |

**Switching.** Every Avatar's bag exists from run start, and its drawn counts
persist for the whole run. Switching Avatars (Appendix B §B16) changes which
bag later draws use. Contents already rolled never change.

**Measured shape,** from the tide catalog:

- Ring 1 averages 89 eligible cards (72–104), with about 10 Rares (4–20).
  Signature tides are 45% Common, 43% Uncommon and 12% Rare.
- Facets hold 35–45 eligible cards each. Most Avatars' journey facet lists sit
  almost entirely inside their own signature: for the 20 signatured Avatars,
  the best three listed facets add 13–124 cards outside the signature (mean
  66). Authored tide sets target 60–100 ring-2 cards.
- Signature and facet tides together cover 468 of the 501 eligible cards. The
  rest appear only in neutral tides and reach the player through antes,
  curiosities and amulet merchants.

Origin: the tide catalog (`src/content/tides.ts`) and the draft engine's
remaining-copies bag. The journey deals a random tides4 pool per run; D97
replaces it with authored tide sets that grow by layers.

## A3. Rarity

| Rarity | Cost points | Price multiplier and floor | Amulet price |
| --- | --- | --- | --- |
| Common, and Starter | 1 | ×1 | 1 |
| Uncommon | 2 | ×2, at least 100 | 2 |
| Rare | 3 | ×4, at least 200 | 3 |
| Legendary | 4 | ×8, at least 200 | not sold |

Origin: `GetCardRarity` and the rarity switch in `CalculateCardShopPrice`.

## A4. Card base value and buy quote

**Base value.** For card `c` with energy cost `e` (X counts as 3) and printed
spark `s` (absent or X counts as 0):

```
v0 = 20 × (e + 1) + (5 × s if c is a Character)
if c is Fast: v0 = v0 × 3 / 2
v  = v0 × rarity multiplier, raised to the rarity floor   (A3)
```

**Buy quote** in a dream of price band `b`:

```
x = v × (b + 2)
quote = clamp(5 × (x / 50), 5, 1000)
```

The quote uses catalog values only. Transfigurations, spark bonuses and
keyword changes on a copy never change its price.

Median quotes, with the interquartile range:

| | Common | Uncommon | Rare | Legendary (sale only) |
| --- | --- | --- | --- | --- |
| Band 1 | 20 (10–25), max 70 | 40 (35–50), max 130 | 80 (60–110), max 250 | 105 |
| Band 2 | 25 (15–35), max 95 | 55 (45–70), max 175 | 110 (80–150), max 335 | 140 |
| Band 3 | 35 (20–45), max 120 | 70 (60–90), max 220 | 140 (100–190), max 420 | 180 |

Origin: `CalculateCardShopPrice` and the pricing loop in `RunTownServicesMenu`.
Shandalar derives `v0` from creature power and toughness, mana cost, an AI base
value and ability flags. D97 derives it from energy cost, spark and Fast, the
only comparable printed attributes, and uses one price everywhere within a
band.

## A5. Sale quote and the resale guard

Every shop buys owned copies:

```
sale = 5 × (v × (b + 2) / 50)            (no clamp)
```

A card sells for its unclamped buy quote in that dream, so later acts pay
more.

**Resale guard.** A copy bought for Essence (shop, curiosities, Duplication)
sells for at most the Essence paid. A copy bought for amulets sells for at most
its band-1 buy quote. Copies from bundles, antes, guardian picks, chests,
prize duels, quests, key prizes and the starting collection sell freely.

**Limits.** Selling is refused when it would cross the collection floor.
Selling a copy that is a pending ante re-rolls that ante (A9).

Origin: `SellPrice`, called from the deck manager in `deckdll.c`. Shandalar
has no guard.

## A6. Shops and curiosities

**Shops.** Every act dream and key dream has one shop at its shop anchor, run
by a shopkeeper authored with the dream.

- **Slot count.** `n = b + 3`: 4, 5 or 6.
- **Stock.** Rolled when the shop is first opened. For slot `i` (0-based):

  ```
  ceiling = (i mod 3) + 1
  c       = bag draw from { eligible cards of B with cost ≤ ceiling }
  ```

  Slots offer distinct cards. A ceiling permits every lower rarity, so slots 2
  and 5 offer a Rare only some of the time. Each quote is fixed when its slot
  is rolled.
- **Purchase.** The player buys any affordable subset, one copy per slot. The
  copy enters reserve with its price recorded, and the slot stays empty.
- **Restock.** Once per visit, the player can pay `10 × (b + 2)` Essence (30,
  40 or 50) to re-roll every slot, including empty ones. A visit ends when the
  player leaves the dream.
- **Selling.** Every shop buys owned copies (A5).

**Curiosities.** Tobias Tanglefur's guide site sells cards the bag can't
supply:

- **Stock.** 4 slots, rolled when the site opens, with the shop's slot
  ceilings. Each slot is a uniform draw from eligible supply cards outside the
  current Avatar's tide set, distinct across slots.
- **Enhanced.** 6 slots; slot ceilings start at Uncommon.
- **Price.** The buy quote × 3 / 2.
- One use per appearance, like every guide site: the player buys any subset,
  then the site closes.

Origin: `RunTownServicesMenu` and the card purchase handler. Shandalar
alternates on-color and loose slots and restocks on the world clock; D97 draws
every slot from the bag and restocks for Essence.

## A7. Card-choice offers

Card-choice offers are occasional "pick one of several" rewards: Exploration
card grants, Augury card offers, the Draft site that Random Site can conceal,
and trial picks.

- Each offer samples distinct cards from `B` with the action's existing
  selection policy (A2).
- Taking a card removes one copy from the bag.
- **The Draft site** (Random Site only) runs three rounds of one pick from four
  bag cards.
- Clam Shell, Sea Urchin, Tortoise Shell and Mushroom Caps change the number of
  options in every card-choice offer (Appendix D §D6).

Guardian picks (A15) choose from an opponent's deck and are not card-choice
offers.

## A8. Victory bundles and extras

**Bundle.** After a won challenger battle at tier `T`:

```
S = β + floor(T / 4)          // β = 0 (calibrated, Appendix E §E2)
remaining = S; i = 0; bundle = []
while remaining > 0:
    if i == 0:
        c = the opponent's ante
    else:
        c = bag draw from eligible cards of B
    bundle.append(c); remaining -= cost(c); i += 1
```

- The bundle is revealed after the win, and the player takes all of it into
  reserve; there is no pick.
- The ante leads the bundle, and its rarity counts against the budget.
- **Type mix** follows the bag. There is no separate Character/Event roll.

**Expected bundle size `E[N | S]`**, including the ante, from the signature
rarity mix:

| Tier | 4–7 | 8–11 | 12–15 | 16–19 |
| --- | --- | --- | --- | --- |
| Budget `S` | 1 | 2 | 3 | 4 |
| `E[N]` | 1.00 | 1.44 | 2.08 | 2.67 |
| Challengers at that tier | Acts 1–2 | Act 3 | Act 4; tier 13 key dreams | Act 5; tier 16 and 18 key dreams |

**Extra.** Each challenger gets one advertised extra when it is placed, shown
on its preview and paid on a win:

| Where | Essence purse | Amulet | Key |
| --- | --- | --- | --- |
| Acts 1–3 | 3/4 | 1/4 | — |
| Acts 4–5 and key dreams | 5/8 | 1/4 | 1/8 |

- **Essence purse:** `5 × (1 + floor(T / 4))` Essence: 10 at tiers 4 and 7, 15
  at tier 10, 20 at tier 13 and 25 at tiers 16 and 18.
- **Amulet:** one amulet whose resonance is drawn from the challenger's tide
  set, weighted by each tide's card count. The player sees only the amulet.
- **Key:** one key, created when it's paid (A16).

Guardians, incarnations and prize duelists have no extra. The Act 4 and Act 5
incarnations each pay one key with their picks.

**Origin:** the ordinary victory settlement in `world_lair_monster_encounter.c`.
Shandalar's budget is `strength + floor(T / 2)`, and its wins pay no gold; an
amulet drops with chance budget ÷ 40. D97 lowers the budget slope because every
D97 challenger pays a bundle, where about half of a Shandalar run's battles
were cardless dungeon and castle fights. It replaces the random amulet drop
with the advertised extra.

## A9. Ante

**Which battles have an ante.** Challengers, high-ante challengers,
guardians, incarnations in the acts and in Limbo, key-dream challengers and
handicap trials. Prize duels and the battle against Apollyon have none.

**Rolled at first preview,** seeded from the preview event, and shown on every
later preview:

- **Player's ante:** a uniform random copy of the active deck.
- **Opponent's ante:** a uniform random non-Legendary card of its constructed
  deck.

Walking away and returning never re-rolls the antes.

**The collection floor.** When a battle starts, the player's ante shrinks to
at most `owned copies − 25` cards. A player at the floor antes nothing, and
the preview says so. The opponent's ante is unchanged.

**Ante drift.** If the player's anted copy has left the active deck when the
battle starts, it re-rolls among active copies whose sale value in this dream
is at least the original's. If there are none, it takes the highest-value
active copy. Unequipping a card never makes the ante cheaper.

**High ante.** Each challenger of tier 13 or more (Act 4 onward, and key
dreams) is high-ante with probability 1/10. Each side antes three cards,
chosen by the same rules.

**Outcomes:**

| Battle | Win | Loss | Draw |
| --- | --- | --- | --- |
| Challenger | Opponent's ante leads the bundle (A8); the extra | Player's ante removed; rematch allowed | Nothing; rematch allowed |
| High-ante challenger | Three opponent antes and the extra; no bundle | Three player antes removed; rematch allowed | Nothing |
| Guardian or incarnation | Opponent's ante and picks (A15) | Player's ante removed; retry allowed | Nothing; retry allowed |
| Key-dream challenger | As a challenger or high-ante challenger | Player's ante removed; the challenger leaves; the prize is forfeited | Nothing exchanged; the challenger leaves; the prize is forfeited |
| Handicap trial | Opponent's ante and the trial reward (A12) | Player's ante removed; retry allowed | Nothing; retry allowed |

A rematch keeps the original antes. Won antes are plain copies of the catalog
card. **What can be anted:** transfigured copies, picks, antes and Legendary
copies are all eligible.

Origin: encounter setup and loss settlement in `world_lair_monster_encounter.c`.
Shandalar limits the opponent's ante to cards it doesn't treat as special; D97
lets any non-Legendary card of the opponent's deck be anted, so antes reach
outside the player's bag.

## A10. Amulets and amulet merchants

**Amulets** come in the five resonances: Wild, Valor, Ember, Shadow and Vision.

**Resonance cores.** Each resonance has a curated core of 20–40 cards, stored
as a catalog module beside the cards and keyed by card UUID. Cores:

- never overlap;
- exclude Legendary, Starter, Special and Tutorial cards;
- are authored from the tides of that resonance, starting from the cards whose
  tide memberships weigh most toward it, and adjusted by hand to match the
  resonance's identity (README).

A core can include cards outside the player's bag; that's its purpose.

**Amulet merchants.**

- **Catalog.** A merchant serves one resonance and sells exact copies from its
  core.
- **Price.** Common 1, Uncommon 2, Rare 3 amulets of that resonance.
- **Use.** The player may buy at any time, repeatedly, while able to pay.
  Merchants have no stock or cooldown. The catalog shows owned counts.

**Amulet changers** sell one amulet of any resonance for 250 Essence,
repeatedly.

Origin: `BuyAnyCardFromTown` with a town's `trade_color_and_type`, and the lair
amulet vendor. Shandalar's catalogs are color or card-type specialties of its
whole card list; D97's are the resonance cores.

## A11. Dream Guide services

Every guide appearance is a one-use site (Appendix B §B13). Prices:

| Service | Standard | Enhanced | Price |
| --- | --- | --- | --- |
| **Curiosities** (Tobias Tanglefur) | 4 cards from outside the tide set (A6) | 6 cards; slot ceilings start at Uncommon | Buy quote × 3 / 2 |
| **Transfiguration** (Durgan Forgehammer) | 3 random untransfigured active-deck copies with an eligible form; every eligible form shown; apply one | Any owned untransfigured copy, any eligible form | Existing form prices, rolled when the site opens: Empowered and Kindled by stat change 10/30/50/70 ±20; Amplified 10 ±20; Inspired 20 ±20; Enduring and Resonant 50 ±30; Attuned 10 ±20; Hastened free; Perfected 100 |
| **Duplication** (Deacon Holt) | 3 random active-deck copies; copy one | Any owned copy | The card's buy quote in this dream (A4). The copy is plain and records the paid price for the resale guard |
| **Dreamsign Bazaar** (Amunet, the Tomb-Keeper) | 3 Dreamsigns for Essence | 4 Dreamsigns | `5 × floor(base × (b + 2) / 20)`, base Common 50, Uncommon 100, Rare 200: band 1 35/75/150, band 2 50/100/200, band 3 60/125/250 |

- Bazaar offers exclude owned and Legendary Dreamsigns. A bought Dreamsign
  joins the collection, and the player may slot it at once.
- Leaf Ledger allows two transfigurations per Transfiguration site, and Spell
  Tome keeps its copy-on-transfigure effect, while slotted.
- The other guides' sites (Revelation, Augury, Random Site, Gamble,
  Exploration, and Master Takeshi's trials) are in Appendix D §D2–D3 and
  Appendix B §B15.

## A12. Quest rewards

Quests are authored with their dreams (Appendix B §B15). Each authored quest
names a reward kind from this table, and the amount follows its formula in the
giver's dream. The reward shows on the offer.

| Quest | Reward |
| --- | --- |
| Defeat, delivery, errand | One amulet of a resonance shown on the offer, or Essence `25 + 25 × a` |
| Lost object | Essence `50 + 25 × a` |
| Handicap trial | One exact pick from 3 bag cards with a Rare in the first slot when the bag has one, plus one amulet; enhanced, a pick from 5 |
| Avatar quest | That Avatar unlocked (Appendix B §B16) |
| Dreamsign slot quest | One Dreamsign slot |

A delivery hands over the requested owned copy, and is refused when it would
cross the collection floor.

## A13. Chests

A chest's contents are rolled when it's opened:

| Weight | Contents |
| --- | --- |
| 1/3 | One bag draw from eligible cards of `B` |
| 1/3 | Essence `5 × ((15 + 10 × a + U{0..30}) / 5)` |
| 1/3 | One amulet of a uniformly random resonance |

Chests never lock. About a quarter of chests stand behind a guardian's
chokepoint (Appendix B §B5).

Origin: Shandalar's dungeon cash chests and lair finds, folded into one table.

## A14. Prize duels

A prize duelist offers an unanted battle for prizes shown before acceptance.
Prizes are distinct Rares drawn from `B`; a bag with too few Rares fills with
Uncommons. The four variants have equal weight, with tiers relative to the
act's challenger tier `t` (Appendix B §B9):

| Variant | Prize | Opponent tier | Note |
| --- | --- | --- | --- |
| Duel of two | 2 Rares | `t` | |
| Duel of three | 3 Rares | `t + 3` | |
| Duel of four | 4 Rares | `min(t + 6, 20)` | |
| Duel with a champion | 2 Rares | `t + 3` | The opponent starts with one of its signature characters in play |

A win pays every prize. A loss or draw pays nothing, and the duelist leaves.

Origin: `RunRandomCreatureAnteDuel` and lair event codes for the rare-card
duels in `world_lair_monster_encounter.c`.

## A15. Guardian picks

A won guardian or incarnation battle pays the opponent's ante and exact picks
from the opponent's constructed deck:

| Opponent | Picks |
| --- | --- |
| Avatar guardian | 1 |
| Incarnation, in an act or in Limbo | 2 |

- Picks are distinct identities, excluding Legendary cards and the card the
  opponent anted.
- An incarnation's curated signature cards are eligible.
- The screen shows owned counts.
- Picked copies are plain.

Origin: `HandleDefeatedWizardCastle`, whose three castle picks come from a
color-filtered catalog. D97 picks from the guardian's own deck.

## A16. Keys and prizes

**Creating a key.** A key is created when it's paid: as a challenger extra
(A8), by the Act 4 or Act 5 incarnation, or by a finished key dream. Its
dream, tier, challenger count and prize are rolled then and shown on the key
(Appendix C §C5).

**The prize pool** has four kinds:

- **Legendary card:** a copy of each of the 8 Legendary cards the player owns
  fewer than four copies of, owned or not;
- **Legendary Dreamsign:** each of the 10 Legendary Dreamsigns the player
  doesn't own;
- **Avatar:** each locked Avatar;
- **Perfected card:** a Perfected copy of each supply card in the current
  Avatar's tide set that is eligible for Perfected and that the player owns
  fewer than four copies of, in any form.

Prizes shown on held or open keys count as owned. A new key's prize draws a
kind among the non-empty kinds by the catalog's prize-kind weights, then a
uniform prize within it. The weights are tunables in the D97 catalog and start
equal. Perfected cards keep the pool from emptying in practice; if it does
empty, keys carry no prize.

**Paying a prize.** A Legendary card arrives as a plain copy in reserve. A
Perfected card arrives in reserve with the Perfected transfiguration applied.
A Legendary Dreamsign joins the Dreamsign collection. An Avatar joins the
roster (Appendix B §B16).

Key prizes are the only source of Legendary cards and Legendary Dreamsigns.
Legendary cards can appear in opponents' decks from tier 13, but they are never
anted or picked.

## A17. Starting package

- **Essence:** `(5 − d) × 50`: 200 at `d = 1`.
- **Amulets:** `max(0, 3 − d)`: 2 at `d = 1`. Each amulet's resonance is drawn
  from the starting Avatar's tide set, weighted by each tide's card count.
- **Dreamsign slots:** 1.
- **Starting collection.** It's built with the opponent deck algorithm
  (`buildTideOpponentDeck`, "unified tide affinity") run on the bag's ring 1.
  All copies start in the active deck, and the player may bench down to the
  minimum of 25.

  1. **Context:** +1 per tide in the tide set.
  2. **Candidates:** the eligible cards of ring 1.
  3. **Iterative picks:** rank the remaining candidates by
     [cosine affinity to the context, rarity], draw uniformly from the top 25%
     (at least 5), add the picked card's tide vector to the context, and repeat
     until 30 cards are chosen.
  4. **Starter dilution:** cut the `3 + 2d` lowest-affinity picks (5 at
     `d = 1`) and add that many distinct Starter cards in seeded random order.

  The kept picks are drawn from the bag (A2). The starting collection holds
  one copy of each card.

Origin: `AddRandomStarterDeckCards` and `InitializeNewGameState`, which build a
random starter by color recipe, more mixed at higher difficulty.

## A18. Difficulty

The player chooses `d` at run start. It never changes during a run.

| | `d = 0` | `d = 1` (default) | `d = 2` | `d = 3` |
| --- | --- | --- | --- | --- |
| Opponent head start bonus | +0⍟ | +1⍟ | +2⍟ | +3⍟ |
| Starting Essence | 250 | 200 | 150 | 100 |
| Starting amulets | 3 | 2 | 1 | 0 |
| Starters in the starting collection | 3 | 5 | 7 | 9 |
| Score multiplier `m(d)` | ×0.5 | ×1 | ×1.5 | ×2 |
| Available | From the start | From the start | After beating Apollyon at `d = 1` | After beating Apollyon at `d = 2` |

The head start bonus applies to every opponent, Apollyon included. Unlocked
levels are stored with the player's profile, outside any run. The levels'
player-facing names are an open question.

Origin: Shandalar's difficulty term, which sets starting gold `(5 − d) × 50`,
opponent life and the starting deck's mix. D97 converts opponent life to a head
start and the deck mix to Starter count.

## A19. Score

When Apollyon falls, following Shandalar's structure:

```
score = m(d) × ( 2 × ( Σ over won campaign battles of (floor(T / 2) + 2)
                     + 25 × high-ante wins )
               + 40 × (30 − Apollyon's final score) )
```

Battles in key dreams before Apollyon's defeat count toward the sum. The
campaign score is fixed at Apollyon's defeat; the endgame keeps its own record
of key dreams finished and prizes owned.

Origin: `CalculateDungeonEndgameScore` (encounter class + 2 per victory, +25 per
special victory, all doubled) and the final `(100 − opponent life) × 10` bonus.
D97 uses tiers for encounter classes and the final score margin for the
opponent's life. Shandalar's siege and occupied-town terms have no D97 analog.
