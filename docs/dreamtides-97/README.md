# Dreamtides 97: Game Design Document

**Status:** design proposal for a future game mode. It is not part of the
active implementation plan in [`docs/plan/`](../plan/README.md), and nothing
here changes the binding decisions in
[`docs/plan/decisions.md`](../plan/decisions.md). Every number on these pages
is a catalog tunable (decision D32); the values given are starting proposals
for simulation and playtest.

Dreamtides 97 ("D97") is a long-form run mode for the Dreamtides web client.
The player walks through a network of **dreams**: authored maps full of
characters, joined by diegetic doors. Some characters can be challenged to a
battle; others trade, give quests or offer Dream Guide services. Every dream
has a **guardian**. Five of the guardians are incarnations of Apollyon, and
defeating those five opens **Limbo**, where Apollyon waits.

D97 combines three references:

- **Path of Exile and Diablo 3** for the world: separate maps linked by doors
  of several kinds, waypoints, and a Dream Atlas for fast travel.
- **Pokémon Scarlet and Violet** for encounters: challengers show an icon over
  their heads, every battle is opt-in, and guardians act as gym leaders.
- **Shandalar** (*Magic: The Gathering*, MicroProse, 1997) for the economy: the
  player owns a collection larger than their deck, battles carry an ante,
  victory bundles and shops supply cards, amulets buy exact cards, and selling
  turns cards into Essence.

**The reward pool.** Normal rewards draw from one **reward pool**: the
playtested tides4 deal for the player's current Avatar. It holds 150 copies,
about 101 distinct cards. Cards outside it come from specialized sources only:
opponents' stakes, guardian picks, amulet merchants and the Legendary dream.
Every card in the game can be obtained within a single run.

## How to read this document

This page is the design overview. The appendices hold the algorithms and
tables:

| Appendix | Contents |
| --- | --- |
| [A: Economy](appendix-a-economy.md) | The reward pool, rarity, prices, selling, traders, the copy allowance, victory bundles and extras, ante, amulets and resonance cores, guide services, quest rewards, chests and prize duels, guardian picks, the starting package, score |
| [B: Dreams and encounters](appendix-b-dreams.md) | Tilesets and maps, network generation, doors and locks, waypoints and the Dream Atlas, population, challengers and tiers, battle setup, encounters, Dream Guides, sages, quests, avatar switching, state and logging |
| [C: Guardians, Limbo and the Legendary dream](appendix-c-guardians-and-limbo.md) | Ordinary guardians, incarnation guardians, Limbo and Apollyon, the Legendary dream and its keepers |
| [D: Reusing Dreamtides content](appendix-d-content-reuse.md) | How every existing site, Dream Guide, Avatar, Dreamsign, transfiguration, Exploration and Augury outcome fits D97, including exclusions |
| [E: Acquisition-rate calibration](appendix-e-calibration.md) | Shandalar reference rates, bundle calibration, the per-run card, Essence and amulet ledgers, and the measurement plan |

Research inputs, outside this repository:

- `~/shandalar-decomp/docs/research/shandalar-economy-and-dreamtides-report.md`
- `~/shandalar-decomp/docs/research/shandalar-journey-apprentice.md`
- `~/shandalar-decomp/docs/research/shandalar-journey-magician.md`
- `~/shandalar-decomp/docs/research/shandalar-journey-highest-difficulty.md`
- The Shandalar decompilation in `~/shandalar-decomp/src/shandalar/src/`.
  Appendices cite its functions by name where D97 keeps Shandalar's economy.

## Design pillars

1. **The collection is the long-term state.** Players own more cards than they
   play. A new card is a choice, not a forced deck addition; reserve cards
   prepare for specific guardians, fund purchases and feed quests.
2. **One coherent pool for normal rewards.** Bundles, traders, chests and prize
   duels draw from the current Avatar's tides4 deal, the pool playtesting has
   shown to make a good game.
3. **Every card is reachable.** Opponent stakes, guardian picks, amulet
   merchants and the Legendary dream reach beyond the pool, each with its own
   degree of control.
4. **Battles are opt-in.** Every challenger shows its stakes and its prize
   before the player accepts. Nothing chases the player.
5. **Losses hurt but never end the run.** A lost battle costs the staked card.
   Lost challengers and guardians can be fought again.
6. **The world is finite and procedural.** Challengers, chests, guide
   appearances and quests are placed once per run. Doors, guardians, quests
   and NPCs are rolled from the run seed onto authored maps; nothing is
   narrative-driven.
