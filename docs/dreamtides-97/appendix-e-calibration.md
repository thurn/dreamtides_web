# Appendix E: Acquisition-rate calibration

The design goal is that a D97 player acquires cards at about Shandalar's rate
per battle through the campaign. This appendix sets out:

- the reference figures from the research;
- how D97's bundle budget was calibrated against them;
- expected card, Essence and amulet ledgers for the happy-path and
  full-clear routes;
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
fights that pay treasure, castle picks or nothing. Its 59 matches are one
authored route, not a typical or required campaign length, so D97 calibrates
against the rate per battle rather than the route's length or final
collection.

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
half of a happy-path campaign's battles and about 60% of a full clear's.
Keeping Shandalar's per-bundle budget (`2 + floor(T / 2)`) would pay about 4.5
copies per challenger win, roughly 300 copies from bundles alone over a full
clear. A budget of `floor(T / 4)` pays a mean of 1.6–1.7 per win, about 36
copies on the happy path and 117 over a full clear:

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
`S = β + floor(T / 4)`. Each step of `β` adds about 0.5 copies per win, about 12
on the happy path and 34 over a full clear. Cost points also drive shop ceilings and merchant prices, so they
stay fixed.

## E3. Expected card ledger

Only bosses block progress, so the campaign has three reference routes. The
ledgers model the two the economy is tuned for:

- **Minimum route:** 21 wins and no optional battles. It has no ledger; its
  target is that it rarely succeeds (E6).
- **Happy path:** about 60 battles. The intended experience and the primary
  balance target.
- **Full clear:** about 120 battles. The upper reference: a player who
  explores every act dream before moving on.

Both modeled routes acquire about 2.2 copies per battle. They differ in how
many optional battles the player fights, not in what each battle pays.

**Model inputs** for a successful campaign at `d = 1`. Replace each with
measurements as they arrive:

| Input | Happy path | Full clear |
| --- | --- | --- |
| Battles | About 60 | About 118 |
| Initial challengers fought | 27: 23 wins, 4 losses | 60: 52 wins, 8 losses |
| Refills fought | 0 | 8: 7 wins, 1 loss |
| Avatar guardian battles | 14: 10 required wins, 4 losses | 14: 11 wins (10 required, 1 optional), 3 losses |
| Incarnation battles | 15: 10 wins, 5 losses | 14: 10 wins, 4 losses |
| Apollyon | One win, with half a loss | One win, with half a loss |
| Prize duels (mean prize 2.75 Rares) | 2: 1.5 wins | 5: 3 wins |
| Trial battles | 1: 1 win | 4: 3 wins |
| Key dreams opened before Apollyon | 0 | 2: 11 battles, 9 wins, 2 losses |
| Challenger wins by tier 4 / 7 / 10 / 13 / 16 | 5 / 5 / 5 / 4 / 4 | 12 / 12 / 12 / 16.5 / 15.5 |
| Dreams entered; chests opened | About 15; about 20 | 27; about 38 |
| Shop purchases; curiosities | 15; 3 | 27; 6 |
| Amulet merchant purchases (E5) | 11 | 22 |
| Quests completed | About 10, 3 of them slot quests | About 25, 4 slot quests and 2 Avatar quests |
| Duplications; Transfigurations | 1; 3 | 3; 7 |

Sales are the balancing item of the Essence ledger in both routes (E4). The
happy-path player loses more boss battles than the full-clear player because
their deck has seen fewer rewards.

| Channel | Happy path | Range | Full clear | Range |
| --- | --- | --- | --- | --- |
| Starting collection | 30 | 30 | 30 | 30 |
| Victory bundles, antes included | +36 (23 wins) | 32–42 | +117 (68 wins) | 105–130 |
| Guardian antes and picks | +50 (10 × 2 + 10 × 3) | 46–52 | +52 (11 × 2 + 10 × 3) | 45–58 |
| Shop purchases | +15 | 10–20 | +27 | 20–34 |
| Curiosities | +3 | 1–5 | +6 | 3–8 |
| Amulet merchant purchases | +11 | 7–14 | +22 | 15–24 |
| Chests | +7 | 5–9 | +13 | 10–16 |
| Prize duels | +4 | 0–6 | +8 | 5–12 |
| Trial antes and picks | +2 | 0–3 | +6 | 4–8 |
| Duplication | +1 | 0–2 | +3 | 1–5 |
| Site outcomes (Exploration, Augury, Random Site, Gamble) | +4 | 2–6 | +8 | 5–12 |
| Key prizes | 0 | 0 | +0.2 | 0–2 |
| Sales | −9 | −5 to −15 | −20 | −12 to −30 |
| Ante losses | −13 | −8 to −18 | −19 | −12 to −25 |
| Deliveries and purge costs | −3 | −1 to −5 | −6 | −3 to −10 |
| **Collection at Apollyon** | **≈ 138** | **125–160** | **≈ 247** | **210–260** |

Gross acquisition is about 133 copies over 60 battles on the happy path and
about 262 over 118 on a full clear: **2.2 per battle** either way, about 15%
above Shandalar Magician's 1.92. The happy path's battle count and collection
are close to the Shandalar route's 59 matches and 116 cards. A full clear
fights about twice as many battles and ends with about twice the collection.

