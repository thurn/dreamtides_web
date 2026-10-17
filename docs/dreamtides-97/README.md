# Dreamtides 97: Game Design Document

**Status:** design proposal for a future game mode. It is not part of the
active implementation plan in [`docs/plan/`](../plan/README.md), and nothing
here changes the binding decisions in
[`docs/plan/decisions.md`](../plan/decisions.md). Every number on these pages
is a catalog tunable (decision D32); the values given are starting proposals
for simulation and playtest.

Dreamtides 97 ("D97") is a long-form run mode for the Dreamtides web client.
A run has two parts:

- **The campaign.** Five **acts** lead to **Limbo**. Each act is a cluster of
  authored **dreams** joined by diegetic doors, and its tilesets mix freely:
  a door in a dwarven dungeon can open onto a space colony. Some characters
  can be challenged to a battle; others run shops, give quests or offer Dream
  Guide services. One of Apollyon's incarnations guards the way out of each
  act. In Limbo the five other incarnations wait, and then Apollyon.
- **The endgame.** From Act 4 the player finds **keys**. Each key opens a
  one-time **key dream** of 4–7 challengers, and clearing one pays the prize
  the key shows: a Legendary card, a Legendary Dreamsign or an Avatar. Key dreams pay
  more keys, so a run can continue indefinitely after Apollyon falls, until
  the player owns every card, Dreamsign and Avatar.

D97 combines three references:

- **Path of Exile and Diablo 3** for the world: acts of linked maps, waypoints
  and a Dream Atlas for fast travel, zones that repopulate so a stuck player
  can grind, and an endgame of one-time maps opened by consumable items.
- **Pokémon Scarlet and Violet** for encounters: challengers show an icon over
  their heads, every battle is opt-in, and the Avatars the player faces are
  guardians who act as gym leaders.
- **Shandalar** (*Magic: The Gathering*, MicroProse, 1997) for the economy and
  quests: the player owns a collection larger than their deck, battles carry
  an ante, victory bundles and shops supply cards, amulets buy exact cards,
  selling turns cards into Essence, and the player follows one quest at a
  time.

**The reward bag.** Random rewards draw from the current Avatar's **reward
bag**, without replacement. The bag starts with each card of the Avatar's
signature tide at its authored pool count of one or two copies, and grows a
layer at a time as the campaign advances: first broader cards, then third and
fourth copies. Each layer sets a target copy count per card, and the bag
supplies only the copies the player has not yet acquired, so random rewards
never pass four copies of a card. Early rewards stay on the Avatar's plan and
rarely repeat; late rewards broaden and build toward four-copy decks. Antes, guardian picks, amulet merchants, Tobias Tanglefur's
curiosities and key prizes reach beyond the bag, and every card in the game
can be obtained within a single run.

## How to read this document

This page is the design overview. The appendices hold the algorithms and
tables:

| Appendix | Contents |
| --- | --- |
| [A: Economy](appendix-a-economy.md) | The reward bag, rarity, prices, selling, shops, victory bundles and extras, ante, amulets and resonance cores, guide services, quest rewards, chests and prize duels, guardian picks, the starting package, difficulty, score |
| [B: Acts, dreams and encounters](appendix-b-dreams.md) | The dream catalog, act assembly, doors and guardian chokepoints, waypoints and the Dream Atlas, population, refills, challengers and tiers, battle setup, encounters, Dream Guides, sages, quests, Avatar switching, state and logging |
| [C: Bosses, Limbo and keys](appendix-c-bosses-and-keys.md) | Ordinary guardians, incarnations, Limbo and Apollyon, keys, key dreams and prizes |
| [D: Reusing Dreamtides content](appendix-d-content-reuse.md) | How every existing site, Dream Guide, Avatar, Dreamsign, transfiguration, Exploration and Augury outcome fits D97, including exclusions |
| [E: Acquisition-rate calibration](appendix-e-calibration.md) | Shandalar reference rates, bundle calibration, the campaign's card, Essence and amulet ledgers, and the measurement plan |
| [Overworld visual guide](overworld-visual-guide.md) | The prototype's pixel-art tilesets, dream doors, waypoints, head icons, character sprites, map authoring and React overlay |

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
2. **Rewards start focused and broaden.** The reward bag keeps early rewards on
   the Avatar's plan with few duplicates, then opens broader cards and extra
   copies act by act, up to four copies of any card.
3. **Every card is reachable.** Antes, guardian picks, amulet merchants,
   Tobias's curiosities and key prizes reach beyond the bag, each with its own
   degree of control.
4. **Battles are opt-in.** Every challenger shows its ante and its prize before
   the player accepts. Nothing chases the player.
5. **Losses hurt but never end the run.** A lost battle costs the anted card,
   but never takes the collection below the minimum deck size. Every act the
   player has reached keeps challengers to fight, so no boss is a hard wall.
6. **The campaign is authored and assembled.** Dreams, their maps, friendly
   characters and quests are authored and tied to their tilesets. Each run
   assembles them into acts in a new arrangement.
7. **Progress is spatial.** Guardians stand in front of the doors they
   protect, and the way out of each act passes the act's incarnation. Sealed
   doors, opened with a toll or a quest item, lead only to optional dreams.
