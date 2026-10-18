# Appendix B: Acts, dreams and encounters

This appendix specifies the dream catalog, how D97 assembles it into acts, and
how doors, guardians, waypoints, characters, refills, battles, Dream Guides,
sages, quests and Avatar switching behave. Notation follows
[Appendix A §A1](appendix-a-economy.md#a1-notation). Values are catalog
tunables.

[Back to the design overview](README.md)

## B1. Tilesets and maps

**Tilesets** are art sets, grouped into four categories. Their names are
internal labels for art sets and never appear in game:

| Category | Tilesets |
| --- | --- |
| Fantasy | Dwarven dungeon (Frostforge), elven realm, talking-animal village (Tumbleleaf Village), graveyard chapel (Hope's End) |
| Sci-Fi | Space colony (Farpoint Station), cyberpunk city (Grid City), post-apocalyptic wasteland (The Rust Expanse) |
| Historic | Egypt (Pharaoh's Gate), Viking (Winterwake Fjords), samurai Japan (Tsukiren), pirate island |
| Nature | Enchanted forest (Wilderveil), meadow, snowfield |

The ten Dream Guides' home dreamscapes are tilesets in this table. A tileset has no mechanical effect, except
that a Dream Guide appearing in their home tileset is enhanced (B13).

**Maps.** Each dream has one map, a committed TS **map module** in
`src/content/d97/maps/`. Maps are built in this order of preference: crops of
existing LPC Tiled maps, reseasons and edits of those crops, and new maps
composed from named LPC stamps for themes no existing map covers. A map
module holds:

- its UUID;
- its **source**: a Tiled map in the local LPC library, pinned by content
  hash, or a blank canvas for a map composed from stamps;
- its **edit recipe**: typed operations with coordinates and named stamps
  (crop, erase a region, place a stamp, paint terrain with auto-tiling, hide a
  layer, mark a layer as drawn above the player, override walkability), never
  hand-edited grids;
- its named **regions** and **landmarks**, so recipes, anchors and briefs can
  refer to places by name;
- its **anchors**, each with a UUID, a tile or landmark and a kind:

| Anchor kind | Per map | Use |
| --- | --- | --- |
| Door | 2 or more | A door to another dream, with the entry point beside it; one is the dream's town door |
| Waypoint | 1 | The dream's waypoint |
| Shop | 1 | The dream's shop |
| Guardian | 0–2 | A chokepoint: names the door anchor it blocks (B5) |
| Challenger | 2–8, by size (B2) | A challenger |
| Friendly | 3 or more | An authored resident, or a town cluster anchor for a placed friendly NPC |
| Townsfolk | 3–8 | An ambient townsperson |
| Chest | 1–2 | A chest; may name the guardian anchor it sits behind |
| Object | 1 or more | A quest's lost object |

A door anchor names the entry point where a player arriving through it
stands. The shop anchor is where the dream's shopkeeper stands. Doors stand
at least 8 tiles apart.

**The town.** Every dream has a town: its friendly cluster, gathered around
its **town door**, a door anchor its dream module names (B2). The player
starts in town and explores outward for challenges.

- **The town radius** extends 12 tiles from the town door's entry. Within it
  stand:
  - the waypoint;
  - the shop, or the building door to the room that holds it;
  - every quest giver;
  - most townsfolk;
  - the **cluster** anchors: friendly anchors with the cluster tag, usually
    three to six, where assembly places Dream Guides, amulet merchants and
    changers, and sages (B7).
- **Outside it** stand every challenger, guardian, chest and quest object,
  and the exit door. Nothing hostile stands in town.
- **Arrival.** A new run arrives at the start dream's town door, and act
  assembly links each dream's town door on the side toward the act's entry
  dream (B4), so the forward route's first arrival in every dream is its
  town. Doors reached later may arrive elsewhere.

**Paths.** Walkability is a first-class map check, and paths are wide and
legible:

- every anchor's route from the town runs on paths at least 2 tiles wide;
- the main routes out of town are at least 3 tiles wide;
- a deliberately narrow crossing, such as a plank bridge, is an explicit
  per-cell exemption in the edit recipe, and is never the only route;
- no route is longer than 1.6 times its straight-line distance;
- walkable ground looks walkable, and blocked ground looks blocked: no
  invisible walls and no walkable-looking dead ends.

The town radius, path widths and detour ratio are tunables in
`src/content/d97/map-tuning.ts`, beside walking speed and the size classes
(B2).

**Compiling.** Neither source maps nor edited maps are committed. The recipe
compiler materializes each edited map and its walkability grid at workspace
preparation (`scripts/prepare-workspace.mjs`), like linked art.

**Map tooling.** Agents author every map, so the tools are legible to a
model:

- **Named stamps** (`src/content/d97/stamps/`): LPC chunks such as houses,
  tree clusters and door frames, each with a name, footprint, anchor points,
  an above-player mask and a preview sheet.
- **The inspector** (`npm run d97:map -- <command>`) prints per-region
  walkability and reachability, lists landmark and anchor coordinates,
  reports the reach time from the town door's entry to each anchor at walking
  speed, reports narrow passages by coordinate, renders PNG previews (the
  whole map, or a zoomed region with a coordinate grid, region outlines,
  anchor letters and a walkability overlay) to a gitignored directory, and
  prints validator findings by coordinate.
- **The validator** checks that:
  - anchors stand on walkable cells;
  - every anchor is reachable from the entries;
  - a guarded door is unreachable while its guardian stands;
  - doors keep their spacing;
  - the map meets its size class's reach maximum (B2);
  - the waypoint, the shop or the building door to the shop's room, every
    quest giver and every cluster anchor stand within the town radius of the
    town door's entry;
  - no challenger, guardian, chest or quest object stands inside it, and the
    exit door stands outside it;
  - every anchor's route from the town meets the path widths, except at a
    recipe's narrow-crossing cells, which are never the only route;
  - no route exceeds the detour ratio.

  A building door on a dream's map must be reached from its doors and
  waypoint, and every anchor in a room from the room's own building door.

**Rooms.** A dream may own **rooms**: small interior maps, each a map module
of its own, entered through ordinary building doors rather than dream doors.
Entering one is a fade with no veil. A room belongs to its dream, shares its
waypoint and tier, and can hold friendly NPCs, chests, quest objects and the
shop. Building doors without a room are scenery.

- **Building doors.** A room joins its dream's map through a pair of
  `buildingDoor` anchors, one on the dream's map and one inside the room,
  each with the entry tile where a player coming through the other arrives.
  The dream module lists its rooms, each with its UUID, its map module and
  its two doors; the dream validator checks each door is a building door on
  the right map.
- **One dream.** A room's anchors register with its dream's, each with the
  room it stands in, so every rule that scopes an anchor to the run's dream
  treats them as the dream's. A rule resolves an anchor only on the map the
  player is on: an intent at a room's anchor bounces on the dream's map, and
  one at the dream map's anchor bounces inside a room. The dream module lists
  the room's residents with the dream's, and the dream's shop may stand
  inside. The dream's waypoint and doors stand on its own map.
- **Passing through.** Stepping through a building door is an intent event:
  entering records the room's door as the run's last place, in that room,
  and leaving records the building door outside, on the dream's map. The
  room of the last place is the map the overworld plays. Each passage logs
  the run, dream, room, map and both doors.
- **Saves.** Reconciliation keeps a last place inside a room at that room's
  current door, forgets one in a room missing from its dream, and records
  the room a place's anchor stands in.

Limbo has one fixed map. Key dreams use catalog maps (Appendix C §C6).

**Presentation.** The target is an isometric 3D view with click or tap to
move. The web prototype renders maps as top-down Liberated Pixel Cup pixel
art, linked into the workspace by `scripts/prepare-workspace.mjs` like card
art and never committed. The renderer draws the compiled map's Tiled layers,
with the layers the map module marks (treetops, roofs) drawn above the
player. With the art missing, the prototype renders flat placeholder tiles.
The [overworld visual guide](overworld-visual-guide.md) designs the maps,
doors, markers and characters.

**Walking and controls.** The player walks at 4 tiles per second.

- **Desktop:** WASD or the arrow keys walk tile by tile; clicking ground walks
  there along an A* path; clicking a character, door, chest, object or
  waypoint walks to it and interacts; E or Space interacts with the faced
  object.
- **Mobile:** a tap walks or interacts.
- While a React panel is open, the canvas ignores input.

## B2. Dream catalog

Each catalog dream is authored as a whole, as one typed **dream module** in
`src/content/d97/dreams/`, keyed by the dream's UUID. Dreams have no names, so
a dream module carries none:

- its map and tileset (B1);
- its **size**:

  | Size | Challenger anchors | Guardian anchors | Map | Largest side | Reach |
  | --- | --- | --- | --- | --- | --- |
  | Small | 2–3 | 0–1 | About 32×32 tiles | 40 | At most 20 seconds |
  | Medium | 4–5 | 1 | About 50×50 tiles | 56 | At most 30 seconds |
  | Large | 6–8 | 1–2 | About 70×70 tiles | 80 | At most 45 seconds |

  Dreams are compact. **Reach** is the walking time (B1) from the town door's
  entry to the farthest anchor. It is a maximum, never a minimum: no map pads
  its route to fill time. At 2× on desktop the camera shows about 30×17
  tiles, so a medium map is a few screens across.
- its **topology**, by anchor UUID on its map: its waypoint, its **town
  door** (B1), where a new run starting in this dream arrives, its exit door
  with the guardian anchor blocking it, and its shop (B5, B6);
- its **town cluster**: the cluster anchors of its town (B1);
- its **residents**, keyed by anchor: each names its role (which matches its
  anchor's kind), its character (a sprite recipe), and the dialogue it
  speaks. Residents are the shopkeeper, 1–3 quest givers and 3–8 townsfolk,
  with authored personas. A resident challenger or guardian also names its
  deck; act assembly keeps the challengers and guardians a dream module
  seats this way at their anchors, and seats generic challengers at the
  dream's empty challenger anchors (B7). An
  Avatar challenger or guardian instead lists the Avatars it may appear as,
  each with that Avatar's own character and dialogue; a run meets the first
  one the player is not playing, which it sees, hears and fights alike;
- its 1–3 **quests**, written for its tileset (B15);
- personas for its generic challengers (name and sprite), suited to its
  tileset.

**Dialogue** is a typed graph per character: nodes with UUIDs, lines, player
choices and conditions on quest state, flags, act, beaten anchors and
collection traits. A choice's effects (offer, advance or complete a quest,
give or take an item, open the shop or a service, set a flag, start a
challenge) each become an intent event. Which node is showing is view state.
A validator checks node reachability, dangling references, effects legal for
the speaker's anchor kind, and condition types.

**Townsfolk** are ambient residents. Each has a sprite recipe, a short
personality and a small dialogue tree of barks and lore, some of it reacting
to quest or act state. They offer no services and carry no head icon. Most
stand in the town (B1). They carry the story's through-line and hint at
quests.

**Briefs.** Each dream module has a written brief beside it,
`src/content/d97/dreams/<dream-uuid>.md`: its premise, mood, landmarks,
residents and personas sketched, and quest hooks. A dream is authored in two
steps: the brief and a map built to fit it, with the inspector and validator
clean; then its residents, dialogue and quests.

Dreams are act-agnostic: nothing in a dream fixes its tier, which comes from
the act it lands in. The catalog targets about 40 dreams, at least 8 per
category, so a run's 25 act dreams and its key dreams vary between runs.

## B3. Acts and tiers

| | Act 1 | Act 2 | Act 3 | Act 4 | Act 5 | Limbo |
| --- | --- | --- | --- | --- | --- | --- |
| Dreams | 3–8 | 3–8 | 3–8 | 3–8 | 3–8 | 1 |
| Challengers | 12–14 | 12–14 | 12–14 | 12–14 | 12–14 | — |
| Avatar guardians | 2–4 | 2–4 | 2–4 | 2–4 | 2–4 | — |
| Challenger tier `t` | 4 | 7 | 10 | 13 | 16 | — |
| Avatar guardian tier | 7 | 10 | 13 | 16 | 18 | — |
| Incarnation tier | 8 | 11 | 14 | 17 | 20 | 20 |
| Score target | 15⍟ | 20⍟ | 25⍟ | 25⍟ | 25⍟ | 30⍟ |
| Incarnation score target | 20⍟ | 25⍟ | 25⍟ | 25⍟ | 30⍟ | 30⍟ |
| Price band `b` | 1 | 1 | 2 | 2 | 3 | 3 |

- An Avatar guardian's tier is `min(t + 3, 18)`; an incarnation's is `t + 4`.
- Avatar guardians, prize duels and trials use their act's score target.
- Key dreams have tier 13, 16 or 18, a 25⍟ score target and price band 3
  (Appendix C §C6).

## B4. Act assembly

At run start, from the run seed, D97:

1. **Builds** the starting collection (Appendix A §A17).
2. **Draws incarnations.** Five of Apollyon's ten incarnations are drawn
   uniformly and assigned to Acts 1–5 in random order. The other five wait in
   Limbo.
3. **Assembles each act,** in order:
   1. **Draws dreams** from the catalog, each at most once per run, until the
      act's challenger anchors total 12–14, using 3–8 dreams. Within an act, no
      tileset repeats, at least three categories appear, and the dreams hold
      at least three guardian anchors.
   2. **Chooses** the entry dream (the start dream, in Act 1) and the
      incarnation's dream, which must have a guardian anchor.
   3. **Joins** the dreams with doors: a random spanning tree over free door
      anchors, plus up to two extra doors that form loops. Each door prefers
      to join dreams of different categories. Each dream's tree door on the
      side toward the entry dream is its town door (B1), so the forward
      route's first arrival in every dream is its town.
   4. **Seats the incarnation** at a guardian anchor in its dream and makes
      the door it blocks the act's **exit door**.
   5. **Seats Avatar guardians** at guardian anchors so that every route from
      the entry dream to the incarnation passes at least `g = 2` of them (B5).
      Remaining guardian anchors take optional guardians, up to four Avatar
      guardians per act, or stay empty, leaving their corridors open.
   6. **Links** the exit door to the next act's entry dream, at that dream's
      town door. Act 5's exit door leads to Limbo.
4. **Places** Limbo's fixed map.
5. **Populates** anchors (B7), placing Dream Guides, amulet merchants and
   changers, and sages at each dream's town cluster anchors, and **binds**
   quests (B15).
6. **Validates** the chokepoint rule, anchor capacity and quest reachability.
   On failure it retries with the next seed salt.

The acts are then fixed for the run. Only the player's progress and refills
change them.

## B5. Doors and chokepoints

**Doors are two-way, blind and never locked.** A door never shows where it
leads until the player steps through it. After that, its tooltip shows at
most a small thumbnail of the destination's art, never a name, and the Dream
Atlas records the link. Stepping through a door
places the player at the matching door's entry point in the destination
dream. Act exit doors look distinct, so the player can tell that the
incarnation guards the way onward.

**Chokepoints.** A guardian anchor sits in a corridor in front of the door it
names. While its guardian is unbeaten, the guardian blocks the corridor in
both directions: walking toward the door opens the guardian's preview instead.
Once beaten, the guardian steps aside and stays as an ordinary character. Map
validation checks that each guarded door is unreachable from the map's other
entry points while its guardian stands.

**The chokepoint rule.** Assembly guarantees that:

- every route from an act's entry dream to its incarnation passes at least
  `g = 2` Avatar guardians;
- every route out of an act passes its incarnation;
- every quest can be completed in dreams reachable without that quest's own
  reward.

Chests can stand behind a chokepoint, opening once its guardian falls.

**The one-dream act.** A run whose start dream is outside the catalog, or
whose catalog cannot supply an act's shape at all (too few dreams, tilesets,
categories, guardian anchors or challenger anchors for B3 and B4), plays its
start dream as a one-dream act: no doors, the dream's exit door and exit
guardian as the act's exit door and incarnation seat, and no chokepoint
rule. A save from before act assembly is given the same act on load. A new
run arrives at its town door's entry, and stepping through its exit door
once the guardian falls ends the slice at a summary screen that names no
dream.

## B6. Waypoints and the Dream Atlas

- **Waypoints.** Each dream has one waypoint, in its town (B1). Touching it
  activates it. The start dream's waypoint is active from the start.
- **Fast travel.** While standing at an activated waypoint, outside battle,
  the player can travel free to any other activated waypoint, arriving beside
  it.
- **The Dream Atlas** shows:
  - every dream the player has entered, grouped by act, identified by its
    tileset thumbnail, with its tier and waypoint status, and never by a
    name;
  - its guardians' status: unseen, seen or beaten, with the incarnation glyph
    once the player has seen it;
  - every door the player has traversed, as a link;
  - dreams marked by sages, as known but unvisited, with their tier;
  - dreams holding unbeaten challengers, including refills;
  - open key dreams, with their remaining challengers and prize;
  - markers for active quests.

  Dreams the player hasn't entered or been told of don't appear.

## B7. Population

Assembly fills each act's anchors:

| Occupant | Count | Placement |
| --- | --- | --- |
| Incarnation | 1 per act | The exit chokepoint |
| Avatar guardians | 2–4 per act | Guardian anchors chosen by B4 |
| Challengers | 12–14 per act | Challenger anchors; about one in five is an Avatar character |
| Shop | 1 per dream | The shop anchor, in town |
| Residents | As authored | Their anchors, by the dream module |
| Townsfolk | 3–8 per dream, as authored | Townsfolk anchors |
| Amulet merchants | 1–2 per act | Town cluster anchors; each resonance at least once across Acts 1–3 |
| Amulet changer | 1 per act from Act 2 | A town cluster anchor |
| Sages | About one dream in two | A town cluster anchor |
| Dream Guide appearances | 12 per act (B13), plus one in each key dream | Town cluster anchors; at most 3 per dream, 1 in a small dream |
| Avatar quest giver | 1 in Act 2, 1 in Act 3 | A friendly Avatar character at a town cluster anchor |
| Prize duelists | 1 per act | |
| Chests | 1–2 per dream | Chest anchors outside town; about a quarter behind a chokepoint |

- **In town.** Placed friendly NPCs stand at their dream's town cluster
  anchors (B1). Assembly places nothing hostile in town.
- **Avatars.** In the campaign, each Avatar other than the starting Avatar
  appears at most once as a character: Avatar guardians first, then the two
  Avatar quest givers, then challengers. Once every Avatar has appeared, the
  remaining Avatar-character challenger spots take generic characters. Key
  dreams may feature any Avatar outside the roster. The player never meets an
  Avatar on their roster as a character (B16).
- **Generic characters** take personas from their dream's authored list,
  falling back to a shared persona catalog by tileset. Each has a **deck
  source**: a uniformly random Avatar whose tide set its deck is built from.
- Limbo holds only its five incarnations, Apollyon and its waypoint.

## B8. Refills

Act dreams repopulate slowly, so a player stuck behind a boss can grind for
cards, Essence and amulets.

- **Clock.** Every `R = 4` battles the player finishes, whatever the result
  and wherever fought, each act the player has entered gains one refill.
- **Placement.** The refill takes a uniformly random challenger anchor in that
  act whose challenger has been beaten, outside the dream the player is
  standing in. An act with no such anchor gains nothing that time.
- **The refill** is a new generic character at the act's challenger tier, with
  a persona suited to the dream's tileset, its own deck source, antes and
  extra (Appendix A §A8–A9). It behaves like any challenger; once beaten, its
  anchor can refill again.
- **Never refilled:** guardians, incarnations, prize duelists, Master Takeshi,
  key-dream challengers and Limbo.

Refills appear while the player is elsewhere and are marked in the Atlas.

## B9. Challengers, tiers and opponent construction

**Tiers.**

| Opponent | Tier |
| --- | --- |
| Challenger or refill | The act's challenger tier `t` (B3) |
| Avatar guardian | `min(t + 3, 18)` |
| Incarnation | `t + 4`; 20 in Limbo |
| Prize duelist | Its variant's tier (Appendix A §A14) |
| Master Takeshi | `t + 2` |
| Key-dream challenger | The key's tier (Appendix C §C6) |

**Deck construction** reuses the existing tide opponent builder
(`buildTideOpponentDeck`, "unified tide affinity") with D97 inputs:

1. **Avatar.** An Avatar character's own Avatar, a generic character's deck
   source, or an incarnation's pool Avatar.
2. **Candidates.** The eligible cards of that Avatar's tide set (Appendix A
   §A2), plus its Legendary cards when the tier allows. Starter cards are
   excluded.
3. **Seed.** `hash(runSeed : characterId)`, so a rematch faces the same deck.
4. **Context.** +1 per tide in the tide set, plus the tides of the opponent's
   Dreamsigns, plus an incarnation's archetype tides. D97 tilesets add no
   tides.
5. **Picks.** 30 greedy picks. Each ranks the remaining candidates by
   [cosine affinity to the context, rarity strength], draws uniformly from the
   top 25% (at least 5), and adds the picked card's tide vector to the
   context, so each deck converges on whatever it has picked. An incarnation's
   signature cards are placed first.
6. **Starter dilution.** The knob's number of lowest-affinity non-signature
   picks are replaced with random Starter cards.
7. **Transfigurations.** The knob's number of random deck cards each receive
   one random applicable transfiguration.

**Tier knobs:**

| Tier | Typical opponents | Avatar ability | Starter dilution | Dreamsigns | Transfigured cards | Legendaries |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | Act 1 challengers | dormant | 10 | 0 | 0 | no |
| 7–8 | Act 2 challengers; Act 1 bosses | active | 5 | 0 | 0 | no |
| 10–11 | Act 3 challengers; Act 2 bosses | active | 0 | 1 | 2 | no |
| 13–14 | Act 4 challengers; Act 3 bosses | active | 0 | 1 | 4 | yes |
| 16–17 | Act 5 challengers; Act 4 bosses | active | 0 | 2 | 6 | yes |
| 18–19 | Act 5 guardians; endgame key dreams | active | 0 | 3 | 8 | yes |
| 20 | Act 5 and Limbo incarnations | Aspect | — | curated + 2 | 10 | yes |

**How to read the knobs:**

- **Avatar ability:** applies to Avatar characters. Generic characters never
  have an Avatar ability.
- **Starter dilution** at tiers 4 and 7–8 matches the journey's levels 0
  and 1.
- **Dreamsigns:** chosen one at a time by the builder's affinity rule from
  Dreamsigns with battle effects, excluding Legendary Dreamsigns.
- **Tiers between rows** use the row below.

Origin: Shandalar's opponent life of `tier + 2d` and monster decks by tier.
Dreamtides has no life total and no AI difficulty levels (decision D24), so
D97 converts tier into deck quality and opponent Dreamsigns; no opponent
starts with points (README decision S32). The journey builder's
per-battle seed and dreamscape affiliation tides are its only inputs D97
replaces.

## B10. Battle setup

- **Score target:** the act's target (B3); 25⍟ in key dreams; 30⍟ against
  Apollyon.
- **Starting score:** 0⍟ for both sides, at every tier and difficulty. The
  Long Odds handicap trial (B15) is the one exception.
- **Opening hands:** 5 each. The player goes first and skips the first draw, as
  in the journey mode.
- **Dreamsigns:** the player's slotted Dreamsigns, and the opponent's per the
  knob table.
- **Player deck:** the active deck as built, which must hold at least 25
  cards. Choosing Fight with a smaller deck opens the deck editor instead.

The engine supports a per-battle score target (`BattleInit.scoreToWin`) and
per-side starting score, opening hand, Avatar, Dreamsigns and placements
(`BattleSetup`); D97 needs no engine rule changes.

## B11. Encounters

**Icons.** Every unbeaten challenger shows an icon over their head: a challenge
mark for challengers, a crown for guardians, a gem for prize duelists. Friendly
NPCs show a service or quest icon. Beaten challengers show none.

**Preview.** Interacting with a challenger opens a preview showing:

- the character, and their Avatar and its ability (Avatar characters), or
  their deck source (generic characters);
- the tier, the score target and three signature cards from the deck;
- both antes (three each when high-ante), rolled at the first preview
  (Appendix A §A9);
- the advertised extra, or the prizes of a prize duel.

The player chooses **Fight** or **Not now**. Not now is free, and nothing in a
dream ever chases the player.

**Rematches.** A won challenger is beaten for the rest of the run and stays in
place as an ordinary character; its anchor can later refill (B8). A lost or
drawn challenger keeps its antes and can be fought again. Prize duelists leave
after one battle, whatever its result. Key-dream challengers allow one attempt
(Appendix C §C7).

**Deck editing** is available anywhere outside battle, including between a
preview and the battle.

Outcomes are in Appendix A §A9.

## B12. Chests and lost objects

- **Chests** stand at chest anchors. Opening one rolls its contents (Appendix A
  §A13). A chest behind a chokepoint can be reached once its guardian falls.
- **Lost objects** are quest items at object anchors, visible only while their
  quest is active. Picking one up adds it to the quest log; it can't be sold or
  discarded.

## B13. Dream Guides

Dream Guides are wandering, recurring characters. Each runs one kind of site,
keeps their authored dialogue, and has a home tileset named for their home
dreamscape.

| Guide | Site | Appearances per act | Per campaign |
| --- | --- | --- | --- |
| Tobias Tanglefur | Curiosities | 1 | 5 |
| Amunet, the Tomb-Keeper | Dreamsign Bazaar | 2 | 10 |
| Sigrún | Dreamsign Revelation | 1 | 5 |
| Durgan Forgehammer | Transfiguration | 2 | 10 |
| Deacon Holt | Duplication | 1 | 5 |
| Master Takeshi | Handicap trials (B15) | 1 | 5 |
| Aldric, the Seer | Augury | 1 | 5 |
| Maddox | Random Site | 1 | 5 |
| Gravok | Gamble | 1 | 5 |
| "Layaway" | Exploration | 1 | 5 |

Each key dream adds one appearance of a uniformly random guide.

- **One use per appearance.** Each appearance is a one-use site. Once used, the
  guide stays in the dream as an ordinary friendly character.
- **Placement.** Each appearance stands at a cluster anchor in its dream's
  town (B1). At most three appearances per dream, one in a small dream, and
  never two of the same guide in one dream.
- **Home tileset.** When an act includes a dream on a guide's home tileset,
  one of that guide's appearances in the act goes there, and it is always
  enhanced.
- **Random enhancement.** Every other appearance is enhanced with probability
  1/4.
- **Preview.** An enhanced appearance is marked before the player uses it.

Site behaviors and prices: Appendix A §A6, §A11 and Appendix D §D2–D3.

## B14. Sages

Each sage gives one free hint, once per run, of a fixed kind:

| Kind | Hint |
| --- | --- |
| Door | Marks where one unexplored door in this dream leads: the destination appears in the Atlas as known, with its tier and tileset thumbnail |
| Way | Points out the door in this dream that starts the shortest route to this act's incarnation |
| Seeker | Marks the dream holding the next step of an active quest on the Atlas; acts as a door sage when no quest is active |

A sage stands at a cluster anchor in its dream's town (B1). A door sage in a
dream with no unexplored door acts as a way sage. Sages are
optional: their hints save walking, and nothing in a run requires talking to
one. They are D97's only source of information about unexplored doors. A
hint never names a dream; it marks the destination on the Atlas.

Origin: `VisitTownWiseman`, Shandalar's fixed-kind settlement advice.

## B15. Quests

**Supply.** Most quests are authored with their dreams: each catalog dream
holds 1–3, written for its tileset, with a giver, dialogue, any quest objects
and a reward kind (Appendix A §A12). A campaign has about 40–60. Assembly adds
two Avatar quests, four Dreamsign slot quests and Master Takeshi's trials.

**Kinds.**

| Kind | Requirement |
| --- | --- |
| Defeat | Beat a named challenger or guardian, usually in another dream of the same act |
| Delivery | Bring an owned copy with a stated trait (type, subtype, cost or rarity) to a named character; the copy is handed over |
| Errand | Carry a quest item from the giver to a named character in another dream |
| Lost object | Find an item at an object anchor in another dream and bring it back |
| Handicap trial | Beat Master Takeshi under a stated constraint (below) |

**Binding.** An authored quest names roles, such as "a challenger in another
dream of this act" or "the shopkeeper of a Historic dream". Assembly binds each
role to a concrete character, anchor or dream in the same act.

**Avatar quests.** In Act 2 and Act 3, a friendly Avatar character offers its
Avatar quest: two steps of the kinds above, bound in that act. Completing it
unlocks that Avatar (B16).

**Dreamsign slot quests.** In each of Acts 1–4, assembly marks one authored
quest as the act's slot quest. It pays a Dreamsign slot instead of its usual
reward (Appendix A §A12), and its giver shows a distinct marker.

**Handicap trials.** On each appearance, Master Takeshi offers one trial,
rolled from the table below. Accepting adds it to the quest log. The player
returns whenever ready and challenges him at his anchor; the constraint is
checked when they choose Fight. Takeshi fights at tier `t + 2` with a random
deck source, antes normally, and can be retried after a loss. His appearance
is used once the trial is won.

| Trial | Constraint |
| --- | --- |
| Empty Hands | No Events in the active deck |
| The Bare Minimum | An active deck of exactly 25 cards |
| One of Each | No card more than once in the active deck |
| Humble Blade | No Rare or Legendary cards in the active deck |
| Small Spirits | No Character costing more than 3● in the active deck |
| Silent Avatar | The player's Avatar ability is suppressed for the battle |
| Heavy Ante | Each side antes three cards |
| Long Odds | Takeshi begins with a 5⍟ head start |

Long Odds is the one battle where a side starts with points; every other
battle starts both sides at 0⍟ (B10).

*Example:* in Act 2, Takeshi offers *Empty Hands*. The player accepts and keeps
exploring. Later they assemble a 25-card deck with no Events from their
collection, return to Takeshi and win. They take his ante, choose one of three
bag cards, and gain one amulet.

**Flow.**

- The player holds at most one quest at a time, as in Shandalar (README
  decision S33). A giver's offer waits until the current quest is finished or
  abandoned; abandoning is free, and an abandoned quest can be taken again.
  Quests never expire.
- Every quest finishes by returning to its giver, or to the named recipient
  for errands and deliveries, which pays the reward.
- A defeat target the player has already beaten completes that step on
  acceptance.
- Quest markers show on the Atlas and over the relevant characters and
  objects.

## B16. Avatar characters and switching

- **Avatar characters** are the 32 Avatars as characters. As challengers and
  guardians, they fight with their Avatar ability under the knob table.
- **Unlocks.** The two friendly Avatar characters in Acts 2 and 3 each unlock
  their Avatar through an Avatar quest. Every other Avatar is unlocked as a key
  prize (Appendix C §C8). Avatars met as challengers or guardians can't be
  unlocked by beating them.
- **The roster** holds the starting Avatar and every unlocked Avatar.
- **No self-encounters.** The player never meets a roster Avatar as a
  character, since the player walks the overworld as their current Avatar.
  Assembly and key dreams place only Avatars outside the roster (B7). When an
  Avatar joins the roster, every character of that Avatar leaves the world:
  - an unbeaten challenger's anchor takes a new generic challenger at once,
    with antes rolled at its first preview;
  - an unbeaten guardian is replaced by an Avatar outside the roster that has
    not yet appeared in the campaign, or any Avatar outside the roster when
    none remains, at the same tier;
  - a beaten character, and the friendly Avatar character whose quest
    unlocked it, steps away.
- **Switching.** While standing at an activated waypoint, outside battle, the
  player can switch to any Avatar on the roster, for free and as often as they
  like. The new Avatar is in play from the next battle, and its bag becomes the
  source of random rewards (Appendix A §A2). The collection, deck, Dreamsigns,
  currencies and pending antes don't change.

## B17. State and logging

**Event log.** Within a build, a run's state is a fold of its event log.
Clients write intent events only. Walking is view-local and never logged.
These are intent events:

- step through a door (a dream door, or a building door into or out of a
  room), activate a waypoint, fast-travel;
- preview a challenger, fight, choose Not now;
- open a shop, buy, sell, restock; buy from an amulet merchant or changer;
- use a guide site; ask a sage;
- accept, advance, abandon or turn in a quest; pick up an object; choose a
  dialogue choice that carries an effect;
- open a chest; switch Avatar; edit the deck; slot or unslot a Dreamsign;
- use a key.

Refills and bag layers derive from the fold: the refill clock counts finished
battles, and each layer opens on the event that first enters its act or
defeats Apollyon.

**Placement.** Returning from a battle places the player beside the opponent
they fought. A reload places the player at the entry point of the last door
they stepped through or beside the last waypoint they used, whichever was
later. A reload inside a room places the player at the entry of the room's
own door. A new run starts at the entry of its start dream's town door.

**Saves.** A run must survive every later build: tuning, content, rules and
code changes.

- **The durable save is a snapshot.** The run state is plain JSON-safe data
  with a `schemaVersion`, persisted after every applied event. Within a build
  the log opens with the latest snapshot as its checkpoint, and intents fold
  through the reducer.
- **Migrations.** Ordered pure functions take each schema version to the
  next. Every change to the persisted shape ships one migration and a golden
  save fixture of the previous version that must load. Across builds, the
  game opens the migrated snapshot as a fresh log base and never re-folds old
  events under new rules.
- **Outcomes, not seeds, are state.** Act assembly, anchor occupants, antes,
  shop stock, bag contents and every other generated result are written into
  state when first produced, never re-derived from the run seed on load, so a
  catalog or algorithm change never reshuffles a run in progress.
- **Reconciliation on load.** Every catalog reference in a snapshot is a UUID,
  resolved against the current catalog: a retired card maps to its
  replacement through a committed retirement table or is compensated in
  Essence; an occupant whose anchor was removed moves to a free anchor of the
  same kind; a quest whose definition was removed is abandoned; new tunables
  apply going forward. Every reconciliation is logged.
- **Battles in progress** belong to their build. If the build changed, a
  battle in progress restarts from its recorded setup, with the same antes
  and no penalty.
- **No content gate.** D97 runs are never gated out by the content-config
  check that journey games use. The build that wrote a snapshot is recorded
  for diagnostics.

**Identities.** Acts, dreams, doors, anchors, characters, quests, objects and
keys have stable UUIDs. Assembled content derives them from the run seed and
the catalog's UUIDs when first produced, and the snapshot keeps them; refills
and keys derive them from the event that created them, so logs refer to them
exactly.

**Logs**, with UUIDs and never names:

- act assembly: dream choices, each act's topology, every door, guardian and
  incarnation placement, quest bindings, and each anchor's occupant;
- each opponent's seed, Avatar, constructed deck and knob values;
- each preview's antes, extra and tier; each battle setup and result;
- each door traversal and waypoint activation; each save migration and
  reconciliation;
- each bag draw and layer opening, with the Avatar; each Avatar switch;
- each character removed or replaced when its Avatar joins the roster: act,
  dream, anchor, old and new occupant;
- each refill: act, dream, anchor and new challenger;
- each roll at first reveal: shop stock, curiosities, bundles, chests, prize
  duel prizes, card-choice offers;
- each acquisition and removal (owned-copy UUID, card UUID, channel, price and
  currency);
- each key created, used and finished, with its dream, tier, prize and
  outcome;
- Dreamsign acquisitions and slot changes;
- quest offers, steps, completions and rewards; sage hints given; guide
  appearances used and whether enhanced.
