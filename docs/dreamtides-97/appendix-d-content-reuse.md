# Appendix D: Reusing Dreamtides content

D97 reuses the existing catalogs and algorithms: cards, tides and the tides4
pool, Avatars, Dreamsigns, transfigurations, the opponent deck builder,
Apollyon and the site encounters. This appendix gives every piece of reused
content its D97 home, and lists what D97 adapts or leaves out. Content is
always identified by UUID; names here are for reading.

[Back to the design overview](README.md)

## D1. Summary

| Content | D97 home |
| --- | --- |
| tides4 pool algorithm | Deals the reward pool for the current Avatar, and every opponent's pool |
| Supply cards (509) | The reward pool, opponent stakes, guardian picks, resonance cores and the Legendary dream |
| Legendary cards (8) | Legendary dream stakes only |
| Starter cards (10) | Starting-collection dilution and safety-net padding |
| Special and Tutorial cards | Not used |
| Opponent deck builder | Every opponent's deck, and the player's starting collection |
| Avatars (32) | Player choice; Avatar characters as guardians, friendly quest givers and challengers; deck sources for generic characters |
| Tides | The reward pool's structure; the affinity space for decks and picks |
| Resonance | Tide labels on the Avatar select screen; the five amulets and resonance cores |
| Rarity | Visible supply tier and economy costs |
| Transfigurations (9) | The Transfiguration site, other site outcomes, opponent knobs |
| Dreamsigns (153) | Battle and journey effects, filtered (D6) |
| Dream Guides (10) | Wandering site hosts with home tilesets (D2) |
| Dreamscapes (10) | Tilesets: the guides' home tilesets |
| Apollyon incarnations (10) | Five guardians and five Limbo challengers per run (Appendix C) |
| Site types (14) | Guide sites, traders, or not used (D3) |
| Battle rules | Unchanged (`docs/rules.md`) |

## D2. Dream Guides

Each guide wanders between dreams, keeps their authored dialogue, and has a
home tileset named for their home dreamscape (Appendix B §B11).

| Guide | Home tileset | Site in D97 | Enhanced |
| --- | --- | --- | --- |
| Tobias Tanglefur | Tumbleleaf Village | Card Shop | +1 slot; slot ceilings start at Uncommon |
| Amunet, the Tomb-Keeper | Pharaoh's Gate | Dreamsign Bazaar | 4 Dreamsigns |
| Sigrún | Winterwake Fjords | Dreamsign Revelation (1 of 3) | 1 of 4 |
| Durgan Forgehammer | Frostforge | Transfiguration | Any owned copy, any eligible form |
| Deacon Holt | Hope's End | Duplication | Any owned copy |
| Master Takeshi | Tsukiren | Handicap trial quest (Appendix B §B13) | The trial pays an exact pick from 5 eligible pool cards instead of 3 |
| Aldric, the Seer | Wilderveil | Augury | Bigger rewards curated to the deck |
| Maddox | The Rust Expanse | Random Site | Choose one of three distinct enhanced sites |
| Gravok | Farpoint Station | Gamble | No initial fee, bigger payouts |
| "Layaway" | Grid City | Exploration | Enhanced Exploration |

Affiliations remain flavor: affiliation weights are not applied.

## D3. Site types

| Site | D97 home | Adaptation |
| --- | --- | --- |
| Battle | Challengers, guardians, keepers, prize duelists, Limbo | Tiers replace completion levels (Appendix B §B7) |
| Draft | Not used | — |
| Essence | Random Site and Exploration outcomes | 200–300 Essence |
| Dreamsign Reward | Exploration and Augury outcomes | One Dreamsign from the D97 pool; Rosemary enhances it |
| Card Shop | Traders everywhere; Tobias's guide site | Shandalar stock and prices, drawn from the reward pool (Appendix A §A4–A6) |
| Dreamsign Bazaar | Amunet's guide site | Rarity prices (Appendix A §A11) |
| Dreamsign Revelation | Sigrún's guide site | 1 of 3 (1 of 4 enhanced) |
| Transfiguration | Durgan's guide site | Existing offers and form prices |
| Duplication | Holt's guide site | Priced at the local buy quote |
| Purge | Not used | — |
| Augury | Aldric's guide site | Filtered archetypes (D5) |
| Random Site | Maddox's guide site | Conceals one enhanced site of another guide: Card Shop, Transfiguration, Duplication, Dreamsign Bazaar, Dreamsign Revelation, Augury, Gamble, Exploration or Essence |
| Gamble | Gravok's guide site | Unchanged games and payouts, except Four-Suit Reprise (below) |
| Exploration | Layaway's guide site | Filtered and adapted actions (D4) |

Every card a site grants comes from the reward pool.

**Four-Suit Reprise.** Its Clubs result (purge the targeted card) is replaced
by a free redraw. Spades (free transfiguration), Diamonds (+100 Essence) and
Hearts (duplicate the card) are unchanged.

## D4. Exploration

**Selection.** Exploration keeps its selection rule: shuffle the encounters by
run seed and site UUID, and take the first encounter whose two actions can
both be prepared. D97 marks an action unpreparable when its effect:

- removes, purges or destroys owned copies;
- grants or involves Nightmare;
- chooses or swaps the Avatar;
- refers to drafting or the journey's map with no adaptation below.

Encounters with such an action are skipped, so the player never sees a
half-usable encounter. Curled Tail's reroll works as authored. The encounter's
full-art source card can be any catalog card; it is illustration, not supply.

**Adapted actions:**

