# Appendix D: Reusing Dreamtides content

D97 reuses the existing catalogs and algorithms: cards, tides, Avatars,
Dreamsigns, transfigurations, the opponent deck builder, Apollyon and the site
encounters. This appendix gives every piece of reused content its D97 home,
and lists what D97 adapts or leaves out. Content is always identified by UUID;
names here are for reading.

[Back to the design overview](README.md)

## D1. Summary

| Content | D97 home |
| --- | --- |
| Tides (64) | Signature and facet tides form the Avatars' authored tide sets, which define reward bags and opponents' candidates; never shown to the player |
| Supply cards (509) | Reward bags, opponent antes, guardian picks, shops, curiosities, resonance cores and Perfected key prizes |
| Legendary cards (8) | Key prizes only |
| Starter cards (10) | Starting-collection dilution and low-tier opponent dilution |
| Special and Tutorial cards | Not used |
| Opponent deck builder | Every opponent's deck, and the player's starting collection |
| Avatars (32) | Player choice; Avatar characters as guardians, quest givers, challengers and key-dream challengers; deck sources for generic characters; key prizes |
| Resonance | Colored pills on the Avatar select screen; the five amulets and resonance cores |
| Rarity | Visible supply tier and economy costs |
| Transfigurations (9) | The Transfiguration site, other site outcomes, Dreamsign effects, opponent knobs, Perfected key prizes |
| Dreamsigns (153) | Battle and journey effects through slots; ten promoted to Legendary as key prizes (D6) |
| Dream Guides (10) | Wandering site hosts with home tilesets (D2) |
| Dreamscapes (10) | Tilesets: the guides' home tilesets |
| Apollyon incarnations (10) | Five act bosses and five Limbo incarnations per run (Appendix C) |
| Site types (14) | Guide sites, shops, Random Site outcomes, or not used (D3) |
| Battle rules | Unchanged (`docs/rules.md`) |

## D2. Dream Guides

Each guide wanders between dreams, keeps their authored dialogue, and has a
home tileset named for their home dreamscape (Appendix B §B13).

| Guide | Home tileset | Site in D97 | Enhanced |
| --- | --- | --- | --- |
| Tobias Tanglefur | Tumbleleaf Village | Curiosities: cards from outside the tide set (Appendix A §A6) | 6 slots; slot ceilings start at Uncommon |
| Amunet, the Tomb-Keeper | Pharaoh's Gate | Dreamsign Bazaar | 4 Dreamsigns |
| Sigrún | Winterwake Fjords | Dreamsign Revelation (1 of 3) | 1 of 4 |
| Durgan Forgehammer | Frostforge | Transfiguration | Any owned copy, any eligible form |
| Deacon Holt | Hope's End | Duplication | Any owned copy |
| Master Takeshi | Tsukiren | Handicap trials (Appendix B §B15) | The trial pays an exact pick from 5 bag cards instead of 3 |
| Aldric, the Seer | Wilderveil | Augury | Bigger rewards curated to the deck |
| Maddox | The Rust Expanse | Random Site | Choose one of three distinct enhanced sites |
| Gravok | Farpoint Station | Gamble | No initial fee, bigger payouts |
| "Layaway" | Grid City | Exploration | Enhanced Exploration |

Affiliations remain flavor: affiliation weights are not applied.

## D3. Site types

| Site | D97 home | Adaptation |
| --- | --- | --- |
| Battle | Challengers, guardians, incarnations, key-dream challengers, prize duelists, trials, Limbo | Tiers replace completion levels (Appendix B §B9) |
| Draft | A Random Site outcome only | Three rounds of one pick from four bag cards (Appendix A §A7) |
| Essence | Random Site and Exploration outcomes | 200–300 Essence |
| Dreamsign Reward | Exploration and Augury outcomes | One Dreamsign; Rosemary enhances it |
| Card Shop | Every dream's shop; Tobias's curiosities | Shandalar stock and prices, drawn from the bag, or from outside the tide set for curiosities (Appendix A §A4–A6) |
| Dreamsign Bazaar | Amunet's guide site | Rarity prices (Appendix A §A11) |
| Dreamsign Revelation | Sigrún's guide site | 1 of 3 (1 of 4 enhanced) |
| Transfiguration | Durgan's guide site | Existing offers and form prices |
| Duplication | Holt's guide site | Priced at the local buy quote |
| Purge | Not used | — |
| Augury | Aldric's guide site | Filtered archetypes (D5) |
| Random Site | Maddox's guide site | Conceals one enhanced site: Curiosities, Transfiguration, Duplication, Dreamsign Bazaar, Dreamsign Revelation, Augury, Gamble, Exploration, Essence or Draft |
| Gamble | Gravok's guide site | Unchanged games and payouts; Four-Suit Reprise respects the collection floor (below) |
| Exploration | Layaway's guide site | Filtered and adapted actions (D4) |