7. **Exploration is the progression.** Doors are blind, incarnations are
   hidden, and locked doors open through guardians, quests, amulets and
   incarnation counts.
8. **Reuse Dreamtides content.** Every card, Avatar, transfiguration, the
   tides4 pool, the Dream Guides, Apollyon's incarnations, and most Dreamsigns
   and site encounters appear.

## A run at a glance

1. **Setup.** The player chooses any of the 32 Avatars. The game deals the
   reward pool, builds a starting collection, and generates the dream network.
2. **Explore.** Walk through dreams, step through doors, activate waypoints,
   and fast-travel between them from the Dream Atlas.
3. **Challenge.** Opt into battles against challengers for their stakes,
   victory bundles, Essence and amulets. Beat dream guardians for exact picks
   from their decks.
4. **Build.** Trade, buy exact cards with amulets, use Dream Guide services,
   follow quests, and edit the active deck anywhere outside battle.
5. **Grow.** Complete friendly Avatars' quests to unlock them, then switch
   Avatars at any waypoint. Switching re-deals the reward pool.
6. **Converge.** Find and defeat the five incarnation guardians. Their fall
   opens Limbo.
7. **Finale.** In Limbo, optionally fight the five other incarnations, then
   defeat Apollyon. Victory ends the run with a score.

Target shape: 55–65 battles and 15–20 hours for a successful run, with the
collection growing from 32 cards to about 120–150.

## Glossary

| Term | Meaning |
| --- | --- |
| **Run** | One D97 game, from Avatar choice to Apollyon's defeat. |
| **Reward pool** | The tides4 deal for the player's current Avatar: 150 copies, about 101 distinct cards. Normal rewards draw from it. |
| **Dream** | One map placed in a run's network, with its own guardian, characters and doors. |
| **Map** | An authored layout on one tileset, with anchors where generation places characters, doors, a waypoint and chests. |
| **Tileset** | A cosmetic art set, such as a pirate island or a wasteland. Tilesets have no mechanical effect. |
| **Network** | The run's dreams and the doors between them, generated at run start. |
| **Depth** | A dream's door distance from the start dream in the generated network. It sets the dream's tier. |
| **Door** | A diegetic passage to another dream. Doors are two-way and blind; some are locked. |
| **Waypoint** | An object in each dream. Touching it lets the player fast-travel to and from that dream. |
| **Dream Atlas** | The map of every dream the player has entered and every door they've traversed; also the fast-travel screen. |
| **Challenger** | A character who can be challenged to a battle, shown with an icon over their head. |
| **Avatar character** | One of the 32 Avatars as a character, fighting with its Avatar ability. |
| **Generic character** | A themed character who plays a deck built like an Avatar's, with no Avatar ability. |
| **Guardian** | Each dream's strongest challenger: a boosted Avatar character, or an incarnation. |
| **Incarnation** | One of Apollyon's ten incarnations. Five are guardians in a run; the other five wait in Limbo. |
| **Limbo** | The final dream, opened by defeating the five incarnation guardians. |
| **Legendary dream** | A locked special dream where keepers stake the eight Legendary cards. |
| **Friendly NPC** | A character who can't be challenged: traders, amulet merchants, sages, Dream Guides and quest givers. |
| **Cluster** | A group of map anchors where friendly NPCs gather, which acts like a small town. |
| **Collection** | Every owned card copy. |
| **Active deck** | The owned copies equipped for battle. |
| **Reserve** | Owned copies not in the active deck. |
| **Stake** | The card each side risks on a battle (the ante). |
| **Victory bundle** | The cards a won battle pays. |
| **Extra** | A challenger's advertised prize besides cards: an Essence purse or one amulet. |
| **Amulet** | A currency token of one resonance, spent at that resonance's amulet merchants. |
| **Resonance core** | The 20–40 cards that most strongly align with a resonance; an amulet merchant's catalog. |
| **Trader** | A friendly NPC who sells reward-pool cards for Essence and buys owned cards. |
| **Essence** | The general currency. |
| **Tier** | An opponent's strength class (4–20). |
| **Head start** | Points (⍟) a side begins a battle with. |

## The five resonances

Resonance labels tides today, and the Avatar select screen shows each Avatar's
tides as resonance-colored pills. D97 keeps that presentation and adds one
mechanic: each resonance has an amulet and a curated **resonance core**.

