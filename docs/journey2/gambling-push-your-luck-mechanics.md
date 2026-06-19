# Gambling, Push-Your-Luck & Repeated-Choice Event Mechanics

A survey of risk-staking event design across **Slay the Spire**, **Slay the Spire 2**,
**Monster Train**, and **Monster Train 2**, drawn from a combined corpus of ~180 events.
The goal is to extract the *structures* these games use to make a player voluntarily
stake a resource against an uncertain or escalating return, and to identify the common
design themes worth borrowing.

---

## 1. Scope and method

This report covers three overlapping families of event mechanic:

1. **Gambling** — a single decision with a *random* outcome the player bets a resource on.
2. **Push-your-luck** — an *escalating* commitment the player can stop at any step, where
   continuing raises both the potential reward and the chance/size of loss.
3. **Repeated / tiered choice** — events the player engages with multiple times, or that
   offer escalating "pay more for more" tiers, with or without randomness.

These categories bleed into each other. A push-your-luck event is usually also a repeated
choice; a tiered merchant is a repeated choice without randomness. The taxonomy below
separates them by their *core tension* rather than treating them as disjoint sets.

**Attribution note.** Game-of-origin is assigned as follows:

- **Slay the Spire 2** is identified reliably by its act-region names — **Underdocks** and
  **Overgrowth** (Act 1), **Hive** (Act 2), **Glory** (Act 3). Events tagged with these
  regions are STS2.
- **Slay the Spire (1)** is the classic Act 1/2/3 / Shrine set (Neow, Dead Adventurer,
  Scrap Ooze, Knowing Skull, The Joust, etc.). Several shrine events recur in STS2; origin
  is credited to STS1.
- **Monster Train** is identified by its vocabulary — Pyre, Ember, Capacity, clans,
  Artifacts, Railspikes, Pact Shards, Rings. The **MT1 vs. MT2** split is *not* cleanly
  recoverable from this corpus, so Monster Train events are grouped as one design lineage
  with **MT2-confident markers flagged** (Railspike/Railforged systems, the
  crossover-game events such as Balatro / Cult of the Lamb / Inscryption / Inkbound, the
  Capacity-gambling Iceberg event, and the Pact-Shards "Divine Artifact" DLC chain). Treat
  MT1/MT2 attributions as "Monster Train family" unless flagged.

---

## 2. Taxonomy at a glance

| Family | Core tension | What you stake | When loss resolves |
|---|---|---|---|
| **One-shot gamble** | Single coin-flip; pick your odds | Gold / HP / a relic | Immediately, once |
| **Attrition push-your-luck** | "How greedy am I?" — each pull is a guaranteed small cost | HP (usually), Gold | Gradually; no sudden wipe |
| **Cliff / collapse push-your-luck** | "Do I risk losing everything?" — a probabilistic catastrophe ends the chain | Accumulated gains + entry cost | Suddenly, on a bad roll |
| **Tiered "pay-for-more"** | Resource budgeting, not luck | Gold (mostly) | No loss; opportunity cost only |
| **Deferred / multi-stage chain** | Patience & commitment across the run | A deck slot / a behavior over time | Battles later (Monster Train signature) |

---

## 3. Catalog by mechanic family

### 3A. One-shot gambles (random outcome)

| Event | Game | Structure |
|---|---|---|
| **The Joust** | STS1 | Bet 50 gold on the Murderer (safe — 100 gold payout) or the Owner (risky — 300 gold) on a random duel. The clearest "pick your odds" bet in the corpus. |
| **Wheel of Change** | STS1 | One spin, six possible outcomes: gold, full heal, upgrade a card, **gain a random curse**, take 10% max-HP damage, or a random relic. Pure slot machine — the downside slices are baked into the same pull. |
| **The Mausoleum** | STS1 | Open the sarcophagus for a relic with a **50% chance** of also gaining a Writhe curse, or leave safely. Reward is guaranteed; the *rider* is the gamble. |
| **Golden Shrine** | STS1 | Pray for 100 gold (safe) **or** desecrate for 275 gold + a Regret curse. Not random — a fixed greed/penalty trade — but the canonical "take the safe payout or the dirty one." |
| **Crystal Sphere** | STS2 (likely) | Pay 56 gold to divine 3 times, or take a Debt curse to divine 6 times. Randomized divinations; the curse buys more rolls. |
| **Let's give 'em Hell** | Monster Train (DLC, Pact-Shards) | A **50/50 random** split between two strong artifacts, gated behind heavy meta-progression conditions. Gamble between two upsides rather than up vs. down. |