| Effect family | D97 behavior |
| --- | --- |
| Card grants (draft-card pick 1 of 4, take-cards, choose-pack, transfigured-card-draft, copy-offered-deck-card) | New copies enter reserve. Offers draw from the reward pool with the action's existing selection policy, respecting the copy allowance |
| Deck-wide changes (increase-spark-all, make-fast-all and similar) | Apply to the copies in the active deck at that moment; the changes stay on those copies |
| Single-card changes (transfigure-selected and similar) | Choose among owned copies in the active deck |
| Next-battle modifiers (opening hand, starting energy) | Apply to the next battle |
| Essence (double-essence, lose-half-essence-and-free-purchases) | As authored; free purchases apply at the next trader |
| Dreamsigns (gain-offered-dreamsign, replace-all-dreamsigns-random) | As authored, from the D97 pool, with the cap's replacement flow |
| Add a site (add-site, choose-site-type) | Places a one-use guide site in the current dream, priced at its band |

**Unpreparable** (encounters containing one are skipped):

- purge-duplicates-and-grant-reclaim;
- purge-for-essence;
- purge-and-copy;
- reduce-cost-all-and-gain-nightmares;
- choose-avatar;
- every other removal or Nightmare action.

## D5. Augury

Augury keeps its two-offers-from-different-families rule over D97-eligible
archetypes:

| Archetype | D97 |
| --- | --- |
| fit_card_grant, fit_card_draft, copies_draft, strong_card, category_draft_known, card_bundle, transfigured_draft | Kept. Candidates come from the reward pool. Affinity uses the active deck; "already owned" uses the collection |
| transfigure | Kept; targets an active-deck copy |
| duplicate | Kept; the copy is plain and free |
| dreamsign | Kept |
| add_site | Places a one-use Card Shop, Transfiguration or Duplication site in the current dream, priced at its band |
| purge | Not used |
| starter_transfigure | Not used |

## D6. Dreamsigns

**The D97 pool** holds live, authored Dreamsigns whose effects have D97
meaning. Pending Dreamsigns join it when authored. The 12-held cap and its
replacement flow are unchanged, and a player holds at most one copy of each
Dreamsign.

**Scaling rule.** A journey effect that triggers "after each battle" was tuned
for a seven-battle run; a D97 run has about sixty battles. In D97 such effects
trigger after each guardian victory instead, about 8–10 times per run.

| Dreamsign | Status | D97 treatment |
| --- | --- | --- |
| Battle-only Dreamsigns | live | Unchanged |
| Banded Worm | live | 20% of current Essence on first entering each incarnation dream |
| Star Badge, Pearl Shell | live | Apply to Essence site outcomes and Essence chests |
| Rosemary | live | Enhances Dreamsign Reward outcomes and Revelation sites |
| Leaf Ledger | live | Two transfigurations per Transfiguration site |
| Spell Tome | live | Unchanged: transfiguring an Event adds a plain copy |
| Green Slime | live | Scaling rule: after each guardian victory |
| Blue Crystal | live | Each copy bought from a trader gains a random applicable transfiguration |
| Brown Acorn | live | Each acquired Warrior copy gains +1 spark |
| Curled Tail | live | Unchanged |
| Clam Shell, Sea Urchin | live | Excluded (draft) |
| Strange Fruit, Sickle, Slug | live | Excluded (purge) |
| Raven Skull | live | Excluded (Nightmare) |
| Rainbow Mushroom | live | Excluded (dreamscape sites) |
| Scorpion, Paired Teeth, Tortoise Shell, Mushroom Caps, Twisted Herbs, Witch Coin | pending | Excluded (purge, draft, Nightmare or paid restock) |
| Shop and Bazaar modifiers (Charm Staff, Cracked Mirror, Cracked Orb, Purple Crystal, Red Shard) | pending | Apply to trader, Card Shop and Bazaar purchases when authored |
| Transfiguration modifiers (Glow Pouch, Glowing Crystal, White Rat, Rainbow Jellyfish, Star Anise) | pending | Apply to the Transfiguration site when authored |
| Red Cheese, Spider | pending | Scaling rule when authored |
| Spiral Shell | pending | Duplication yields 2 copies instead of 4 when authored |
| Carved Bone, Mortal Skull | pending | Unchanged when authored; their Essence per kill adds to purses |

**Opponent Dreamsigns** come only from live Dreamsigns with battle effects.

## D7. Avatars

- **Player.** All 32 Avatars are selectable, and the choice deals the reward
  pool. The selection screen shows each Avatar's tides as resonance-colored
  pills, as in the journey, and marks the nine without a live ability.
- **Characters.** Each Avatar other than the player's starting Avatar appears
  at most once per run, as a guardian, a friendly quest giver or a challenger
  (Appendix B §B6).
- **Unlocks.** Completing a friendly Avatar character's quest adds it to the
  roster (Appendix B §B14). Switching re-deals the reward pool.
- **Deck sources.** Generic characters and Legendary keepers build their decks
  from a deck-source Avatar's pool, without its ability.

## D8. Transfigurations

All nine forms are unchanged. A transfiguration is a permanent per-copy
modification on an owned copy, at most one per copy.

**Sources:**

- the Transfiguration site;
- Gamble's Spades result;
- Augury and Exploration;
- Green Slime and Blue Crystal;
- opponent decks at higher tiers (Appendix B §B7).

Transfigurations never change buy or sale prices (Appendix A §A4). Duplication
copies, won stakes and guardian picks are plain.

## D9. Content D97 does not use

- Draft sites, draft offers and the draft engine's remaining-copies bag. The
  reward pool is drawn from as an unlimited catalog.
- The journey's layered atlas, dreamscape site lists, completion levels, the
  seven-battle structure and Firstlight Meadow.
- Purge sites, card-removal outcomes, Nightmare and Bane effects.
- The Dreamsigns excluded in D6.
- The Special card Contemplation as a supply card. It remains available as the
  token created by Seer of the Fallen.