| Resonance | Identity |
| --- | --- |
| **Wild** | Play many cheap Spirit Animals, grow the whole pack, and convert a wide board into an explosive finish. |
| **Valor** | Sacrifice smaller Warriors to deploy or empower champions; recur fallen Warriors to sustain pressure. |
| **Ember** | Abandon allies for power, cards, points, and stored charges; spend those resources on removal or large threats. |
| **Shadow** | Fill the void through discard and sacrifice, play Survivors, reclaim cards repeatedly, and fuel threats that scale with the void. |
| **Vision** | Chain, copy, and amplify events into a decisive turn, supported by disruption and evasive Outsiders. |

Avatars have no resonance of their own.

## Player identity and difficulty

- **Avatar.** The player chooses any Avatar from the full roster. It is in play
  in every battle, as in the journey mode, and determines the reward pool.
- **Avatar roster.** Six to eight friendly Avatar characters per run offer
  quests. Completing one unlocks that Avatar. The player can switch among
  unlocked Avatars at any waypoint, outside battle.
- **Switching re-deals the pool.** The new Avatar's tides4 deal becomes the
  reward pool for every later draw. Each Avatar's deal is seeded by the run and
  that Avatar, so switching back restores the same pool. The collection is
  unchanged.
- **Difficulty.** D97 has one difficulty, using Shandalar's Magician values.
  The difficulty term `d = 1` remains a catalog tunable so more levels can be
  added later.

| Starting value | Amount |
| --- | --- |
| Starting collection | 32 distinct cards, 5 of them Starter cards |
| Minimum deck size | 27 |
| Starting Essence | 200 |
| Starting amulets | 2 |

