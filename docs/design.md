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

## Dreamsign journey effects

A Dreamsign's journey effect reacts to each change the player's journey goes
through: a site reward, a purchase, a pick, a battle reward, and so on.

- **Timing.** The effect applies after the change, to its result.
- **Holding.** Only the Dreamsigns held once the change completes apply. A
  Dreamsign gained by a change applies to that same change; one lost or
  replaced by a change does not.
- **Order.** Held Dreamsigns apply in the order they are held, once per held
  copy, each seeing the result of the ones before it.
- **Administrative edits.** Debug, QA, and developer edits, such as setting
  essence to an exact value, and loading or resetting a whole journey, never
  trigger journey effects: they write exactly the state they name.

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

Battle, Draft, Essence, and Dreamsign Reward have no guide. Guide home
specialties and additional random enhancements apply to the other site types.
A targeted Dreamsign Reward enhancement offers up to three distinct free
alternatives, including its standard prepared reward. Its persisted choice
spends the shown UUIDs on reveal and survives holdings, essence, and reload
changes; accept one, replace a held Dreamsign at the current cap, or decline.
Every guided site belongs to a guide and has a home specialty.

| Site | Standard | Home specialty |
| --- | --- | --- |
| **Battle** | A match against an AI Avatar whose deck is built by simulating a journey with that Avatar's tides to the same point, biased toward the affiliation. The opponent's Avatar ability is dormant in the opening battle, and opponents bring one Dreamsign from layer 3 on. The opponent's Avatar and Dreamsigns are previewed before the match. | — |
| **Draft** | 5 picks from the shared pool, 4 cards per pick. | — |
| **Essence** | Grants essence from a band (200–300). | — |
| **Dreamsign Reward** | Grants one prepared Dreamsign. | — |
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

### Journey Transfiguration Modifiers

A held Leaf Ledger prepares a two-card allowance with a Transfiguration site's
initial quote; each choice retains the same offers and prices until the allowance
is used or the visit is finished. A held Spell Tome copies each concrete Event
transfigured by a journey operation, including its form and permanent entry
modifications, with a fresh deck-entry identity. Gaining an already-transfigured
card is a separate operation.

Green Slime earns an optional choice after every battle: select up to its printed
maximum of eligible deck entries and apply one random applicable form to each for
free. Its earned copies and Slug's earned purge copies appear in held order and
persist through source loss and reload. Their final continuation preserves the
battle's reward and exact Atlas, completed, or failed route.

## Apollyon

Apollyon is the final boss, appearing in one of ten **incarnations** selected
when the atlas is generated. The incarnation UUID is authoritative for the
boss battle. Its distinct Aspect UUID occupies the engine's permanent Avatar
emblem slot; the Aspect is not a selectable journey Avatar. The three curated
signature cards, one Dreamsign and archetype tide bias are defined alongside
its provisional DSL specification in `src/content/apollyon/design.ts`.

**Provisional design.** The battle construction and recipes are active. Each
Aspect keeps its separate `proposedAbilities` specification. Verified pairs
have live abilities and matching `verifiedText`; pending pairs receive an
empty live ability list. Ravening and Catastrophe are verified live Aspects.
Pair-authoring work verifies the other pairs; the subsequent sanity work
measures 50 Greedy-vs-Greedy games per incarnation against layer-6 decks.
These designs carry no balance or win-rate claim.

