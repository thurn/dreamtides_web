# Appendix B: Dreams and encounters

This appendix specifies the dream network D97 generates and how doors,
waypoints, characters, battles, Dream Guides, sages, quests and Avatar
switching behave in it. Notation follows
[Appendix A §A1](appendix-a-economy.md#a1-notation). Values are catalog
tunables.

[Back to the design overview](README.md)

## B1. Tilesets and maps

**Tilesets** are cosmetic art sets: a pirate island, a wasteland, an enchanted
forest, a space station. The ten Dream Guides' home dreamscapes (Tumbleleaf
Village, Pharaoh's Gate, Winterwake Fjords, Frostforge, Hope's End, Tsukiren,
Wilderveil, The Rust Expanse, Farpoint Station and Grid City) are tilesets too.
A tileset has no mechanical effect, except that a Dream Guide appearing in
their home tileset is enhanced (B11).

**Maps** are authored layouts, each on one tileset, about 4–5 per tileset.
Each map is a typed TS module holding:

- its UUID and tileset UUID;
- a tile grid, written as rows of characters with a legend, so layouts can be
  authored and reviewed as text;
- its **anchors**, each with a UUID, position and kind:

| Anchor kind | Minimum per map | Use |
| --- | --- | --- |
| Door | 3 | A door to another dream, with the entry point beside it |
| Waypoint | 1 | The dream's waypoint |
| Guardian | 1 | Where the guardian stands |
| Character | 8 | A challenger or friendly NPC |
| Chest | 2 | A chest |
| Object | 2 | A quest's lost object or fragment |

Character anchors can carry a **cluster** tag. A cluster is a group of
anchors, usually three to six, where friendly NPCs gather like a small town.
Clusters are a map feature, not a separate kind of location.

Limbo and the Legendary dream each have one fixed map.

**Presentation.** The target is an isometric 3D view with click or tap to
move. The web prototype renders maps as top-down 2D tile maps from a CC0
pixel-art dungeon tileset, linked into the workspace by
`scripts/prepare-workspace.mjs` like card art and never committed. With the
art missing, the prototype renders flat placeholder tiles. Clicking or tapping
ground walks there; clicking or tapping a character, door, chest, object or
waypoint walks to it and interacts.

## B2. Dreams and depth

A **dream** is one map placed in a run's network. A run has:

| Dream | Count | Guardian |
| --- | --- | --- |
| Ordinary dreams | 12, including the start dream | 7 Avatar guardians and 5 incarnations |
| Hidden dreams | 1–2 | Avatar guardians |
| The Legendary dream | 1 | An Avatar guardian |
| Limbo | 1 | Apollyon |

**Depth** is a dream's door distance from the start dream in the generated
tree (B3), fixed at generation; shortcuts don't change it. The **dream tier**
is `4 + 2 × depth`:

| Depth | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary dreams | 1 | 2 | 3 | 3 | 2 | 1 |
| Tier | 4 | 6 | 8 | 10 | 12 | 14 |
| Price band | 1 | 1 | 2 | 2 | 3 | 3 |

Hidden dreams sit at depth 3–5, one deeper than the dream holding their door.

## B3. Network generation

At run start, from the run seed, D97:

1. **Deals** the reward pool (Appendix A §A2) and builds the starting
   collection (Appendix A §A17).
2. **Chooses maps:** 12 ordinary maps and 1–2 hidden-dream maps, each map at
   most once and at most 3 per tileset, plus the fixed Legendary dream and Limbo
   maps.
3. **Builds the tree.** Ordinary dreams take depths by the profile in B2. Each
   dream at depth `k + 1` picks a uniformly random parent at depth `k` that
   still has a free door anchor. The start dream is depth 0.
4. **Locks tree doors.** Each tree door into depth 2 or deeper is
   guardian-locked by its parent's guardian with probability 2/5, and open
   otherwise. Every route from the start to an incarnation at depth 3 or deeper
   passes at least one guardian lock; if a route doesn't, the deepest open door
   on it becomes guardian-locked.
5. **Adds shortcuts.** Four extra doors join ordinary dreams whose depths differ
   by at most one and that aren't already joined: one open, one amulet toll and
   two hidden doors that key quests reveal (B13).
6. **Attaches special dreams:**
   - each hidden dream through a door in a dream at depth 2–4, key-locked or an
     amulet toll with equal odds;
   - the Legendary dream through a door in a dream at depth 2–3 (Appendix C
     §C5);
   - Limbo through a door in every incarnation dream (Appendix C §C3).
7. **Places incarnations.** Five of Apollyon's ten incarnations are drawn
   uniformly, and placed one at depth 1–2, two at depth 2–4 and two at depth
   4–5, in distinct dreams. The other five wait in Limbo.