### 3B. Push-your-luck — attrition model (each step is a guaranteed cost; risk is *overspending*)

These are the genre's signature events. You may stop after any step; tension is entirely
self-imposed greed against a draining resource (almost always HP).

| Event | Game | Escalation curve |
|---|---|---|
| **Scrap Ooze** | STS1 | Lose 3 HP for a **25%** relic chance; each further reach costs **+1 HP** and **+10%** chance. Two curves (cost up, odds up) crossing — the textbook example. |
| **Sensory Stone** | STS1 | Each touch grants a random colorless card of **increasing rarity** at an **escalating HP cost**. Reward *quality* climbs instead of odds. Leave anytime. |
| **Knowing Skull** | STS1 | Buy answers at rising HP costs (6 HP → gold, 11 HP → potion, 21 HP → card, …); even leaving costs 1 HP. Gated behind a minimum HP — the floor that stops a death spiral. |
| **Colossal Flower** | STS2 (Hive) | Three escalating tiers: pay **35/75/135 gold** *or* **5/6/7 HP** to descend toward the Pollinous Core relic. Player picks how deep to go; cost rises per tier. |
| **Endless Conveyor** | STS2 (Underdocks) | Pay **35 gold per pull** for escalating benefits, repeatable, or skip to upgrade a card. Gold-fueled attrition. |
| **Abyssal Baths** | STS2 (Underdocks) | Immerse repeatedly: **+2 max HP** but **3–4 damage** each time. A rare *gain*-flavored attrition — you trade current HP for permanent max HP. |
| **Tablet of Truth** | STS2 (Overgrowth) | Accept repeatedly: **−3 max HP, upgrade a random card** each time. Permanent-resource attrition for incremental upgrades. |

### 3C. Push-your-luck — cliff / collapse model (a bad roll forfeits accumulated gains)

Here continuing risks a probabilistic catastrophe that ends the chain and can wipe what
you've banked. The fear is *losing it all*, not *overspending*.

| Event | Game | Collapse mechanic |
|---|---|---|
| **Dead Adventurer** | STS1 | Each search has an **escalating 25% → 50% → 75%** chance to wake an Elite (a real, dangerous fight); escaping clean awards gold + relic + maybe a potion. Leaving is free. The canonical ambush-risk chain. |
| **Clipped Wings** | Monster Train | Take Wings now, or **Search Deeper**: ~50% to find Uncommon wings with a **10–50% collapse risk per round**, then a further shot at Rare wings with **25–50% collapse**. Explicit, stacking collapse probability — the purest collapse-model event in the set. |
| **Gremlin Looter** | Monster Train | Gain a consumable, then **"haggle" for a 25% chance** to draw another, repeating until haggling fails. Each success tempts another roll against a flat fail chance. |
| **Cave of a Thousand Eyes** | Monster Train | Pay 25 coins or 5 HP for a **10/25/50/75% shared-escalating** chance at an artifact; **retry on failure with higher odds**. Failure isn't catastrophic but the cost-per-attempt accumulates. |
| **Archus** | Monster Train | Offer **10 Pyre HP for a 50%** artifact chance, repeatable up to 4 times (10/10/10/20 HP); paying the full 50 guarantees a payout. Repeated independent gambles with a pity backstop. |
| **Cursed Tome** | STS1 | Commit to reading through **four "pages," each dealing escalating HP damage**, to reach a guaranteed rare book relic. Leaving is safe; once you start, you're paying the whole staircase. |
| **The Colosseum** | STS1 | Beat one elite, then **flee with rewards or continue** into a second, harder elite for a rare relic — combat-flavored "double or nothing." |