The AI plays at full strength (decision D24). Opponent tiers change deck
construction and head starts, not the AI. See
[Appendix A §A17](appendix-a-economy.md#a17-starting-package) and
[Appendix B §B7](appendix-b-dreams.md#b7-challengers-tiers-and-opponent-construction).

## Collection and deck

- **Owned copies.** Every acquisition creates an owned copy with its own UUID,
  the catalog card UUID, per-copy modifications (transfiguration, spark bonus,
  keyword and type changes) and provenance: channel, battle count and, for
  bought copies, the price paid. Names are display text only.
- **Active deck and reserve.** New copies enter reserve. Equipping and
  unequipping are free and change no ownership.
- **Where you can edit.** Anywhere outside battle. Selling happens only at a
  trader.
- **Deck size.** At least 27; no maximum. Battles never pad a legal deck.
- **No copy cap.** A deck can hold any number of copies of a card.
- **Copy allowance.** Random generators skip a card the player already owns
  `allowance` copies of: 1, plus 1 when the active deck has 30 or more cards,
  plus 1 at 45 or more. Player-directed acquisitions ignore it and show owned
  counts: amulet merchants, guardian picks, stakes, quest picks and
  Duplication. See [A7](appendix-a-economy.md#a7-copy-allowance).
- **Safety net.** If the collection can't field a legal deck, a battle pads the
  active deck with temporary, unowned copies of the ten Starter cards. Selling
  and delivering are refused when they would leave fewer owned cards than the
  minimum deck size.

## Card supply

| Source | Draws from | Control |
| --- | --- | --- |
| Starting collection | Reward pool | None |
| Victory bundles | Reward pool, led by the opponent's stake | Low: random, sized by tier |
| Traders | Reward pool | Medium: known stock, finite |
| Chests, prize duels, quest picks | Reward pool | Low to medium |
| Opponent stakes | The opponent's own deck | Shown before the player opts in |
| Guardian picks | The guardian's own deck | High: exact picks |
| Amulet merchants | A resonance core | High: exact cards for amulets |
| Legendary dream | The eight Legendary cards | High: each keeper's stake is shown |

**The reward pool.** At run start, and on each Avatar switch, D97 runs the
production tides4 algorithm for the Avatar with seed `hash(runSeed : avatarId)`.
It joins the signature tide and 1–3 drawn facets, plus fill if needed, and
deals 150 copies, at most 2 per card and 1 per Legendary. Starter cards are
excluded. Measured over 32 Avatars × 200 seeds, a pool has 101 distinct cards on
average (85–121), about 48 of them at two copies, about 12 Rares (6–21), and
71% Characters.

**Opponents' pools.** Every challenger's deck comes from its own tides4 deal:
an Avatar character's own Avatar, or a generic character's **deck source**
Avatar. Its stake is a card from that deck, so each win can reach outside the
player's pool.

**Resonance cores.** Each resonance has a hand-curated core of 20–40 cards
that align with it most strongly, stored as catalog metadata alongside the
cards. Cores never overlap and exclude Legendary, Starter, Special and Tutorial
cards. Together they cover 100–200 of the 509 supply cards; the other sources
cover the rest.

**Legendary cards** come only from the Legendary dream.

## Rarity

D97 uses the authored `rarity` field and shows it on shop, reward and
collection surfaces.

- **Cost points:** Common 1, Uncommon 2, Rare 3, Legendary 4.
- **Starter cards** (owned only through the starting collection) price as
  Commons.
- **Special and Tutorial cards** never appear.

## Currencies

| | Essence | Amulets (one type per resonance) |
| --- | --- | --- |
| Start | 200 | 2 |
| Main sources | Advertised purses; selling cards; chests; quests; Essence events and Gamble | Advertised amulet extras; quests; chests; amulet changers |
| Main sinks | Traders; Transfiguration, Duplication and Dreamsign Bazaar; amulet changers; Gamble stakes | Amulet merchants (1/2/3 per C/U/R); amulet-toll doors |

Algorithms: [Appendix A](appendix-a-economy.md).

## Dreams

- **Network** (Appendix B). About 12 ordinary dreams, generated at run start,
  plus the Legendary dream, 1–2 hidden dreams and Limbo. Every dream has a
  guardian.
- **Maps** are authored layouts on cosmetic tilesets, about 4–5 maps per
  tileset. Generation fills each map's anchors with characters, doors, a
  waypoint and chests. A map appears at most once per run.
- **Depth and tier.** A dream's depth is its door distance from the start
  dream. Its challengers' tier is `4 + 2 × depth`, so going deeper is harder
  and pays more.
- **Doors** are two-way and blind: a door never reveals where it leads until
  the player steps through. A locked door shows its lock:
  - **guardian:** opens when this dream's guardian is beaten;
  - **key:** opens with a quest's key, or appears only when a quest reveals it;
  - **amulet toll:** opens by spending one amulet of the door's resonance;
  - **incarnation count:** opens after a number of incarnations are beaten.
- **Waypoints.** Each dream has one. Touching it activates it. Standing at any
  activated waypoint, the player can travel free to any other.
- **Dream Atlas.** It shows every dream the player has entered, each traversed
  door, and each dream's tier, guardian and waypoint status.
- **Presentation.** The target is an isometric 3D view with click or tap to
  move. The web prototype mocks it with top-down 2D tile maps built from a CC0
  pixel-art dungeon set, linked into the workspace like card art and never
  committed.

## Encounters and battles

- **Opt-in.** Challengers show an icon over their heads. Approaching one opens a
  preview: the character, their Avatar (Avatar characters) or deck preview,
  their tier, both stakes and their advertised extra. The player chooses
  **Fight** or **Not now**.
- **Challengers.** Avatar characters fight with their Avatar ability. Generic
  characters play a deck built from a deck-source Avatar's pool, with no Avatar
  ability. Each non-player Avatar appears at most once per run, as a challenger,
  a guardian or a friendly quest giver.
- **Finite.** Each challenger can be beaten once. A loss leaves the challenger
  in place for a rematch with the same stakes.
- **Stakes.** Each side stakes one card: the player's is a random active copy,
  the opponent's a random non-Legendary card of its own deck. Both are rolled
  when the challenge is first previewed and stay fixed. A loss permanently
  removes the player's staked copy; a draw exchanges nothing. A few deep
  challengers are high-stakes, risking three cards each.
- **Win.** The player takes a victory bundle, led by the opponent's stake and
  filled from the reward pool up to `S = ⌊T/4⌋` rarity points, and the
  advertised extra.
- **Head starts.** The score target is 25⍟. Opponents gain a head start at
  higher tiers.
- **Discoveries.** Chests hold a card, Essence or an amulet. Prize duelists
  offer an unstaked battle for two to four displayed Rares.

Details: [Appendix A §A8–A9](appendix-a-economy.md#a8-victory-bundles-and-extras)
and [Appendix B](appendix-b-dreams.md).

## Guardians, Limbo and the Legendary dream

- **Guardians.** Every dream's guardian is a single staked battle, retryable
  after a loss. Among the twelve ordinary dreams, seven guardians are boosted
  Avatar characters and five are incarnations of Apollyon, chosen from the ten
  at generation. Hidden dreams and the Legendary dream have Avatar guardians.
- **Guardian picks.** A win pays the guardian's stake and exact picks from its
  deck: 2 from an Avatar guardian, 3 from an incarnation.
- **Incarnations** sit one shallow, two in the middle and two deep, and are
  found by exploring. Each is stronger for every incarnation already beaten, so
  any order works.
- **Limbo.** Its door stands in every incarnation dream and opens after the
  fifth incarnation falls. Inside, the five other incarnations are optional
  challengers, and Apollyon is the guardian: unstaked, retryable, and built from
  the five incarnations the player defeated. Beating him wins the run.
- **The Legendary dream.** A lost-object quest chain recovers three fragments
  for its key, and its door also needs two incarnations beaten. Inside, seven
  keepers and a guardian each stake one distinct Legendary card.

Details: [Appendix C](appendix-c-guardians-and-limbo.md).

## Friendly NPCs

There are no towns. Friendly NPCs stand at map anchors, and maps group some
anchors into clusters that act like small towns.

| NPC | Role |
| --- | --- |
| Trader | Sells 4–6 reward-pool cards for Essence from finite stock; buys owned copies |
| Amulet merchant | Sells exact cards from one resonance core for that resonance's amulets |
| Amulet changer | Sells an amulet of any resonance for Essence |
| Dream Guide | Hosts their signature service once per appearance; wanders between dreams |
| Sage | Gives one free hint about doors, incarnations or an active quest |
| Quest giver | Offers a quest; friendly Avatar characters offer quests that unlock them |

**Dream Guides** wander and recur. Each has a home tileset; a guide appearing
in a dream of their home tileset is always enhanced, and other appearances are
enhanced at random.

**Quests** have no deadlines, and the player can hold any number. They come in
these kinds:

- defeat a named challenger;
- deliver an owned card with a stated trait;
- carry an item to a character in another dream;
- a handicap trial: beat a challenger under a constraint;
- a collector request: own cards from a named tide or core;
- find a lost object;
- an Avatar quest;
- a key quest.

Details: [Appendix B §B11–B13](appendix-b-dreams.md#b11-dream-guides).

## Dreamsigns

Dreamsigns keep their battle effects and the 12-held cap. They come from the
Dreamsign Bazaar and Revelation guide services and from Exploration, Augury
and Gamble. Journey-effect Dreamsigns with no D97 meaning are remapped or
excluded; see [Appendix D](appendix-d-content-reuse.md#d6-dreamsigns).

## Content reuse and exclusions

- **Reused:**
  - every card, including the 8 Legendaries through the Legendary dream;
  - Starter cards for the starting collection and safety-net padding;
  - all 32 Avatars, all transfigurations, and the tides4 pool algorithm;
  - the opponent deck builder, which also builds the starting collection;
  - the ten Apollyon incarnations and the Dream Guides;
  - the Card Shop, Dreamsign Bazaar, Dreamsign Revelation, Transfiguration,
    Duplication, Augury, Random Site, Gamble, Exploration and Essence sites.
- **Not included:**
  - the journey's layered map, dreamscape site lists, Firstlight Meadow and
    Draft sites;
  - Purge sites, every card-removal outcome, and Nightmare.

Details: [Appendix D](appendix-d-content-reuse.md).

## Acquisition-rate targets

The economy is tuned so a successful run acquires cards within about 15% of
Shandalar's rate per battle: a forecast 2.18 copies per battle against the
Magician research journey's 1.92. The table compares the two;
[Appendix E](appendix-e-calibration.md) derives each row.

| Channel (per successful run) | Shandalar Magician | D97 target (expected) |
| --- | --- | --- |
| Starting collection | 40 | 32 |
| Victory bundles, stakes included | 59 copies from 21 wins | 40–55 from about 33 wins |
| Guardian stakes and picks | 15 castle picks | 28–38 |
| Trader and Card Shop purchases | 16 | 10–18 |
| Amulet merchant purchases | 11 | 7–12 |
| Chests and prize duels | 5 lair finds and special duels | 8–17 |
| Legendary dream | 5 dungeon treasures | 2–6 |
| Quests, Duplication and site outcomes | 2 bounty picks | 3–13 |
| Removed: sales, stakes, deliveries | −37 | −11 to −35 |
| **Final collection** | **116** | **120–150** |

## Logging

Every D97 system logs enough to reconstruct a run in a production game
(invariant "Log new features", decision D40), with UUIDs and never names:

- each reward-pool deal, with its Avatar and seed;
- network generation: map choices, depths, doors, locks, and every anchor's
  occupant;
- each door traversal, waypoint activation, Atlas travel and Avatar switch;
- each challenge preview, with both stakes, the extra, tier and knob values;
- each battle setup and result;
- each acquisition and removal (owned-copy UUID, card UUID, channel, price and
  currency);
- each generated offer set: trader stock, bundles, chest contents, prize duel
  prizes, guardian picks and amulet merchant catalogs;
- quest offers, steps, completions and rewards; sage hints given.

[Appendix B §B15](appendix-b-dreams.md#b15-state-and-logging) and
[Appendix E §E6](appendix-e-calibration.md#e6-measurement-plan) list the
details and the derived metrics.

## Decision record

**Interview of October 14, 2026.** These decisions define the dreams model.
The "Revises" column names the October 13 decisions each one replaces or
changes.

| # | Topic | Decision | Revises |
| --- | --- | --- | --- |
| R1 | Direction | Keep the collection economy; replace the world layer with dreams; use Dreamtides names | Q9, Q29 |
| R2 | Run failure | No run loss and no world clock; losses cost stakes only | Q14, Q21 |
| R3 | Run length | 15–20 hours, 55–65 battles | — |
| R4 | Amulets | Spent at amulet merchants for exact cards from a Shandalar-catalog-sized resonance selection | Q20, Q37, Q38 |
| R5 | Resonance cores | 20–40 curated cards per resonance; the cores need not cover the catalog | Q34 |
| R6 | Wide sources | Opponent stakes, guardian picks and the Legendary dream reach outside the reward pool; normal rewards stay inside it | Q39, Q43 |
| R7 | Switching and the pool | Switching Avatars re-deals the reward pool; the collection is kept | Q34 |
| R8 | Challengers | The 32 Avatars as characters, plus generic characters with similar decks and no Avatar ability | Q11, Q44 |
| R9 | Avatar unlocks | Avatar quests from friendly Avatar characters only | — |
| R10 | Switching rules | An unlocked roster; switch freely at waypoints; per-Avatar seeded deals | — |
| R11 | Avatar resonance | Avatars have no resonance; the select screen keeps its resonance-colored tide pills | — |
| R12 | Tilesets | Cosmetic only; about 4–5 maps per tileset | Q36 |
| R13 | Dream Guides | Wandering, recurring characters; enhanced in their home tileset and at random elsewhere | Q16 |
| R14 | Maps | Authored layouts with anchors; contents rolled per run | Q9 |
| R15 | Presentation | Isometric click/tap-to-move target; the web prototype is top-down 2D with CC0 pixel art | Q9 |
| R16 | Network | About 12 ordinary dreams, each with a guardian; five guardians are incarnations | Q26 |
| R17 | Ordinary guardians | Boosted Avatar characters | — |
| R18 | Scaling | Tier by depth; incarnations scale with incarnations already beaten | — |
| R19 | Locks | Guardian, quest key, amulet toll and incarnation count | — |
| R20 | Doors | Two-way and fully blind | — |
| R21 | Fast travel | Waypoints found in each dream; travel only from a waypoint | — |
| R22 | Respawning | Challengers are strictly finite; a loss allows a rematch | Q21 |
| R23 | Guardian battle | One staked battle, retryable | Q25 |
| R24 | Limbo | The five unused incarnations as optional challengers; Apollyon as an unstaked, retryable guardian | Q26 |
| R25 | Win rewards | Stake, in-pool bundle and one advertised extra (an Essence purse or an amulet) | Q6 |
| R26 | Incarnation placement | Spread by depth and found by exploring | — |
| R27 | Information | Sages only | Q24 |
| R28 | Quest types | Defeat, delivery, errand, handicap trial, collector request, lost object, Avatar and key quests | Q21 |
| R29 | Quest log | Open, with no deadlines; quests placed at generation | Q21 |
| R30 | Legendary dream | A fragment quest chain plus two incarnations opens it; seven keepers and a guardian stake the eight Legendaries | Q24, Q39 |
| R31 | Guide services | One use per appearance | Q28 |
| R32 | Starting Avatar | Any of the 32 | — |
| R33 | Difficulty | One difficulty at Magician values; `d` stays a tunable | Q7, Q32 |
| R34 | Dreamlinks | Not part of D97 | Q15 |
| R35 | Discoveries | Chests and prize duelists | Q23 |
| R36 | World magic | Not part of D97 | Q22 |
| R37 | Copy allowance | Kept, without a Dreamsign term | Q4 |
| R38 | Guardian picks | 2 from an Avatar guardian's deck, 3 from an incarnation's | Q43 |
| R39 | Recovery | Rematches and the Starter safety net | — |
| R40 | State | Walking is view-local; interactions are intent events | — |
| R41 | Unlockable Avatars | Only Avatars met as friendly quest givers | — |

**October 13 decisions that still hold,** as adapted above: Q1 (scale), Q3
(rarity), Q4 (no deck copy cap), Q5 (any Avatar), Q12 (bundle budgets), Q13
(one stake each; three when high-stakes), Q17 (trader slots and rarity
ceilings), Q18 (price formula), Q19 (selling with a resale guard), Q27 (no
removal or Nightmare), Q30 in part (mandatory final win, the safety net, deck
editing), Q31 (location), Q33 (bundle type mix), Q35 (unlimited catalog with
the allowance) and Q42 (starting collection method).

**Adopted without separate discussion,** as calibration or consistent
application of the decisions above; each is a tunable called out in its
appendix:

- the bundle budget `S = ⌊T/4⌋`, recalibrated because every challenger win
  pays a bundle ([E2](appendix-e-calibration.md#e2-victory-bundle-size));
- amulet changers, carried over from Shandalar's lair amulet vendors
  ([A10](appendix-a-economy.md#a10-amulets-and-amulet-merchants));
- the depth profile, tier formulas and guardian boosts
  ([B7](appendix-b-dreams.md#b7-challengers-tiers-and-opponent-construction),
  [C1](appendix-c-guardians-and-limbo.md#c1-ordinary-guardians));
- population counts for challengers, traders, merchants, sages, guides, chests
  and prize duelists ([B6](appendix-b-dreams.md#b6-population));
- the network generator and its reachability rule
  ([B3–B4](appendix-b-dreams.md#b3-network-generation));
- purse sizes and the extra split
  ([A8](appendix-a-economy.md#a8-victory-bundles-and-extras));
- depth bands in place of settlement tiers for prices, and selling without
  locality factors ([A4–A5](appendix-a-economy.md#a4-card-base-value-and-buy-quote));
- pool-drawn contents rolled at first reveal
  ([A2](appendix-a-economy.md#a2-the-reward-pool));
- high-stakes challengers ([A9](appendix-a-economy.md#a9-ante-stakes));
- Master Takeshi hosting handicap trials
  ([D2](appendix-d-content-reuse.md#d2-dream-guides));
- the Dreamsign scaling rule ([D6](appendix-d-content-reuse.md#d6-dreamsigns));
- starting amulets from the starting Avatar's tides
  ([A17](appendix-a-economy.md#a17-starting-package));
- the D97 score ([A18](appendix-a-economy.md#a18-score)).

## Risks and open questions

- **Finite supply and losses.** A struggling player can bleed stakes while the
  remaining challengers are deep. Rematches, traders, merchants and the safety
  net are the only recovery; playtests should check that weak runs still
  progress.
- **A larger collection.** The forecast final collection is about 20% larger
  than Shandalar's, from guardian picks and fewer sales. Playtests should check
  that late-run rewards still matter.
- **Pool saturation.** About 101 cards over 15–20 hours means random channels
  offer mostly second copies late in a run. Avatar switching, stakes and
  guardian picks open new cards; measure how much.
- **Switching churn.** A player can switch Avatars just before claiming a
  reward to steer it. Pool-drawn contents roll at first reveal, which limits
  this to unrevealed rewards.
- **Curating the cores.** The five resonance cores are a new authoring task.
  Ember has only two signature tides, so its core needs the most care.
- **Pending content.** Nine Avatars, all ten Apollyon Aspects and 104 of 153
  Dreamsigns have no live ability. D97 offers only live Dreamsigns; pending
  Avatars and Aspects fight without abilities until authored.
- **Map authoring.** About 12 dreams per run at 4–5 maps per tileset needs a
  catalog of roughly 30–50 maps before runs stop repeating layouts.
- **Long-lived state.** A run is a long event log. It needs stable network,
  anchor, quest and character identities, and content-hash pinning across
  catalog revisions.