8. **Tides stay hidden.** Tides and resonances appear only on the Avatar
   select screen and on amulets. Tides shape the reward bag and opponents'
   decks behind the scenes.
9. **Reuse Dreamtides content.** Every card, Avatar, transfiguration, the tide
   catalog, the Dream Guides, Apollyon's incarnations, nearly every Dreamsign
   and most site encounters appear.

## A run at a glance

1. **Setup.** The player chooses a difficulty (Standard, Hard or Nightmare)
   and any of the 32 Avatars. The
   game builds a starting collection from the Avatar's bag and assembles the
   five acts.
2. **Explore.** Walk through dreams, step through doors, activate waypoints,
   and fast-travel between them from the Dream Atlas.
3. **Challenge.** Opt into battles against challengers for their antes,
   victory bundles, Essence, amulets and, from Act 4, keys. Beat the Avatar
   guardians to pass their doors and for exact picks from their decks.
4. **Build.** Shop, buy exact cards with amulets, use Dream Guide services,
   follow one quest at a time, slot Dreamsigns, and edit the active deck anywhere outside
   battle.
5. **Advance.** Beat each act's incarnation to step into the next act. Act 2
   and Act 3 each offer one Avatar, related to the current one, to unlock and
   switch to.
6. **Finale.** In Limbo, defeat the five remaining incarnations in any order,
   then Apollyon. His defeat records the campaign victory and its score.
7. **Endgame.** Use keys to open key dreams one at a time, clear them for
   Legendary cards, Legendary Dreamsigns and Avatars, and collect more keys.

**Target shape.** Only bosses block progress, so a campaign has three
reference lengths from run start to Apollyon's defeat:

| Route | Battles | Collection at Apollyon | Meaning |
| --- | --- | --- | --- |
| Minimum | 21 wins | — | Ten Avatar guardians, ten incarnations and Apollyon, each beaten on the first attempt. Should be very hard, reached only by exceptionally skilled and lucky players |
| Happy path | About 60 | About 125–160 | The intended experience: about half the challengers, the required bosses and a few side battles |
| Full clear | About 120; 25–35 hours | About 210–260 | Exhaustive exploration: nearly every challenger, the optional guardians, refills, side battles and early key dreams |

Refills make the battle count unbounded above. The endgame has no fixed length.

## Glossary

| Term | Meaning |
| --- | --- |
| **Run** | One D97 game, from Avatar choice onward. A run continues after Apollyon's defeat. |
| **Campaign** | Acts 1–5 and Limbo, ending with Apollyon's defeat. |
| **Act** | One stage of the campaign: several act dreams assembled at run start, ending at an incarnation. |
| **Dream** | One authored location: a map on one tileset, with its own characters, quests and doors. |
| **Act dream** | A dream placed in an act. Act dreams can be revisited for the rest of the run. |
| **Key** | An item that opens one key dream, showing only its prize. |
| **Key dream** | A one-time dream opened by a key. It closes once every challenger in it has been fought. |
| **Prize** | A key dream's reward for beating all its challengers: a Legendary card, a Legendary Dreamsign or an Avatar. |
| **Map** | A dream's authored layout, with anchors for characters, doors, a waypoint, a shop and chests. |
| **Tileset** | A dream's art set, such as a dwarven dungeon or a space colony, grouped into categories. Tilesets have no mechanical effect. |
| **Door** | A diegetic passage between dreams. Doors are two-way and blind. |
| **Sealed door** | A door to an optional dream that opens for a toll or a quest item. |
| **Chokepoint** | A guardian anchor in front of a door. The guardian blocks that door until beaten. |
| **Waypoint** | An object in each dream. Touching it lets the player fast-travel to and from that dream. |
| **Dream Atlas** | The map of every dream the player has entered and every door they've traversed; also the fast-travel screen. |
| **Challenger** | A generic character who can be challenged to a battle, shown with an icon over their head. |
| **Refill** | A new challenger who appears in a cleared act dream as the player fights elsewhere. |
| **Avatar character** | One of the 32 Avatars as a character. Hostile Avatar characters are always guardians and fight with their Avatar ability. |
| **Generic character** | A themed character who plays a deck built like an Avatar's, with no Avatar ability. |
| **Guardian** | A boss standing at a chokepoint: an Avatar character, or an incarnation. Every Avatar the player fights is a guardian. |
| **Incarnation** | One of Apollyon's ten incarnations. Five guard the acts; the other five wait in Limbo. |
| **Limbo** | The final campaign dream, beyond the Act 5 incarnation. |
| **Friendly NPC** | A character who can't be challenged: shopkeepers, amulet merchants, sages, Dream Guides and quest givers. |
| **Cluster** | A group of map anchors where friendly NPCs gather, which acts like a small town. |
| **Collection** | Every owned card copy. |
| **Active deck** | The owned copies equipped for battle. |
| **Reserve** | Owned copies not in the active deck. |
| **Reward bag** | The current Avatar's supply for random rewards, drawn without replacement and refilled by layers up to a per-card copy target. |
| **Tide set** | An Avatar's authored signature tide and three facets, which define its bag. Hidden from the player. |
| **Ante** | The card each side risks on a battle. |
| **Victory bundle** | The cards a won battle pays. |
| **Extra** | A challenger's advertised prize besides cards: an Essence purse, one amulet or one key. |
| **Amulet** | A currency token of one resonance, spent at that resonance's amulet merchants. |
| **Resonance core** | The 20–40 cards that most strongly align with a resonance; an amulet merchant's catalog. |
| **Shop** | The card shop in every dream: sells bag cards for Essence and buys owned cards. |
| **Dreamsign slot** | A place for one active Dreamsign. Only slotted Dreamsigns take effect. |
| **Essence** | The general currency. |
| **Tier** | An opponent's strength class, which sets its deck quality and Dreamsigns. |
| **Difficulty** | The run's level, Standard, Hard or Nightmare, chosen at setup. |