### 3D. Tiered "pay-for-more" (repeated choice, little/no randomness)

The "luck" here is whether you'll *need* or *afford* the option later — opportunity cost,
not a dice roll.

| Event | Game | Tiers |
|---|---|---|
| **The Woman in Blue** | STS1 | 20 gold per potion, up to 3; at least one purchase required to leave. |
| **Zen Weaver** | STS2 (Hive) | 50 / 125 / 250 gold tiers for add/remove/special card effects. |
| **Welcome to Wongo's** | STS2 (Hive) | 100 / 200 / 300 gold for common relic / rare relic / multi-combat ticket. |
| **Tea Master** | STS2 | 50 / 150 gold tiers for scaling benefits; refusing shuffles 2 Dazed into your draw pile (a penalty for walking away). |
| **Designer In-Spire** | STS1 | Tiered gold packages for upgrade / transform / removal services. |
| **Battleworn Dummy** | STS2 (Glory) | **Pick a difficulty** (75/150/300 HP target, kill in 3 turns) for escalating rewards — a self-selected risk tier rather than a price tier. |
| **Doll Room** | STS2 (Hive) | Pick one relic from three dolls, with **escalating risk per additional pick** — a tiered choice that crosses back into collapse push-your-luck. |

### 3E. Deferred / multi-stage chains — the Monster Train signature

Monster Train (especially MT2) converts a single choice into a *run-spanning commitment*:
you choose now, and the payoff — or an escalation — arrives several battles later, often
**gated on your behavior in between**. This is the family's distinctive contribution to the
repeated-choice space; STS uses it far less.

| Chain | Game | Mechanic |
|---|---|---|
| **Abandoned Winged → Heaven's Aid → Heaven's Finest** | Monster Train | Purge a card now; 2 battles later reclaim it upgraded; hold it again for an even stronger version. Each stage rewards *waiting*. |
| **Heph the Blacksmith** | MT2 (Railspike) | Take Railspikes/Spikedrivers; once you own **4+ copies**, Heph **returns** and mass-upgrades them. Payoff gated on how much you committed to the card. |
| **Lifemother's Remnant** | Monster Train | Take a weak artifact now, or wait two Rings for it to upgrade twice — and **pay Pyre HP to shorten the wait**. Patience vs. HP as explicit trade. |
| **Armageddon Battlefield** | Monster Train | Take a Purge spell; **keep it in your deck for 2 battles** to revisit the field and earn a powerful conversion artifact. |
| **Malicka Purge** | MT2 (DLC) | A **recurring** event (up to 4 times, once every 2 battles): heal Pyre in exchange for Pact Shards, with both heal and cost escalating each appearance. |
| **Inscryption / Dante / Balatro / Mysterious Figure** | MT2 (crossover & guest) | Initial pick now, follow-up encounter later granting the pieces you skipped or a capstone reward. |

A related Monster Train pattern is the **random-clan fan-out**: events such as Railspikes,
Glowing Brands, Wreckage Remains, Historian's Records, Library, and Abandoned Train offer
"1 of 3 **random** clans," then a deterministic pick. The gamble is *which factions you're
shown*, not the outcome of the pick — a controlled way to inject variance without a
feel-bad random result.

---

## 4. Cross-cutting design themes

**1. HP is the universal gambling chip.** Across all four games, the dominant stake in
push-your-luck is health (Scrap Ooze, Sensory Stone, Knowing Skull, Dead Adventurer, Cave
of a Thousand Eyes, Archus, Colossal Flower, Cursed Tome). HP is finite but renewable, so
spending it is self-limiting — the player's current health *is* the natural stop signal.
Gold is the secondary stake (The Joust, Endless Conveyor, the tiered merchants); permanent
**max HP** is the highest-stakes chip, reserved for the biggest commitments (Abyssal Baths,
Tablet of Truth).

