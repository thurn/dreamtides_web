# Dreamtides Design

Dreamtides is a roguelike deckbuilder. A **journey** is one run: the player
picks an Avatar, travels a branching map of dreamscapes, improves a deck at
sites, and fights seven battles, the last against Apollyon. A **battle** is
one card match, played under [the battle rules](rules.md).

Gameplay and UI tunables live in the content catalogs, never as literals in
logic. Numbers on this page are the current catalog values and may change
there.

## Run structure

- **Essence** is the only journey currency. A run starts with 200.
- **Avatar.** The player chooses 1 of 3 offered Avatars. Each Avatar is in
  play from the start of every battle, has its own abilities, and seeds the
  run's draft pool, Dreamsign pool, and reward bias through its tides.
  A player has exactly one Avatar.
- **Starter deck.** Choosing an Avatar adds its fixed starter deck, grants
  the starting essence, builds the draft and Dreamsign pools, generates the
  Dream Atlas, and enters Firstlight Meadow.
- **Dreamsigns** are illustrated objects with minor effects that apply in
  battle, on the map, or both. They are kept for the rest of the run. A
  player holds at most 12; gaining one at the cap opens a replacement choice.
- **Single elimination.** Losing a battle ends the journey. A drawn battle
  counts as a defeat. Winning the seventh battle wins the journey.
- **Battle rewards.** Every won battle grants essence that grows with the
  number of dreamscapes completed.
- **Deck size.** Decks are tuned to land near 30 cards. A deck below 25 cards
  is padded with extra copies of itself for each battle.

## Cards, rarity, and Nightmare

- Dreamtides has no card rarity. The one exception is the **legendary** tag:
  a legendary card appears at most once in a run's draft pool, and reward
  effects can refer to the tag.
- **Nightmare** is the only Bane card: a 0-cost Special Event whose text is
  `Bane.` Journey effects that add, count, price, protect against, or remove a
  Bane act on Nightmare. Authored effects can add it, and Purge removes it
  cheaply or for free.

## Tides and the draft pool

A **tide** is a preconstructed package of cards with one of three roles.
Cards are assigned to tides by battle function, and a card may belong to
several tides.

- **Signature tides** define an Avatar's identity and are always joined.
- **Facet tides** are single-anchor variety engines; each run draws a subset.
- **Neutral tides** are broad fill, joined to reach the pool size.

The **tides4** algorithm builds the run's draft pool deterministically from
the Avatar and the run seed:

1. Join the Avatar's signature tide, if it has one.
2. Join a uniformly random subset of 1–3 of its facet tides.
3. Add neutral tides until a full pool can be dealt.
4. Shuffle and deal 150 cards, at most 2 copies of a card (1 for legendary
   cards), excluding the Avatar's starter cards.

The same step builds the run's Dreamsign pool from the Dreamsign templates of
the joined tides.

**Draft offers** show 4 unique cards sampled without replacement, weighted by
remaining copies and by affiliation. The shown cards are spent from the pool
whether or not they are picked. When the pool runs out it is rebuilt from the
dealt multiset, so draft and shop sites can always make a full offer.

Dreamsigns are spent from the shared Dreamsign pool as soon as they are
offered, so the same Dreamsign is never offered twice in a run.

## Dreamscapes, guides, and affiliations

A **dreamscape** is a named location with a collection of sites. Every
dreamscape between the start and the end has a **Dream Guide** and an
**affiliation**.

- A **Dream Guide** runs one kind of site everywhere it appears and is always
  present in their **home** dreamscape. There, their signature site is
  **enhanced**.
- An **affiliation** is a signature card set. Within its dreamscape, it
  multiplies each candidate's selection weight by its similarity to that set,
  for every random card or Dreamsign draw: draft offers, shop stock,
  transfiguration and duplication candidates, Augury rewards, and so on. It
  never changes pool membership. It also biases the dreamscape's Battle
  opponent toward a matching deck.

