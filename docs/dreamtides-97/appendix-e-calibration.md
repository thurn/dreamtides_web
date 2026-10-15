# Appendix E: Acquisition-rate calibration

The design goal is that a D97 player acquires cards at about Shandalar's rate
per battle. This appendix sets out:

- the reference figures from the research;
- how D97's bundle budget was calibrated against them;
- expected per-run card, Essence and amulet ledgers;
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

The Magician journey acquires 113 copies over 59 matches: **1.92 copies per
battle**. Only 21 of its 55 wins pay a bundle; the rest are dungeon and castle
fights that pay treasure, castle picks or nothing.

Structural facts from the decompilation that the ledgers rely on:

- ordinary budgets of 4 early, 4–7 at tiers 6–8, 8 at tier 12, 10 at tier 16
  and 11 at tier 18;
- no gold from ordinary wins;
- an amulet drop chance of budget ÷ 40;
- 4–6 shop slots;
- five castles of three picks each;
- at most three treasures per dungeon.

## E2. Victory bundle size

Shandalar's original card and rarity data isn't in the decompilation, so the
research report models bundles with a reference curve: the first card (the
stake) costs 2 points, and each later card costs 1, 2 or 3 with equal
probability. D97 computes its curve from real pools, measured over 32 Avatars
× 20 seeds. Their copy-weighted mix is 44% Common, 44% Uncommon and 12% Rare, a
mean cost of about 1.67.

| Budget | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| D97 `E[N]` (mean over pools) | 1.00 | 1.44 | 2.08 | 2.67 | 3.27 | 3.87 |
| D97 5th–95th percentile | — | — | 1.84–2.32 | 2.36–3.02 | 2.85–3.71 | 3.38–4.41 |

Budgets 3 and up are measured over pools. Budgets 1 and 2 follow from the mean
mix: a budget of 1 pays exactly the stake, and a budget of 2 adds a second card
when the stake is a Common.

**Why the budget is `floor(T / 4)`.** In Shandalar about half the battles pay
no bundle. In D97 every challenger win pays one, and challengers make up about
two thirds of a run's battles. Keeping Shandalar's per-bundle budget
(`2 + floor(T / 2)`) would pay about 3 copies per challenger win, roughly 100
copies from bundles alone. A budget of `floor(T / 4)` pays a mean of 1.43 per
win, about 47 copies over a run, which keeps the per-battle rate near
Shandalar's:

| Tier | 4–6 | 8–10 | 12–14 |
| --- | --- | --- | --- |
| Budget | 1 | 2 | 3 |
| `E[N]` | 1.00 | 1.44 | 2.08 |
| What it pays | The opponent's stake | The stake, often with one pool card | The stake and one or two pool cards |

Early wins pay only the opponent's stake, which comes from outside the
player's pool, plus the extra.

**Lever.** If playtests find bundles too large or small, change `β` in
`S = β + floor(T / 4)`. Each step of `β` adds about 0.5 copies per win, about 17
per run. Cost points also drive trader ceilings and merchant prices, so they
stay fixed.

## E3. Expected card ledger

**Model inputs** for a successful run. Replace each with measurements as they
arrive:

- 58 battles:
  - 38 challengers: 33 wins and 5 losses, with wins by tier of 4 at tier 4,
    7 at 6, 8 at 8, 7 at 10, 5 at 12 and 2 at 14;
  - 10 guardians: 3 Avatar guardian wins, 5 incarnation wins and 2 losses;
  - 3 in Limbo: one incarnation challenger and Apollyon, with half a loss each;
  - 4 Legendary keeper battles: 3 wins and 1 loss;
  - 3 prize duels: 2 wins, with a mean prize of 2.75 Rares;
- about 14 chests opened;
- 14 trader and Card Shop purchases, out of about 35 offers;
- 10 amulet merchant purchases (E5);
- about 15 quests completed;
- 2 Duplications, and 3 Transfigurations;
- sales as the balancing item of the Essence ledger (E4).

| Channel | Expected copies | Range |
| --- | --- | --- |
| Starting collection | 32 | 32 |
| Victory bundles, stakes included (33 wins) | +47 | 40–55 |
| Guardian stakes and picks (3 × 3 + 5 × 4 + 1 × 4) | +33 | 28–38 |
| Legendary dream | +3 | 2–6 |
| Prize duels | +5.5 | 3–8 |
| Chests | +7 | 5–9 |
| Trader and Card Shop purchases | +14 | 10–18 |
| Amulet merchant purchases | +10 | 7–12 |
| Quest picks | +3 | 2–5 |
| Duplication | +2 | 0–4 |
| Site outcomes (Exploration, Augury) | +2 | 1–4 |
| Sales | −8 | −5 to −20 |
| Stake losses | −8.5 | −5 to −12 |
| Deliveries | −2 | −1 to −3 |
| **Final collection** | **≈ 140** | **120–150** |

