# Dreamtides 97: Game Design Document

**Status:** design proposal for a future game mode. It is not part of the
active implementation plan in [`docs/plan/`](../plan/README.md), and nothing
here changes the binding decisions in
[`docs/plan/decisions.md`](../plan/decisions.md). Every number on these pages
is a catalog tunable (decision D32); the values given are starting proposals
for simulation and playtest.

Dreamtides 97 ("D97") is a long-form campaign mode for the Dreamtides web
client. It recreates the experience of *Magic: The Gathering* (MicroProse,
1997), commonly called *Shandalar*, using Dreamtides battles, cards, Avatars,
Dreamsigns, transfigurations and site encounters. The player walks a character
across a persistent overworld, owns a growing collection, builds a deck from it,
and defeats five castle lords and Apollyon.

**The campaign pool.** Every card the player can acquire comes from one fixed
**campaign pool**: the playtested tides4 pool for the chosen Avatar, dealt
once at campaign start. It holds 150 copies, about 101 distinct cards. D97
emulates Shandalar's economy around it closely:

- card income comes from the same channels at roughly the same rate per battle;
- Essence (gold) comes from selling cards and treasure, not from winning;
- regional amulets buy exact cards from specialty merchants.

## How to read this document

This page is the design overview. The appendices hold the algorithms and
tables:

| Appendix | Contents |
| --- | --- |
| [A: Economy algorithms](appendix-a-economy.md) | The campaign pool and its slices, prices, selling, shop stock and restock, copy allowance, victory bundles, ante, amulets, merchants, services, world magic, quests, chests, the starting package, score |
| [B: Overworld, encounters and sieges](appendix-b-overworld.md) | Map generation, realms and featured slices, settlements, the clock, travel, spawning, rosters and tiers, battle setup, Dreamlinks, quests, the sage, lairs, sieges |
| [C: Dungeons, clues and castles](appendix-c-dungeons-and-castles.md) | Treasure seeding, clues and clue targeting, expedition boards, events, dungeon rules, castles, Incarnations, the final battle |
| [D: Reusing Dreamtides content](appendix-d-content-reuse.md) | How every existing site, Dream Guide, Avatar, Dreamsign, transfiguration, Exploration and Augury outcome fits D97, including exclusions |
| [E: Acquisition-rate calibration](appendix-e-calibration.md) | Shandalar reference rates, expected bundle sizes, the per-campaign card, Essence and amulet ledgers, and the measurement plan |

Research inputs, outside this repository:

- `~/shandalar-decomp/docs/research/shandalar-economy-and-dreamtides-report.md`
- `~/shandalar-decomp/docs/research/shandalar-journey-apprentice.md`
- `~/shandalar-decomp/docs/research/shandalar-journey-magician.md`
- `~/shandalar-decomp/docs/research/shandalar-journey-highest-difficulty.md`
- The Shandalar decompilation in `~/shandalar-decomp/src/shandalar/src/`.
  Appendices cite its functions by name.

## Design pillars

1. **The collection is the long-term state.** Players own more cards than they
   play. A new card is a choice, not a forced deck addition; reserve cards
   prepare for dungeon rules, fund purchases and feed quests.
2. **One coherent pool per campaign.** All supply comes from the Avatar's
   tides4 pool. The pool's slices give each realm its own flavor of the same
   coherent card set.
3. **Many acquisition channels, each with its own degree of control.** Victory
   bundles are cheap and random, shops are known and limited, amulet merchants
   are exact and scarce, dungeon treasure is finite and previewed, and castle
   rewards are exact and large.
4. **Selling is how cards become money.** Wins pay cards, not Essence. Unwanted
   cards sell at full value, so loot is liquid, and where you sell sets the
   price.
5. **Information competes with cards.** A victory can be traded for a dungeon
   clue that points at specific, rare treasure.
6. **The world ages.** Movement advances a clock that drives restocks,
   cooldowns, quest deadlines and the castle lords' sieges. Farming has an
   opportunity cost.
7. **Losses hurt but do not end the campaign.** A lost battle costs the staked
   card. Only sieges, or the five lords' victory, end a campaign in defeat.