**2. "Leave anytime" makes the greed self-inflicted.** The strongest push-your-luck events
(Scrap Ooze, Sensory Stone, Knowing Skull, Dead Adventurer, Cave) let the player stop after
*every* step and resolve each outcome before deciding to continue. The tension is authored
by the player, not the game — which is exactly what makes overreaching feel like the
player's own fault and stopping feel like discipline. Both outcomes are satisfying.

**3. Two escalation curves move together.** Each additional pull costs more *and* improves
the return — either the **odds** (Scrap Ooze +10%/reach; Dead Adventurer +25%; Cave's
10→25→50→75%) or the **reward quality** (Sensory Stone's rising rarity; Knowing Skull's
gold→potion→card ladder). The crossing of "cost rising" against "value rising" is the core
mathematical shape of the genre.

**4. Attrition vs. collapse is the key design axis.** Two structurally different risk
models recur:
   - *Attrition* (§3B): every step is a guaranteed small cost; you can't be wiped, only
     bled. Risk = overspending. Calmer, more calculable, dopamine from each small win.
   - *Collapse* (§3C): a probabilistic catastrophe can end the chain and forfeit banked
     gains (Dead Adventurer's elite, Clipped Wings' collapse %, Gremlin Looter's failed
     haggle). Risk = losing it all. Spikier, more thrilling, harsher feel-bad.
   Choosing which model an event uses sets its entire emotional register.

**5. Curses are the "house edge."** Rather than immediate loss, many gambles attach a
**permanent curse / dead card** as the downside or as the price of the greedy branch —
Golden Shrine's Regret, Mausoleum's Writhe, Crystal Sphere's Debt, This or That's Clumsy.
This converts the cost into a long-tail deck-pollution tax the player feels for the rest of
the run, which is often a *scarier* deterrent than HP loss because it can't be healed.

**6. Transparency turns gambling into an EV decision.** Slay the Spire exposes exact
probabilities (25%→50%→75%, +10% per attempt, 50% riders), so push-your-luck becomes a
*calculable* expected-value problem, not blind superstition. The skill expression is in
reading the odds against your current HP and run state — the randomness is honest. This is a
deliberate, repeatable design contract worth preserving.

