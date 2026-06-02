# Cards the color pool generator can never produce

`scripts/generate-color-pool.mjs` can emit **497 of the 509 cards** in
`data/tabula/cards_v2.toml`. The remaining **12 cards never appear in any
generated pool**, for structural reasons described below.

## Why these cards are unreachable

Every card the generator emits enters the pool through one of three paths, and
all three are bounded by the same rule:

- **core** — `docs/archetype_lists/core.txt`, always included.
- **themes** — a mechanic archetype list (intersected with the set of cards
  legal in the chosen color identity) or a color+archetype `drafts_adapted`
  slice.
- **fill** — the most-shared cards from the on-color `drafts_adapted` lists.

The legal set, the fill reservoir, and the legal-intersection applied to every
mechanic-archetype theme are all built only from `core` and the *on-color*
`drafts_adapted` lists. A `drafts_adapted` list is on-color only when its
color-identity prefix is a subset of the chosen identity, and the generator
chooses identities of **one to four colors** (it never rolls a five-color
identity). Putting these together, the set of producible cards is exactly:

> **`core` ∪ every card that appears in a `drafts_adapted` list whose color
> prefix has one to four colors.**

A Monte Carlo sweep of 1,500 seeds produces all 497 cards in this set and no
others, confirming the bound is exact. A card in `cards_v2` is therefore
unreachable precisely when it falls outside that set, which happens for two
reasons.

## The 12 unreachable cards

### Present only in mechanic archetype lists (11 cards)

These cards appear in `docs/archetype_lists/` archetype lists but in **no
`drafts_adapted` list**, and they are not in `core`. Because a mechanic-archetype
theme is intersected with the legal set — which is drawn only from `core` and the
color lists — a card that is in neither is filtered out of every theme it would
otherwise belong to, and it is never a fill candidate either. Each is shown with
the archetype lists it belongs to:

| Card | Archetype lists |
| --- | --- |
| Ashlight Caller | discard-madness, events |
| Cradle of Storms | discard-madness, wake-the-fallen-combo |
| Evacuation Enforcer | cheap-characters, discard-madness, survivors |
| Gloomantler | discard-madness, wake-the-fallen-combo |
| Liminal Striker | warrior-aggro |
| Nightmare Manifest | abandon, warrior-combo |
| Radiant Convergence | cheap-characters, wake-the-fallen-combo, warrior-combo |
| Spirit of the Greenwood | celestial-reverie-combo, cindermarch-shadow-soloist-combo, spirit-animals |
| Stoneborn Leviathan | blink, spirit-animals |
| Tethered Hollow | warrior-aggro, warrior-combo |
| Wolfbond Chieftain | cindermarch-shadow-soloist-combo, warrior-aggro, warrior-combo |

Adding any of these cards to an appropriate `drafts_adapted` color list would
make it reachable.

### Present in no input list (1 card)

This card appears in `cards_v2` but in none of the generator's input lists
(`core`, the archetype lists, or `drafts_adapted`), so nothing can ever place it
in a pool:

- Grim Pursuer