## The five resonances

Each Avatar has tides, and each tide has a resonance. D97 shows tides and
resonances in exactly two player-facing places: the Avatar select screen shows
each Avatar's tides and its resonances as colored pills, and each resonance has
an amulet that buys from a curated **resonance core**. Resonance is otherwise aesthetic: it tells the
player a little about an Avatar's core plan.

| Resonance | Identity |
| --- | --- |
| **Wild** | Play many cheap Spirit Animals, grow the whole pack, and convert a wide board into an explosive finish. |
| **Valor** | Sacrifice smaller Warriors to deploy or empower champions; recur fallen Warriors to sustain pressure. |
| **Ember** | Abandon allies for power, cards, points, and stored charges; spend those resources on removal or large threats. |
| **Shadow** | Fill the void through discard and sacrifice, play Survivors, reclaim cards repeatedly, and fuel threats that scale with the void. |
| **Vision** | Chain, copy, and amplify events into a decisive turn, supported by disruption and evasive Outsiders. |

Outside the Avatar select screen, tide names never appear in D97. Quests,
offers and rewards refer to card traits players can see (type, subtype, cost
and rarity), never to tides or resonance.

## Player identity and difficulty

- **Avatar.** The player chooses any Avatar from the full roster. It is in play
  in every battle, as in the journey mode, and selects the reward bag.
- **Avatar roster.** In the campaign, one friendly Avatar character in Act 2
  and one in Act 3 each offer an Avatar quest that unlocks them. Each is chosen
  when the player first enters the act, from the locked Avatars whose tide sets
  share the most cards with the current Avatar's, so the collection the player
  has built stays useful after a switch. Every other Avatar is a key prize. The
  player can switch among unlocked Avatars at any waypoint, outside battle.
- **Switching changes the bag.** Each Avatar keeps its own bag for the whole
  run. Switching makes the new Avatar's bag the source of random rewards. The
  collection is unchanged. Bag copy targets count every copy the player has
  acquired through any channel and under any Avatar, so a new bag that overlaps
  the old one supplies only the copies still missing and never stacks
  duplicates.
