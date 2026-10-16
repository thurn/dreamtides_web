# Appendix E: Acquisition-rate calibration

The design goal is that a D97 player acquires cards at about Shandalar's rate
per battle through the campaign. This appendix sets out:

- the reference figures from the research;
- how D97's bundle budget was calibrated against them;
- expected card, Essence and amulet ledgers for a campaign;
- what to measure in simulation and playtest.

Every expected value here comes from a stated model, not from play; treat it
as a target to verify. The endgame has no fixed length, so the ledgers stop at
Apollyon's defeat.

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
| Sales / ante losses / deliveries | −32 / −2 / −1 | −32 / −4 / −1 | −30 / −4 / −1 |
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
ante) costs 2 points, and each later card costs 1, 2 or 3 with equal
probability. D97 computes its curve from real pools, measured over 32 Avatars
× 20 seeds of tides4 deals. Their copy-weighted mix is 44% Common, 44%
Uncommon and 12% Rare, within a point of the signature tides' mix, for a mean
cost of about 1.67.

| Budget | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| D97 `E[N]` (mean over pools) | 1.00 | 1.44 | 2.08 | 2.67 | 3.27 | 3.87 |
| D97 5th–95th percentile | — | — | 1.84–2.32 | 2.36–3.02 | 2.85–3.71 | 3.38–4.41 |

Budgets 3 and up are measured over pools. Budgets 1 and 2 follow from the mean
mix: a budget of 1 pays exactly the ante, and a budget of 2 adds a second card
when the ante is a Common.

**Why the budget is `floor(T / 4)`.** In Shandalar about half the battles pay
no bundle. In D97 every challenger win pays one, and challengers make up about
two thirds of a campaign's battles. Keeping Shandalar's per-bundle budget
(`2 + floor(T / 2)`) would pay about 4.5 copies per challenger win, roughly 300
copies from bundles alone. A budget of `floor(T / 4)` pays a mean of 1.72 per
win, about 117 copies over a campaign:

| Tier | 4 and 7 | 10 | 13 | 16 and 18 |
| --- | --- | --- | --- | --- |
| Where | Acts 1–2 | Act 3 | Act 4; early key dreams | Act 5; later key dreams |
| Budget | 1 | 2 | 3 | 4 |
| `E[N]` | 1.00 | 1.44 | 2.08 | 2.67 |
| What it pays | The opponent's ante | The ante, often with one bag card | The ante and one or two bag cards | The ante and about two bag cards |

Wins in Acts 1–2 pay only the opponent's ante, which comes from outside the
player's bag, plus the extra. Early bag cards come from shops, chests and
sites.

**Lever.** If playtests find bundles too large or small, change `β` in
`S = β + floor(T / 4)`. Each step of `β` adds about 0.5 copies per win, about 34
per campaign. Cost points also drive shop ceilings and merchant prices, so they
stay fixed.

## E3. Expected card ledger

**Model inputs** for a successful campaign at `d = 1`. Replace each with
measurements as they arrive:

- about 118 battles:
  - 60 initial challengers fought: 52 wins and 8 losses;
  - 8 refills fought: 7 wins and 1 loss;
  - 14 Avatar guardian battles: 11 wins (10 required, 1 optional) and 3
    losses;
  - 14 incarnation battles: 5 in the acts and 5 in Limbo won, 4 losses;
  - Apollyon: one win, with half a loss;
  - 5 prize duels: 3 wins, with a mean prize of 2.75 Rares;
  - 4 trial battles: 3 wins;
  - 2 key dreams opened before Apollyon: 11 battles, 9 wins and 2 losses;
- challenger wins by tier, refills included: 12 at tier 4, 12 at 7, 12 at 10,
  16.5 at 13 and 15.5 at 16;
- about 38 chests opened in 27 dreams;
- 27 shop purchases and 6 curiosities;
- 22 amulet merchant purchases (E5);
- about 25 quests completed, 4 of them slot quests and 2 Avatar quests;
- 3 Duplications and 7 Transfigurations;
- sales as the balancing item of the Essence ledger (E4).

| Channel | Expected copies | Range |
| --- | --- | --- |
| Starting collection | 30 | 30 |
| Victory bundles, antes included (68 wins) | +117 | 105–130 |
| Guardian antes and picks (11 × 2 + 10 × 3) | +52 | 45–58 |
| Shop purchases | +27 | 20–34 |
| Curiosities | +6 | 3–8 |
| Amulet merchant purchases | +22 | 15–24 |
| Chests | +13 | 10–16 |
| Prize duels | +8 | 5–12 |
| Trial antes and picks | +6 | 4–8 |
| Duplication | +3 | 1–5 |
| Site outcomes (Exploration, Augury, Random Site, Gamble) | +8 | 5–12 |
| Key prizes | +0.2 | 0–2 |
| Sales | −20 | −12 to −30 |
| Ante losses | −19 | −12 to −25 |
| Deliveries and purge costs | −6 | −3 to −10 |
| **Collection at Apollyon** | **≈ 247** | **210–260** |