Gross acquisition is about 126 copies over 58 battles, **2.18 per battle**,
13% above Shandalar Magician's 1.92. The final collection is about 20% larger
than Shandalar's 116, for two reasons:

- **Guardian picks.** Eight to nine guardian wins pay 33 copies, against
  Shandalar's 15 castle picks.
- **Fewer sales.** Purses fund part of the player's spending, and D97 has no
  world magic or food to buy, so players sell about 8 cards instead of 32.

Both follow from interview decisions (R25, R38). If playtests find the
collection too large, the levers, in order of preference, are the chest card
weight, trader slot counts, quest pick rewards and Essence purse sizes.

**Pool saturation.** Every pool-drawn channel draws from about 101 cards. Late
in a run, random channels mostly offer second copies. Stakes, guardian picks,
amulet merchants and Avatar switches are the channels that keep offering new
identities; measure their share by run phase.

## E4. Expected Essence ledger

| Income | Expected | Spending | Expected |
| --- | --- | --- | --- |
| Starting Essence | 200 | Trader and Card Shop purchases (14 × 55) | 770 |
| Purses (24.75 × 14.4) | 356 | Transfigurations (3 × 45) | 135 |
| Essence chests (3.5 × 87.5) | 306 | Duplication (2 × 60) | 120 |
| Quest rewards | 290 | Dreamsign Bazaar (3 × 100) | 300 |
| Essence site outcomes and Gamble, net | 100 | Amulet changer (1 × 250) | 250 |
| Sales (8 × 40) | 320 | | |
| **Total** | **≈ 1,570** | **Total** | **≈ 1,575** |

Sales are the balancing item: income before sales falls about 320 Essence
short of the modeled spending, so the player sells about 8 cards. Shandalar
Magician's ledger earns 1,900 and spends 1,270, of which 395 is food.

**Levers, in order of preference:**

1. the amulet changer price;
2. chest Essence;
3. purse sizes;
4. the sale formula, last because it also sets what loot is worth.

## E5. Expected amulet ledger

| Source | Expected | Sink | Expected |
| --- | --- | --- | --- |
| Starting amulets | 2 | Amulet merchant purchases (10 cards × 1.8) | 18 |
| Challenger extras (33 × 1/4) | 8.25 | Amulet tolls | 2 |
| Quests (2 collector requests, 2 trials, others) | 7 | | |
| Chests (14 × 1/4) | 3.5 | | |
| Amulet changer | 1 | | |
| **Total** | **≈ 21.75** | **Total** | **≈ 20** |

Shandalar Magician's journey receives 15 and spends 15. D97's amulets buy from
resonance cores the reward pool doesn't reach, so more of the D97 supply
flows through them. Because each amulet is spent only at its own resonance's
merchants, a couple usually wait for the right merchant or a toll.

## E6. Measurement plan

**Logs.** D97 logs every economy and network event with UUIDs (Appendix B
§B15). Simulation and playtest reports should give each metric by run phase
(incarnations beaten) and by encounter type and tier:

- copies acquired per battle fought, and per win, by channel;
- gross, net and distinct-identity collection growth, and the share of
  acquired identities from outside the current reward pool;
- reward pools dealt per run (Avatar switches) and the timing of each switch;
- active-deck turnover, the share of acquired copies that are ever equipped,
  and the time from acquisition to equipping;
- Essence and amulets by source and sink, cards sold, and unspent amulets by
  resonance;
- win rate by tier and by head-start difference; rematch counts;
- stake losses by rarity and by modification;
- dreams entered, doors traversed, waypoints activated and fast travels; the
  order in which incarnations fell;
- quests accepted and completed by kind; sage hints by kind;
- run length in battles and wall time.

**Simulation first.** A headless run simulator can tune the levers above before
playtests. It replays the event log with scripted exploration, shopping and
challenge policies, and resolves battles from a win-rate model by tier and head
start. Its job is to produce distributions around the expected ledgers in
E3–E5.

**Acceptance targets** for a successful run:

| Metric | Target |
| --- | --- |
| Gross acquisitions per battle | 1.9–2.3 |
| Final collection | 120–150 copies |
| Victory bundle copies, stakes included | 40–55 |
| Copies from outside the reward pool at its deal | 25% or more |
| Amulet income | 16–24 |
| Essence income | 1,300–1,900 |
| Run length | 55–65 battles |