8. **Reuse Dreamtides content.** Every card, Avatar, transfiguration, the
   tides4 pool, and most Dreamsigns and site encounters appear. Sites are
   rehomed as town services and lair events.
9. **Encounters are opt-in.** Monsters chase the player as in Shandalar, but
   every pre-battle screen offers a free Decline.

## The campaign at a glance

1. **Setup.** The player chooses a difficulty and any Avatar. The game deals the
   campaign pool, generates a world whose five realms each feature a slice of
   that pool, and builds a starting collection, Essence and amulets.
2. **Overworld loop.** Walk between towns. Shop, sell, take quests, use Dream
   Guide services, and accept or decline the monsters that chase you. Explore
   lairs and follow clues to dungeons.
3. **Expeditions.** Enter a dungeon with a prepared deck. Fight through a maze
   for finite, previewed treasure; retreat at any time.
4. **Castles.** Each realm's Incarnation of Apollyon rules a castle. Winning
   its gauntlet frees its towns, quiets its realm and grants three chosen cards
   from the realm's slice.
5. **Pressure.** Undefeated lords besiege towns on the siege clock. A lord who
   holds three towns ends the campaign.
6. **Finale.** With all five castles fallen, the player prepares a deck and
   fights Apollyon. Victory ends the campaign with a score.

Target shape (decision Q1): 55–65 battles and 15–20 hours for a successful
campaign, with the collection growing from about 30–36 cards to about 100–125.
By the end the player owns copies of most of the pool. Each campaign deals a
fresh pool and starts a fresh collection; D97 has no meta-progression.

## Glossary

D97 keeps Shandalar's words (decision Q29). Only gold and mana links take
Dreamtides names.

| Term | Meaning in D97 | Shandalar origin |
| --- | --- | --- |
| **Campaign pool** | The tides4 pool dealt for the player's Avatar at campaign start: 150 copies, about 101 distinct cards. All supply comes from it. | The whole card catalog |
| **Slice** | A part of the pool: the **signature core** (pool cards in no joined facet tide) or a **facet slice** (pool cards in one joined facet tide). | Color |
| **Featured slice** | The slice a realm favors in shop stock, bundles, lair finds, prices and castle rewards. | Terrain color |
| **Essence** | The general currency. | Gold |
| **Amulet** | A currency token of one realm, spent at that realm's specialty merchants. | Amulets of the five colors |
| **Realm** | One of five regions of the overworld, each featuring one slice. Realm names and art use the five resonances cosmetically. | Terrain color |
| **Collection** | Every owned card copy. | Deck array |
| **Active deck** | The owned copies equipped for battle. | Active deck |
| **Reserve** | Owned copies not in the active deck. | Reserve (flag 0x4000) |
| **Village, town, city** | Settlement tiers 1, 2 and 3. | Location types 1–3 |
| **Card shop** | A town's persistent stock of priced single cards. | Town shop |
| **Specialty merchant** | Sells exact cards from a slice or category for amulets. | Amulet merchant |
| **Sage** | Free, fixed-kind advice in each settlement. | Wise man |
| **Monster** | A roaming opponent: an Avatar at some tier. | Roaming creature |
| **Tier** | A monster's strength class (4–18, castle lords 20). | Creature tier |
| **Victory bundle** | The cards a won ordinary battle pays. | Reward bundle |
| **Ante** | The cards each side stakes on a battle. | Ante |
| **Lair** | A one-shot discovery in a roaming slot. | Lair |
| **Dungeon** | A maze expedition holding finite treasure. | Dungeon |
| **Clue** | One fact about a dungeon: location, guardians or rules. | Dungeon clue |
| **Castle** | A realm lord's stronghold. | Wizard castle |
| **Incarnation** | A castle lord, one of Apollyon's ten incarnations. | Wizard |
| **Siege** | A lord's attack on a town. | Siege |
| **Dreamlink** | A bond with a town or city that gives a head start in battle. | Mana link |
| **Head start** | Points (⍟) a side begins a battle with. | Starting life |
| **World magic** | A Dreamsign with a campaign-wide effect, sold once in an assigned city. | World magic |
| **Clock** | The world clock, advanced by travel. | Economy clock |

