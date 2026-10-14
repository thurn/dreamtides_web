# Appendix A: Economy algorithms

This appendix specifies every D97 economy algorithm: how cards, Essence and
amulets enter and leave the player's possession. Values are catalog tunables.
Each section names its Shandalar origin in the decompilation
(`~/shandalar-decomp/src/shandalar/src/`) and says where D97 departs from it.

[Back to the design overview](README.md)

## A1. Notation

- `d` — difficulty, 0 (Apprentice) to 3 (Wizard).
- `U{a..b}` — a uniform random integer from `a` to `b` inclusive. Every random
  draw is a seeded event-log draw, so reload and replay reproduce it.
- `t` — settlement tier: village 1, town 2, city 3.
- `P` — the campaign pool. `w(c)` is card `c`'s copy count in `P` (1 or 2).
- `R` — a realm. `φ(R)` is the slice it features (A2).
- `T` — a monster's tier.
- `W` — the world clock; `Σ` — the siege clock (Appendix B).
- `cost(card)` — rarity cost points: Common 1, Uncommon 2, Rare 3, Legendary 4.
- **Eligible cards** are the Common, Uncommon and Rare cards of `P` that are not
  current dungeon treasure. Legendary, Starter, Special and Tutorial cards never
  come from generators, shops or merchants.
- **A weighted draw** from a set picks card `c` with probability proportional to
  `w(c)`, as the draft engine weights offers by copies.
- Integer arithmetic truncates toward zero, in the order written, as in
  Shandalar.

## A2. The campaign pool and its slices

**The pool** (Q34) is the production tides4 pool for the player's Avatar,
generated at campaign start with seed `hash(campaignSeed : avatarId)`. The draw
is:

