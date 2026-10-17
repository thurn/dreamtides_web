# Appendix C: Bosses, Limbo and keys

This appendix specifies D97's Avatar guardians, the incarnations of Apollyon,
Limbo and its final battle, and the keys and key dreams of the endgame.
Notation follows [Appendix A §A1](appendix-a-economy.md#a1-notation). Values
are catalog tunables.

[Back to the design overview](README.md)

## C1. Avatar guardians

Each act has 2–4 **Avatar guardians**: boosted Avatar characters standing at
chokepoints (Appendix B §B5), marked with a crown.

- **Who.** Avatars are assigned to guardian seats first (Appendix B §B7), drawn
  uniformly from the Avatars other than the player's starting Avatar.
- **Strength.** Tier `min(t + 3, 18)`, built as in Appendix B §B9, with one
  Dreamsign beyond its tier's knobs. It starts the battle at 0⍟, like every
  opponent (Appendix B §B10).
- **Battle.** One anted battle (Appendix A §A9). A loss costs the player's
  ante, and the player can challenge the guardian again at any time with the
  same antes.
- **Victory:**
  - the guardian's ante and 1 exact pick from its deck (Appendix A §A15);
  - the guardian steps aside, opening its corridor, its door and any chests
    behind it.

Every route to an act's incarnation passes at least two Avatar guardians.
Guardians off those routes are optional.

## C2. Incarnations

At run start, five of Apollyon's ten incarnations are drawn uniformly and
assigned to Acts 1–5 in random order (Appendix B §B4). Each stands at the
chokepoint before its act's exit door. The other five wait in Limbo.

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

**Strength by act.** An act's incarnation has tier `t + 4`: 8, 11, 14, 17 and
20 in Acts 1–5. It plays to its act's incarnation score target (Appendix B
§B3).

**Battle.** It uses the incarnation's existing curated recipe:

- the pool Avatar's tide set, with its two archetype tides added to the
  context;
- its three signature cards seeded in;
- its curated Dreamsign plus the knob table's Dreamsigns for its tier;
- the knob table's Starter dilution and transfigured cards for its tier;
- its Aspect in the Avatar slot;
- one of its signature characters in play at the start.

The battle is anted and retryable like an Avatar guardian's.

**Victory:**

- the incarnation's ante and 2 exact picks from its deck, with its signature
  cards eligible (Appendix A §A15);
- in Acts 4 and 5, one key (C5);
- the incarnation steps aside, opening the act's exit door.

Origin: Shandalar's five wizard castles. D97 keeps five incarnation bosses as
the run's required milestones, one at the end of each act, as single battles
rather than castle gauntlets.

## C3. Limbo

- **Entry.** The Act 5 exit door leads to Limbo, behind the Act 5
  incarnation.
- **Map.** Limbo has one fixed map with a waypoint, which activates on first
  entry.
- **The Limbo incarnations.** The five incarnations not drawn for the acts
  stand around Apollyon's dais. All five are mandatory, and the player can
  fight them in any order. Each is tier 20, built by the C2 recipe, plays to
  30⍟, is anted and retryable, and pays its ante and 2 picks.
- **Apollyon manifests** on his dais when the fifth Limbo incarnation falls
  (C4).
- **Leaving.** The player can leave Limbo by its waypoint or its door, and
  return at any time.

## C4. Apollyon

**Setup:**

| Element | Setup |
| --- | --- |
| Deck | The 15 signature cards of the five incarnations who guarded the acts, plus 15 distinct cards ranked by affinity to their ten archetype tides (10% band) |
| Dreamsigns | Those five incarnations' curated Dreamsigns |
| Avatar slot | Apollyon's own Aspect, new content whose ability is pending until authored |
| Score target | 30⍟ |
| Starting score | 0⍟ for both sides |
| Opening placements | Two of his signature characters start in play |
| Ante | None |

**Victory:**