Difficulty levels keep Shandalar's names: **Apprentice** (d = 0),
**Magician** (1), **Sorcerer** (2) and **Wizard** (3).

## Player identity and difficulty

- **Avatar.** The player chooses any Avatar from the full roster (Q5). It is in
  play in every battle, as in the journey mode, and determines the campaign
  pool. Exploration outcomes that offer an Avatar choice can still swap the
  Avatar; the pool stays as dealt.
- **Home realm.** The player starts in the realm that features the signature
  core. A signatureless Avatar's core comes from the archetype its pool
  borrowed.
- **Difficulty** (Q7) feeds almost every economy constant through `d`:

| | Apprentice | Magician | Sorcerer | Wizard |
| --- | --- | --- | --- | --- |
| Starting collection, distinct cards | 30 | 32 | 34 | 36 |
| Starter cards diluted into it (Q42) | 0 | 5 | 8 | 10 |
| Minimum deck size (Q32) | 25 | 27 | 30 | 30 |
| Starting Essence, `(5 − d) × 50` | 250 | 200 | 150 | 100 |
| Starting amulets, `4 − d` (1 home + random) | 4 | 3 | 2 | 1 |
| Shop restock delay, `U{0..4}·(d+2) + 5·(d+3)` | 15–23 | 20–32 | 25–41 | 30–50 |
| Merchant and service cooldown, `18·(d+3)` | 54 | 72 | 90 | 108 |
| Quest offer cooldown, `16·(d+3)` | 48 | 64 | 80 | 96 |
| Dungeon event period on first entry | 5 | 4 | 3 | 2 |
| World magic amulet burn, `1/(4 − d)` | 25% | 33% | 50% | 100% |