**7. Pick-your-risk-tier vs. risk-that-unfolds.** Some events make you commit to a risk
level up front (The Joust's safe/risky payout, Battleworn Dummy's difficulty, Colossal
Flower's tiers) — one decision, then it resolves. Others unfold step by step with
information between steps (Scrap Ooze, Dead Adventurer). The step-by-step form gives more
agency and more dopamine beats; the up-front form is cleaner and faster.

**8. Floors and pity backstops keep the spiral survivable.** Knowing Skull requires a
minimum HP to engage; Archus guarantees a payout if you pay the full 50 HP. These guardrails
stop push-your-luck from becoming a death spiral and reassure the player that maximum
commitment can't be pure waste.

**9. A cost to walk away tightens the screws.** A few events punish *refusal* rather than
only the greedy branch — Tea Master shuffles in Dazed if you decline; The Woman in Blue
forces at least one purchase. This removes the trivial "always skip if unsure" default and
forces genuine engagement.

---

## 5. Per-game tendencies

- **Slay the Spire (1)** is the home of the **transparent attrition push-your-luck**:
  HP-cost-per-pull, published odds, leave-anytime (Scrap Ooze, Dead Adventurer, Sensory
  Stone, Knowing Skull). It rounds this out with a few crisp one-shot gambles (The Joust,
  Wheel of Change, Mausoleum). Greed is self-limited by HP and made legible by exact
  probabilities.

- **Slay the Spire 2** keeps STS1's template but leans harder on **self-selected risk
  tiers** and region-flavored escalation: Colossal Flower's three tiers, Battleworn Dummy's
  difficulty choice, Doll Room's escalating multi-pick. It also expands **tiered
  pay-for-more merchants** (Zen Weaver, Wongo's, Tea Master) and sometimes charges you to
  walk away.

- **Monster Train (family)** spends less on pure attrition and more on:
  (a) **deferred multi-stage chains** that gate a payoff on later behavior (Heaven's Aid,
  Heph, Lifemother's, Armageddon Battlefield) — turning one choice into a run-long
  commitment; (b) **collapse-model** push-your-luck (Clipped Wings, Gremlin Looter, Cave of
  a Thousand Eyes); and (c) **random-clan fan-out** offers that gamble on *what you're
  shown* rather than the outcome.

- **Monster Train 2** specifically adds the **crossover-game** events (Balatro, Cult of the
  Lamb, Inscryption, Inkbound), the **Railspike / Railforged** commitment systems, the
  **Capacity gamble** (Iceberg: trade train Capacity for power), and a **meta-progression
  gamble** layered on top via Pact Shards and Divine Victories — a wager that pays out
  across *runs*, the longest-horizon version of the genre in the corpus.

---

## 6. Implications for our journey design

Distilled into actionable levers for the Dream Journey:

1. **Pick a stake the player feels.** HP works because it's finite-but-renewable and
   self-limiting. Identify our equivalent renewable resource so escalation has a natural
   stop signal built into the player's own state.
2. **Decide attrition vs. collapse per event, deliberately.** They produce opposite
   emotional registers. A journey wants some of each, not an accidental monoculture.
3. **Show the odds.** Transparent probabilities make push-your-luck a skill-expressing EV
   decision and keep the randomness honest — a strong fit for our explainability/logging
   priorities (every roll and its published odds should be reconstructable from the log).
4. **Let the player stop after each step, with the outcome revealed.** Self-authored greed
   is the whole appeal; resolve-then-decide beats commit-blindly.
5. **Use long-tail costs, not just immediate ones.** A permanent dead card / negative
   modifier is often a scarier and more interesting deterrent than instant resource loss.
6. **Consider Monster Train's deferred chains for run-spanning texture.** A choice that pays
   off (or escalates) several encounters later — gated on what the player does in between —
   is a distinctive, underused structure that rewards planning and commitment.
7. **Add floors and pity backstops** so maximum commitment is never pure waste and the
   spiral stays survivable.

---

## Sources

- [Slay the Spire 2 — All Events and Rewards Guide (KeenGamer)](https://www.keengamer.com/articles/guides/slay-the-spire-2-all-events-and-rewards-guide/)
- [Slay the Spire 2 Events (Mobalytics)](https://mobalytics.gg/slay-the-spire-2/encounters/events)
- [Slay the Spire 2 Events — All Choices & Outcomes (sts2front)](https://sts2front.com/events/)
- [Overgrowth — Slay the Spire 2 Wiki](https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Overgrowth)
- [Dead Adventurer — Slay the Spire Wiki](https://slay-the-spire.fandom.com/wiki/Dead_Adventurer)
- [Scrap Ooze — Slay the Spire Wiki](https://slaythespire.wiki.gg/wiki/Scrap_Ooze)
- [Knowing Skull — Slay the Spire Wiki](https://slaythespire.wiki.gg/wiki/Knowing_Skull)
- [All Events in Slay the Spire (slaythespire.gg)](https://slaythespire.gg/events)
- [Monster Train 2 — Destiny of the Railforged update](https://monstertrain2.miraheze.org/wiki/Third_Major_Update)
- [Railspikes (event) — Monster Train 2 Wiki](https://monstertrain2.miraheze.org/wiki/Railspikes_(event))
- [Pact Shards — Monster Train Wiki](https://monster-train.fandom.com/wiki/Pact_Shards)
- [Overworld Events — Monster Train Wiki](https://monster-train.fandom.com/wiki/Overworld_Events)
- Primary corpus: `~/Documents/events/mt_sts_combined.txt` (~180 events across the four games)