| Dreamscape | Guide | Signature site | Affiliation |
| --- | --- | --- | --- |
| Tumbleleaf Village | Tobias Tanglefur | Card Shop | Spirit Animals |
| Pharaoh's Gate | Amunet, the Tomb-Keeper | Dreamsign Bazaar | Erode, Void matters |
| Winterwake Fjords | Sigrún | Dreamsign Revelation | Removal (Dissolve, Banish) |
| Frostforge | Durgan Forgehammer | Transfiguration | Storm, Events matter |
| Hope's End | Deacon Holt | Duplication | Inexpensive Characters |
| Tsukiren | Master Takeshi | Purge | Warriors |
| Wilderveil | Aldric, the Seer | Augury | Abandon, Sacrifice |
| The Rust Expanse | Maddox | Random Site | Survivors |
| Farpoint Station | Gravok | Gamble | Figments |
| Grid City | "Layaway" | Exploration | Discard |

Two dreamscapes are fixed and have neither guide nor affiliation:

- **Firstlight Meadow** starts every journey. Its sites are fixed: two Draft
  sites, a Dreamsign Revelation offering a choice of 3, a Purge site, and a
  Battle fought to 10 points. Nothing in it is enhanced.
- **Limbo** ends every journey and is home to Apollyon. Its sites are drawn
  from the fill pool, none enhanced, and its final Battle is visited last.

## The Dream Atlas

The Dream Atlas is the run's map: seven layers of dreamscape nodes from
Firstlight Meadow (layer 1, one node) to Limbo (layer 7, one node). The
player visits exactly one node per layer and never backtracks.

| Layer | Nodes | Required sites besides Battle and the signature site |
| --- | --- | --- |
| 1 | 1 | Firstlight Meadow's fixed list |
| 2 | 2 | 2 Draft, Purge, Augury |
| 3 | 3 | 1 Draft, Purge |
| 4 | 3–4 | 1 Draft |
| 5 | 3–5 | none |
| 6 | 3–5 | none |
| 7 | 1 | Limbo: Battle against Apollyon |

- **Connections.** The whole skeleton and its forward connections are
  generated at journey start. Connections never cross, average about two
  forward edges per node, and every node has at least one forward and one
  backward connection. Layer 1 connects to both layer-2 nodes; every layer-6
  node connects to Limbo.
- **Node states:** unrevealed, revealed-locked, available, completed, and
  forgone (a route the player passed by, shown dimmed).
- **Reveals.** Completing a layer reveals the layer two ahead, so the player
  sees the current choice plus one layer of look-ahead. Limbo is always
  revealed, and 0–2 extra nodes in layers 5–6 (usually 1) are revealed at
  the start for planning. Connections are always visible.
- **Assigning dreamscapes.** Layers 2–6 draw from the ten guide dreamscapes
  with weights that drop each time a dreamscape is placed, so fresh
  dreamscapes are strongly favored but repeats stay possible. A dreamscape is
  never adjacent to a copy of itself, and the two layer-2 choices show
  different signature sites.
- **Preview.** A node shows its home guide's signature-site icon; hovering it
  describes the guide, the affiliation, and the home specialty.
- **Known Dreamsigns.** Rarely, a node in layers 3–6 carries a known
  Dreamsign (at most 2 per atlas), drawn from the Dreamsign pool at
  generation. Visiting the node's Dreamsign Reward site grants it for free.
  Placement favors nodes revealed at the start.

## Dreamscape generation

A dreamscape's sites are fixed when it becomes available. A non-starter
dreamscape has 3–6 sites:

1. The Battle site, always visited last.
2. The home guide's signature site, enhanced (Limbo has none).
3. The layer's required sites from the table above.
4. Fill sites drawn from the other guides' signature sites (each with its
   guide, not enhanced) plus Essence sites, using the layer's fill profile.
   Later profiles favor sites such as Transfiguration and Duplication. A
   known Dreamsign takes one fill slot as a Dreamsign Reward site. A known
   Dreamsign is placed only in a layer whose Battle, signature, and required
   sites leave a fill slot free. If a dreamscape has no free slot anyway,
   its Reward replaces a second Draft, or else the last required site, so
   it never exceeds the layer's site count.

A site type appears at most once per dreamscape, except Draft (at most 2).
Sites can be visited in any order except Battle, and each is visited once.

## Sites

Battle, Draft, Essence, and Dreamsign Reward have no guide and are never
enhanced. Every other site belongs to a guide and has a home specialty.

