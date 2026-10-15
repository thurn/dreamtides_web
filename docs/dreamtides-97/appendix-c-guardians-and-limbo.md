# Appendix C: Guardians, Limbo and the Legendary dream

This appendix specifies D97's guardians, the incarnations of Apollyon, Limbo
and its final battle, and the Legendary dream. Notation follows
[Appendix A §A1](appendix-a-economy.md#a1-notation). Values are catalog
tunables.

[Back to the design overview](README.md)

## C1. Ordinary guardians

Every dream has a guardian standing at its guardian anchor, marked with a
crown. Seven of the twelve ordinary dreams, every hidden dream and the
Legendary dream have an **Avatar guardian**: a boosted Avatar character.

- **Who.** Avatars are assigned to guardian seats first (Appendix B §B6), drawn
  uniformly from the Avatars other than the player's starting Avatar.
- **Strength.** Tier `min(dream tier + 4, 18)`, built as in Appendix B §B7, with
  one Dreamsign and one ⍟ of head start beyond its tier's knobs.
- **Battle.** One staked battle (Appendix A §A9). A loss costs the player's
  stake, and the player can challenge the guardian again at any time with the
  same stakes.
- **Victory:**
  - the guardian's stake and 2 exact picks from its deck (Appendix A §A15);
  - every guardian-locked door and chest in the dream opens.

A guardian is optional unless a guardian lock stands on the only route the
player wants to take.

## C2. Incarnation guardians

Five of the twelve ordinary dreams have an **incarnation guardian**: one of
Apollyon's ten incarnations, drawn uniformly at generation and placed by depth
(Appendix B §B3). The player learns which dreams hold incarnations by entering
them, or earlier through sages. The Atlas marks an incarnation dream once its
guardian has been seen.

| Incarnation UUID | Title / Aspect | Pool Avatar | Deck focus |
| --- | --- | --- | --- |
| `1380edc9-09ed-44df-ad09-ab4cbfc081b5` | World's End / Ravening | Grath | Spirit animals |
| `ac116276-5569-491b-85c9-e192823bddae` | Butcher / Hunger | Kragg | Sacrifice |
| `3fe26475-8023-46d3-b13b-86673b92e3d0` | End of Causality / Catastrophe | Ovanel | Event storm |
| `ccc0385e-ff00-4be3-a807-99e4def47d2d` | Unplaceable / Violation | Edran | Outsiders and removal |
| `80b6296d-840e-4ed7-b684-5aadc0981bf4` | Doom of Humanity / Slaughter | Eldrik | Warriors |
| `9a1bf275-2763-4db9-ad10-86d8f7e7efdf` | Herald of Revelation / Frenzy | Eldrik | Events and warriors |
| `57c65dfd-a125-440e-a410-c8c4a314b1d1` | Last Word / Haunting | Seraveth | Void recursion |
| `e70d2d02-9ba6-434b-94d3-73ad29d3e9f4` | Broken Cycle / Damnation | Vaela | Reclaim |
| `9ae35d68-a432-45f6-ab8c-07572a25ad6b` | Keeper of Names / Suffering | Corvath | Discard |
| `8890b892-0634-4b8a-bfc0-018adfa979a7` | Sovereign of the Void / Oblivion | Kell Tarn | Void |

**Strength by order.** An incarnation's tier is `12 + 2k`, where `k` is the
number of incarnations the player has beaten when the battle starts: 12, 14,
16, 18, then 20. Every order of the five is viable, and the last incarnation is
always the hardest. The preview shows the tier at the moment it's opened.

**Battle.** It uses the incarnation's existing curated recipe:

- the pool Avatar's tides4 pool, biased by its two archetype tides;
- its three signature cards seeded in;
- its curated Dreamsign plus the knob table's Dreamsigns for its tier;
- the knob table's transfigured cards for its tier;
- its Aspect in the Avatar slot;
- one of its signature characters in play at the start.

Aspects are pending today, so incarnations fight without an Aspect ability
until they're authored. The battle is staked and retryable like an Avatar
guardian's.

**Victory:**

- the incarnation's stake and 3 exact picks from its deck, with its signature
  cards eligible (Appendix A §A15);
- every guardian-locked door and chest in the dream opens;
- every Limbo door's count advances by one.

Origin: Shandalar's five wizard castles. D97 keeps five incarnation bosses as
the run's required milestones, as single battles in open dreams rather than
castle gauntlets.

## C3. Limbo

- **Door.** A Limbo door stands in every incarnation dream. It shows its count,
  "n of 5", and opens when the fifth incarnation falls.
- **Map.** Limbo has one fixed map with a waypoint, which activates on first
  entry.
- **Incarnation challengers.** The five incarnations not chosen as guardians
  stand in Limbo as optional challengers at tier 20, built by the C2 recipe.
  Each battle is staked and pays the incarnation's stake and 3 picks
  (Appendix A §A15).
- **Apollyon** is Limbo's guardian (C4). The player can challenge him at once,
  without fighting any incarnation in Limbo.
- **Leaving.** The player can leave Limbo by its waypoint or its doors, and
  return at any time.

## C4. Apollyon

**Setup:**

| Element | Setup |
| --- | --- |
| Deck | The 15 signature cards of the five incarnations the player defeated as guardians, plus 15 distinct cards ranked by affinity to their ten archetype tides (10% band) |
| Dreamsigns | The five defeated incarnations' curated Dreamsigns |
| Avatar slot | Apollyon's own Aspect, new content whose ability is pending until authored |
| Head start | `6 + d` |
| Opening placements | Two of his signature characters start in play |
| Stakes | None |

**Victory** ends the run and shows the score (Appendix A §A18). A loss or draw
costs nothing; the player can prepare and challenge him again.

Origin: Shandalar's final duel against Arzakon, with its opening cards in play
and its score bonus. Shandalar's handler doesn't check the final duel's result;
D97 requires a win.

## C5. The Legendary dream

**Unlock.** The Legendary dream's door stands in a dream at depth 2–3. It
shows two requirements:

1. **The fragment key.** A generic quest giver in a dream at depth 0–1 offers
   the fragment chain: a lost-object quest for three fragments, placed at object
   anchors in three distinct dreams at depth 1 or more. Returning all three
   pays the key (Appendix A §A12).
2. **Two incarnations beaten.**

The door opens when both hold.

**Inside.** The Legendary dream has one fixed map with a waypoint, seven
keepers and a guardian:

- **Keepers** are generic characters from a keeper persona catalog, at tier 18,
  each with a deck source drawn as in Appendix B §B6.
- **The guardian** is an Avatar guardian (C1) at tier 18.
- **Stakes.** At generation, the eight Legendary cards are assigned one each to
  the keepers and the guardian. Each stakes its Legendary (Appendix A §A16),
  and its preview shows it.

**Battles** are ordinary staked battles against the player's random active
copy. A keeper's win pays only its Legendary; the guardian's pays its Legendary
and two picks. A loss costs the player's stake and leaves the keeper in place
for a rematch, so all eight Legendaries stay winnable for the rest of the run.

The Legendary dream is the only source of Legendary cards.

Origin: Shandalar's dungeon treasure, the finite special cards at the end of a
clue trail. D97 gathers them in one locked dream.

## C6. Hidden dreams

Each run has one or two hidden dreams (Appendix B §B3). A hidden dream:

- hangs off a dream at depth 2–4 behind a key-locked door or an amulet toll;
- has an Avatar guardian, three challengers, a prize duelist, and one or two
  chests;
- has a 1/2 chance of a Dream Guide appearance, which is always enhanced.

Hidden dreams are optional. They give quest rewards and amulets a destination,
and pay a little more than a dream of the same depth.