- **Difficulty.** Three levels: Standard (the default), Hard and Nightmare.
  Difficulty improves every opponent's deck cards and Dreamsigns, and sets the
  starting Essence, amulets and Starter count and the score multiplier.
  Standard and Hard are open from the start; Nightmare unlocks when the player
  beats Apollyon on Hard. See
  [Appendix A §A18](appendix-a-economy.md#a18-difficulty).

| Starting value (Standard) | Amount |
| --- | --- |
| Starting collection | 30 distinct cards, 5 of them Starter cards |
| Minimum deck size | 25 |
| Starting Essence | 200 |
| Starting amulets | 2 |
| Dreamsign slots | 1 |

The AI plays at full strength (decision D24). Opponent tiers and difficulty
change deck construction and opponent Dreamsigns, not the AI. Both sides start
every battle at 0⍟. See
[Appendix A §A17](appendix-a-economy.md#a17-starting-package) and
[Appendix B §B9](appendix-b-dreams.md#b9-challengers-tiers-and-opponent-construction).

## Collection and deck

- **Owned copies.** Every acquisition creates an owned copy with its own UUID,
  the catalog card UUID, per-copy modifications (transfiguration, spark bonus,
  keyword and type changes) and provenance: channel, battle count and, for
  bought copies, the price paid. Names are display text only.
- **Active deck and reserve.** New copies enter reserve. Equipping and
  unequipping are free and change no ownership.
- **Where you can edit.** Anywhere outside battle. Selling happens only at a
  shop.
- **Deck size.** At least 25; no maximum.
- **No deck copy cap.** A deck can hold any number of owned copies of a card.
  Random rewards stop at four copies per card (see the reward bag), but antes,
  picks, purchases and Duplication can exceed that.
- **The collection floor.** The collection never drops below 25 owned copies.
  A player at the floor antes nothing, and selling, delivering and purge costs
  are refused when they would cross it. So the player can always field a legal
  deck.

## Card supply

| Source | Draws from | Control |
| --- | --- | --- |
| Starting collection | The bag's first layer | None |
| Victory bundles | The opponent's ante, then the bag | Low: random, sized by tier |
| Shops | The bag | Medium: known stock, finite |
| Chests, prize duels, card-choice outcomes | The bag | Low to medium |
| Opponent antes | The opponent's own deck | Shown before the player opts in |
| Guardian picks | The guardian's own deck | High: exact picks |
| Tobias's curiosities | Supply cards outside the Avatar's tide set | Medium: known stock |
| Amulet merchants | A resonance core | High: exact cards for amulets |
| Key prizes | Legendary cards | High: each key shows its prize |

**The reward bag.** Each Avatar has an authored **tide set**: its signature
tide and three facets, chosen by hand so the 32 Avatars together cover the
card pool evenly. Each layer sets a target copy count for the tide set's
cards. The bag holds each card's target minus the copies the player has ever
acquired, through any channel, so an acquired copy leaves every bag that
counts it:

| Bag layers (copy targets) | Signature cards | Other tide-set cards |
| --- | --- | --- |
| Run start | The authored pool count (1–2) | — |
| Act 2 | The authored pool count (1–2) | 1 |
| Act 3 | 2 | 1 |
| Act 4 | 2 | 2 |
| Act 5 | 3 | 3 |
| After Apollyon | 4 | 4 |

A signature tide holds about 89 eligible cards (72–104), about 10 of them
Rare; the facets add about 60–100 more. Signature cards authored at two
copies hold two from run start. Legendary and Starter cards are never
in a bag. Details: [Appendix A §A2](appendix-a-economy.md#a2-the-reward-bag).

**Opponents' decks** come from the existing opponent deck builder over each
opponent Avatar's tide set, seeded per character. Antes are cards from those
decks, so each win can reach outside the player's bag.

**Resonance cores.** Each resonance has a hand-curated core of 20–40 cards
that align with it most strongly, stored as catalog metadata alongside the
cards. Cores never overlap and exclude Legendary, Starter, Special and Tutorial
cards.

**Legendary cards** come only from key prizes.

## Rarity

D97 uses the authored `rarity` field and shows it on shop, reward and
collection surfaces.

- **Cost points:** Common 1, Uncommon 2, Rare 3, Legendary 4.
- **Starter cards** (owned only through the starting collection) price as
  Commons.
- **Special and Tutorial cards** never appear.
- **Legendary Dreamsigns.** D97 promotes the ten strongest Dreamsigns to
  Legendary rarity, recorded in a D97 catalog module by Dreamsign UUID. Only
  key prizes award them.

## Currencies

| | Essence | Amulets (one type per resonance) |
| --- | --- | --- |
| Start (Standard) | 200 | 2 |
| Main sources | Advertised purses; selling cards; chests; quests; Essence events and Gamble | Advertised amulet extras; quests; chests; amulet changers |
| Main sinks | Shops and restocks; Tobias's curiosities; Transfiguration, Duplication and Dreamsign Bazaar; amulet changers; Gamble stakes | Amulet merchants (1/2/3 per C/U/R) |

Algorithms: [Appendix A](appendix-a-economy.md).

## Acts and dreams

- **Five acts and Limbo** (Appendix B). Each act holds 3–8 act dreams, about 25
  across the campaign, with 12–14 challengers, 2–4 Avatar guardians and one
  incarnation. Limbo is a single fixed dream.
- **Authored dreams.** Each dream in the catalog is authored as a whole: its
  map, tileset, friendly characters, 1–3 quests written for that tileset, and
  any sealed doors with their tolls or quest items.
  Dreams come in sizes from small (2–3 challengers) to large (6–8), so an act
  might be eight small dreams or four large ones.
- **Assembled acts.** At run start, D97 draws dreams from the catalog for each
  act and joins them with doors into a new topology. A dream can land in any
  act; its challengers' tier comes from the act.
- **Mixed tilesets.** An act never repeats a tileset, spans at least three
  tileset categories, and joins dreams of different categories wherever it
  can, so genre jumps begin in Act 1.

| Category | Example tilesets |
| --- | --- |
| Fantasy | Dwarven dungeon (Frostforge), elven realm, talking-animal village (Tumbleleaf Village) |
| Sci-Fi | Space colony (Farpoint Station), cyberpunk city (Grid City), post-apocalyptic wasteland (The Rust Expanse) |
| Historic | Egypt (Pharaoh's Gate), Viking (Winterwake Fjords), samurai Japan (Tsukiren), pirate island |
| Nature | Enchanted forest (Wilderveil), meadow, snowfield |

- **Doors** are two-way and blind. A door never reveals where it leads until
  the player steps through.
- **Sealed doors.** Some dreams have a sealed door that opens for a toll in
  Essence or amulets, or for an item found through a quest. A sealed door
  always leads to an optional dream, so no route to an incarnation depends on
  one.
- **Chokepoints.** A guardian stands in front of the door it protects and
  blocks it until beaten. Assembly guarantees that every route from an act's
  entry to its incarnation passes at least two guardians, and the incarnation
  stands in front of the door to the next act.
- **Tiers by act.** Act 1 challengers are tier 4, then 7, 10, 13 and 16 in
  Act 5. A higher tier means stronger deck cards and more opponent
  Dreamsigns; opponents never start a battle with points. Deeper acts are
  harder and pay more.
- **Refills.** After each battle, every act the player has reached that holds
  fewer than two unbeaten challengers gains a new generic challenger in one of
  its cleared challenger spots. A player stuck in an early act always has
  battles nearby, while the act's tier keeps its rewards low. Guardians and
  incarnations never return.
- **Waypoints.** Each dream has one. Touching it activates it. Standing at any
  activated waypoint, the player can travel free to any other.
- **Dream Atlas.** It shows every dream the player has entered, grouped by
  act, each traversed door, and each dream's tier, guardians and waypoint
  status.
- **Presentation.** The target is an isometric 3D view with click or tap to
  move. The web prototype mocks it with top-down Liberated Pixel Cup pixel art
  in a PixiJS canvas under the existing React UI; the
  [overworld visual guide](overworld-visual-guide.md) designs its tilesets,
  doors, markers and characters.

## Encounters and battles

- **Opt-in.** Challengers and guardians show an icon over their heads.
  Approaching one opens a preview: the character, their Avatar (guardians) or
  deck preview, their tier, both antes and their advertised extra. The player
  chooses **Fight** or **Not now**.
- **Challengers and guardians.** Every Avatar the player fights is a guardian
  and fights with its Avatar ability. Challengers are generic characters: they
  play a deck built from a deck-source Avatar's tide set, with no Avatar
  ability.
- **Rematches.** A beaten challenger stays beaten. A loss leaves the challenger
  in place for a rematch with the same antes. Key dreams allow one attempt per
  challenger instead.
- **Ante.** Each side antes one card: the player's is a random active copy,
  the opponent's a random non-Legendary card of its own deck. Both are rolled
  when the challenge is first previewed and stay fixed. A loss permanently
  removes the player's anted copy, unless the player is at the collection
  floor; a draw exchanges nothing. A few challengers from Act 4 on are
  high-ante, risking three cards each.
- **Win.** The player takes a victory bundle, led by the opponent's ante and
  filled from the bag up to `S = ⌊T/4⌋` rarity points, and the advertised
  extra.
- **Score targets** grow with the campaign: 10⍟ for the run's first three
  battles, 15⍟ for the rest of Act 1, 20⍟ in Act 2 and 25⍟ from Act 3. Every
  battle, guardians and Apollyon included, caps at 25⍟.
- **Discoveries.** Chests hold a card, Essence or an amulet. Prize duelists
  offer an unanted battle for two to four displayed Rares.

Details: [Appendix A §A8–A9](appendix-a-economy.md#a8-victory-bundles-and-extras)
and [Appendix B](appendix-b-dreams.md).

## Guardians, incarnations and Limbo

- **Guardians.** Each act has 2–4 Avatar guardians at chokepoints, and these
  are the only Avatars the player fights in the campaign. A guardian plays a
  boosted deck with its Avatar ability in a single anted battle, retryable
  after a loss.
- **Incarnations.** At run start, five of Apollyon's ten incarnations are
  drawn, one to guard each act's exit. Each act's incarnation is stronger than
  the last.
- **Guardian picks.** A win pays the guardian's ante and exact picks from its
  deck: 1 from an Avatar guardian, 2 from an incarnation.
- **Limbo.** The Act 5 incarnation guards the door to Limbo. Inside, the five
  other incarnations stand as mandatory challengers, fought in any order and
  each retryable. When the fifth falls, Apollyon manifests: unanted,
  retryable, and built from the five incarnations who guarded the acts.
  Beating him wins the campaign.

Details: [Appendix C](appendix-c-bosses-and-keys.md).

## Keys and key dreams

- **Finding keys.** From Act 4, a key joins Essence and amulets as a possible
  challenger extra, and the Act 4 and Act 5 incarnations each pay one. Every
  finished key dream pays at least one new key, so the endgame never runs dry.
- **What a key shows.** Only its prize. A prize is something the player doesn't own yet: one of the 8 Legendary cards,
  one of the 10 Legendary Dreamsigns, or a locked Avatar. Once the player owns
  them all, prizes become further copies of Legendary cards, up to four of
  each.
- **Using a key.** At any activated waypoint, outside battle, when no other
  key dream is open. The key dream opens with its own waypoint, and the player
  can leave and return until it is finished. Only one key dream is open at a
  time.
- **One attempt each.** Every challenger in a key dream can be fought once. A
  win pays its normal rewards; a loss costs the ante, removes that challenger
  and forfeits the prize. A key dream with an Avatar prize includes that Avatar
  as its guardian.
- **Finishing.** When every challenger has been fought, the key dream pays a
  key. If every battle was won, it pays a second key and its prize. It closes
  when the player leaves.
- **Tier.** A key found in Act 4 or Act 5 opens a dream at that act's
  challenger tier; keys found after Apollyon open tier 18 dreams.

Key modifiers are future work. Details:
[Appendix C §C5–C8](appendix-c-bosses-and-keys.md#c5-keys).

## Friendly NPCs

There are no towns. Friendly NPCs stand at map anchors, and maps group some
anchors into clusters that act like small towns. A dream's friendly
characters are authored with it.

| NPC | Role |
| --- | --- |
| Shopkeeper | Every dream has one shop: 4–6 bag cards for Essence, a paid restock once per visit, and buying owned copies |
| Amulet merchant | Sells exact cards from one resonance core for that resonance's amulets |
| Amulet changer | Sells an amulet of any resonance for Essence |
| Dream Guide | Hosts their signature service once per appearance; every guide appears in every act |
| Sage | Gives one free hint about a door, the way to the incarnation, or an active quest |
| Quest giver | Offers one of the dream's authored quests; friendly Avatar characters offer Avatar quests |

**Dream Guides** wander and recur. Each has a home tileset; a guide appearing
in a dream of their home tileset is always enhanced, and other appearances are
enhanced at random. Tobias Tanglefur sells **curiosities**: cards from outside
the current Avatar's tide set, at a premium.

**Sages** are optional. Their hints save walking, and no progress depends on
talking to them.

**Quests** have no deadlines, and, as in Shandalar, the player holds at most
one at a time. A quest giver's offer waits until the current quest is
finished or abandoned; an abandoned quest can be taken again. Quests come in
these kinds:

- defeat a named challenger;
- deliver an owned card with a stated trait;
- carry an item to a character in another dream;
- a handicap trial: beat Master Takeshi under a stated constraint;
- find a lost object, sometimes the item that opens a sealed door;
- an Avatar quest (Acts 2 and 3);
- a Dreamsign slot quest (one in each of Acts 1–4).

Details: [Appendix B §B13–B15](appendix-b-dreams.md#b13-dream-guides).

## Dreamsigns

- **Collection and slots.** The player owns any number of Dreamsigns, at most
  one copy of each, and has **Dreamsign slots** for active ones: 1 at the
  start, plus one from each act's slot quest in Acts 1–4, for 5 entering
  Act 5.
- **Only slotted Dreamsigns take effect,** for both battle and journey effects:
  a shop discount works only while slotted. One-time effects on gaining a
  Dreamsign fire when it is acquired, whatever its slot.
- **Swapping** is free anywhere outside battle, like deck editing.
- **Sources:** the Dreamsign Bazaar and Revelation guide services, Exploration,
  Augury and Gamble outcomes, and key prizes for Legendary Dreamsigns.
- **Journey effects** are adapted to D97: card-choice effects apply to D97's
  card-choice offers, shop effects to shops, and "after each battle" effects
  trigger after each boss victory and each finished key dream. Only
  Dreamsigns whose effect is a purge reward or a Nightmare are left out; see
  [Appendix D §D6](appendix-d-content-reuse.md#d6-dreamsigns).

## Content reuse and exclusions

- **Reused:**
  - every card, including the 8 Legendaries as key prizes;
  - Starter cards for the starting collection;
  - all 32 Avatars, all transfigurations, the tide catalog and the opponent
    deck builder;
  - the ten Apollyon incarnations and the Dream Guides;
  - the Dreamsign Bazaar, Dreamsign Revelation, Transfiguration, Duplication,
    Augury, Random Site, Gamble, Exploration and Essence sites, and the Card
    Shop's stock and pricing for shops and Tobias's curiosities;
  - card-choice offers from Exploration, Augury and Random Site's Draft, as
    occasional rewards;
  - purge as a cost: giving up an owned copy for a reward.
- **Not included:**
  - the journey's layered map, dreamscape site lists, Firstlight Meadow and
    recurring Draft sites;
  - Purge sites and every purge offered as a reward;
  - Nightmare, and Exploration's choose-avatar action.

Details: [Appendix D](appendix-d-content-reuse.md).

## Acquisition-rate targets

The campaign is tuned so a successful run acquires cards within about 15% of
Shandalar's rate per battle: a forecast 2.2 copies per battle against the
Magician research journey's 1.92. The rate per battle is the primary target.
Campaign length and the final collection follow from how many optional battles
the player chooses, so the table gives both D97 reference routes;
[Appendix E](appendix-e-calibration.md) derives each row.

The Shandalar column is one authored, illustrative route of 59 matches, not a
measured average; real campaigns often fight more roaming duels. Its "21 wins"
counts only ordinary wins that kept a bundle, out of 55 wins in all.

| Channel (per successful campaign) | Shandalar Magician route | D97 happy path (about 60 battles) | D97 full clear (about 120 battles) |
| --- | --- | --- | --- |
| Starting collection | 40 | 30 | 30 |
| Victory bundles, antes included | 59 copies from 21 bundle-paying wins (of 55) | 32–42 from about 23 wins | 105–130 from about 68 wins |
| Guardian antes and picks | 15 castle picks | 46–52 | 45–58 |
| Shop and curiosity purchases | 16 | 11–25 | 25–40 |
| Amulet merchant purchases | 11 | 7–14 | 15–24 |
| Chests and prize duels | 5 lair finds and special duels | 5–15 | 15–28 |
| Key prizes | 5 dungeon treasures | 0 | 0–2 |
| Trials, Duplication and site outcomes | 2 bounty picks | 2–11 | 10–20 |
| Removed: sales, antes, deliveries, purge costs | −37 | −15 to −35 | −30 to −60 |
| **Collection at Apollyon** | **116** | **125–160** | **210–260** |

## Logging

Every D97 system logs enough to reconstruct a run in a production game
(invariant "Log new features", decision D40), with UUIDs and never names:

- act assembly: each act's dreams, topology, doors, guardians, incarnation and
  every anchor's occupant;
- each bag draw, layer opening and Avatar switch;
- each door traversal, waypoint activation and Atlas travel;
- each refill, with its dream, anchor and new challenger;
- each challenge preview, with both antes, the extra, tier and knob values;
- each battle setup and result;
- each acquisition and removal (owned-copy UUID, card UUID, channel, price and
  currency);
- each generated offer set: shop stock, curiosities, bundles, chest contents,
  prize duel prizes, guardian picks and amulet merchant catalogs;
- each key created, used and finished, with its prize and outcome;
- Dreamsign slot changes;
- quest offers, steps, completions and rewards; sage hints given.

[Appendix B §B17](appendix-b-dreams.md#b17-state-and-logging) and
[Appendix E §E6](appendix-e-calibration.md#e6-measurement-plan) list the
details and the derived metrics.

## Decision record

**Interview of October 16, 2026.** These decisions define the act and key
structure. The "Revises" column names the earlier decisions each one replaces
or changes.

| # | Topic | Decision | Revises |
| --- | --- | --- | --- |
| S1 | Run shape | Five acts and Limbo form the campaign; keys open one-time key dreams; the run continues after Apollyon | R3, R16 |
| S2 | Campaign length | About 60 battles to Apollyon on the happy path; about 120 and 25–35 hours for a full clear; the 21-win minimum route should be very hard | R3 |
| S3 | Act tilesets | Tilesets mix within every act, across categories | R12 |
| S4 | Act assembly | Act-agnostic authored dreams with their own NPCs and quests, assembled per run into variable topologies | R14, R16 |
| S5 | Gating | Guardians block the doors they stand before; every route to an act's incarnation passes at least two guardians; sealed doors open for a toll or quest item and lead only to optional dreams | R19, R26 |
| S6 | Incarnations and Limbo | Five incarnations drawn per run guard the acts; the other five are mandatory in Limbo, in any order, before Apollyon | R18, R24, R26 |
| S7 | Refills | After each battle, every reached act with fewer than two unbeaten challengers gains a new generic challenger; bosses never refill | R22 |
| S8 | Key timing | Keys appear from Act 4; Apollyon's defeat records the campaign and opens the endgame | R30 |
| S9 | Key sources | A key is a possible challenger extra from Act 4; Act 4 and 5 incarnations pay one; every finished key dream pays at least one | R30 |
| S10 | Key dreams | 4–7 challengers, one attempt each; any loss forfeits the prize; the dream closes once finished; a key shows only its prize; one key dream open at a time | R30 |
| S11 | Key prizes | An unowned Legendary card, Legendary Dreamsign or Avatar; then extra Legendary copies, up to four | R30 |
| S12 | Legendary Dreamsigns | The ten strongest Dreamsigns are promoted to Legendary | — |
| S13 | Key modifiers | None yet | — |
| S14 | Key naming | "Keys" open "key dreams" | — |
| S15 | Avatar unlocks | Avatar quests in Acts 2 and 3, from Avatars whose tide sets overlap the current Avatar's most; every other Avatar is a key prize | R9, R41 |
| S16 | Reward bag | Authored tide sets; random rewards draw without replacement from a bag whose per-card copy targets grow by act; the first layer uses authored pool counts; copies acquired anywhere count against every bag, so random rewards stop at four copies | R6, R7, R37 |
| S17 | Signatureless Avatars | A fixed borrowed signature tide plus three facets of their own | — |
| S18 | Opponent decks | The existing opponent deck builder over the opponent's tide set, seeded per character, with D97 tier knobs | — |
| S19 | Ante | The battle wager is called the ante everywhere; no loss takes the collection below 25 | R39 |
| S20 | Deck size | Minimum 25; no padding | R39 |
| S21 | Dreamsign slots | 1 slot, plus one per slot quest in Acts 1–4; only slotted Dreamsigns take effect; swap freely | — |
| S22 | Journey Dreamsigns | Adapt all but purge-reward and Nightmare effects | — |
| S23 | Shops | A generic shop in every dream; Tobias sells curiosities from outside the bag | R13 |
| S24 | Guide appearances | Every guide appears in every act | R13 |
| S25 | Score target | 10⍟ for the first three battles, 15⍟ for the rest of Act 1, 20⍟ in Act 2, 25⍟ from Act 3; every battle caps at 25⍟ | — |
| S26 | Difficulty | Standard (default), Hard and Nightmare; Nightmare unlocks by beating Apollyon on Hard; difficulty scales opponent deck cards and Dreamsigns | R33 |
| S27 | Hidden tides | Tides and resonances appear only on the Avatar select screen and on amulets | R11, R28 |
| S28 | Exploration | Occasional card-choice offers; purge as a cost; no purge as a reward | — |
| S29 | Sages | Optional hints; nothing requires them | — |
| S30 | Handicap trials | Master Takeshi offers trial quests and fights them himself | — |
| S31 | Avatar opponents | Every Avatar the player fights is a guardian with its Avatar ability; challengers are generic characters | R8 |
| S32 | No head starts | Both sides start every battle at 0⍟; tier and difficulty scale opponent deck cards and Dreamsigns only | — |
| S33 | Quest limit | One quest at a time, as in Shandalar; abandoning is free | R29 |

**October 14 decisions that still hold,** as adapted above: R1 (direction),
R2 (no run loss), R4 (amulets), R5 (resonance cores), R8 (Avatar and generic
characters, as revised by S31), R10 (switching at waypoints), R13 in part (wandering guides with
home tilesets), R15 (presentation), R17 (ordinary guardians), R20 (two-way
blind doors), R21 (waypoints), R23 (retryable anted guardians), R25 (win
rewards), R27 (sages as the only door information), R31
(one use per guide appearance), R32 (any starting Avatar), R34 (no
Dreamlinks), R35 (chests and prize duelists), R36 (no world magic) and R40
(state). R38 holds with recalibrated pick counts (E3).

**October 13 decisions that still hold,** as adapted above: Q1 (scale), Q3
(rarity), Q4 (no deck copy cap), Q5 (any Avatar), Q12 (bundle budgets), Q13
(one ante each; three when high-ante), Q17 (shop slots and rarity ceilings),
Q18 (price formula), Q19 (selling with a resale guard), Q30 in part
(mandatory final win, deck editing), Q31 (location), Q33 (bundle type mix) and
Q42 (starting collection method).

**Adopted without separate discussion,** as calibration or consistent
application of the decisions above; each is a tunable called out in its
appendix:

- tiers by act, guardian and incarnation offsets, and the knob table for
  deck quality and opponent Dreamsigns
  ([B9](appendix-b-dreams.md#b9-challengers-tiers-and-opponent-construction));
- the bag's layer schedule ([A2](appendix-a-economy.md#a2-the-reward-bag));
- the bundle budget `S = ⌊T/4⌋`
  ([E2](appendix-e-calibration.md#e2-victory-bundle-size));
- guardian picks of 1 and incarnation picks of 2
  ([E3](appendix-e-calibration.md#e3-expected-card-ledger));
- act budgets, dream sizes and the act assembly rules
  ([B2–B4](appendix-b-dreams.md#b2-dream-catalog));
- population counts for challengers, shops, merchants, sages, guides, chests
  and prize duelists ([B7](appendix-b-dreams.md#b7-population));
- the refill floor of two unbeaten challengers per act
  ([B8](appendix-b-dreams.md#b8-refills));
- purse sizes and the extra split
  ([A8](appendix-a-economy.md#a8-victory-bundles-and-extras));
- price bands by act ([A1](appendix-a-economy.md#a1-notation));
- shop restocks and Tobias's curiosity prices
  ([A6](appendix-a-economy.md#a6-shops-and-curiosities));
- high-ante challengers ([A9](appendix-a-economy.md#a9-ante));
- amulet changers ([A10](appendix-a-economy.md#a10-amulets-and-amulet-merchants));
- the Dreamsign scaling rule ([D6](appendix-d-content-reuse.md#d6-dreamsigns));
- difficulty values ([A18](appendix-a-economy.md#a18-difficulty));
- the starting package and the D97 score
  ([A17](appendix-a-economy.md#a17-starting-package),
  [A19](appendix-a-economy.md#a19-score)).

## Risks and open questions

- **A larger collection.** A full clear forecasts about 250 cards at Apollyon,
  about twice the Shandalar route's 116, because it fights about twice as many
  battles at a similar rate. Playtests should check that late-campaign rewards
  still matter to a full-clear player and that collection screens stay usable
  at 250 cards.
- **The minimum route.** Bosses are retryable, so the 21-win route is hard only
  if a deck that skipped optional battles loses to late bosses often. Boss
  tiers, opponent Dreamsigns and the bag's growth must leave that deck well
  behind. A
  player at the collection floor antes nothing, so boss retries there cost only
  time; measure whether retrying with a floor-sized deck beats fighting
  challengers.
- **Refill pacing.** The two-challenger floor keeps every reached act
  fightable, so refills must not make low-tier grinding the best use of time.
  Measure how often players fight refills, and where.
- **Score targets.** A 25⍟ cap makes Limbo and Apollyon as long as an Act 3
  battle. Measure whether the finale needs more length than its decks and
  Dreamsigns give it.
- **Sealed doors and the quest limit.** One quest at a time means a sealed
  door's item quest competes with Avatar and slot quests. Measure how often
  players abandon quests to reach sealed dreams.
- **Key-dream harshness.** One attempt per challenger and a forfeited prize on
  any loss make Avatar unlocks slow for weaker players. Measure clear rates by
  tier; the fallback is more keys, not easier rules.
- **Endgame depth.** Without key modifiers, the endgame ends when the player
  owns everything. Modifiers that harden key dreams and add rewards are the
  natural next step.
- **Authoring tide sets.** The 32 tide sets are a new authoring task. Most
  Avatars' journey facet lists sit almost entirely inside their own signature
  tide, so broad facets must often come from neighboring signature regions.
- **Choosing Legendary Dreamsigns.** The ten promoted Dreamsigns need a
  curation pass for power and variety.
- **Content scale.** About 25 act dreams per run, with authored quests and
  characters, needs a catalog of about 40 dreams before runs stop repeating;
  key dreams draw on the same catalog.
- **Long-lived state.** A run is a long event log that never formally ends. It
  needs stable act, dream, anchor, quest, key and character identities, and
  content-hash pinning across catalog revisions.