Where the rate comes from differs by route:

- **Bosses.** The 21 required guardian and incarnation wins pay about 50
  copies, against Shandalar's 15 castle picks. They are over a third of the
  happy path's gross acquisition and about a fifth of a full clear's. Each
  extra pick per boss would add about 21 copies to every route, so picks stay
  at 1 per Avatar guardian and 2 per incarnation.
- **Challengers.** Optional challengers pay less per battle than bosses but
  supply most of a full clear's growth. Because their bundles grow by tier,
  skipping late-act challengers costs more than skipping early ones.
- **Fewer sales.** Purses and quests fund much of the player's spending, and
  D97 has no world magic or food to buy, so a full-clear player sells about 20
  cards instead of Shandalar's 32.

If playtests find the collection too large, the levers, in order of
preference, are the chest card weight, shop slot counts, guardian picks and
Essence purse sizes.

**Bag shape over the campaign.** On a full clear, about 49 bundle cards, 27 shop purchases, 13
chest cards and the site and trial picks, about 100 copies, come from the bag.
With ring 1 alone in Act 1 and second copies only from Act 3, a typical
campaign sees no random duplicate before Act 3 and few second copies before
Act 4. The happy path draws about 40 bag copies and sees fewer random
duplicates at every stage. Measure the duplicate share of bag draws by
stage.

## E4. Expected Essence ledger

| Income | Happy path | Full clear |
| --- | --- | --- |
| Starting Essence | 200 | 200 |
| Purses (mixed extras) | 260 (23 wins) | 765 (68 wins) |
| Essence chests, 62 each | 415 (6.7 chests) | 790 (12.7 chests) |
| Quest rewards | 505 (5 Essence quests) | 1,215 (12 Essence quests) |
| Essence site outcomes and Gamble, net | 110 | 250 |
| Sales, 50 each | 450 (9 cards) | 1,000 (20 cards) |
| **Total income** | **≈ 1,940** | **≈ 4,220** |

| Spending | Happy path | Full clear |
| --- | --- | --- |
| Shop purchases, 55 each | 825 (15) | 1,485 (27) |
| Restocks, 40 each | 80 (2) | 240 (6) |
| Curiosities, 83 each | 250 (3) | 500 (6) |
| Transfigurations, 45 each | 135 (3) | 315 (7) |
| Duplication, 60 each | 60 (1) | 180 (3) |
| Dreamsign Bazaar, 110 each | 330 (3) | 770 (7) |
| Amulet changer, 250 each | 250 (1) | 750 (3) |
| **Total spending** | **≈ 1,930** | **≈ 4,240** |

Sales are the balancing item: income before sales falls about 450 Essence
short of the modeled spending on the happy path and about 1,000 on a full
clear, so the player sells about 9 or 20 cards. Shandalar Magician's route
earns 1,900 and spends 1,270, of which 395 is food, over 59 matches, close to
the happy path's length.

**Levers, in order of preference:**

1. the amulet changer price;
2. chest Essence;
3. quest Essence;
4. purse sizes;
5. the sale formula, last because it also sets what loot is worth.

## E5. Expected amulet ledger

| Source or sink | Happy path | Full clear |
| --- | --- | --- |
| Starting amulets | 2 | 2 |
| Challenger extras, 1/4 per win | 6 (23 wins) | 17 (68 wins) |
| Quests | 4 (3 amulet quests, 1 trial) | 10 (7 amulet quests, 3 trials) |
| Chests, 1/3 each | 7 (20 chests) | 13 (38 chests) |
| Amulet changer | 1 | 3 |
| **Total received** | **≈ 20** | **≈ 45** |
| Amulet merchant purchases, 1.8 each | 20 (11 cards) | 40 (22 cards) |

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
ledgers in E3–E5. It runs three challenge policies:

- **Minimum:** fights only the 21 required bosses, retrying after losses.
- **Happy path:** fights about half of each act's challengers, preferring
  favorable antes and extras, and the bosses on its route.
- **Full clear:** fights every challenger and optional guardian it reaches
  before moving on.

**Acceptance targets** for a successful campaign at `d = 1`:

| Metric | Happy path | Full clear |
| --- | --- | --- |
| Campaign length | 50–70 battles | 110–130 battles; 25–35 hours |
| Gross acquisitions per battle | 1.9–2.3 | 1.9–2.3 |
| Collection at Apollyon | 125–160 copies | 210–260 copies |
| Victory bundle copies, antes included | 32–42 | 105–130 |
| Boss wins per boss battle | About two thirds to three quarters | About three quarters |
| Copies from outside the current tide set | 30% or more | 30% or more |
| Random duplicates before Act 3 | Under 5% of bag draws | Under 5% of bag draws |
| Amulet income | 16–26 | 38–52 |
| Essence income | 1,600–2,300 | 3,600–4,800 |
| Refill battles | Under 5% of battles | 5–15% of battles |

**The minimum route.** A strong minimum-route policy should beat Apollyon
within 25 battles in under 5% of runs, and its median campaign should take
far more battles than the happy path, mostly boss retries. If it gets close
to the happy path's length, harden the late bosses (tier offsets, head
starts) before shrinking rewards.

**Endgame:**

| Metric | Target |
| --- | --- |
| Keys paid per finished key dream | 1.3 or more |