- records the campaign victory and its score (Appendix A §A19);
- on Hard, unlocks Nightmare (Appendix A §A18);
- opens bag stage 6 (Appendix A §A2);
- from then on, new keys are tier 18 (C5).

The run continues: every act dream, Limbo and the endgame stay open. A loss or
draw costs nothing; the player can prepare and challenge him again.

Origin: Shandalar's final duel against Arzakon, with its opening cards in play.
D97 keeps the opening placements and drops Arzakon's life bonus, so both sides
start at 0⍟. Shandalar's handler doesn't check the final duel's result;
D97 requires a win.

## C5. Keys

**Sources:**

| Source | Keys |
| --- | --- |
| Challenger extra, in Acts 4–5 and key dreams | 1, with probability 1/8 per challenger (Appendix A §A8) |
| Act 4 and Act 5 incarnations | 1 each |
| A finished key dream | 1, plus 1 more when every battle in it was won |

Because every finished key dream pays at least one key, the endgame never runs
out of keys.

**What a key holds,** rolled when it's created and shown on the key:

- **Dream:** a uniformly random catalog dream, preferring dreams not placed in
  this run's acts and not on another held or open key.
- **Tier:** 13 before the player first enters Act 5, 16 from then until
  Apollyon falls, and 18 afterwards.
- **Challengers:** `min(U{4..7}, the dream's challenger anchors)`.
- **Prize:** drawn as in Appendix A §A16.

The player can hold any number of keys. Keys can't be sold or traded.

**Using a key.** At any activated waypoint, outside battle, the player uses a
key. The key is consumed, its key dream opens, and the player arrives at the
key dream's waypoint.

Key modifiers, which would make key dreams harder for larger rewards, are
future work.

Origin: Path of Exile's maps, consumable items that each open one instance of
an endgame area, and Shandalar's dungeons, whose treasures are the run's
finite special cards.

## C6. Key dreams

A key dream is a one-time instance of the key's catalog dream:

- **Challengers:** the key's count, at the key's tier, at the dream's
  challenger anchors. About one in five is an Avatar character (any Avatar);
  the rest are generic characters. Each has the usual antes and extra
  (Appendix A §A8–A9), including the 1/10 chance of high ante.
- **Friendly NPCs:** the dream's shop and residents, one Dream Guide
  appearance (Appendix B §B13) and its usual 1–2 chests. The dream's authored
  quests are not offered.
- **No guardians.** Guardian anchors stay empty and their corridors open.
- **Settings:** score target 25⍟ and price band 3.
- **Waypoint.** It activates on arrival. The player can leave and return
  until the key dream is finished. Only one key dream is open at a time, and
  the Atlas lists it with its remaining challengers and prize.
- **No refills.**

## C7. One attempt each

- **Each challenger can be fought once.** A win pays its normal rewards. A
  loss costs the player's ante; a draw exchanges nothing. Either way, the
  challenger leaves and the key dream's prize is forfeited. The remaining
  challengers still pay their own rewards.
- **Finishing.** A key dream is finished when every challenger in it has been
  fought. It then pays its key, or two keys and its prize if every battle was
  won.
- **Closing.** A finished key dream closes when the player leaves it, and
  leaves the Atlas.

## C8. Prizes

A key's prize is fixed when the key is created (Appendix A §A16):

- **Legendary card:** a plain copy, into reserve.
- **Legendary Dreamsign:** one of the ten promoted Dreamsigns, into the
  Dreamsign collection.
- **Avatar:** the Avatar joins the roster. Its key dream places that Avatar
  among the challengers, fighting with its Avatar ability.
- **Perfected card:** a Perfected copy of a tide-set supply card, into
  reserve.

Legendary card copies can repeat before the player owns all eight, up to four
copies of each. Key prizes are the only source of Legendary cards, Legendary
Dreamsigns and, beyond the two campaign Avatar quests, Avatars. Owning every
Legendary Dreamsign and Avatar takes 39 prizes; Perfected cards keep later keys
worth opening.