| Site | Standard | Home specialty |
| --- | --- | --- |
| **Battle** | A match against an AI Avatar whose deck is built by simulating a journey with that Avatar's tides to the same point, biased toward the affiliation. The opponent's Avatar ability is dormant in the opening battle, and opponents bring one Dreamsign from layer 3 on. The opponent's Avatar and Dreamsigns are previewed before the match. | — |
| **Draft** | 5 picks from the shared pool, 4 cards per pick. | — |
| **Essence** | Grants essence from a band (200–300). | — |
| **Dreamsign Reward** | Grants the node's known Dreamsign. | — |
| **Card Shop** | 5 cards for essence (about 100 each) with random discounts of 30–90% on one or two, plus one restock for 50. Stock is spent from the draft pool. | Discounted strong cards drawn from the Avatar's signature tide. |
| **Dreamsign Bazaar** | 3 Dreamsigns for essence plus one restock for 50. | The restock is free. |
| **Dreamsign Revelation** | A choice of 3 Dreamsigns. | A choice of 4. |
| **Transfiguration** | Up to 3 random deck cards, each offering an applicable transfiguration; pick one. | Pick any card and any applicable transfiguration. |
| **Duplication** | 3 random deck cards; copy one. | Copy any card. |
| **Purge** | Pay escalating essence to remove cards: the Nth removal in a visit costs `30 + 5·N·(N+1)` (40, 60, 90, 130, 180, 240), up to 6 per visit. Nightmare is cheap or free. | Remove up to 3 cards, including Nightmare, for free. |
| **Augury** | Choose one of two pure-upside rewards, often structural (deck-wide changes, new sites, curated cards). Some details stay hidden until chosen. | Bigger rewards curated to the deck. |
| **Random Site** | Shown as `?`; conceals one enhanced site of another guide, hosted by Maddox. | Choose one of three distinct enhanced sites. |
| **Gamble** | One of several wager games: the Three-Gate Wager, Tidemark Ladder Climb, Starway Stairs, Four-Suit Reprise, and Blackjack. A win pays more than the stake; a loss forfeits it. | No initial fee, bigger payouts. |
| **Exploration** | A card from the deck opens into its dream, presenting an authored narrative and a choice of mechanical outcomes. | Enhanced Exploration. |

Guides have authored dialogue. In portrait layouts the guide is framed at the
top of the screen with content below; in landscape layouts the guide stands
to one side.

## Transfigurations

A transfiguration permanently modifies one card. A card can hold only one,
and each has a color and an emblem shown on the card.

| Transfiguration | Effect | Eligible cards |
| --- | --- | --- |
| Empowered | Halves the energy cost, rounding down: 4→2, 3→1, 2→1, 1→0. | Cost 1 or more |
| Amplified | Uses the card's authored amplified text, which changes a number in its rules by one. | Cards with an amplified variant |
| Kindled | Doubles base spark, or sets 0 spark to 1. | Characters |
| Inspired | Appends "draw a card". | Events |
| Enduring | Adds Reclaim. | Events |
| Hastened | Makes the card Fast. | Events that are not Fast |
| Resonant | Widens named triggers: Materialized also fires on dissolve, Dawn also fires on materialize, and "once per turn" becomes unlimited. | Cards with those triggers |
| Attuned | Reduces an activated ability's energy cost by 1. | Cards with energy-cost activated abilities |
| Perfected | Applies every other transfiguration the card is eligible for. | Cards eligible for 2 or more |

## Apollyon

Apollyon, the Doom of Humanity, is the final boss: always the same character,
appearing in one of ten **incarnations** chosen when the atlas is generated.
Each incarnation has a title, an Aspect description, and a deck archetype.
The incarnations are currently presentation only; their battle mechanics
(an Aspect ability, a curated boss deck, and 1–2 Dreamsigns each) are
provisional and are documented here once implemented.

## Future: meta-progression

Meta-progression is not part of the game yet. The intended design is
achievement-based: each reward unlocks on a trigger such as "win 3 journeys"
or "play 500 events", with an early linear track keyed to journeys attempted
that doubles as a tutorial. Planned unlock kinds include additional Avatars
and Avatar choices, enhanced sites, a second chance after one lost battle,
waiving the Firstlight Meadow battle, more starting essence, draft rerolls,
wider atlas layers, rare cards and Dreamsigns, and cosmetics.