8. **Seats guardians.** Every other dream gets an Avatar guardian (Appendix C
   §C1).
9. **Populates anchors** (B6) and **generates quests** (B13).
10. **Validates** reachability (B4) and anchor capacity. On failure it retries
    with the next seed salt.

The network is then fixed for the run. Only the player's progress changes it:
opened doors, beaten characters, opened chests and completed quests.

## B4. Doors and locks

**Doors are two-way and blind.** A door never shows where it leads until the
player steps through it. After that, its tooltip names the destination, and the
Dream Atlas records the link. Stepping through a door places the player at the
matching door's entry point in the destination dream.

**Locks** apply to both sides of a door, and opening a door from either side
opens it for good. A locked door shows its lock:

| Lock | Shown as | Opens when |
| --- | --- | --- |
| Guardian | The guardian's crown | This dream's guardian is beaten |
| Key | A keyhole | The player holds the quest key for this door |
| Hidden | Nothing; the door is absent | A key quest reveals it; it then stands open |
| Amulet toll | The resonance glyph | The player spends one amulet of that resonance |
| Incarnation count | A count, such as "2 of 5" | That many incarnations are beaten |

The doors to Limbo and the Legendary dream look distinct and show all their
requirements; they're the only doors whose destination is visible beforehand.

**Reachability rule.** Generation guarantees that:

- every ordinary dream is reachable from the start through open and
  guardian-locked doors alone;
- key locks, hidden doors and amulet tolls guard only shortcuts, hidden dreams
  and the Legendary dream;
- every quest can be completed using dreams that are reachable without that
  quest's own reward;
- every amulet toll on a shortcut has a toll-free route around it.

## B5. Waypoints and the Dream Atlas

- **Waypoints.** Each dream has one waypoint. Touching it activates it. The
  start dream's waypoint is active from the start.
- **Fast travel.** While standing at an activated waypoint, outside battle,
  the player can travel free to any other activated waypoint, arriving beside
  it.
- **The Dream Atlas** shows:
  - every dream the player has entered, with its tileset art, tier and
    waypoint status;
  - its guardian's status: unseen, seen, beaten, and the incarnation glyph once
    the player has seen it;
  - every door the player has traversed, as a link;
  - dreams revealed by sages, as known but unvisited, with their tier;
  - markers for active quests.

  Dreams the player hasn't entered or been told of don't appear.

## B6. Population

Generation fills each map's anchors:

| Occupant | Count per run | Placement |
| --- | --- | --- |
| Guardian | One per dream | The guardian anchor |
| Challengers | 3–5 per ordinary dream (mean 4) and 3 per hidden dream | About a third are Avatar characters; the rest are generic characters |
| Traders | 6–8 | The start dream always has one; at most one per dream |
| Amulet merchants | 5–7 | At least one per resonance; at most one per dream |
| Amulet changers | 1–2 | Depth 1 or more |
| Sages | 8–9 | About two dreams in three |
| Dream Guide appearances | About 20 | 0–2 per dream (B11) |
| Quest givers | The 6–8 friendly Avatar characters, plus 8–10 generic givers | Any dream |
| Prize duelists | 3–4 | Depth 2 or more |
| Chests | 1–2 per dream | Chest anchors; about a quarter locked |

- **Clusters first.** Friendly NPCs fill cluster anchors first, and challengers
  fill the other character anchors first.
- **Avatars.** Each Avatar other than the player's starting Avatar appears at
  most once per run: as a guardian, a friendly quest giver or a challenger,
  assigned in that order.
- **Generic characters** come from a persona catalog (name, sprite and the
  tilesets they suit). Each has a **deck source**: a uniformly random Avatar
  whose pool its deck is built from.
- Limbo holds only its incarnations, Apollyon and its waypoint. The Legendary
  dream holds only its keepers, its guardian and its waypoint.

## B7. Challengers, tiers and opponent construction

**Tiers.**

| Opponent | Tier |
| --- | --- |
| Challenger | The dream tier (B2) |
| Avatar guardian | `min(dream tier + 4, 18)` (Appendix C §C1) |
| Incarnation guardian | `12 + 2k`, where `k` is the number of incarnations beaten when the battle starts (Appendix C §C2) |
| Limbo incarnation | 20 |
| Legendary keeper | 18 |
| Prize duelist | Its variant's tier (Appendix A §A14) |

**Deck construction** reuses the existing tide opponent builder
(`buildTideOpponentDeck`):

- Deal the opponent's tides4 pool with seed `hash(runSeed : characterId)`, from
  its own Avatar (Avatar characters) or its deck source (generic characters).
- Build 30 distinct cards from that pool, with its joined tides as the affinity
  context.
- Select from the top band by [affinity, rarity].