Gross acquisition is about 262 copies over 118 battles, **2.2 per battle**,
about 15% above Shandalar Magician's 1.92. The collection is about twice
Shandalar's 116 because the campaign is twice as long, with two further
contributors:

- **Bosses.** Twenty-one guardian and incarnation wins pay 52 copies, against
  Shandalar's 15 castle picks. Each extra pick per boss would add about 21
  copies, so picks stay at 1 per Avatar guardian and 2 per incarnation.
- **Fewer sales.** Purses and quests fund much of the player's spending, and
  D97 has no world magic or food to buy, so players sell about 20 cards
  instead of 32.

If playtests find the collection too large, the levers, in order of
preference, are the chest card weight, shop slot counts, guardian picks and
Essence purse sizes.

**Bag shape over the campaign.** About 49 bundle cards, 27 shop purchases, 13
chest cards and the site and trial picks, about 100 copies, come from the bag.
With ring 1 alone in Act 1 and second copies only from Act 3, a typical
campaign sees no random duplicate before Act 3 and few second copies before
Act 4. Measure the duplicate share of bag draws by stage.

## E4. Expected Essence ledger

| Income | Expected | Spending | Expected |
| --- | --- | --- | --- |
| Starting Essence | 200 | Shop purchases (27 × 55) | 1,485 |
| Purses (68 wins, mixed extras) | 765 | Restocks (6 × 40) | 240 |
| Essence chests (12.7 × 62) | 790 | Curiosities (6 × 83) | 500 |
| Quest rewards (12 Essence quests) | 1,215 | Transfigurations (7 × 45) | 315 |
| Essence site outcomes and Gamble, net | 250 | Duplication (3 × 60) | 180 |
| Sales (20 × 50) | 1,000 | Dreamsign Bazaar (7 × 110) | 770 |
| | | Amulet changer (3 × 250) | 750 |
| **Total** | **≈ 4,220** | **Total** | **≈ 4,240** |

Sales are the balancing item: income before sales falls about 1,000 Essence
short of the modeled spending, so the player sells about 20 cards. Shandalar
Magician's ledger earns 1,900 and spends 1,270, of which 395 is food, over a
campaign about half as long.

**Levers, in order of preference:**

1. the amulet changer price;
2. chest Essence;
3. quest Essence;
4. purse sizes;
5. the sale formula, last because it also sets what loot is worth.

## E5. Expected amulet ledger

| Source | Expected | Sink | Expected |
| --- | --- | --- | --- |
| Starting amulets | 2 | Amulet merchant purchases (22 cards × 1.8) | 40 |
| Challenger extras (68 × 1/4) | 17 | | |
| Quests (7 amulet quests, 3 trials) | 10 | | |
| Chests (38 × 1/3) | 13 | | |
| Amulet changer | 3 | | |
| **Total** | **≈ 45** | **Total** | **≈ 40** |

Shandalar Magician's journey receives 15 and spends 15. D97's amulets buy from
resonance cores the bag doesn't reach, so more of the D97 supply flows through
them. Because each amulet is spent only at its own resonance's merchants,
a few usually wait for the right merchant.

## E6. Measurement plan

**Logs.** D97 logs every economy, assembly and key event with UUIDs (Appendix
B §B17). Simulation and playtest reports should give each metric by act and by
encounter type and tier:

- copies acquired per battle fought, and per win, by channel;
- gross, net and distinct-identity collection growth, and the share of
  acquired copies from outside the current tide set;
- bag draws by stage, and the share that are a card's second or later copy;
- Avatar switches and their timing;
- active-deck turnover, the share of acquired copies that are ever equipped,
  and the time from acquisition to equipping;
- Essence and amulets by source and sink, cards sold, and unspent amulets by
  resonance;
- win rate by tier, head-start difference and difficulty; rematch counts;
- refills placed and fought, by act and by the player's current act;
- ante losses by rarity and by modification;
- dreams entered, doors traversed, waypoints activated and fast travels;
- Dreamsign slot usage: slotted Dreamsigns by kind, and swaps per act;
- quests accepted and completed by kind; sage hints by kind;
- keys found, key dreams opened and finished, perfect-clear rate by tier, and
  keys paid per finished key dream;
- run length in battles and wall time, per act and to Apollyon.

**Simulation first.** A headless run simulator can tune the levers above before
playtests. It replays the event log with scripted exploration, shopping and
challenge policies, and resolves battles from a win-rate model by tier, head
start and difficulty. Its job is to produce distributions around the expected
ledgers in E3–E5.

**Acceptance targets** for a successful campaign at `d = 1`:

| Metric | Target |
| --- | --- |
| Gross acquisitions per battle | 1.9–2.3 |
| Collection at Apollyon | 210–260 copies |
| Victory bundle copies, antes included | 105–130 |
| Copies from outside the current tide set | 30% or more |
| Random duplicates before Act 3 | Under 5% of bag draws |
| Amulet income | 38–52 |
| Essence income | 3,600–4,800 |
| Refill battles | 5–15% of battles |
| Campaign length | 110–120 battles; 25–35 hours |
| Keys paid per finished key dream | 1.3 or more |