| Incarnation UUID and Aspect | Proposed emblem ability | Design rationale and deck focus |
| --- | --- | --- |
| `1380edc9-09ed-44df-ad09-ab4cbfc081b5` — World's End / Ravening | **Verified live.** Once per turn, playing a spirit animal materializes a 1✦ spirit animal figment. | Bounded pack growth turns animals into a chorus. The Grath pool and Stampede/One Pack tides emphasize swarm support; Dreamborne Leviathan, Ghostlight Wolves and Emerald Guardian are signatures, with Magic Fish sustaining the pack. |
| `3fe26475-8023-46d3-b13b-86673b92e3d0` — End of Causality / Catastrophe | **Verified live.** Copy the second event played each turn. | A finite event echo supplies storm tempo. Copies are not played cards. Ovanel's pool and Gathering Tempest/Doubling Current bias support Echoes of the Journey, Echo Architect and Echoes of Eternity; Witch Hat provides cards rather than another copy trigger. |
| `80b6296d-840e-4ed7-b684-5aadc0981bf4` — Doom of Humanity / Slaughter | Warriors you control have +1✦. | The live provisional continuous strength bonus rewards gathered ranks and support geometry. Eldrik's pool and Drums of War/Sundering Vanguard favor Skyflame Commander, Warrior's Path and Winterbough Guide, with Ivory Claw replenishment. |
| `ac116276-5569-491b-85c9-e192823bddae` — Butcher / Hunger | Once per turn, abandoning a character draws a card. | Sacrifice feeds another survivor without an automatic sacrifice loop. Kragg's pool and Rite of the Swarm/Cull's Bounty support Corrupted Host, Soulkindler and Tidewreck Navigator; Shadow Droplet supplies survivor reclaim. |
| `57c65dfd-a125-440e-a410-c8c4a314b1d1` — Last Word / Haunting | Dawn returns a random ≤2● cost character from your void to hand. | The live provisional Dawn recovery keeps the cheap host returning; it pays to reenter play. Seraveth's pool and Hunger of the Deep/Unending Host favor Sunrise Strummer, Void Salvager and Voidsire; Mandrake Root reinforces smaller-character recovery. |
| `e70d2d02-9ba6-434b-94d3-73ad29d3e9f4` — Broken Cycle / Damnation | **Provisional live:** Once per turn, the first character you reclaim gains +1✦ on its physical card before materialization; the gain travels across zones. | Repeated passage through the void builds a soul's strength. Vaela's pool and Embers into Flame/Eternal Cycle favor Amber Aurelia, Spirit of Smoldering Echoes and Echo Technician, with Dragon Egg rewarding the return route. |
| `9ae35d68-a432-45f6-ab8c-07572a25ad6b` — Keeper of Names / Suffering | Once per turn, the discarded card gains reclaim until end of turn. | Discard creates one immediate opportunity rather than limitless card flow. Corvath's pool and Echoes in the Abyss/Drowned Archive favor Ritekeeper, Resonance Surveyor and Soulkindler; Honeycombs helps pay for recursion. |
| `8890b892-0634-4b8a-bfc0-018adfa979a7` — Sovereign of the Void / Oblivion | **Provisional, live.** Dawn grants reclaim to a random character in your void when it contains at least seven cards, checked at triggering and resolution. | Density unlocks a growing recursion resource, with the character’s normal reclaim costs paid to play it. Kell Tarn's pool and Harvest of the Fallen/Risen from the Depths favor Ashen Remnant, Vessel of Echoes and Voidsire; Eyeball Plant supplies another cost-gated reclaim route. |
| `ccc0385e-ff00-4be3-a807-99e4def47d2d` — Unplaceable / Violation | **Provisional live:** Pay 2● and exhaust the Aspect to dissolve an enemy with at most 2 effective ✦. | Precise removal opens lanes for Outsiders, with exhaustion limiting each use. Edran's pool and Unseen Procession/Long Attrition favor Paradox Corps Enforcer, Abyssal Deputy and Breach Artist; Cloud Lens supports cheap event tempo. |
| `9a1bf275-2763-4db9-ad10-86d8f7e7efdf` — Herald of Revelation / Frenzy | **Provisional, live.** Playing the second event each turn awakens warriors you control; copied events do not count as played. | A timed rapture rewards events followed by warrior challenges. Eldrik's pool and Dawn's Charge/Drums of War favor Conduit of Resonance, Winter Harbinger and Warrior's Path; Black Attuned connects the event and warrior plans. |

Recipes use real roster Avatar UUIDs solely as seeded Tide pool sources. Their
explicit tide UUIDs and signature card UUIDs seed the shared affinity ranking;
signatures remain present once each through fill and starter dilution. Names
are display references in this rationale, never keys or equality predicates.
The catalog records all card, tide, Dreamsign, Aspect and pool-source UUIDs.

The configured historical default is Doom of Humanity. A historical atlas
with an absent or null incarnation uses that default when its supplied catalog
contains it. Historical callers without boss configuration, and catalogs
without the configured default, retain their seeded ordinary opponent route.
An explicitly selected unknown incarnation is an error when boss configuration
is supplied. Battle construction does not mutate the atlas or select another
incarnation. The boss descriptor preserves paired incarnation/Aspect UUIDs;
engine replay preserves the same permanent emblem and exact deck/Dreamsigns.

`apollyon_opponent_constructed` records the selection mode, incarnation,
Aspect, pool source, tide bias, signature and Dreamsign UUIDs, final card UUIDs,
seeds, opponent tuning hash and live Aspect status. Its reconstruction logs
share the battle transaction's deferred commit handoff.

## Future: meta-progression

Meta-progression is not part of the game yet. The intended design is
achievement-based: each reward unlocks on a trigger such as "win 3 journeys"
or "play 500 events", with an early linear track keyed to journeys attempted
that doubles as a tutorial. Planned unlock kinds include additional Avatars
and Avatar choices, enhanced sites, a second chance after one lost battle,
waiving the Firstlight Meadow battle, more starting essence, draft rerolls,
wider atlas layers, rare cards and Dreamsigns, and cosmetics.
