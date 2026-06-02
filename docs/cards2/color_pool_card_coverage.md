# Color pool generator card coverage

`scripts/generate-color-pool.mjs` can produce **all 509 cards** in
`data/tabula/cards_v2.toml`. Every card appears in at least some generated pool.

## The producible set

Every card the generator emits enters a pool through `core`
(`docs/archetype_lists/core.txt`, always included), a theme (a mechanic
archetype list intersected with the cards legal in the chosen color identity, or
a color+archetype `drafts_adapted` slice), or fill (the most-shared on-color
`drafts_adapted` cards). The legal set, the fill reservoir, and the
legal-intersection on every mechanic-archetype theme are all built from `core`
and the *on-color* `drafts_adapted` lists, and a list is on-color only when its
color-identity prefix is a subset of the chosen identity. The generator chooses
identities of one to four colors, so only lists with a one-to-four-color prefix
ever qualify. The set of producible cards is therefore exactly:

> **`core` ∪ every card that appears in a `drafts_adapted` list whose color
> prefix has one to four colors.**

## Full coverage

Every card in `cards_v2` falls inside that set:

- **`Grim Pursuer`** is in `core`, so it is in every pool.
- Eleven cards that otherwise sit only in mechanic archetype lists are also
  placed in small color theme lists in `drafts_adapted`, which brings them into
  the producible set:

  | Theme list | Cards |
  | --- | --- |
  | `br-madness` | Cradle of Storms, Gloomantler |
  | `br-sacrifice` | Evacuation Enforcer, Nightmare Manifest |
  | `ub-madness` | Ashlight Caller |
  | `wr-warriors` | Tethered Hollow, Wolfbond Chieftain |
  | `wr-vanguard` | Liminal Striker, Radiant Convergence |
  | `g-stompy` | Spirit of the Greenwood |
  | `gu-blink` | Stoneborn Leviathan |

- The remaining cards are reachable through the standard archetype and color
  lists.

A 3,000-seed sweep produces all 509 cards, and the analytic producible set has
509 members, confirming coverage is complete.
