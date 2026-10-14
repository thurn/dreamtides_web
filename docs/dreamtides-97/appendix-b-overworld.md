# Appendix B: Overworld, encounters and sieges

This appendix specifies the world D97 generates and how time, travel,
monsters, lairs, quests and sieges behave in it. Notation follows
[Appendix A §A1](appendix-a-economy.md#a1-notation). Values are catalog
tunables.

[Back to the design overview](README.md)

## B1. World generation

At campaign start, from the campaign seed, D97:

1. Deals the campaign pool and computes its slices (Appendix A §A2).
2. Generates a 64 × 64 tile continent: land, water, roads, open ground and
   rough ground.
3. Divides it into five contiguous realms and assigns each a featured slice
   (B2).
4. Places 128 settlement slots with tiers (B3).
5. Places one castle per realm and ten dungeons (Appendix C §C1).
6. Assigns settlement features: specialties, Dream Guide services, guide home
   cities, world magic sellers and sage kinds (B4).
7. Builds the realm rosters (B7).
8. Seeds dungeon treasure (Appendix C §C2).
9. Seats the castle lords (Appendix C §C6).

Generation retries until its constraints hold, as Shandalar's does: at least
30 towns and cities, at least four in each realm, and every castle and dungeon
placed. The world is then fixed for the campaign. Only stock, occupants and
dungeon positions change.

Origin: `world_generation.c`, including its 128 town slots, the 30-larger-town
minimum and retry loop.

## B2. Realms and terrain

- **Realms.** Five realm seeds sit spread around the continent. Each land tile
  belongs to the nearest seed under a noise-warped distance, so realms are
  contiguous, irregular and of similar size.
- **Featured slices.** The player starts in the **home realm**, which features
  the signature core. The other four take the pool's joined facets in join
  order, cycling when fewer than four joined (Appendix A §A2).
- **Names and art** use the five resonances cosmetically (Ember, Valor, Vision,
  Wild, Shadow), assigned at random, and so do the realms' amulets. Resonance
  has no other effect.
- **Terrain classes:**

| Class | Travel cost per tile | Notes |
| --- | --- | --- |
| Road | ½ | Roads connect most towns and cities |
| Open | 1 | Most land |
| Rough | 2 | 1 with Dwarven Pick |
| Water | — | Impassable |

Shandalar's terrain is patchy, with its five colors interleaved. D97 uses
contiguous realms so that featured slices, amulets and castles read clearly.

## B3. Settlements

- **Slots.** 128 slots at land tiles, at least 3 tiles apart.
- **Tiers.** Slots are processed in seeded order:
  - a slot becomes a **city** if no city lies within 12 tiles;
  - otherwise a **town** if no town or city lies within 6 tiles;
  - otherwise a **village**.
- **Constraints.** At least 30 towns and cities in all, and at least 4 in each
  realm; otherwise regenerate.
- **Castles.** One castle tile per realm, at least 8 tiles from the realm's
  border.
- **Starting position.** The player starts in a random town of the home realm.

## B4. Settlement features

| Feature | Rule |
| --- | --- |
| **Card shop** | Every settlement (Appendix A §A6) |
| **Specialty** | Towns and cities only. Start an offset `k = U{0..11}`. For each town or city in slot order, odd `k` gives a slice catalog and even `k` a category catalog, then `k = k + 1`. Slice catalogs cycle through the pool's slices: core first, then facets in join order. Category catalogs cycle through Characters, Events, Fast, cost ≤ 1 and cost ≥ 4, skipping any with fewer than 8 eligible pool cards. |
| **Dream Guide services** | Each town gets 1 and each city 2, drawn from Transfiguration, Duplication and Dreamsign Bazaar. Each realm has at least one of each. |
| **Guide home cities** | Each realm hosts two guides (Appendix D §D2) in two distinct cities; if a realm has one city, its largest town is promoted. A home city adds its guide's enhanced service. |
| **World magic sellers** | Each world magic Dreamsign is assigned to a distinct town or city of its realm, preferring settlements that aren't guide homes. |
| **Sage kind** | `(x mod 2) + (y mod 3)` of the settlement's tile, giving 0–3 (B13) |

Origin: the specialty scan in `world_generation.c`. Shandalar alternates color
and card-type specialties from a random start, and assigns world magic cities.

## B5. The clock and travel

- **World clock `W`.** Each tile entered adds its travel cost (B2). Quickening
  halves costs. The UI shows the clock as days.
- **Siege clock `Σ`.** It advances by the same amounts, plus the siege
  accelerations in B14.
- **When the clock is frozen.** Battles, services, menus and deck editing take
  no clock time, and neither do dungeon and castle boards. The world clock
  advances only on the overworld.
- **Monster movement.** Chasing monsters move at three quarters of the player's
  base speed on the same terrain costs.

Origin: Shandalar's movement loop in `adventure_input.c`. It advances the
economy clock and the siege clock once per 32 movement ticks, about one tile,
with terrain and roads changing speed. Food consumption runs on the same tick
in Shandalar and has no D97 analog.

## B6. Roaming slots and the spawn table

Six roaming slots (0–5) hold monsters or lairs near the player. A seventh slot
holds a siege attacker (B14).

**Respawn trigger.** A roaming slot spawns again when it's empty, or when its
occupant is more than 4 tiles from the player along either axis. The spawn tile
is a random land tile on the square ring 4 tiles from the player.

**Spawn roll.** For a spawn tile in realm `R`:

```
v     = floor(lairsExplored / 8) + (wins against monsters in realm R)
range = clamp(floor(128 / (v + 4)), 6, 20)
roll  = U{0..range − 1} + floor(5 / (v + 1))
```

| `roll` | Outcome |
| --- | --- |
| 0, 1, 2, 4 | High tier: `U{0..199}` → <50: 10, <85: 11, <115: 12, <142: 13, <165: 14, <185: 16, else 18 |
| 5 | Tier 8 |
| 6, 8, 11 | Tier 6 |
| 7, 10, 13, 15 | Tier 4 |
| 3, 9, 12, 14, 16+ | Lair |

A monster's Avatar is drawn uniformly from `R`'s roster (B7), excluding
hunted-out Avatars.

**Spawn gates:**

- At Apprentice, slot 5 holds lairs only.
- A slot cannot spawn a monster sooner than
  `(4 − d) × 2.19 / (1 + (W / 1082)²)` clock units after its previous spawn.
- No monster spawns in a realm whose lord is defeated; that roll leaves the
  slot empty.
- While a bounty quest is active, slot 0 spawns only the bounty target.
- A spawn onto an occupied tile is cancelled.

**Hunted out.** After 9 wins against one Avatar in one realm, that Avatar
stops spawning there.

Expected outcomes from this table, using `S = 1 + floor(T/2)` and the mean pool
bundle sizes:

| `v` | P(lair) | Mean tier | Mean budget `S` | Mean bundle `E[N]` | P(amulet) |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.60 | 5.3 | 3.6 | 2.45 | 0.116 |
| 1 | 0.50 | 6.7 | 4.3 | 2.87 | 0.133 |
| 2–4 | 0.45–0.31 | 7.2 | 4.6 | 3.02 | 0.139 |
| 5 | 0.21 | 8.0 | 5.0 | 3.24 | 0.149 |
| 6–7 | 0.17–0.18 | 8.4–8.7 | 5.2–5.3 | 3.36–3.44 | 0.155 |
| 8+ | 0.11–0.20 | 9.3 | 5.6 | 3.61 | 0.164 |

Origin: `UpdateWorldLairAndMonsterSlots`, including the case table, the
200-point high-tier subroll, the difficulty slot gates, the respawn formula
(converted from monster-timer ticks at 32 per clock unit) and the
more-than-8-victories cut-off. Shandalar counts victories against a color; D97
counts victories in a realm.

## B7. Rosters, tiers and opponent construction

**Realm rosters** (Q44) are fixed at world generation and keyed by Avatar UUID:

- **Facet realms.** A realm featuring facet F is home to every signatured
  Avatar, other than the player's, whose tide pool lists F among its facets.
  Each facet is shared by 2–8 signatured Avatars. Realms featuring the same
  facet share a roster.
- **Home realm.** It's home to the signatureless Avatars. When one spawns there,
  its tides4 pool borrows the player's own archetype (the signature tide entry
  the player's pool used) instead of a random one, so home-realm opponents play
  the player's theme.
- **Top-up.** A roster with fewer than 4 Avatars is topped up with random
  signatureless Avatars. When such an Avatar spawns in a facet realm, it
  borrows a random roster member's archetype.
- **The player's own Avatar** never spawns.

**Deck construction** reuses the existing tide opponent builder
(`buildTideOpponentDeck`):

- Build 30 distinct cards from the Avatar's tides4 pool.
- The affinity context is its joined tides, plus one for the realm's featured
  facet tide, if any. This replaces the dreamscape affiliation bias.
- Selection takes the top band by [affinity, rarity].

Tier sets the knobs:

| Tier | Ability | Starter dilution | Selection band | Dreamsigns | Transfigured cards | Legendaries | Opponent head start |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | dormant | 6 | 50% | 0 | 0 | no | 0 |
| 6 | active | 3 | 40% | 0 | 0 | no | 0 |
| 8 | active | 0 | 30% | 1 | 0 | no | 0 |
| 10–11 | active | 0 | 25% | 1 | 2–3 | no | 1 |
| 12–13 | active | 0 | 20% | 2 | 4–5 | yes | 2 |
| 14 | active | 0 | 15% | 2 | 6 | yes | 3 |
| 16 | active | 0 | 10% | 3 | 8 | yes | 4 |
| 18 | active | 0 | 10% | 3 | 10 | yes | 5 |
| 20 (lord) | Aspect | — | curated | curated + 2 | 10 | yes | 6 |

**How to read the knobs:**

- **Selection band:** the share of ranked candidates sampled per pick. A wider
  band gives a weaker, less coherent deck. The journey default is 25%.
- **Transfigured cards:** that many deck cards receive one random applicable
  transfiguration.
- **Dreamsigns:** chosen by the existing affinity rule from live Dreamsigns
  only.
- **Difficulty:** opponent head start adds `d` at every tier.

Opponents' decks come from their own pools, not the player's. Facet-neighbour
rosters make them share the realm's theme, so their stakes usually come
straight from the player's pool (Appendix A §A9).

Origin: Shandalar's opponent life of `tier + 2d` (more for named foes) and
monster decks by tier. Dreamtides has no life total and no AI difficulty
levels (decision D24), so D97 converts tier into deck quality and a head start.

## B8. Battle setup

- **Score target:** 25⍟ for every D97 battle.
- **Player head start:**
  `min(L, 8)` + 1 (Sword of Resistance) + a pending blessing (sage +2, or spoils
  `U{1..4}`, consumed) + dungeon aid, capped at 12. `L` counts linked towns and
  cities that aren't captured (B10).
- **Opponent head start:** knob(T) + `d` + dungeon attrition carry
  (Appendix C §C5).
- **Opening hands:** 5 each, +1 for the player with Sleight of Hand. The player
  goes first and skips the first draw, as in the journey mode.
- **Dreamsigns:** the player's held Dreamsigns, and the opponent's per the knob
  table.
- **Player deck:** the active deck as built. If it's below the minimum, the
  safety net pads it with temporary, unowned Starter copies, which leave after
  the battle.

The engine supports per-side starting score, opening hand, Avatar, Dreamsigns
and placements (`BattleSetup`); D97 needs no engine rule changes.

## B9. Contact, decline and tribute

- **Contact.** It happens when a chasing monster reaches the player's tile, or
  when the player walks into any monster. Staff of Thunder stops monsters of
  tier ≤ 8 from chasing.
- **Pre-battle screen.** It shows the opponent's Avatar, tier, three signature
  cards and head starts, and both stakes (three each when high-stakes).
- **Fight.** Start the battle.
- **Decline.** Free. The monster moves to the ring tile opposite the player,
  keeps its stakes, and doesn't chase for 8 clock units.
- **Tribute.** If the player has at least 5 wins against this Avatar and a
  coin flip at contact succeeds, the screen also offers Tribute. The player
  takes one of:
  - one card from the opponent's deck that is in the player's pool
    (non-Legendary);
  - one clue (if a clue target exists);
  - Essence `10 × (2 + floor(T/2))`.

  Tribute ends the encounter and counts as neither a win nor a loss.
- **High stakes.** Each spawned monster of tier ≥ 12 is high-stakes with
  probability 1/10 (Appendix A §A9).
- **Afterward.** After any result or tribute, the monster leaves.

Origin: Shandalar's bribe, flee, surrender and tribute options
(`world_lair_monster_encounter.c`, "after five matching victories"). D97
replaces forced confrontation with a free Decline (Q10).

## B10. Dreamlinks

- **What it is.** A Dreamlink is a flag on a settlement, set by quests
  (Appendix A §A13).
- **Head start.** Only uncaptured towns and cities count: each gives +1⍟
  starting score, up to 8 (B8).
- **Linked village.** It gives no head start, but always offers travel or
  delivery quests (B12).
- **Loss.** Capture clears a settlement's Dreamlink; liberation doesn't
  restore it.

Origin: `CountDuelPoolEligibleTowns`, which counts linked, unoccupied type 2
and type 3 settlements, and the quest generator's linked-village branch.

## B11. Lairs

**Lifecycle.**

- A lair's outcome is rolled when it spawns and revealed when the player
  enters.
- Entering consumes the lair and increments `lairsExplored`, which feeds `v`.
- A lair left more than 4 tiles behind despawns unvisited.

**Outcome table**, with weights out of 100 (Q23):

| Group | Outcome | Weight |
| --- | --- | --- |
| Ordinary find (40) | One weighted draw from the eligible cards of the realm's featured slice | 40 |
| Dreamtides event (30) | Exploration | 12 |
| | Augury | 6 |
| | Gamble | 4 |
| | Dreamsign Revelation | 3 |
| | Dreamsign Reward | 2 |
| | Random Site | 2 |
| | Essence (200–300) | 1 |
| Shandalar special (30) | Rare-card duel | 10 |
| | Dungeon clue | 7.5 |
| | Essence windfall or wager | 2.5 |
| | Amulet treasure or wager | 2.5 |
| | Amulet vendor | 2.5 |
| | Exact-card Essence merchant | 2.5 |
| | Exact-card amulet merchant | 2.5 |

**Notes.**

- The specials keep Shandalar's relative frequencies from lair codes 5–18,
  scaled to 30. Riddle codes become clues, and the temporary duel-benefit codes
  are not used.
- A clue outcome with no clue target becomes an ordinary find.
- Dreamtides events run their standard (not enhanced) site behavior, drawing
  cards from the pool, with the adaptations in Appendix D. Their economics are
  in Appendix A §A14.

Origin: lair event generation in `world_lair_monster_encounter.c`. Shandalar
gives an ordinary find in two of three timer phases (half of those a basic
land) and special codes 5–18 otherwise.

## B12. Quests

**Offers.**

- A settlement offers a quest when the player has none active and
  `W − lastOffer(settlement) > 16 × (d + 3)`.
- Showing the offer starts that settlement's cooldown.
- Master Takeshi's home city always offers a bounty.

**Type.**

- **At a village, travel or delivery.** This happens with probability 2/3, or
  always when the village holds a Dreamlink.
  - **Destination:** a random uncaptured town or city 8–16 tiles away. The upper
    bound widens by 1 per 16 failed tries.
  - **Quest kind:** with probability ½ a delivery. Otherwise a travel quest:
    link or amulet with equal odds.
  - **Delivery card:** a copy from the destination realm's featured slice, of
    type Character if the destination's slot index is even, Event if odd.
  - **No amulet held:** a link quest becomes an amulet quest when the player
    holds no amulet of the destination's realm.
- **Otherwise, a bounty.** This covers towns, cities and the remaining third of
  villages.
  - **Target:** with probability ¾, the monster in a random occupied roaming
    slot; otherwise a random Avatar of the settlement's realm roster at tier
    `2 × U{2..9}`.
  - **Spawning:** the target occupies roaming slot 0 until beaten.

**Deadlines and completion.**

| Kind | Deadline |
| --- | --- |
| Travel | `W + 63` |
| Delivery | `W + 79` |
| Bounty | `W + 47` |

- A travel or delivery quest completes on arrival at the destination.
- A bounty completes when the player beats the target and returns to the giver
  before the deadline.
- An expired quest lapses with no penalty. Rewards are in Appendix A §A13.

Origin: quest generation and completion in `visitLocation.c`.

## B13. The sage

Each settlement's sage gives free advice once per visit:

1. **Quest reminder.** While a quest is active, the sage first reminds the
   player of the destination and its direction with probability 2/5.
2. Otherwise the settlement's fixed **kind** applies:

| Kind | Advice |
| --- | --- |
| 0 | Names the city selling an unowned world magic Dreamsign |
| 1 | Reveals a clue for the clue target (Appendix C §C3); acts as kind 2 when there is no target |
| 2 | A blessing: +2⍟ head start in the next battle, unless one is already pending |
| 3 | A challenge: a monster from the realm's roster, rolled with the spawn table, appears beside the settlement for the player to engage or ignore |

Origin: `VisitTownWiseman`. Shandalar's food gift and unreachable duplication
branch have no D97 analog.

## B14. Sieges, capture and liberation

**Siege clock.**

```
when Σ reaches a multiple of 64:          start a siege (if none is active)
                                          Σ += clamp(d + floor(Σ / 256), 0, 16)
when Σ mod 64 reaches 24:                 resolve the active siege
                                          Σ += clamp(2d + floor(Σ / 64), 0, 32)
```

The first siege starts at `Σ = 64`. The jumps shorten the response window and
the gap between sieges as the campaign ages and with difficulty.

**Target.** For each uncaptured town or city:

- find the nearest castle whose lord is undefeated;
- score it `32 × townsHeld(lord) + U{0..127}`.

The lowest score's town is besieged by that lord, so lords holding fewer towns
attack more often.

**Attacker.** It's a random Avatar from the roster of the lord's realm, at tier
`[4, 6, 8, 12][floor(Σ / 128)]`. Once `floor(Σ / 128) ≥ 4`, the tier is 12 or
16 by the town's row parity. The attacker occupies the siege slot on the town
tile and doesn't chase. A news screen announces the siege.

**Defense.** Beating the attacker before resolution breaks the siege. It counts
as an ordinary win, with a bundle in the besieged town's realm and an amulet
roll. A loss or a Decline leaves the siege running.

**Capture.** At resolution, if the attacker remains:

- the town is captured: services close, stock freezes and its Dreamlink
  clears;
- if the lord then holds 3 towns (5 with Ring of the Guardian), the campaign
  ends in defeat.

**Liberation.** Entering a captured town offers a liberation duel. The occupier
is an Avatar from the roster of the lord's realm, at the current siege tier. A
win pays its stake and frees the town; a loss costs the player's stake.

**Castle victory** frees every town that lord holds.

Origin: `StartWizardTownSiege`, `ResolveWizardTownSiege` and the siege-timer
updates in `adventure_input.c`.

## B15. After a castle falls

- Monsters stop spawning in the fallen lord's realm. Lairs still spawn.
- The lord's towns are freed and can't be besieged again.
- Settlements, merchants, services and quests in that realm carry on.
- The Incarnation's tier-20 deck and Dreamsign join the final battle's recipe
  (Appendix C §C7).

Origin: `HandleDefeatedWizardCastle` and the defeated-color check in
`UpdateWorldLairAndMonsterSlots`.