- join the signature tide (or the borrowed archetype's) and 1–3 drawn facets,
  with fill facets and neutral tides joined only while the deal needs copies;
- deal 150 copies, at most 2 per card and 1 per Legendary;
- exclude Starter cards.

The pool never changes during the campaign (Q35); it is an unlimited catalog of
its cards.

**Slices** (Q41) partition it for regional use:

- **Signature core:** pool cards in no joined facet tide.
- **Facet slice of F:** pool cards in joined facet tide F. Facet slices can
  overlap one another, but never the core.

Measured over 32 Avatars × 20 seeds:

| | Mean | 5th–95th percentile |
| --- | --- | --- |
| Distinct eligible pool cards | 100 | 89–113 |
| Signature core | 50 | 21–95 |
| Facet slice | 33 | 15–43 |
| Rares in the pool | 12 | 6–21 |
| Uncommons in the pool | 44 | — |
| Joined facets | 1: 28%, 2: 40%, 3: 13%, 4+: 19% | — |

**Featured slices** (Q36). The home realm features the core. The other four
realms take the joined facets in join order (drawn facets first, then fill),
cycling when there are fewer than four.

**Locality.** For realm `R`, a card is **featured** if it is in `φ(R)`,
**pooled** if it is in `P` but not `φ(R)`, and **outside** if it is not in `P`.
Only treasure Legendaries can be outside (Q39).

Origin: Shandalar's card colors, terrain colors and
`is_card_color_compatible_with_mask` (strict mode 1, loose mode 3).
The draft-pool generator is `generatePoolFromData`
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

**Buy quote** at a settlement of tier `t` in realm `R`:

```
x = v × (t + 2)
if c is pooled in R:  x = x × 3 / 2
quote = clamp(5 × (x / 50), 5, 1000)
```

The quote uses catalog values only. Transfigurations, spark bonuses and
keyword changes on a copy never change its price.

Resulting quotes for featured cards, median with the interquartile range:

| | Common | Uncommon | Rare | Legendary (sale only) |
| --- | --- | --- | --- | --- |
| Village | 20 (10–25), max 70 | 40 (35–50), max 130 | 80 (60–110), max 250 | 105 |
| Town | 25 (15–35), max 95 | 55 (45–70), max 175 | 110 (80–150), max 335 | 140 |
| City | 35 (20–45), max 120 | 70 (60–90), max 220 | 140 (100–190), max 420 | 180 |

Pooled cards cost half again as much.

Origin: `CalculateCardShopPrice` and the pricing loop in `RunTownServicesMenu`.
Shandalar derives `v0` from creature power and toughness, mana cost, an AI base
value and ability flags. D97 derives it from energy cost, spark and Fast, the
only comparable printed attributes. Shandalar's on-color, compatible and
off-color factors (×1, ×1.5, ×2) become featured, pooled and outside (Q40).

## A5. Sale quote and the resale guard

Selling is available in every settlement that is not captured:

```
y = v × (t + 2)
if c is pooled in R:   y = y × 4 / 3
if c is outside P:     y = y × 3 / 2
sale = 5 × (y / 50)                     (no clamp)
```

A featured card sells for exactly its buy quote in that settlement. Pooled and
outside cards sell at a premium. A looted card therefore sells best in a city
of a realm that doesn't feature it: up to 2.2 times its featured village
value.

**Resale guard.** A copy bought for Essence (card shop, lair merchant,
Duplication) sells for at most the Essence paid. A copy bought for amulets
sells for at most its buy quote in the settlement where it was bought. Copies
from bundles, lairs, quests, castles, treasure, spoils and the starting
collection sell freely.

**Limits.** Selling is refused when it would leave fewer owned copies than the
minimum deck size. A sold copy that a nearby monster holds as the player's
stake re-rolls that stake (A9).

Origin: `SellPrice`, called from the deck manager in `deckdll.c`. Shandalar
has no guard.

## A6. Card shop stock and restock

**Slot count.**
`n = min(t + 3 + [Haggler's Coin held] + [Tobias's home city], 8)`, giving
4, 5 or 6 before modifiers.

**Generation.** A slot is generated when a settlement's services open for the
first time, and an empty slot regenerates under the restock rule below. For
slot `i` (0-based), in realm `R`:

```
ceiling = (i mod 3) + 1        // Tobias's home city: min((i mod 3) + 2, 3)
pool    = eligible cards of φ(R) if i is even, eligible cards of P if i is odd
c       = weighted draw from { cards in pool with cost ≤ ceiling that the allowance permits (A7) }
```

If the even-slot set is empty, the slot draws from all eligible pool cards
instead. If that is also empty, it ignores the allowance. Duplicate offers
across slots are allowed. A ceiling permits every lower rarity, so slots 2 and
5 offer a Rare only some of the time. Each quote is fixed when its slot is
generated.

**Purchase.** The player buys any affordable subset, one copy per slot. The
copy enters reserve with its price recorded, and the slot empties and records
`stamp = W + U{0..4} × (d + 2)`.

**Restock.** When the player arrives at a settlement whose services last
opened at a *different* settlement, each empty slot with
`W − stamp ≥ 5 × (d + 3)` regenerates. Unsold slots never regenerate, and
leaving and re-entering a settlement refreshes nothing.

| | Apprentice | Magician | Sorcerer | Wizard |
| --- | --- | --- | --- | --- |
| Restock delay (clock units) | 15–23, mean 19 | 20–32, mean 26 | 25–41, mean 33 | 30–50, mean 40 |

A captured settlement keeps its stock frozen until liberated.

Origin: `RunTownServicesMenu` and the card purchase handler. Shandalar
nominates one random slot for basic lands and excludes artifacts from odd
slots; D97 has neither.

## A7. Copy allowance

```
allowance = 1 + [|active deck| ≥ 30] + [|active deck| ≥ 45] + [Tome of Enlightenment held]
eligible for a random draw ⇔ owned copies < allowance
```

The allowance applies to random generators:

- victory bundle draws after the stake card;
- card shop slots;
- lair ordinary finds;
- rare-card duel prizes and windfall Rares;
- card-granting Dreamtides events.

Player-directed acquisition ignores it: specialty merchants, lair exact-card
merchants, castle and quest picks, tribute and Duplication. Those screens show
owned counts. The starting collection holds distinct cards.

**Saturation.** A simulated campaign of 150 weighted draws at allowance 2 ends
owning copies of about 87% of the pool's identities.

Origin: `GetRemainingAllowedCardCopies` (1 copy below 40 active cards, 2 at 40,
3 at 60, plus the Tome). Shandalar's helper compares exact deck entries, so in
practice it counts active copies only; D97 counts the whole collection.

## A8. Victory bundles

After an ordinary win against a monster of tier `T` in realm `R`:

```
S = β + floor(T / 2)          // β = 1 (calibrated); Shandalar's typical base strength is 2
remaining = S; i = 0; bundle = []
while remaining > 0:
    if i == 0 and the opponent staked a card:
        c = the opponent's stake
    else:
        c = weighted draw from eligible cards of φ(R) if i is odd, else of P
        (an empty set falls back to P)
    bundle.append(c); remaining -= cost(c); i += 1
```

- The bundle is revealed after the win. The player takes all of it into
  reserve; there is no pick.
- **Clue alternative.** When the clue targeting rule (Appendix C §C3) yields a
  target, the reveal also offers one clue for that dungeon. Choosing the clue
  forfeits the whole bundle, including the stake card. Choosing the bundle sets
  the target's penalty flag.
- **Type mix** follows the copy-weighted pool (Q33). There is no separate
  Character/Event roll.

**Expected bundle size `E[N | S]`**, computed exactly from each pool's
copy-weighted rarity mix with the recurrence `E_i(b) = 0` for `b ≤ 0`,
otherwise `1 + Σ_c p_i(c) E_{i+1}(b − cost(c))`:

| `S` | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D97 mean over pools | 2.08 | 2.67 | 3.27 | 3.87 | 4.47 | 5.07 | 5.66 | 6.26 |
| D97 5th–95th percentile | 1.84–2.32 | 2.36–3.02 | 2.85–3.71 | 3.38–4.41 | 3.88–5.10 | 4.39–5.80 | 4.91–6.49 | 5.41–7.19 |
| Shandalar reference curve | 2.00 | 2.33 | 2.78 | 3.37 | 3.83 | 4.33 | 4.84 | 5.33 |

Common-heavy pools run largest. With `β = 1`, a tier-`T` D97 bundle tracks the
Shandalar curve at the same tier (base 2); Appendix E §E2 has the derivation.

**Amulet drop.** After an ordinary win, with probability
`p = (2 + floor(T / 2)) / 40`, the player gains one amulet of `R`. That is 10%
at tier 4, 17.5% at tier 10 and 27.5% at tier 18. The chance keeps Shandalar's
budget so amulet income is faithful.

**Spoils.** When no amulet dropped, with probability 1/3 roll `U{1..12}`:

- 1 — duplicate one owned copy of the player's choice (a plain copy);
- 2 — the next battle gives the player a head start of `U{1..4}`⍟;
- 3–12 — nothing.

**Origin:** the ordinary victory settlement and post-duel bonus code in
`world_lair_monster_encounter.c`:

- **Amulet roll:** `internal_rand(40) < S`.
- **Spoils:** the timer-gated `1 << internal_rand(12) & 0x1a19` roll, reduced
  to its outcomes with D97 analogs.
- **Draw alternation:** Shandalar's alternating strict and loose color
  compatibility becomes the featured slice and the whole pool.

## A9. Ante (stakes)

**When.** Ordinary, siege, liberation, dungeon and castle battles all stake
cards. Rare-card lair duels and the final battle do not.

**Rolled at spawn,** seeded from the monster's spawn event, and previewed on the
pre-battle screen:

- **Player's stake:** a uniform random copy of the active deck.
- **Opponent's stake** (Q39): a uniform random non-Legendary card of its
  constructed deck that is also in `P`. If its deck shares no card with `P`, the
  stake is a pool card instead: rank eligible cards by cosine affinity to the
  opponent's joined tides and draw uniformly from the top 25% (at least 5).

Declining and re-engaging the same monster never re-rolls the stakes.

**Stake drift.** If the player's staked copy has left the active deck when the
battle starts, it re-rolls among active copies whose sale value at the nearest
settlement is at least the original's. If there are none, it takes the
highest-value active copy. Unequipping a card never makes the stake cheaper.

**High-stakes encounters.** These stake three player copies against three
opponent stakes chosen by the same rule. They pay no bundle; a win pays the
three opponent stakes.

**Outcomes:**

| Battle | Win | Loss | Draw |
| --- | --- | --- | --- |
| Ordinary, siege defense | Opponent's stake leads the bundle (A8) | Player's stake removed | Nothing |
| High-stakes | Three opponent stakes | Three player stakes removed | Nothing |
| Liberation | Opponent's stake; town freed | Player's stake removed | Nothing |
| Dungeon or castle minion, lord | Route cleared; no cards | Player's stake removed; route blocked or expedition ended | Treated as a loss without the stake removal |

**What can be staked.** Transfigured copies, treasure and Legendary copies are
all eligible.

Origin: encounter setup and loss settlement in `world_lair_monster_encounter.c`
and `RunDungeonMonsterDuel`. Shandalar stakes a random active non-basic card
and excludes dungeon specials and the monster's signature card from the
opponent's stake.

## A10. Specialty merchants

- **Where.** Every town and city that is not captured; never villages.
- **Specialty** (Q38), assigned at campaign start (Appendix B §B4):
  - a **slice catalog**: the eligible cards of one slice of `P`, either the
    core or a joined facet, independent of the realm's featured slice; or
  - a **category catalog**: the eligible pool cards that are Characters,
    Events, Fast, cost ≤ 1, or cost ≥ 4.

  A category with fewer than 8 eligible pool cards is skipped when specialties
  are assigned. Sizes, as mean and 5th–95th percentile:

| Catalog | Mean | 5th–95th |
| --- | --- | --- |
| Signature core | 50 | 21–95 |
| Facet slice | 33 | 15–43 |
| Characters | 71 | 41–91 |
| Cost ≤ 1 | 32 | 25–39 |
| Events | 29 | 10–64 |
| Fast | 13 | 2–40 |
| Cost ≥ 4 | 11 | 8–16 |
- **Payment.** Amulets of the settlement's realm (Q37), whatever the catalog.
- **Prices.** Common 1, Uncommon 2, Rare 3 amulets for one exact copy.
  Legendaries and treasure are never listed.
- **Sessions.** Opening the merchant needs at least one amulet of the realm and
  `W − lastSession > 18 × (d + 3)` at that settlement: 54, 72, 90 or 108.
  Opening starts the cooldown even if nothing is bought. The player may buy
  repeatedly within a session while they can pay.
- **Allowance.** Not enforced; the browser shows owned counts and filters.

Origin: `BuyAnyCardFromTown` with a town's `trade_color_and_type`, and the
merchant gate in `RunTownServicesMenu`. Shandalar's four-basic-lands exception
has no D97 analog.

## A11. Dream Guide services

All three services are on cooldown at each settlement. Transfiguration and
Duplication allow one use per session, and a session needs
`W − lastSession ≥ 18 × (d + 3)`. The Bazaar runs on stock and restock
instead.

| Service | Standard | Enhanced (guide's home city) | Price |
| --- | --- | --- | --- |
| **Transfiguration** (Durgan Forgehammer) | 3 random untransfigured active-deck copies with an eligible form; every eligible form shown; apply one | Any owned untransfigured copy, any eligible form | Existing form prices, rolled when the session opens: Empowered and Kindled by stat change 10/30/50/70 ±20; Amplified 10 ±20; Inspired 20 ±20; Enduring and Resonant 50 ±30; Attuned 10 ±20; Hastened free; Perfected 100 |
| **Duplication** (Deacon Holt) | 3 random active-deck copies; copy one | Any owned copy | The card's buy quote at this settlement (A4). The copy is plain, with no per-copy modifications, and records the paid price for the resale guard |
| **Dreamsign Bazaar** (Amunet) | 3 Dreamsign slots, persistent like card stock | Restock delay halved | `5 × floor(base × (t + 2) / 20)`, base Common 50, Uncommon 100, Rare 200: village 35/75/150, town 50/100/200, city 60/125/250 |

- Bazaar offers exclude held Dreamsigns, world magic Dreamsigns and pending
  Dreamsigns. At the 12-Dreamsign cap, a purchase uses the existing
  replacement flow.
- Leaf Ledger allows two transfigurations per session, and Spell Tome keeps its
  copy-on-transfigure effect.
- The other guides' home cities host their enhanced lair events as services on
  the same cooldown (Appendix D §D2). Master Takeshi's home city posts bounties
  (A13).

Duplication is a card-creation channel. Its price, the full local buy quote,
makes a copy cost the same as buying a known card, and the per-town cooldown
bounds its rate.

## A12. World magic Dreamsigns

Each world magic Dreamsign is unique and belongs to one realm. It is sold once
at an assigned town or city in that realm, two per realm. Kind-0 sages reveal
where an unowned one is sold. It counts toward the 12-Dreamsign cap. If
replaced at the cap, it returns to its city for repurchase. Activated world
magic needs at least one amulet of its realm, and each use burns one with
probability `1/(4 − d)`.

| World magic | Kind | Effect | Proposed price |
| --- | --- | --- | --- |
| Haggler's Coin | Passive | +1 card shop slot everywhere (max 8) | 500 |
| Ring of the Guardian | Passive | A lord must hold 5 towns, not 3, to end the campaign | 600 |
| Tome of Enlightenment | Passive | +1 copy allowance | 400 |
| Sleight of Hand | Passive | +1 opening-hand card in every battle | 500 |
| Sword of Resistance | Passive | +1⍟ head start in every battle, outside the Dreamlink cap | 500 |
| Staff of Thunder | Passive | Monsters of tier ≤ 8 do not chase; they can still be engaged | 300 |
| Dwarven Pick | Passive | Rough ground costs 1 clock unit per tile | 300 |
| Quickening | Activated | Travel costs halve for the next 32 clock units | 300 |
| Leap of Fate | Activated | Travel at once to any visited settlement; the clock advances 8 | 400 |
| Conjurer's Will | Activated | Open the deck editor inside a dungeon or castle | 400 |

Origin: the twelve `WORLDMAGIC_*` powers, the world magic purchase at an
assigned city (`worldmagic_price / 2`), and activation in
`adventure_input.c` (`internal_rand(4 - difficulty) == 0` burns an amulet).
Shandalar's exact prices come from external data. Fruit of Sustenance and
Amulet of Swampwalk have no D97 analog, since D97 has no food or swamps.

## A13. Quest rewards

Quest generation and deadlines are in Appendix B §B12.

| Quest | Requirement | Reward |
| --- | --- | --- |
| Travel (link) | Reach the destination town or city by the deadline | Dreamlink with the destination |
| Travel (amulet) | Reach the destination by the deadline | 1 amulet of the destination's realm |
| Delivery | Bring one owned copy of the requested type (Character or Event) from the destination realm's featured slice | The copy is handed over; 1 amulet of the destination's realm and a Dreamlink with the destination |
| Bounty, village giver | Beat the named Avatar at its tier, then return | `floor((2 + floor(T/2)) / 7) + 1` amulets of the giver's realm (1 at tier ≤ 8, 2 at tier 10+), plus a Dreamlink with the giver village. A village Dreamlink gives no head start; a linked village always offers travel or delivery quests (Appendix B §B12) |
| Bounty, town or city giver | Same | One exact card chosen from the giver's specialty catalog |
| Bounty, Master Takeshi | Same | One exact card from any slice of `P` the player names |

Origin: town quest completion in `visitLocation.c`. Shandalar's bounty amount
is `floor(monster field / 7) + 1`; D97 substitutes the tier's Shandalar budget.

## A14. Lair economics

Lair outcome weights are in Appendix B §B11. These are the economic outcomes:

- **Ordinary find:** one weighted draw from the eligible cards of `φ(R)`.
- **Essence windfall:** if `Σ < 128` or a coin flip succeeds, +500 Essence.
  Otherwise Essence halves (rounded down) and the player gains one random
  eligible Rare, from `φ(R)` if it has one, else from `P`.
- **Amulet treasure:** if `Σ < 128` or a coin flip succeeds, +1 amulet of each
  realm. Otherwise each balance `a` becomes `(a + 1) / 2`, and the player gains
  one random eligible Rare as above.
- **Amulet vendor:** buy amulets of any realm for 200 Essence each, repeatedly
  during the visit.
- **Exact-card Essence merchant:** the player picks any eligible card of `P`,
  and may buy repeatedly during the visit. The quote is:

```
x = v × 4
if the card is pooled in R: x = x × 3 / 2
x = x × 1250 / (750 + j),  j = U{0..96} rolled per visit
quote = max(clamp(5 × (x / 50), 5, 1000), 50 × cost(card))
```

  That is roughly 1.2–1.3 times a city quote.
- **Exact-card amulet merchant:** any eligible card of `P` for `cost(card)`
  amulets, each debited from a random held realm.
- **Rare-card duel:** the prize is displayed before acceptance and nothing is
  staked. A win pays every prize card; a loss or draw pays nothing, and the
  lair is consumed. Prizes are distinct eligible Rares, from `φ(R)` first and
  then from `P`; a pool with too few Rares fills with Uncommons. The four
  variants have equal weight:

| Variant | Prize | Opponent tier | Note |
| --- | --- | --- | --- |
| Duel of two or three | 2 Rares (3 when `Σ ≥ 256`) | 8 (13 when `Σ ≥ 256`) | |
| Duel of four | 4 Rares | 18 | |
| Duel with a champion | 2 Rares | 13 | The opponent starts with one of its signature characters in play |
| Duel of three | 3 Rares | 13 | |

Origin: lair event codes 7–18 in `world_lair_monster_encounter.c` and
`RunRandomCreatureAnteDuel`.

## A15. Dungeon treasure and chests

- **Treasure room.** It grants one uniformly random remaining treasure item of
  that dungeon (up to 100 random slot tries, as in Shandalar). The item is an
  owned copy with provenance `treasure`, and its slot empties for the rest of
  the campaign.
- **Cash chest,** when the dungeon has no treasure left:
  - Essence `10 × floor((100 + U{0..99} × (d + 2)) / 10)`, with means 195,
    244, 294 and 345 by difficulty;
  - each of the five realm amulets independently with probability 1/2, mean
    2.5.

Origin: dungeon room resolution in `dungeonEncounter.c`.

## A16. Castle rewards and liberation

- **Castle victory** (Q43). Three separate picks, each one exact card from the
  eligible cards of the castle realm's featured slice, with distinct identities
  across the three. The allowance is ignored. (`HandleDefeatedWizardCastle`.)
- **Liberation.** Beating a captured town's occupier pays the occupier's stake
  card and frees the town; its Dreamlink stays cut.
- **Siege defense.** Beating a siege attacker is an ordinary win (A8).

## A17. Starting package

- **Essence:** `(5 − d) × 50`.
- **Amulets:** one of the home realm, plus `3 − d` drawn uniformly from the
  five realms, with repeats allowed.
- **Starting collection** (Q42). It's built with the opponent deck algorithm
  (`buildTideOpponentDeck`, "unified tide affinity") run on the player's own
  pool. All copies start in the active deck, and the player may bench down to
  the minimum.

  1. **Context:** +1 per tide joined by `P`.
  2. **Candidates:** the distinct non-Legendary cards of `P`.
  3. **Iterative picks:** rank the remaining candidates by
     [cosine affinity to the context, rarity], draw uniformly from the top 25%
     (at least 5), add the picked card's tide vector to the context, and repeat
     until the size below is reached.
  4. **Starter dilution:** cut the `k` lowest-affinity picks and add `k`
     distinct Starter cards in seeded random order.

| `d` | Distinct cards | Starter dilution `k` |
| --- | --- | --- |
| 0 | 30 | 0 |
| 1 | 32 | 5 |
| 2 | 34 | 8 |
| 3 | 36 | 10 |

  The starting collection holds one copy of each card. Harder difficulties
  start with more generic Starter cards, as early opponents do.

Origin: `AddRandomStarterDeckCards` and `InitializeNewGameState`, which build a
random starter by color recipe, more mixed at higher difficulty, and add 13–18
basic lands. D97 reaches the same difficulty curve through Starter dilution.

## A18. Score

On campaign victory, using Shandalar's structure:

```
score = 2 × ( Σ over wins of (floor(T / 2) + 2)
            + 25 × high-stakes wins
            − 3 × sieges started
            − 6 × towns held by lords at the end )
      + 40 × (25 − Apollyon's final score)
```

Origin: `CalculateDungeonEndgameScore` (encounter class + 2 per victory, +25 per
special victory, −3 per siege, −6 per occupied town, all doubled) and the final
`(100 − opponent life) × 10` bonus. D97 uses tier classes for encounter
classes and the final score margin for the opponent's life.