The AI plays at full strength at every difficulty (decision D24); difficulty
changes economy constants, the starting collection, opponent deck construction
and opponent head starts. See
[Appendix A](appendix-a-economy.md#a17-starting-package) for the starting
collection and
[Appendix B](appendix-b-overworld.md#b7-rosters-tiers-and-opponent-construction)
for opponent tuning.

## Collection and deck

- **Owned copies.** Every acquisition creates an owned copy with its own UUID,
  the catalog card UUID, per-copy modifications (transfiguration, spark bonus,
  keyword and type changes) and provenance: source, clock time and, for bought
  copies, the price paid. Names are display text only.
- **Active deck and reserve.** New copies enter reserve. Equipping and
  unequipping are free and change no ownership.
- **Where you can edit.** Anywhere on the overworld; not inside a dungeon or
  castle. Selling happens only in settlements.
- **Deck size.** At least the difficulty's minimum (25/27/30/30); no maximum.
  Battles never pad a legal deck.
- **Copies.** There is no deck copy cap (Q4, Q35). The pool is an unlimited
  catalog; random draws are weighted by each card's pool copies (1 or 2).
  Random generators respect a supply-side **copy allowance**: they skip a card
  the player already owns `allowance` copies of. The allowance is 1, plus 1 when
  the active deck has 30 or more cards, plus 1 at 45 or more, plus 1 from the
  Tome of Enlightenment. Player-directed acquisitions ignore it and show owned
  counts: merchants, castle picks, quest picks and Duplication. See
  [A7](appendix-a-economy.md#a7-copy-allowance).
- **Safety net.** If the collection cannot field a legal deck, a battle pads the
  active deck with temporary, unowned copies of the ten Starter cards. Selling
  and delivering are refused when they would leave fewer owned cards than the
  minimum deck size.
- **Collection size** has no hard cap.

## The campaign pool and its slices

At campaign start D97 runs the production tides4 algorithm for the chosen
Avatar and campaign seed (Q34). It joins the signature tide and 1–3 drawn
facets, plus fill if needed, and deals 150 copies, at most 2 per card and 1 per
Legendary. Starter cards are excluded.

Measured over 32 Avatars × 200 seeds, a pool has:

- 101 distinct cards on average (85–121);
- about 48 cards at two copies;
- about 12 Rares (6–21);
- 0–3 Legendaries;
- 71% Characters and 29% Events.

The signature tide alone covers about 89 of the pool's distinct cards, so the
pool divides into **slices** (Q41):

- **Signature core:** pool cards in no joined facet tide, about 50 (21–95).
- **Facet slices:** for each joined facet, the pool cards in that tide, about
  33 each (15–43). Slices can overlap, and 28% of pools join a single facet.

Each realm **features** one slice (Q36). The home realm features the core; the
other four cycle through the joined facets in join order. The featured slice
drives:

- strict shop slots and bundle draws;
- lair finds;
- prices;
- castle rewards;
- which Avatars live in the realm (Q44).

Loose draws use the whole pool. A Pool Viewer shows the pool, every slice and
where each is featured, since tides are decklists players can read.

**Resonance is cosmetic.** It names and colors the five realms and their
amulets, and nothing else.

## Rarity

D97 uses the authored `rarity` field and shows it on shop, reward and
collection surfaces (Q3).

- **Cost points:** Common 1, Uncommon 2, Rare 3, Legendary 4.
- **Starter cards** (owned only through difficulty dilution) price as Commons.
- **Special and Tutorial cards** never appear.
- **Legendary cards** exist only as dungeon treasure. This includes any
  Legendary in the pool.

## Currencies

| | Essence | Amulets (one type per realm) |
| --- | --- | --- |
| Start | `(5 − d) × 50` | 1 of the home realm + `(3 − d)` of random realms |
| Main sources | Selling cards; dungeon cash chests; lair windfalls, Essence sites, Gamble; tribute | Victory drops in the realm fought in (chance `(2 + ⌊tier/2⌋)/40`); travel and delivery quests (the destination's realm); village bounties; cash chests; lair amulet treasure and vendors |
| Main sinks | Shop cards; Transfiguration, Duplication, Dreamsign Bazaar; world magic Dreamsigns; Gamble stakes; lair merchants and amulet vendors | Specialty merchants of that realm (1/2/3 per C/U/R); world magic activation burns |
| Not a source | Winning battles (Q6) | — |

Algorithms: [Appendix A](appendix-a-economy.md).

## The overworld

- **Map** (Q9): a generated 64 × 64 tile continent divided into five
  contiguous **realms**, with roads, open ground and rough ground. Each realm
  features one slice of the pool.
- **Settlements:** 128 slots, at least 30 of them towns or cities, the rest
  villages. Each takes its realm from its tile.
- **Destinations:** 5 castles (one per realm) and 10 dungeons.
- **The clock** advances 1 unit per tile of open ground (½ on roads, 2 on rough
  ground) and is shown to the player as days. It drives restocks, cooldowns,
  quest deadlines, monster respawns and sieges.
- **Movement** is free tile walking with the character, as in Shandalar.

Details: [Appendix B](appendix-b-overworld.md).

## Encounters and battles

- **Spawning.** Six roaming slots near the player fill with monsters or lairs
  using Shandalar's spawn table. A monster's tier rises with the player's wins
  in that realm.
- **Contact** (Q10). Monsters chase as in Shandalar. On contact the pre-battle
  screen shows the opponent's Avatar, deck preview, tier and both stakes, and
  offers **Fight**, a free **Decline** that repels the monster, and, after five
  wins against that Avatar, sometimes **Tribute**.
- **Opponents** (Q11, Q44) are the Avatars. A realm featuring facet F is home to
  the Avatars whose tide pools include F; the home realm hosts the signatureless
  Avatars. Tier maps to deck-construction knobs and an opponent head start; the
  AI is unchanged.
- **Stakes** (Q13, Q39). Each ordinary, dungeon and castle battle stakes one
  random active card of the player's. Against it, the opponent stakes one random
  card from its deck that is also in the player's pool; failing that, a pool
  card weighted toward its tides. Both are rolled when the monster spawns and
  shown before the fight. A loss permanently removes the staked copy; a draw
  exchanges nothing.
- **Victory bundle** (Q12). An ordinary win pays a bundle: the opponent's staked
  card, then random pool cards, alternating the realm's featured slice and the
  whole pool. Draws continue until their rarity cost points reach the budget
  `S = 1 + ⌊tier/2⌋`. That is about 2.1–2.7 cards at tiers 4–6, 3.9 at tier 10
  and 6.3 at tier 18. When a clue target exists, the player may give up the
  bundle for a dungeon clue.
- **Amulet drop:** chance `(2 + ⌊tier/2⌋)/40` after an ordinary win, paid in the
  realm's amulets.
- **Head starts** stand in for Shandalar's life totals. The target stays 25⍟.
  The player starts with one point per Dreamlink, up to 8. The opponent starts
  with a tier- and difficulty-based head start.
- **Losses never end the campaign.** A loss in a castle, or in a dungeon with
  attrition rules, ends that expedition.

Details: [Appendix A §A8–A9](appendix-a-economy.md#a8-victory-bundles) and
[Appendix B](appendix-b-overworld.md).

## Settlements and their services

| Service | Village | Town | City | Notes |
| --- | --- | --- | --- | --- |
| Card shop | 4 slots | 5 slots | 6 slots | Persistent stock from the pool; even slots from the featured slice; slot `i` caps rarity at `(i mod 3) + 1`; buy any affordable subset (Q17) |
| Selling | ✓ | ✓ | ✓ | Same valuation as buying, with a resale guard (Q19) |
| Specialty merchant | — | ✓ | ✓ | Half sell a slice, half a category; pay in the realm's amulets (Q20, Q38) |
| Quests | Travel, delivery, bounty | Bounty | Bounty | One active quest at a time |
| Sage | ✓ | ✓ | ✓ | Free advice of a fixed kind per settlement |
| Dream Guide services | — | 1 | 2 | Transfiguration, Duplication or Dreamsign Bazaar, priced and on cooldown (Q28) |
| Guide home city | | | 10 cities | Each Dream Guide's home city also hosts that guide's enhanced service |

**Prices** follow Shandalar's formula (Q18, Q40):

- a card's base value comes from its energy cost, spark and Fast keyword;
- that value is multiplied by its rarity, the settlement tier, and a locality
  factor;
- the result is rounded down to 5 and clamped to 5–1000.

| Locality factor | Buy | Sell |
| --- | --- | --- |
| Card in the realm's featured slice | ×1 | ×1 |
| Other pool card | ×1.5 | ×4/3 |
| Card outside the pool (treasure Legendaries) | — | ×3/2 |

Typical quotes for a featured-slice card:

| | Common | Uncommon | Rare |
| --- | --- | --- | --- |
| Village | 20 | 40 | 80 |
| Town | 25 | 55 | 110 |
| City | 35 | 70 | 140 |

A copy bought from a shop or merchant never sells for more than it cost.
Details: [Appendix A §A4–A6, A10–A11](appendix-a-economy.md#a4-card-base-value-and-buy-quote).

## Lairs

Lairs appear in roaming slots and vanish when left behind (Q23). Entering
one resolves a single outcome:

- **40% ordinary find:** one random card from the realm's featured slice.
- **30% Dreamtides event:** Exploration, Augury, Gamble, Dreamsign Revelation,
  Dreamsign Reward, Random Site or Essence.
- **30% Shandalar special**, in Shandalar's proportions: rare-card duel, dungeon
  clue, Essence windfall or wager, amulet treasure, amulet vendor, exact-card
  Essence merchant, exact-card amulet merchant.

Details: [Appendix B §B11](appendix-b-overworld.md#b11-lairs).

## Dungeons and clues

- **Finite treasure** (Q24, Q39). Thirty items, seeded three per dungeon at world
  generation: all **8 Legendary cards**, the one exception to the pool, plus
  **22 Perfected copies of pool cards**, the pool's Rares first and then
  Uncommons. Plain copies of those pool cards stay available everywhere else.
- **Clues** reveal a dungeon's location, guardians or rules, and always show
  its remaining treasure. Clue targeting favors near, unfinished dungeons and
  penalizes ones whose clue the player passed over for cards.
- **Expeditions** (Q25) walk a regenerated 15 × 13 maze. Minion battles pay no
  cards but still stake one. Aid cells give head starts or a prepared card.
  Dungeon rules can ban a slice, Events or Fast cards, give the opponent an
  opening card in play, or impose attrition.
- **Chests** dispense one random remaining treasure each, then Essence and
  amulets once the dungeon is empty.

Details: [Appendix C](appendix-c-dungeons-and-castles.md).

## Castles, sieges and the finale

- **Lords** (Q26). An Incarnation of Apollyon rules each realm's castle, using
  its curated boss deck at tier 20. Incarnations are matched to realms by
  cosmetic resonance.
- **Castles** are dungeon boards with stronger minions and the lord at the end.
  The player needs consecutive wins, and one loss ends the attempt.
- **Castle victory** frees the lord's towns, ruins the castle, ends monster
  spawns in that realm, and grants **three distinct exact cards** from the
  realm's featured slice (Q43).
- **Sieges** (Q14). The siege clock starts a siege every 64 units, accelerating
  over the campaign. An undefeated lord's attacker camps on a town; the player
  can defend it by beating the attacker. Otherwise the town falls, loses its
  services and its Dreamlink, and can be liberated by a duel that pays one
  stake card. A lord holding 3 towns ends the campaign; the Ring of the Guardian
  raises that to 5.
- **Finale.** After the fifth castle, the player prepares a deck and fights
  Apollyon, whose deck draws on the five defeated Incarnations. A loss returns
  the player to the overworld to retry. A win ends the campaign with
  Shandalar's score formula.

## Dreamsigns and world magic

- **Dreamsigns** keep their battle effects and the 12-held cap. They come from
  Dreamsign Bazaars (town services), Revelation and Reward lair events,
  Exploration, Augury and Gamble.
- **World magic** (Q22). About ten D97-only Dreamsigns carry Shandalar's world
  magic effects: Haggler's Coin (+1 shop slot), Ring of the Guardian (siege
  threshold 5), Tome of Enlightenment (+1 copy allowance), travel boosts,
  battle edges, and escape or editing powers. Each is sold once, in an assigned
  city, for Essence; sages hint where. They count toward the 12-Dreamsign cap,
  and activated ones can burn an amulet.
- Journey-effect Dreamsigns with no D97 meaning are remapped or excluded. See
  [Appendix D](appendix-d-content-reuse.md#d6-dreamsigns).

## Content reuse and exclusions

- **Reused:**
  - every pool card, and the 8 Legendaries as treasure;
  - Starter cards for difficulty dilution and safety-net padding;
  - all 32 Avatars, all transfigurations, and the tides4 pool algorithm;
  - the opponent deck algorithm, which also builds the starting collection;
  - the ten Apollyon incarnations and the Dream Guides;
  - the Shop, Dreamsign Bazaar, Dreamsign Revelation, Dreamsign Reward,
    Transfiguration, Duplication, Augury, Random Site, Gamble, Exploration and
    Essence sites.
- **Not included:**
  - the Dream Atlas and dreamscape maps, and Draft sites;
  - Purge sites, every card-removal outcome, and Nightmare (Q27);
  - resonance as a mechanic (Q34).

  Master Takeshi, whose Purge service has no D97 counterpart, posts bounties in
  his home city.
- **Not part of D97:** food, trivia, riddles, random forced encounters, lands
  and an explicit color pie.

Details: [Appendix D](appendix-d-content-reuse.md).

## Acquisition-rate targets

The economy is tuned so a successful Magician campaign acquires cards at
Shandalar's rate. The following table compares a D97 forecast with the
research journeys; [Appendix E](appendix-e-calibration.md) derives each row.

| Channel (per successful campaign) | Shandalar journeys | D97 target (expected) |
| --- | --- | --- |
| Starting collection | 36–46 | 30–36 |
| Retained victory bundles | 40–61 copies from 14–22 wins | 55–68 |
| Shop purchases | 15–16 | 12–20 |
| Specialty merchant purchases | 8–11 | 5–10 |
| Lairs (finds, events, specials) | 3–7 | 5–12 |
| Dungeon treasure | 4–9 | 5–9 |
| Castle rewards | 15 | 15 |
| Quests, tribute, spoils, Duplication | 1–2 | 2–8 |
| Removed: sales, stakes, deliveries | −35 to −37 | −27 to −49 |
| **Final collection** | **98–119** | **100–125** |

**Bundle calibration.** Victory budgets use base strength 1
(`S = 1 + ⌊tier/2⌋`) rather than Shandalar's typical 2. Pool cards cost fewer
rarity points on average (about 1.67 against the 2.0 of the research report's
reference curve), so this keeps bundle sizes on Shandalar's curve. Amulet drop
chances keep Shandalar's budget. See
[E2](appendix-e-calibration.md#e2-victory-bundle-size).

**Saturation.** By campaign end the player typically owns copies of about 87% of
the pool's cards. Late income therefore leans toward second copies, exact
purchases and Essence from sales.

## Logging

Every D97 system logs enough to reconstruct a campaign's economy in a
production game (invariant "Log new features", decision D40), with UUIDs and
never names:

- the pool deal (the existing `draft_pool_constructed` record) and the slice
  assignment;
- each acquisition and removal (owned-copy UUID, card UUID, channel, price and
  currency);
- each generated offer set: shop slots (with ceiling, slice and candidate
  count), bundles (with budget and per-draw slice), lair rolls, merchant
  catalogs and castle picks;
- each spawn roll (`v`, roll, tier, roster), stake roll and battle setup (both
  head starts and knob values);
- clock and siege clock transitions, restock stamps, cooldown starts, quest
  offers and deadlines;
- clue targeting scores and penalties, treasure seeding, and dungeon board seeds
  and event placement.

[Appendix E §E6](appendix-e-calibration.md#e6-measurement-plan) lists the
derived metrics.

## Decision record

**Interview of October 13, 2026.** Later decisions revise earlier ones where
noted:

| # | Topic | Decision |
| --- | --- | --- |
| Q1 | Campaign scale | Faithful: 5 castles + final boss, 55–65 battles, 15–20 hours, fresh collection per campaign |
| Q2 | Color axis | Resonance (superseded by Q34–Q36: resonance is cosmetic) |
| Q3 | Rarity | Existing rarity field, visible; costs C1/U2/R3/L4 |
| Q4 | Copy rules | No deck cap; Shandalar's supply-side allowance |
| Q5 | Identity | Any Avatar |
| Q6 | Essence | Battles pay no Essence |
| Q7 | Difficulty | Four Shandalar levels |
| Q8 | Starter | Recipe of 30/32/34/36 cards (method superseded by Q42) |
| Q9 | Overworld | Faithful 64 × 64 tile world |
| Q10 | Encounters | Monsters chase; free Decline |
| Q11 | Opponents | The 32 Avatars with tier knobs |
| Q12 | Bundles | Shandalar's budget algorithm |
| Q13 | Ante | One stake each, fixed at spawn; three in high-stakes encounters |
| Q14 | Sieges | Kept, with campaign loss at 3 held towns |
| Q15 | Mana links | Dreamlinks give +1⍟ head start each, capped at 8 |
| Q16 | Site homes | Services in settlements, events in lairs, enhanced services in guide home cities |
| Q17 | Shop stock | Shandalar's slots and rarity ceilings |
| Q18 | Prices | Shandalar-shaped formula from cost, spark and Fast |
| Q19 | Selling | Shandalar's formula with a resale guard |
| Q20 | Specialty merchants | Half one kind of catalog, half another (catalogs revised by Q38) |
| Q21 | Timers and quests | Shandalar's clock, restock, quests, sage and settlement rules |
| Q22 | World powers | World magic Dreamsigns that count toward the cap |
| Q23 | Lairs | 40% find, 30% Dreamtides event, 30% Shandalar special |
| Q24 | Treasure | Dungeon-only Legendaries and Perfected cards (revised by Q39) |
| Q25 | Dungeons | Faithful tile mazes |
| Q26 | Lords | Apollyon incarnations in castles; Apollyon as final boss |
| Q27 | Removal | Purge, removal outcomes and Nightmare excluded |
| Q28 | Services | Priced, with per-town cooldowns |
| Q29 | Names | Shandalar-literal |
| Q30 | Remaining rules | Tribute, rare-card duels, castle rules, mandatory final win, Takeshi's bounties, safety net, editing rules |
| Q31 | Location | This folder |
| Q32 | Minimum deck | 25/27/30/30 |
| Q33 | Bundle type mix | Proportional, with no separate Character/Event roll |
| Q34 | Card supply | The standard 150-copy tides4 deal is the fixed campaign pool |
| Q35 | Pool draws | Unlimited catalog weighted by pool copies, with the allowance |
| Q36 | Regions | Realms feature slices of the pool; strict and loose draws alternate |
| Q37 | Amulets | Five realm amulets |
| Q38 | Specialty catalogs | Half a pool slice, half a category within the pool |
| Q39 | Outside the pool | Only the 8 Legendaries, as treasure; stakes stay in the pool |
| Q40 | Price locality | Featured slice ×1; other pool cards ×1.5 buy, ×4/3 sell; outside the pool ×3/2 sell |
| Q41 | Slices | Signature core plus one slice per joined facet |
| Q42 | Starting collection | The opponent deck algorithm on the pool, with Starter dilution 0/5/8/10 |
| Q43 | Castle picks | The realm's featured slice |
| Q44 | Rosters | Facet neighbours; signatureless Avatars in the home realm |

**Adopted without separate discussion,** as faithful translations, calibration
or consistent application of the decisions above; each is a tunable called out
in its appendix:

- victory budget base strength 1 ([E2](appendix-e-calibration.md#e2-victory-bundle-size));
- post-victory spoils ([A8](appendix-a-economy.md#a8-victory-bundles));
- tribute and high-stakes frequency, and the Decline repel time
  ([B9](appendix-b-overworld.md#b9-contact-decline-and-tribute));
- the opponent knob table
  ([B7](appendix-b-overworld.md#b7-rosters-tiers-and-opponent-construction));
- Bazaar and world magic prices and the world magic list
  ([A11–A12](appendix-a-economy.md#a11-dream-guide-services));
- lair sub-weights ([B11](appendix-b-overworld.md#b11-lairs));
- slice-based dungeon themes, dungeon minion tiers, the attrition carry, and
  the final battle setup ([Appendix C](appendix-c-dungeons-and-castles.md));
- the D97 score translation ([A18](appendix-a-economy.md#a18-score));
- slices, rather than whole tides, for specialty catalogs (following Q41);
- the Pool Viewer.

## Risks and open questions

- **A small universe for a long campaign.** About 101 cards over 15–20 hours
  means the player owns copies of about 87% of the pool by the end. Late
  victories pay mostly second copies, and the sale and exact-purchase channels
  carry more of the late game. This is the cost of the coherent pool;
  playtests should check that late campaigns still feel rewarding.
- **Variable regional variety.** 28% of pools join a single facet, so their
  four non-home realms feature the same slice. The signature core ranges from
  21 to 95 cards and facet slices from 15 to 43.
- **Thin Rare supply.** Pools hold 6–21 Rares. Low-Rare pools give fewer Rare
  shop offers and rare-card duels, and fill more of their 22 Perfected treasures
  with Uncommons.
- **Pending content.** Nine Avatars, all ten Apollyon Aspects and 104 of 153
  Dreamsigns have no live ability. D97 offers only live Dreamsigns; pending
  Avatars and Aspects fight without abilities until authored.
- **Bundle calibration** assumes the research report's Shandalar reference
  curve, since Shandalar's original card data is not available. Playtests
  should confirm Appendix E's targets.
- **Selling arbitrage.** The resale guard closes buy-and-sell loops. Looted
  cards still sell for up to 2.2 times their featured village price in another
  realm's city; this is intended, but its Essence rate needs measurement.
- **Long-lived state.** A campaign is a long event log. It needs stable world,
  settlement, quest and dungeon identities, and content-hash pinning across
  catalog revisions.