Opponents' decks never come from the player's pool.

**Tier knobs:**

| Tier | Avatar ability | Starter dilution | Selection band | Dreamsigns | Transfigured cards | Legendaries | Opponent head start |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | dormant | 6 | 50% | 0 | 0 | no | 0 |
| 6 | active | 3 | 40% | 0 | 0 | no | 0 |
| 8 | active | 0 | 30% | 1 | 0 | no | 0 |
| 10–11 | active | 0 | 25% | 1 | 2–3 | no | 1 |
| 12–13 | active | 0 | 20% | 2 | 4–5 | yes | 2 |
| 14 | active | 0 | 15% | 2 | 6 | yes | 3 |
| 16 | active | 0 | 10% | 3 | 8 | yes | 4 |
| 18 | active | 0 | 10% | 3 | 10 | yes | 5 |
| 20 (incarnation) | Aspect | — | curated | curated + 2 | 10 | yes | 6 |

**How to read the knobs:**

- **Avatar ability:** applies to Avatar characters. Generic characters never
  have an Avatar ability.
- **Selection band:** the share of ranked candidates sampled per pick. A wider
  band gives a weaker, less coherent deck. The journey default is 25%.
- **Transfigured cards:** that many deck cards receive one random applicable
  transfiguration.
- **Dreamsigns:** chosen by the existing affinity rule from live Dreamsigns
  only.
- **Odd tiers** (guardians at 13, 15 and 17) use the row below.
- **Difficulty:** opponent head start adds `d` at every tier.

Origin: Shandalar's opponent life of `tier + 2d` and monster decks by tier.
Dreamtides has no life total and no AI difficulty levels (decision D24), so
D97 converts tier into deck quality and a head start.

## B8. Battle setup

- **Score target:** 25⍟ for every D97 battle.
- **Player head start:** 0⍟.
- **Opponent head start:** the knob for its tier, plus `d`, plus any guardian
  or Apollyon bonus (Appendix C).
- **Opening hands:** 5 each. The player goes first and skips the first draw, as
  in the journey mode.
- **Dreamsigns:** the player's held Dreamsigns, and the opponent's per the knob
  table.
- **Player deck:** the active deck as built. If it's below the minimum, the
  safety net pads it with temporary, unowned Starter copies, which leave after
  the battle.

The engine supports per-side starting score, opening hand, Avatar, Dreamsigns
and placements (`BattleSetup`); D97 needs no engine rule changes.

## B9. Encounters

**Icons.** Every unbeaten challenger shows an icon over their head: a challenge
mark for challengers, a crown for guardians, a gem for prize duelists. Friendly
NPCs show a service or quest icon. Beaten challengers show none.

**Preview.** Interacting with a challenger opens a preview showing:

- the character, and their Avatar and its ability (Avatar characters), or
  their deck source (generic characters);
- the tier, three signature cards from the deck, and both head starts;
- both stakes (three each when high-stakes), rolled at the first preview
  (Appendix A §A9);
- the advertised extra, or the prizes of a prize duel.

The player chooses **Fight** or **Not now**. Not now is free, and nothing in a
dream ever chases the player.

**Finite challengers.** A won challenger is beaten for the rest of the run and
stays in place as an ordinary character. A lost or drawn challenger keeps its
stakes and can be fought again. Prize duelists leave after one battle, whatever
its result.

**Deck editing** is available anywhere outside battle, including between a
preview and the battle.

Outcomes are in Appendix A §A9.

## B10. Chests and lost objects