Every card a site grants comes from the bag, except Tobias's curiosities.

**Four-Suit Reprise.** All four suits keep their results: Clubs purges the
targeted card, Spades grants a free transfiguration, Diamonds pays 100 Essence
and Hearts duplicates the card. The Clubs purge is the game's risk. When the
collection is at the floor, Clubs is a free redraw instead.

## D4. Exploration

**Selection.** Exploration keeps its selection rule: shuffle the encounters by
run seed and site UUID, and take the first encounter whose two actions can
both be prepared. D97 marks an action unpreparable when its effect:

- offers a purge as a reward;
- grants or involves Nightmare;
- chooses or swaps the Avatar;
- refers to the journey's map with no adaptation below;
- would take the collection below the floor, or purges while Tortoise Shell is
  slotted.

Encounters with such an action are skipped, so the player never sees a
half-usable encounter. Curled Tail's reroll works as authored. The encounter's
full-art source card can be any catalog card; it is illustration, not supply.

**Purge as a cost.** Giving up an owned copy for a reward fits a collection
game, so these actions are kept. A purge removes the copy from the
collection; Strange Fruit pays Essence for each one.

| Effect kind | D97 behavior |
| --- | --- |
| `purge-for-essence` | Purge a chosen owned copy for 20 Essence per ✦ |
| `purge-and-copy` | Purge one chosen owned copy; copy another |
| `purge-duplicates-and-grant-reclaim` | Purge every extra copy of each card in the active deck; the active deck's remaining copies gain reclaim |
| `purge-random-subtype-and-increase-spark` | Purge random active-deck copies of the subtype; the deck's other copies of it gain +1✦ |
| `purge-one-transfigure-and-copy-others` | As authored, over four random active-deck copies |
| `purge-disclosed-and-transfigure-same-type` | As authored, over active-deck copies |
| `replace-selected`, `replace-selected-with-card`, `replace-random-with-card`, `replace-all-starter-cards` | The replaced copies leave the collection; replacements come from the bag |
| `purge-dreamsign-for-essence`, `purge-selected-dreamsign-and-gain-random` | Act on the Dreamsign collection |
| `replace-selected-dreamsign-with-offered`, `replace-all-dreamsigns-random` | Act on slotted Dreamsigns; replacements exclude owned and Legendary Dreamsigns |

**Other adapted actions:**

| Effect family | D97 behavior |
| --- | --- |
| Card grants (`draft-card`, `take-cards`, `choose-pack`, `transfigured-card-draft`, `gain-offered-card`, `copy-offered-deck-card`) | Card-choice offers (Appendix A §A7). New copies enter reserve |
| Deck-wide changes (increase-spark-all, make-fast-all and similar) | Apply to the copies in the active deck at that moment; the changes stay on those copies |
| Single-card changes (transfigure-selected and similar) | Choose among owned copies in the active deck |
| `transfigure-next-draft-or-shop` | Applies to the next card taken from a card-choice offer or bought at a shop |
| Next-battle modifiers (opening hand, starting energy) | Apply to the next battle |
| Essence (double-essence, lose-half-essence-and-free-purchases) | As authored; free purchases apply at the next shop |
| Dreamsign grants (gain-offered-dreamsign and similar) | Into the Dreamsign collection, excluding owned and Legendary Dreamsigns |
| Add a site (add-site, choose-site-type) | Places a one-use guide site in the current dream, priced at its band |

**Unpreparable** (encounters containing one are skipped):

- purge as a reward: `purge-selected`, `purge-starter-card`,
  `purge-random-starter-card`, `purge-random-starter-and-gain-card`;
- Nightmare: `reduce-cost-all-and-gain-nightmares`,
  `make-predicate-fast-and-gain-nightmares`, `gain-nightmare-and-dreamsign`,
  `gain-nightmare-and-offered-dreamsign`, `gain-nightmare-and-card`,
  `take-transfigured-cards-and-gain-nightmares`;
- `choose-avatar`.

## D5. Augury

Augury keeps its two-offers-from-different-families rule over D97-eligible
archetypes:

| Archetype | D97 |
| --- | --- |
| fit_card_grant, fit_card_draft, copies_draft, strong_card, card_bundle, transfigured_draft | Kept. Candidates come from the bag. Affinity uses the active deck; "already owned" uses the collection |
| category_draft_known | Kept for card-type and subtype categories. Tide-package categories are not offered, since D97 never names a tide |
| transfigure | Kept; targets an active-deck copy |
| duplicate | Kept; the copy is plain and free |
| dreamsign | Kept; excludes owned and Legendary Dreamsigns |
| add_site | Places a one-use Curiosities, Transfiguration or Duplication site in the current dream, priced at its band |
| purge | Not used |
| starter_transfigure | Not used |

## D6. Dreamsigns

