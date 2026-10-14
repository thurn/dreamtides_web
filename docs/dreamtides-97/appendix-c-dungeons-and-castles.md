# Appendix C: Dungeons, clues and castles

This appendix specifies D97's expedition content: where dungeons and castles
are, what treasure they hold, how clues lead to them, how an expedition plays,
and the castle lords and final battle. Notation follows
[Appendix A §A1](appendix-a-economy.md#a1-notation). Values are catalog
tunables.

[Back to the design overview](README.md)

## C1. Placement and themes

- **Ten ordinary dungeons** sit on random land tiles at least 4 tiles from
  every settlement, castle and other dungeon.
- **Theme.** Each dungeon draws a **theme slice** uniformly from the pool's
  slices (the signature core or a joined facet), independent of the realm it
  sits in. This mirrors Shandalar's dungeon colors, which are independent of
  terrain.
- **Guardians.** The theme slice sets the dungeon's guardian roster, built the
  same way as realm rosters (Appendix B §B7):
  - a facet theme uses that facet's neighbours;
  - the core theme uses signatureless Avatars borrowing the player's archetype;
  - either is topped up to 4.
- **Rating.** Each dungeon has a rating: 1 with probability 0.6, otherwise 2
  (C4).
- **Castles.** One per realm, on the realm's castle tile (Appendix B §B3), and
  always visible.
- **Visibility.** Ordinary dungeons are hidden until the player knows at least
  one of their clues (C3).
- **Relocation.** After every expedition an ordinary dungeon moves to a new
  valid tile (C4).

Origin: `InitializeCastleDungeonSlots`, which places 15 castle and dungeon
slots, five of them colored wizard castles.

## C2. Treasure seeding

The finite treasure pool has 30 items (Q24, Q39):

- **The 8 Legendary cards,** the one exception to the campaign pool. They come
  from the whole catalog whether or not the pool holds them, and are never sold,
  bundled or offered anywhere else:

| Card UUID | Display name | Type |
| --- | --- | --- |
| `881e3a5f-280f-413a-b927-352aeb3bda71` | Bloodpact Berserker | Character |
| `97bc4b48-9ea1-40e9-94bb-a88ae4f55d83` | Epiphany Unfolded | Event |
| `1658d9a0-c3b0-4eb7-babc-4933acf362c4` | Glimpse of Infinity | Event |
| `73fc1b7f-3c2b-4993-9590-924240515c2f` | Lunar Hart | Character |
| `a911ef71-799c-4240-ad13-8fabd3caeafa` | Moment Rewound | Event |
| `fd5b3e85-ad7b-4d87-b4db-cd6ba0e6d277` | Nexus Wayfinder | Character |
| `99ca2635-a91a-46ba-a9d3-4d2581c354f3` | Spirit of the Greenwood | Character |
| `be6a2712-cfe3-4d61-b62c-fab8990786a1` | Wolfbond Chieftain | Character |

- **22 Perfected pool cards.** Take the pool's Rares eligible for at least two
  transfiguration forms (a uniform 22 of them if there are more). Fill any
  remaining places with weighted draws of distinct eligible pool Uncommons. Each
  item is that card with the Perfected transfiguration. A typical pool supplies
  about 12 Rares and 10 Uncommons. Plain copies of those cards stay available
  everywhere else.

**Distribution.** Shuffle the 30 items and give each to a uniformly random
ordinary dungeon holding fewer than 3, so each dungeon holds exactly three.

**After it's found,** a treasure item is an ordinary owned copy with provenance
`treasure`. It can be equipped, sold, staked, delivered and lost. An item that
leaves the collection never returns.

Origin: Shandalar seeds its dungeon-exclusive cards (`extra_ability & 0x100`)
at most three per ordinary dungeon, and keeps them out of shops and browsers.
Shandalar's world visibility and clue eligibility check only the first treasure
field; D97 checks all three.

## C3. Clues and clue targeting

**Clue bits.** Each ordinary dungeon has three clue bits:

| Clue | Reveals |
| --- | --- |
| Location | The nearest town and the direction to the dungeon |
| Guardians | The dungeon's theme slice, rating and guardian roster |
| Rules | Its restriction, opening effect and attrition (C5) |

**Clue opportunities:**

- the clue alternative after an ordinary win (Appendix A §A8);
- a clue lair (B11);
- a kind-1 sage (B13);
- tribute (B9).

**Targeting.** Each opportunity runs the targeting rule:

```
for each ordinary dungeon: with probability 1/3, clear its penalty flag
candidates = ordinary dungeons with treasure remaining and at least one unknown clue bit
for each candidate:
    dist  = distance from the player
    score = U{0..dist − 1} + dist / 2
    if penalty flag: score = score × 3
target = the candidate with the lowest score       (no candidates: no clue is offered)
```

Choosing a victory bundle over the offered clue sets the target's penalty flag.
Revealing a clue turns one random unknown bit of the target known.

**Clue journal.** For each dungeon with a known clue, the journal shows:

- its known facts;
- how many clues remain unknown;
- its **remaining treasure, by identity**, from the first clue on.

Seeing the treasure is what turns a clue into a goal.

Origin: `PickWisemanCastleDungeonSlotForHint`, `RevealRandomCastleDungeonClue`,
`RandomlyClearDungeonRuleFlag` and the clue screen in `dungeonCluesScreen.c`.

## C4. Expedition boards and events

**Board.** Every entry generates a fresh 15 × 13 tile maze:

- border walls and a seeded interior wall pattern;
- the entrance at the bottom middle;
- every open cell connected;
- at least three qualifying dead ends, each at path depth ≥ 10 and in distinct
  rows (regenerate otherwise).

In an ordinary dungeon, every qualifying dead end is a treasure room.

**Event period.** `p = 5 − min(timesEntered + d, 3)`. On first entry that is 5,
4, 3 or 2 by difficulty; revisits shrink it toward 2.

**Event cells.** Along each path, an event cell sits every `p` steps past
depth 8 and shallower than the deepest qualifying dead end. Each event cell
becomes:

- **aid**, with probability `1/(d + 3)`;
- otherwise **a minion fight**. The minion's archetype index is
  `floor(5 × depth / maxDepth)`, capped at 4, so deeper fights are harder.
  One cell in four is a **former riddle cell**: a passage with probability ½,
  otherwise a fight one archetype stronger.

**Minions.** The dungeon has five archetypes: Avatars drawn from its guardian
roster, each at a tier from its rating's set:

| Board | Archetype tiers (index 0–4) | Final room |
| --- | --- | --- |
| Rating 1 dungeon | 4, 6, 8, 12, 16 | Treasure rooms |
| Rating 2 dungeon | 6, 8, 12, 16, 18 | Treasure rooms |
| Castle | 12, 13, 14, 16, 18 | The lord at tier 20 (C6) |

**Aid** is a coin flip:

- **Head start:** +`U{1..3}`⍟ for the player in the next fight. It accumulates
  until spent, or until reset (C5).
- **Prepared card:** the player picks a Character from the active deck to
  start the next fight in play.

**Fights.**

- **Stakes:** one player stake each, previewed; the dungeon's minion stakes
  nothing (Appendix A §A9).
- **Win:** the cell clears, with no cards.
- **Loss:** the stake is lost, and the cell stays impassable for this
  expedition, or the expedition ends under attrition.
- **Draw:** blocks the cell without a stake loss.

**Treasure rooms** pay per Appendix A §A15. A room opened after the dungeon's
treasure is exhausted is a cash chest.

**Exit.** The player walks back to the entrance, or uses Leap of Fate. Found
treasure stays owned. Then:

- the dungeon relocates;
- its location clue clears, while the guardian and rules clues stay known;
- `timesEntered` increases.

**Frozen state.** The world clock does not advance inside, and deck editing is
closed unless the player holds Conjurer's Will.

Origin: `RunCastleDungeonBoard`, `PopulateDungeonCellEvents` and dungeon room
resolution in `dungeonEncounter.c`. Riddles depend on card trivia, which D97
does not use.

## C5. Dungeon rules

At world generation each ordinary dungeon independently draws its rules:

| Rule | Chance | Effect |
| --- | --- | --- |
| **Restriction** | ½ | One of three, uniformly: **slice ban** (cards of the dungeon's theme slice cannot be in the expedition deck), **Event ban**, or **Fast ban**. |
| **Opening effect** | ½ | Every minion fight starts with the minion's top-ranked Character, the first Character its deck builder picked, already in play for the opponent. |
| **Attrition** | ½ | A loss ends the expedition. After each won fight, the carry grows by `floor(opponent's final score / 5)`, up to 8. The carry is added to later opponents' head starts in this expedition. |

- **Bans** temporarily remove matching cards from the active deck when the
  player enters. Below the minimum, the safety net pads the deck with temporary
  Starter copies.
- **Castles** always use attrition with **reset**: a loss ends the attempt,
  aid and the carry clear after every fight, and nothing carries between fights.

Origin: Shandalar's rule bits. These cover color, artifact and instant bans;
an opponent starting card (`card_in_effect`); life carried into the next fight
with a loss ending the run; and a reset bit, set together with carry for
castles. D97 converts carried life damage into an opponent head start.

## C6. Castles and Incarnations

**Lords.** Each realm's castle is ruled by one Incarnation of Apollyon. The
Incarnation is matched to the realm's cosmetic resonance through its pool
Avatar's signature tide, and chosen uniformly at world generation when a
resonance has several. The match is presentational; lord decks are curated and
never use the player's pool.

| Cosmetic resonance | Incarnation UUID | Title / Aspect | Pool Avatar | Deck focus |
| --- | --- | --- | --- | --- |
| Wild | `1380edc9-09ed-44df-ad09-ab4cbfc081b5` | World's End / Ravening | Grath | Spirit animals |
| Ember | `ac116276-5569-491b-85c9-e192823bddae` | Butcher / Hunger | Kragg | Sacrifice |
| Vision | `3fe26475-8023-46d3-b13b-86673b92e3d0` | End of Causality / Catastrophe | Ovanel | Event storm |
| Vision | `ccc0385e-ff00-4be3-a807-99e4def47d2d` | Unplaceable / Violation | Edran | Outsiders and removal |
| Valor | `80b6296d-840e-4ed7-b684-5aadc0981bf4` | Doom of Humanity / Slaughter | Eldrik | Warriors |
| Valor | `9a1bf275-2763-4db9-ad10-86d8f7e7efdf` | Herald of Revelation / Frenzy | Eldrik | Events and warriors |
| Shadow | `57c65dfd-a125-440e-a410-c8c4a314b1d1` | Last Word / Haunting | Seraveth | Void recursion |
| Shadow | `e70d2d02-9ba6-434b-94d3-73ad29d3e9f4` | Broken Cycle / Damnation | Vaela | Reclaim |
| Shadow | `9ae35d68-a432-45f6-ab8c-07572a25ad6b` | Keeper of Names / Suffering | Corvath | Discard |
| Shadow | `8890b892-0634-4b8a-bfc0-018adfa979a7` | Sovereign of the Void / Oblivion | Kell Tarn | Void |

**Lord battle.** It uses the incarnation's existing curated recipe:

- the pool Avatar's tides4 pool, biased by its two archetype tides;
- its three signature cards seeded in;
- its curated Dreamsign plus two from the knob table;
- ten transfigured cards;
- Legendaries allowed;
- its Aspect in the Avatar slot.

Aspects are pending today, so lords fight without an Aspect ability until
they're authored. Castle guards come from the realm's roster.

**Castle opening effect** by difficulty:

| Difficulty | Signature characters in play for the lord |
| --- | --- |
| Apprentice | none |
| Magician, Sorcerer | 1 |
| Wizard | 2 |

**Attempt.** The castle board uses the castle row of C4 and the castle rules
of C5. The player needs consecutive wins through the minions to the lord. A
loss ends the attempt; the player may re-enter later and gets a new layout.

**Victory:**

- three exact card picks from the realm's featured slice (Appendix A §A16);
- the castle is ruined and can't be entered again;
- every town the lord holds is freed;
- monster spawns stop in that realm (Appendix B §B15).

Origin: `HandleDefeatedWizardCastle` and the castle branches of
`InitializeCastleDungeonSlots` (tier-20 wizard, per-difficulty castle opening
cards).

## C7. The final battle

**Unlock.** The final battle unlocks when all five castles are ruined. After
the fifth castle victory the player gets a deck-preparation screen and then
fights Apollyon. After a loss, the player can challenge Apollyon again from any
ruined castle.

**Apollyon's setup:**

| Element | Setup |
| --- | --- |
| Deck | The 15 signature cards of the five defeated Incarnations, plus 15 distinct cards ranked by affinity to their ten archetype tides (10% band) |
| Dreamsigns | The five Incarnations' curated Dreamsigns |
| Avatar slot | Apollyon's own Aspect, new content whose ability is pending until authored |
| Head start | `6 + d` |
| Opening placements | Two of its signature characters start in play |
| Stakes | None |

**Victory** ends the campaign and shows the score (Appendix A §A18). A loss
returns the player to the overworld with nothing lost but time.

Origin: Shandalar's final duel against Arzakon (tier scaled by difficulty, with
Black Lotus and Celestial Prism in play) and its score bonus. Shandalar's
handler doesn't check the final duel's result; D97 requires a win (Q30).