- **Chests** stand at chest anchors. Opening one rolls its contents (Appendix A
  §A13). A locked chest shows its lock: a guardian crown (opens when the
  dream's guardian falls) or a keyhole (opens with a named quest key).
- **Lost objects** are quest items at object anchors, visible only while their
  quest is active. Picking one up adds it to the quest log; it can't be sold or
  discarded.

## B11. Dream Guides

Dream Guides are wandering, recurring characters. Each runs one kind of site,
keeps their authored dialogue, and has a home tileset named for their home
dreamscape.

| Guide | Site | Appearances per run |
| --- | --- | --- |
| Tobias Tanglefur | Card Shop | 2 |
| Amunet, the Tomb-Keeper | Dreamsign Bazaar | 2–3 |
| Sigrún | Dreamsign Revelation | 2 |
| Durgan Forgehammer | Transfiguration | 3–4 |
| Deacon Holt | Duplication | 2 |
| Master Takeshi | Handicap trial | 1–2 |
| Aldric, the Seer | Augury | 2 |
| Maddox | Random Site | 1–2 |
| Gravok | Gamble | 1–2 |
| "Layaway" | Exploration | 2–3 |

- **One use per appearance.** Each appearance is a one-use site. Once used, the
  guide stays in the dream as an ordinary friendly character.
- **Placement.** At most two appearances per dream, and never two of the same
  guide in one dream.
- **Home tileset.** When a run includes a dream on a guide's home tileset, the
  guide appears there with probability 1/2. That appearance is always
  enhanced.
- **Random enhancement.** Every other appearance is enhanced with probability
  1/4.
- **Preview.** An enhanced appearance is marked before the player uses it.

Site behaviors and prices: Appendix A §A11 and Appendix D §D2–D3.

## B12. Sages

Each sage gives one free hint, once per run, of a fixed kind:

| Kind | Hint |
| --- | --- |
| Door | Names where one unexplored door in this dream leads; the destination appears in the Atlas as known, with its tier |
| Incarnation | Names the door in this dream that starts the shortest route to the nearest incarnation the player hasn't found |
| Seeker | Names the dream holding the next step of an active quest; acts as a door sage when no quest is active |

A door sage in a dream with no unexplored door acts as an incarnation sage.
Sages are D97's only source of information about unexplored doors.

Origin: `VisitTownWiseman`, Shandalar's fixed-kind settlement advice.

## B13. Quests

**Supply.** Quests are generated with the network and placed on givers, so a
run's quests are finite. A run has 18–24:

| Kind | Count per run |
| --- | --- |
| Avatar quests | 6–8, one per friendly Avatar character |
| Key quests | One per key lock and hidden door |
| The Legendary fragment chain | 1 (Appendix C §C5) |
| Other quests | 8–10 |

**Kinds.** Avatar and key quests use one or two steps of these kinds:

| Kind | Requirement |
| --- | --- |
| Defeat | Beat a named challenger, usually in another dream |
| Delivery | Bring an owned copy with a stated trait (type, subtype, cost or rarity) to a named character; the copy is handed over |
| Errand | Carry a quest item from the giver to a named character in another dream |
| Handicap trial | Beat the giver, who challenges the player once, under one constraint: no Events in the deck, a deck of exactly the minimum size, the Avatar ability suppressed, three stakes each, or a +5⍟ opponent head start |
| Collector request | Own 3–5 cards from a named tide or resonance core, or with a stated trait |
| Lost object | Find an item at an object anchor in another dream and bring it back |

**Flow.**

- The player can accept any number of quests, and quests never expire.
- Every quest finishes by returning to its giver, or to the named recipient
  for errands and deliveries, which pays the reward (Appendix A §A12).
- A defeat target the player has already beaten completes that step on
  acceptance.
- Quest markers show on the Atlas and over the relevant characters and
  objects.
- Trial opponents are built like challengers at the giver's dream tier plus 2,
  and stake normally.

## B14. Avatar characters and switching

- **Avatar characters** are the 32 Avatars as characters. As challengers and
  guardians, they fight with their Avatar ability under the knob table.
- **Friendly Avatar characters** (6–8 per run) each offer one Avatar quest.
  Completing it unlocks that Avatar. Only friendly Avatar characters can be
  unlocked; Avatars met as challengers or guardians can't.
- **The roster** holds the starting Avatar and every unlocked Avatar.
- **Switching.** While standing at an activated waypoint, outside battle, the
  player can switch to any Avatar on the roster, for free and as often as they
  like. The new Avatar is in play from the next battle, and its tides4 deal
  becomes the reward pool (Appendix A §A2). The collection, deck, Dreamsigns,
  currencies and pending stakes don't change.

## B15. State and logging

**Event log.** A run's state is a fold of its event log. Clients write intent
events only. Walking is view-local and never logged. These are intent events:

- step through a door, open a lock, activate a waypoint, fast-travel;
- preview a challenger, fight, choose Not now;
- open a trader, buy, sell; buy from an amulet merchant or changer;
- use a guide site; ask a sage;
- accept a quest, pick up an object, turn in a quest;
- open a chest; switch Avatar; edit the deck.

A reload places the player at the entry point of the last door they stepped
through or the last waypoint they used, whichever was later.

**Identities.** Dreams, doors, anchors, characters, quests and objects have
stable UUIDs derived from the run seed and the map's anchor UUIDs, so replay
and logs refer to them exactly.

**Logs**, with UUIDs and never names:

- the network: map choices, depths, the tree, every door with its lock,
  incarnation placement, guardians, and each anchor's occupant;
- each opponent's pool seed, deck source, constructed deck and knob values;
- each preview's stakes, extra and tier; each battle setup and result;
- each pool deal and Avatar switch;
- each roll at first reveal: trader stock, bundles, chests, prize duel prizes;
- each acquisition and removal (owned-copy UUID, card UUID, channel, price and
  currency);
- quest offers, steps, completions and rewards; sage hints given; guide
  appearances used and whether enhanced.