**Collection and slots.** The player owns any number of Dreamsigns, at most one
copy of each, and slots up to five (Appendix B §B15). Only slotted Dreamsigns
take effect. Choices a Dreamsign asks for on gain (a type, an Event) are made
when it's acquired; its effects then apply while it is slotted. One-time "on
gain" effects fire when it is acquired, whatever its slot.

**Legendary Dreamsigns.** A curation pass promotes the ten strongest
Dreamsigns, drawn from the 30 Rares, to Legendary rarity in a D97 catalog
module. They come only from key prizes, and Dreamsign offers and opponent knob
draws exclude them; an incarnation's curated Dreamsign keeps its place.

**Scaling rule.** A journey effect that triggers "after each battle" was tuned
for a seven-battle run; a D97 campaign has over a hundred battles. In D97 such
effects trigger after each guardian, incarnation and Apollyon victory and each
finished key dream, about 22 times per campaign.

| Dreamsign | D97 treatment |
| --- | --- |
| Battle-only Dreamsigns | Unchanged |
| Clam Shell, Sea Urchin | +1 option in every card-choice offer (Sea Urchin while holding 300+ Essence) |
| Tortoise Shell | +1 option in card-choice offers; purge costs are unavailable while slotted |
| Mushroom Caps | −1 option in card-choice offers; battle effect unchanged |
| Star Anise | The first Event taken from each card-choice offer gains Amplified |
| Strange Fruit | +50 Essence for each copy purged as a cost |
| Banded Worm | +20% of current Essence on first entering each act and Limbo |
| Star Badge, Pearl Shell | Apply to Essence site outcomes and Essence chests |
| Carved Bone, Mortal Skull | Unchanged |
| Witch Coin | The first restock at each shop is free |
| Charm Staff | A card bought at a shop or curiosities, or a Dreamsign bought at the Bazaar, is replaced by a new roll |
| Cracked Orb | +2 slots at shops and curiosities |
| Purple Crystal, Red Shard | Apply to Bazaar purchases as authored |
| Cracked Mirror | The first purchase at each shop is duplicated |
| Spider, Red Cheese, Green Slime | Scaling rule |
| Spiral Shell | Duplication yields two copies |
| Rainbow Mushroom | Each dream first entered while it is slotted gains one enhanced Dream Guide appearance |
| Curled Tail, Rosemary, Leaf Ledger, Spell Tome, Glow Pouch | Unchanged |
| Brown Acorn, Glowing Crystal | Apply to every acquired copy |
| Blue Crystal | While the active deck has 30 or more cards, acquired copies gain a random transfiguration |
| Rainbow Jellyfish | On gain, every owned Starter copy becomes Perfected |
| White Rat | On gain, random transfigurations on half the active deck |
| Voodoo Doll | Copies another slotted Dreamsign |
| Theater Mask, Toad, Spotted Mug | Unchanged |
| Slug, Sickle, Scorpion, Paired Teeth | Excluded (purge as a reward) |
| Raven Skull, Twisted Herbs | Excluded (Nightmare) |

**Opponent Dreamsigns** come only from Dreamsigns with battle effects,
excluding Legendary Dreamsigns.

## D7. Avatars

- **Player.** All 32 Avatars are selectable, and all have authored abilities.
  The selection screen shows each Avatar's resonances as colored pills and
  never names its tides.
- **Characters.** In the campaign, each Avatar other than the player's starting
  Avatar appears at most once, as a guardian, a friendly quest giver or a
  challenger (Appendix B §B7). Key dreams may feature any Avatar.
- **Unlocks.** The Act 2 and Act 3 Avatar quests unlock two Avatars; key
  prizes unlock the rest (Appendix C §C8).
- **Tide sets.** Each Avatar has an authored tide set (Appendix A §A2). The 12
  Avatars without a signature tide use a fixed borrowed one.
- **Deck sources.** Generic characters build their decks from a deck-source
  Avatar's tide set, without its ability.

## D8. Transfigurations

All nine forms are unchanged. A transfiguration is a permanent per-copy
modification on an owned copy, at most one per copy.

**Sources:**

- the Transfiguration site;
- Gamble's Spades result;
- Augury and Exploration;
- Green Slime, Blue Crystal, Glowing Crystal, White Rat and other Dreamsigns;
- opponent decks at higher tiers (Appendix B §B9).

Transfigurations never change buy or sale prices (Appendix A §A4). Duplication
copies, won antes, guardian picks and key prizes are plain.

## D9. Content D97 does not use

- The journey's random tides4 deal and recurring Draft sites. Draft appears
  only as a Random Site outcome.
- The journey's layered atlas, dreamscape site lists, completion levels, the
  seven-battle structure and Firstlight Meadow.
- Purge sites and every purge offered as a reward; Nightmare and Bane effects;
  Exploration's choose-avatar action.
- The Dreamsigns excluded in D6.
- Tide names and descriptions on any player-facing surface, including Augury's
  tide-package categories.
- The Special card Contemplation as a supply card. It remains available as the
  token created by Seer of the Fallen.
