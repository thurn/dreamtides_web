# Appendix E: Acquisition-rate calibration

The design goal (Q1) is that a D97 player acquires cards at Shandalar's rate.
This appendix sets out:

- the reference figures from the research;
- how D97's bundle budget was calibrated against them;
- expected per-campaign card, Essence and amulet ledgers;
- what to measure in simulation and playtest.

Every expected value here comes from a stated model, not from play; treat it
as a target to verify.

[Back to the design overview](README.md)

## E1. Shandalar reference figures

The three research journeys are authored, illustrative successful campaigns,
not measured averages. Their ledgers:

| | Apprentice (d = 0) | Magician (d = 1) | Wizard (d = 3) |
| --- | --- | --- | --- |
| Starting collection | 36 | 40 | 46 |
| Matches (wins / losses) | 65 (63 / 2) | 59 (55 / 4) | Not tallied; 19 ordinary (15 / 4) |
| Ordinary wins with retained bundles | 22 → 61 copies | 21 → 59 copies | 14 → 40 copies |
| Bundles traded for clues | 4 (10 copies) | 3 (8 copies) | 1 |
| Gold-shop / amulet purchases | 16 / 9 | 16 / 11 | 15 / 8 |
| Lair finds / special duel / bounty picks | 5 / 2 / 1 | 3 / 2 / 2 | 1 / 2 / 2 |
| Dungeon treasure / castle picks | 9 / 15 | 5 / 15 | 4 / 15 |
| Sales / stake losses / deliveries | −32 / −2 / −1 | −32 / −4 / −1 | −30 / −4 / −1 |
| Final collection (active / reserve) | 119 (40 / 79) | 116 (40 / 76) | 98 (40 / 58) |
| Gold income, including starting gold | 2,440 | 1,900 | 1,840 |
| Amulets received, including starting amulets | 22 | 15 | 6 |

Structural facts from the decompilation that the ledgers rely on:

- ordinary budgets of 4 early, 4–7 at tiers 6–8, 8 at tier 12, 10 at tier 16
  and 11 at tier 18;
- no gold from ordinary wins;
- an amulet drop chance of budget ÷ 40;
- 4–6 shop slots;
- five castles of three picks each;
- at most three treasures per dungeon.

The journeys award amulets more often than budget ÷ 40 gives, since their drops
are authored; D97 targets the formula, not the journeys.

## E2. Victory bundle size

Shandalar's original card and rarity data isn't in the decompilation, so the
research report models bundles with a reference curve. The first card (the
stake) costs 2 points, and each later card costs 1, 2 or 3 with equal
probability, a mean of 2.0. D97 computes its curve from real campaign pools,
measured over 32 Avatars × 20 seeds. Their copy-weighted mix is 44% Common,
44% Uncommon and 12% Rare, a mean cost of about 1.67, because Commons and
Uncommons dominate.

| Budget | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shandalar reference `E[N]` | 2.00 | 2.33 | 2.78 | 3.37 | 3.83 | 4.33 | 4.84 | 5.33 |
| D97 `E[N]` (mean over pools) | 2.08 | 2.67 | 3.27 | 3.87 | 4.47 | 5.07 | 5.66 | 6.26 |
| D97 5th–95th percentile | 1.84–2.32 | 2.36–3.02 | 2.85–3.71 | 3.38–4.41 | 3.88–5.10 | 4.39–5.80 | 4.91–6.49 | 5.41–7.19 |

At equal budgets D97 bundles run 15–20% larger. Shandalar's typical monster has
base strength 2 (`S = 2 + ⌊T/2⌋`). D97 uses base strength **1**
(`S = 1 + ⌊T/2⌋`), which puts a tier-`T` D97 bundle on the reference curve for
the same tier:

| Tier | Shandalar budget | Reference `E[N]` | D97 budget | D97 `E[N]` | Difference |
| --- | --- | --- | --- | --- | --- |
| 4 | 4 | 2.33 | 3 | 2.08 | −11% |
| 6 | 5 | 2.78 | 4 | 2.67 | −4% |
| 8 | 6 | 3.37 | 5 | 3.27 | −3% |
| 10–11 | 7 | 3.83 | 6 | 3.87 | +1% |
| 12–13 | 8 | 4.33 | 7 | 4.47 | +3% |
| 14 | 9 | 4.84 | 8 | 5.06 | +5% |
| 16 | 10 | 5.33 | 9 | 5.66 | +6% |
| 18 | 11 | 5.83 | 10 | 6.26 | +7% |

Weighted by the spawn table (Appendix B §B6), the per-win mean is 2.45 at
`v = 0` and 3.61 at `v ≥ 8`. Under the same table, the reference curve gives
2.63 and 3.60: D97 is 7% lower at `v = 0`, within 3% from `v = 2`, and equal
from `v = 8`. The amulet drop keeps Shandalar's budget, `(2 + ⌊T/2⌋)/40`, so
amulet income is unaffected by the calibration.

**Lever.** If playtests find bundles too large or small, change the base
strength `β`, not the cost points. Cost points also drive shop ceilings and
merchant prices.

## E3. Expected card ledger (Magician)

**Model inputs.** Replace each with measurements as they arrive:

- 27 ordinary encounters fought (24 wins, 3 losses), about five wins per realm,
  so `v` runs 0–5 in each realm and the mean bundle is 2.95;
- 3 bundles traded for clues;
- about 10 lairs entered, split 40/30/30;
- a 70% win rate in rare-card duels, with a mean prize of 2.75 Rares;
- 2–3 dungeon expeditions and 5 castles;
- 4 quests, 1 tribute and 2 Duplication purchases;
- 16 card-shop purchases;
- specialty purchases limited by amulet income (E5), at 1.8 amulets per card;
- 30 sales;
- stake losses: 3 ordinary, plus 1–2 in dungeons and castles;
- 1 delivery.

