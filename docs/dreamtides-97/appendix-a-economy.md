# Appendix A: Economy algorithms

This appendix specifies every D97 economy algorithm: how cards, Essence and
amulets enter and leave the player's possession. Values are catalog tunables.
Where D97 keeps a Shandalar rule, the section names its origin in the
decompilation (`~/shandalar-decomp/src/shandalar/src/`) and says where D97
departs from it.

[Back to the design overview](README.md)

## A1. Notation

- `d` — the difficulty term, fixed at 1 (Shandalar's Magician) and kept as a
  tunable.
- `U{a..b}` — a uniform random integer from `a` to `b` inclusive. Every random
  draw is a seeded event-log draw, so reload and replay reproduce it.
- `depth` — a dream's depth in the generated network (Appendix B §B2).
- `b` — a dream's **price band**: 1 at depth 0–1, 2 at depth 2–3, 3 at depth 4
  or more. It plays the role of Shandalar's settlement tier.
- `P` — the reward pool (A2). `w(c)` is card `c`'s copy count in `P` (1 or 2).
- `T` — an opponent's tier (Appendix B §B7).
- `cost(card)` — rarity cost points: Common 1, Uncommon 2, Rare 3, Legendary 4.
- **Eligible cards** are the Common, Uncommon and Rare cards of `P`.
  Legendary, Starter, Special and Tutorial cards never come from generators,
  traders or merchants.
- **A weighted draw** from a set picks card `c` with probability proportional to
  `w(c)`, as the draft engine weights offers by copies.
- Integer arithmetic truncates toward zero, in the order written.

## A2. The reward pool

**The deal.** The reward pool is the production tides4 pool for the player's
current Avatar, generated with seed `hash(runSeed : avatarId)`:

- join the signature tide (or the borrowed archetype's) and 1–3 drawn facets,
  with fill facets and neutral tides joined only while the deal needs copies;
- deal 150 copies, at most 2 per card and 1 per Legendary;
- exclude Starter cards.

The pool is an unlimited catalog of its cards: drawing a card never removes it.

**Switching.** When the player switches Avatar (Appendix B §B14), the reward
pool becomes the new Avatar's deal. Because the seed depends only on the run
and the Avatar, each Avatar always has the same deal within a run.

**Rolled at first reveal.** Pool-drawn contents are rolled from the current
pool when they're first revealed, then fixed:

| Content | Rolled when |
| --- | --- |
| Trader stock | The trader is first opened |
| Victory bundle | The battle is won |
| Chest card | The chest is opened |
| Prize duel prizes | The duelist is first previewed |
| Quest card picks | The quest is completed |

A later Avatar switch never changes contents already rolled.

**Measured shape,** over 32 Avatars × 200 seeds: 101 distinct cards on average
(85–121), about 48 at two copies, about 12 Rares (6–21), 0–3 Legendaries, and
71% Characters.

Origin: the draft-pool generator `generatePoolFromData`
(`src/draft/pool/variant-tides4.ts`).

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

Every trader buys owned copies:

```
sale = 5 × (v × (b + 2) / 50)            (no clamp)
```

A card sells for its unclamped buy quote in that dream, so deeper traders pay
more.

**Resale guard.** A copy bought for Essence (trader, Card Shop, Duplication)
sells for at most the Essence paid. A copy bought for amulets sells for at most
its band-1 buy quote. Copies from bundles, stakes, guardian picks, chests,
prize duels, quests, the Legendary dream and the starting collection sell
freely.

**Limits.** Selling is refused when it would leave fewer owned copies than the
minimum deck size. Selling a copy that is a pending stake re-rolls that stake
(A9).

Origin: `SellPrice`, called from the deck manager in `deckdll.c`. Shandalar
has no guard.

## A6. Trader stock

**Slot count.** `n = b + 3`: 4, 5 or 6.

**Generation.** A trader's stock is rolled when the trader is first opened. For
slot `i` (0-based):

```
ceiling = (i mod 3) + 1
c       = weighted draw from { eligible cards with cost ≤ ceiling that the allowance permits (A7) }
```

If that set is empty, the slot ignores the allowance. Duplicate offers across
slots are allowed. A ceiling permits every lower rarity, so slots 2 and 5 offer
a Rare only some of the time. Each quote is fixed when its slot is generated.

**Purchase.** The player buys any affordable subset, one copy per slot. The
copy enters reserve with its price recorded, and the slot stays empty. Trader
stock never restocks; a run's supply of trader offers is its traders' slots.

Origin: `RunTownServicesMenu` and the card purchase handler. Shandalar
alternates on-color and loose slots and restocks on the world clock; D97 draws
every slot from the whole pool and has no clock.

## A7. Copy allowance

```
allowance = 1 + [|active deck| ≥ 30] + [|active deck| ≥ 45]
eligible for a random draw ⇔ owned copies < allowance
```

The allowance applies to random generators:

- victory bundle draws after the stake card;
- trader slots;
- chest cards;
- prize duel prizes;
- card-granting Dreamtides events.

Player-directed acquisition ignores it and shows owned counts: amulet
merchants, guardian picks, opponent stakes, quest picks and Duplication. The
starting collection holds distinct cards. Decks have no copy cap.

Origin: `GetRemainingAllowedCardCopies` (1 copy below 40 active cards, 2 at 40,
3 at 60, plus 1 with the Tome of Enlightenment). D97 lowers the thresholds to
match Dreamtides deck sizes and counts the whole collection, not only the
active deck.

## A8. Victory bundles and extras

**Bundle.** After a won challenger battle at tier `T`:

```
S = β + floor(T / 4)          // β = 0 (calibrated, Appendix E §E2)
remaining = S; i = 0; bundle = []
while remaining > 0:
    if i == 0:
        c = the opponent's stake
    else:
        c = weighted draw from eligible cards of P that the allowance permits
        (an empty set ignores the allowance)
    bundle.append(c); remaining -= cost(c); i += 1
```

- The bundle is revealed after the win, and the player takes all of it into
  reserve; there is no pick.
- The stake leads the bundle, and its rarity counts against the budget.
- **Type mix** follows the copy-weighted pool. There is no separate
  Character/Event roll.

**Expected bundle size `E[N | S]`**, including the stake, from the measured
pool rarity mix (44% Common, 44% Uncommon, 12% Rare):

| Tier | 4–7 | 8–11 | 12–15 | 16–19 |
| --- | --- | --- | --- | --- |
| Budget `S` | 1 | 2 | 3 | 4 |
| `E[N]` | 1.00 | 1.44 | 2.08 | 2.67 |

**Extra.** At generation, each challenger gets one advertised extra, shown on
its preview and paid on a win:

- **Essence purse** (probability 3/4): `5 × (1 + floor(T / 4))` Essence, so 10
  at tier 4, 15 at tier 8, 20 at tier 12 and 25 at tier 16;
- **Amulet** (probability 1/4): one amulet whose resonance is drawn from the
  challenger's joined tides, weighted by each tide's card count.

Guardians, keepers and prize duelists have no extra.

**Origin:** the ordinary victory settlement in `world_lair_monster_encounter.c`.
Shandalar's budget is `strength + floor(T / 2)`, and its wins pay no gold; an
amulet drops with chance budget ÷ 40. D97 lowers the budget slope because every
D97 challenger pays a bundle, where about half of a Shandalar run's battles
were cardless dungeon and castle fights. It replaces the random amulet drop
with the advertised extra.

## A9. Ante (stakes)

**Which battles stake.** Challenger, high-stakes, guardian, Limbo incarnation
and Legendary keeper battles. Prize duels and the battle against Apollyon
don't.

**Rolled at first preview,** seeded from the preview event, and shown on every
later preview:

- **Player's stake:** a uniform random copy of the active deck.
- **Opponent's stake:** a uniform random non-Legendary card of its constructed
  deck. A Legendary keeper stakes its Legendary instead (A16).

Walking away and returning never re-rolls the stakes.

**Stake drift.** If the player's staked copy has left the active deck when the
battle starts, it re-rolls among active copies whose sale value in this dream
is at least the original's. If there are none, it takes the highest-value
active copy. Unequipping a card never makes the stake cheaper.

**High stakes.** Each challenger of tier 12 or more is high-stakes with
probability 1/10. Each side stakes three cards, chosen by the same rules.

**Outcomes:**

| Battle | Win | Loss | Draw |
| --- | --- | --- | --- |
| Challenger | Opponent's stake leads the bundle (A8); the extra | Player's stake removed; rematch allowed | Nothing; rematch allowed |
| High-stakes challenger | Three opponent stakes and the extra; no bundle | Three player stakes removed; rematch allowed | Nothing |
| Guardian or Limbo incarnation | Opponent's stake and picks (A15) | Player's stake removed; retry allowed | Nothing |
| Legendary keeper | Its Legendary (A16) | Player's stake removed; rematch allowed | Nothing |

A rematch keeps the original stakes. Won stakes are plain copies of the catalog
card. **What can be staked:** transfigured copies, picks, stakes and Legendary
copies are all eligible.

Origin: encounter setup and loss settlement in `world_lair_monster_encounter.c`.
Shandalar limits the opponent's stake to cards it doesn't treat as special; D97
lets any non-Legendary card of the opponent's deck be staked, so stakes reach
outside the player's pool.

## A10. Amulets and amulet merchants

**Amulets** come in the five resonances: Wild, Valor, Ember, Shadow and Vision.

**Resonance cores.** Each resonance has a curated core of 20–40 cards, stored
as a catalog module beside the cards and keyed by card UUID. Cores:

- never overlap;
- exclude Legendary, Starter, Special and Tutorial cards;
- are authored from the tides of that resonance, starting from the cards whose
  tide memberships weigh most toward it, and adjusted by hand to match the
  resonance's identity (README).

A core can include cards outside the player's reward pool; that's its purpose.

**Amulet merchants.**

- **Catalog.** A merchant serves one resonance and sells exact copies from its
  core.
- **Price.** Common 1, Uncommon 2, Rare 3 amulets of that resonance.
- **Use.** The player may buy at any time, repeatedly, while able to pay.
  Merchants have no stock or cooldown.
- **Allowance.** Not enforced; the catalog shows owned counts and filters.

**Amulet changers** sell one amulet of any resonance for 250 Essence,
repeatedly.

**Amulet tolls.** Some doors open by spending one amulet of the door's
resonance (Appendix B §B4).

Origin: `BuyAnyCardFromTown` with a town's `trade_color_and_type`, and the lair
amulet vendor. Shandalar's catalogs are color or card-type specialties of its
whole card list; D97's are the resonance cores.

## A11. Dream Guide services

Every guide appearance is a one-use site (Appendix B §B11). Prices:

| Service | Standard | Enhanced | Price |
| --- | --- | --- | --- |
| **Card Shop** (Tobias Tanglefur) | A trader stock of 5 slots (A6) | 6 slots; slot ceilings start at Uncommon | Buy quotes (A4) |
| **Transfiguration** (Durgan Forgehammer) | 3 random untransfigured active-deck copies with an eligible form; every eligible form shown; apply one | Any owned untransfigured copy, any eligible form | Existing form prices, rolled when the site opens: Empowered and Kindled by stat change 10/30/50/70 ±20; Amplified 10 ±20; Inspired 20 ±20; Enduring and Resonant 50 ±30; Attuned 10 ±20; Hastened free; Perfected 100 |
| **Duplication** (Deacon Holt) | 3 random active-deck copies; copy one | Any owned copy | The card's buy quote in this dream (A4). The copy is plain and records the paid price for the resale guard |
| **Dreamsign Bazaar** (Amunet, the Tomb-Keeper) | 3 Dreamsigns for Essence | 4 Dreamsigns | `5 × floor(base × (b + 2) / 20)`, base Common 50, Uncommon 100, Rare 200: band 1 35/75/150, band 2 50/100/200, band 3 60/125/250 |

- Bazaar offers exclude held and pending Dreamsigns. At the 12-Dreamsign cap,
  a purchase uses the existing replacement flow.
- Leaf Ledger allows two transfigurations per Transfiguration site, and Spell
  Tome keeps its copy-on-transfigure effect.
- The other guides' sites (Revelation, Augury, Random Site, Gamble,
  Exploration, and Master Takeshi's trials) are in Appendix D §D2–D3.

## A12. Quest rewards

Quest generation is in Appendix B §B13. Each quest's reward is fixed at
generation and shown on the offer.

| Quest | Reward |
| --- | --- |
| Defeat, delivery, errand | One amulet of a resonance shown on the offer, or Essence `25 + 25 × depth` of the giver's dream |
| Handicap trial | One exact pick from 3 eligible pool cards with a Rare in the first slot when the pool has one, plus one amulet |
| Collector request | Two amulets of the named core's resonance, or of the named tide's resonance |
| Lost object | Essence `75 + 25 × depth`, or a hidden door revealed |
| Avatar quest | That Avatar unlocked (Appendix B §B14) |
| Key quest | A key to a named key-locked door, or a hidden door revealed |
| Legendary fragment chain | The key to the Legendary dream (Appendix C §C5) |

A delivery hands over the requested owned copy. A collector request leaves the
counted cards with the player.

## A13. Chests

A chest's contents are rolled when it's opened:

| Weight | Contents |
| --- | --- |
| 1/2 | One weighted draw from eligible cards of `P` that the allowance permits |
| 1/4 | Essence `5 × ((25 + 15 × depth + U{0..50}) / 5)` |
| 1/4 | One amulet of a uniformly random resonance |

About a quarter of chests are locked: by the dream's guardian, or by a quest
key (Appendix B §B10).

Origin: Shandalar's dungeon cash chests and lair finds, folded into one table.

## A14. Prize duels

A prize duelist offers an unstaked battle for prizes shown before acceptance.
Prizes are distinct eligible Rares of `P`; a pool with too few Rares fills with
Uncommons. The four variants have equal weight:

| Variant | Prize | Opponent tier | Note |
| --- | --- | --- | --- |
| Duel of two | 2 Rares | 8 | |
| Duel of three | 3 Rares | 13 | |
| Duel of four | 4 Rares | 18 | |
| Duel with a champion | 2 Rares | 13 | The opponent starts with one of its signature characters in play |

A win pays every prize. A loss or draw pays nothing, and the duelist leaves.

Origin: `RunRandomCreatureAnteDuel` and lair event codes for the rare-card
duels in `world_lair_monster_encounter.c`.

## A15. Guardian picks

A won guardian or Limbo incarnation battle pays the opponent's stake and exact
picks from the opponent's constructed deck:

| Opponent | Picks |
| --- | --- |
| Avatar guardian | 2 |
| Incarnation guardian, or Limbo incarnation | 3 |

- Picks are distinct identities, excluding Legendary cards and the card the
  opponent staked.
- An incarnation's curated signature cards are eligible.
- The allowance is ignored; the screen shows owned counts.
- Picked copies are plain.

Origin: `HandleDefeatedWizardCastle`, whose three castle picks come from a
color-filtered catalog. D97 picks from the guardian's own deck.

## A16. Legendary stakes

At generation, the eight Legendary cards are assigned one each to the seven
Legendary keepers and the Legendary dream's guardian (Appendix C §C5). Each
stakes its assigned Legendary instead of a random deck card. A win pays only
that Legendary. The guardian also pays its two picks.

The Legendary dream is the only source of Legendary cards. Legendaries can
appear in opponents' decks at tier 12 and above, but they are never staked or
picked there.

## A17. Starting package

- **Essence:** 200, Shandalar's Magician value `(5 − d) × 50`.
- **Amulets:** 2, each of a resonance drawn from the starting Avatar's joined
  tides, weighted by each tide's card count.
- **Starting collection.** It's built with the opponent deck algorithm
  (`buildTideOpponentDeck`, "unified tide affinity") run on the player's own
  reward pool. All copies start in the active deck, and the player may bench
  down to the minimum of 27.

  1. **Context:** +1 per tide joined by `P`.
  2. **Candidates:** the distinct non-Legendary cards of `P`.
  3. **Iterative picks:** rank the remaining candidates by
     [cosine affinity to the context, rarity], draw uniformly from the top 25%
     (at least 5), add the picked card's tide vector to the context, and repeat
     until 32 cards are chosen.
  4. **Starter dilution:** cut the 5 lowest-affinity picks and add 5 distinct
     Starter cards in seeded random order.

  The starting collection holds one copy of each card.

Origin: `AddRandomStarterDeckCards` and `InitializeNewGameState`, which build a
random starter by color recipe, more mixed at higher difficulty.

## A18. Score

On victory, following Shandalar's structure:

```
score = 2 × ( Σ over won battles of (floor(T / 2) + 2)
            + 25 × high-stakes wins )
      + 40 × (25 − Apollyon's final score)
```

Origin: `CalculateDungeonEndgameScore` (encounter class + 2 per victory, +25 per
special victory, all doubled) and the final `(100 − opponent life) × 10` bonus.
D97 uses tiers for encounter classes and the final score margin for the
opponent's life. Shandalar's siege and occupied-town terms have no D97 analog.