| Channel | Expected copies | Range |
| --- | --- | --- |
| Starting collection | 32 | 32 |
| Retained victory bundles (21 × 2.95) | +62 | 55–68 |
| Spoils duplicates | +0.6 | 0–2 |
| Lair ordinary finds | +4 | 2–6 |
| Lair Dreamtides events (Exploration, Augury) | +2 | 1–4 |
| Lair specials (rare duels, merchants) | +2.9 | 0–6 |
| Dungeon treasure | +7 | 5–9 |
| Castle picks | +15 | 15 |
| Bounty picks and tribute | +2.5 | 1–4 |
| Duplication | +2 | 0–4 |
| Card-shop purchases | +16 | 12–20 |
| Specialty merchant purchases | +7.5 | 5–10 |
| Sales | −30 | −25 to −40 |
| Stake losses | −4.5 | −2 to −7 |
| Deliveries | −1 | 0 to −2 |
| **Final collection** | **≈ 118** | **100–125** |

That is gross acquisition of about 122 copies against Shandalar Magician's
113, a net of about +86 against +76, and a final collection of about 118 against
116.

The D97 starter is 8 cards smaller, since it has no lands, and at Magician 5 of
its 32 cards are Starter cards. Its bundles carry no lands either, so a larger
share of D97's inflow is playable spells. The tuning target is the gross rate
per win and the final collection size, which match.

**Pool saturation.** Every random channel draws from the same ~100-card pool. A
simulated sequence of 150 copy-weighted draws at allowance 2 ends owning
copies of about 87% of the pool's identities. Late in a campaign, random
channels mostly offer second copies or cards already sold. Exact channels
(merchants, castles, treasure) and Essence from sales then carry more of the
player's progress than they did in Shandalar, whose open card catalog never
saturates.

## E4. Expected Essence ledger (Magician)

| Income | Expected | Spending | Expected |
| --- | --- | --- | --- |
| Starting Essence | 200 | Card-shop purchases (16 × 50) | 800 |
| Sales (30 × 40) | 1,200 | Transfigurations (5 × 45) | 225 |
| Cash chests (1.5 × 244) | 366 | Duplication (2 × 60) | 120 |
| Lair windfalls (0.25 × 500, mostly early) | 95 | Dreamsign Bazaar (3 × 100) | 300 |
| Essence lair events, Exploration | 75 | World magic (1.5 × 450) | 675 |
| Tribute | 50 | Lair merchants and amulet vendors | 160 |
| Gamble (net of stakes) | 20 | | |
| **Total** | **≈ 2,000** | **Total** | **≈ 2,280** |

The model ends about 280 Essence short. The intended consequence is
Shandalar's own tension: players sell more cards, skip a world magic
Dreamsign, or buy fewer shop cards. Shandalar Magician's ledger earns 1,900 and
spends 1,270, of which 395 is food. In D97, services, Dreamsigns and world magic
take food's place as sinks.

**Levers, in order of preference:**

1. world magic and Bazaar prices;
2. cash chest gold;
3. the Essence lair weight;
4. the sale formula. This is last because it also sets the arbitrage rate.

## E5. Expected amulet ledger (Magician)

| Source | Expected | Sink | Expected |
| --- | --- | --- | --- |
| Starting amulets | 3 | Specialty merchant purchases (about 7.5 cards) | 13.5 |
| Victory drops (24 × 0.14) | 3.4 | World magic burns (3 uses × 1/3) | 1 |
| Travel, delivery and village bounty quests | 2.5 | | |
| Cash chests (1.5 × 2.5) | 3.75 | | |
| Lair amulet treasure and vendors | 1.5 | | |
| **Total** | **≈ 14** | **Total** | **≈ 14.5** |

Shandalar Magician's journey receives 15 and spends 15. Because amulets belong
to five realms and are spent only at their own realm's merchants, the expected
purchase count is lower than the raw total suggests. Some amulets wait for the
right town.

## E6. Measurement plan

**Logs.** D97 logs every economy event with UUIDs (README, "Logging").
Simulation and playtest reports should give each metric per difficulty, per
castle count (campaign phase), and per encounter type and tier:

- copies acquired per battle fought, and per win, by channel;
- gross, net and distinct-identity collection growth, and the share of the
  campaign pool owned, by campaign phase;
- per pool: slice sizes, joined facet count, Rare count, and how often strict
  draws repeat a card;
- active-deck turnover, the share of acquired copies that are ever equipped,
  and the time from acquisition to equipping;
- clue uptake (the share of clue offers taken) and bundle size when declined;
- time from a target card's first sighting (shop, merchant catalog, clue
  journal) to its acquisition, including the slowest decile;
- Essence and amulets by source and sink, the sale arbitrage rate (Essence
  from sales of cards outside the realm's featured slice), and the stock of
  unspent amulets by realm;
- win rate by tier and by head-start difference;
- stake losses by rarity and by modification;
- sieges started, defended and lost, and towns held at the end;
- campaign length in battles, clock units and wall time.

**Simulation first.** A headless campaign simulator can tune the levers above
before playtests. It replays the event log with scripted travel, shopping and
clue policies, and resolves battles from a win-rate model by tier and head
start. Its job is to produce distributions around the expected ledgers in E3–E5.

**Acceptance targets** for a successful Magician campaign:

| Metric | Target |
| --- | --- |
| Final collection | 100–125 copies |
| Gross acquisitions per ordinary win, including the bundle and its share of incidental channels | 3.0–3.6 |
| Retained bundle copies | 55–68 |
| Amulet income | 12–18 |
| Essence income | 1,800–2,400 |
| Campaign length | 55–65 battles |
