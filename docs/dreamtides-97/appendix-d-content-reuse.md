# Appendix D: Reusing Dreamtides content

D97 reuses the existing catalogs and algorithms: cards, the tides4 pool,
Avatars, Dreamsigns, transfigurations, the opponent deck builder, Apollyon and
the site encounters. This appendix gives every piece of reused content its D97
home, and lists what D97 adapts or leaves out. Content is always identified by
UUID; names here are for reading.

[Back to the design overview](README.md)

## D1. Summary

| Content | D97 home |
| --- | --- |
| tides4 pool algorithm | Deals the fixed campaign pool, the only source of supply (Q34) |
| Pool cards (about 101 per campaign) | Collection, shops, bundles, lairs, merchants, castle picks |
| Legendary cards (8) | Dungeon treasure only, from the whole catalog (Q39) |
| Starter cards (10) | Difficulty dilution of the starting collection and safety-net padding |
| Special and Tutorial cards | Not used |
| Opponent deck builder | Monster decks and the player's starting collection (Q42) |
| Avatars (32) | Player choice; realm rosters of monsters (Q44) |
| Tides | The pool's slices: signature core and facets (Q41) |
| Resonance | Cosmetic: realm names, art and amulet names |
| Rarity | Visible supply tier and economy costs |
| Transfigurations (9) | Town service, lair events, treasure, opponent knobs |
| Dreamsigns (153) | Battle and journey effects, filtered (D6) |
| Dream Guides (10) | Service hosts; one home city each (D2) |
| Apollyon incarnations (10) | Castle lords and the final battle (Appendix C) |
| Site types (14) | Settlement services, lair events, or not used (D3) |
| Battle rules | Unchanged (`docs/rules.md`) |

## D2. Dream Guides

Each guide belongs to one realm and has a **home city** named after their home
dreamscape. Guides are seated two per realm by the realm's cosmetic resonance,
following each guide's affiliation where it's clear:

| Guide | Home city | Realm (cosmetic) | Role in D97 | Enhanced at home |
| --- | --- | --- | --- | --- |
| Tobias Tanglefur | Tumbleleaf Village | Wild | Card shops | +1 slot; slot ceilings start at Uncommon |
| Aldric, the Seer | Wilderveil | Wild | Augury lair events | Augury as a service on cooldown |
| Amunet, the Tomb-Keeper | Pharaoh's Gate | Ember | Dreamsign Bazaars | Restock delay halved |
| Gravok | Farpoint Station | Ember | Gamble lair events | Gamble as a service on cooldown, at enhanced stakes |
| Sigrún | Winterwake Fjords | Vision | Dreamsign Revelation lair events | Revelation (1 of 4) as a service on cooldown |
| Durgan Forgehammer | Frostforge | Vision | Transfiguration services | Any owned copy, any eligible form |
| Deacon Holt | Hope's End | Valor | Duplication services | Any owned copy |
| Master Takeshi | Tsukiren | Valor | Bounties | Always offers a bounty paying an exact card from any slice of the pool |
| Maddox | The Rust Expanse | Shadow | Random Site lair events | Random Site (choose 1 of 3) as a service on cooldown |
| "Layaway" | Grid City | Shadow | Exploration lair events | Exploration as a service on cooldown |

Home-city services use the merchant cooldown, `18 × (d + 3)` clock units.
Guide dialogue keeps its existing authored lines. Affiliations remain flavor,
as in the journey mode, where affiliation weights are not applied.

## D3. Site types

| Site | D97 home | Adaptation |
| --- | --- | --- |
| Battle | Overworld monsters, sieges, liberation, dungeons, castles, final battle | Tier knobs replace completion levels (Appendix B §B7) |
| Draft | Not used | — |
| Essence | Lair event | 200–300 Essence |
| Dreamsign Reward | Lair event | One Dreamsign from the D97 pool; Rosemary enhances it |
| Card Shop | Every settlement | Shandalar stock and prices, drawn from the campaign pool (Appendix A §A4–A6) |
| Dreamsign Bazaar | Town and city service | Persistent stock, rarity prices (Appendix A §A11) |
| Dreamsign Revelation | Lair event; Sigrún's home | 1 of 3 (1 of 4 enhanced) |
| Transfiguration | Town and city service | Existing offers and form prices |
| Duplication | Town and city service | Priced at the local buy quote |
| Purge | Not used | — |
| Augury | Lair event; Aldric's home | Filtered archetypes (D5) |
| Random Site | Lair event; Maddox's home | Conceals one enhanced D97 site: Transfiguration, Duplication, Dreamsign Bazaar, Dreamsign Revelation, Augury, Gamble, Exploration or Essence |
| Gamble | Lair event; Gravok's home | Unchanged games and payouts, except Four-Suit Reprise (below) |
| Exploration | Lair event; Layaway's home | Filtered and adapted actions (D4) |

**Lair versions** of sites run their standard behavior once. **Service
versions** follow Appendix A §A11. Every card a site grants comes from the
campaign pool.

**Four-Suit Reprise.** Its Clubs result (purge the targeted card) is replaced
by a free redraw. Spades (free transfiguration), Diamonds (+100 Essence) and
Hearts (duplicate the card) are unchanged.

## D4. Exploration

**Selection.** Exploration keeps its selection rule: shuffle the encounters by
campaign seed and lair UUID, and take the first encounter whose two actions can
both be prepared. D97 marks an action unpreparable when its effect:

- removes, purges or destroys owned copies;
- grants or involves Nightmare;
- refers to drafting, the Dream Atlas or dreamscapes with no adaptation below.

Encounters with such an action are skipped, so the player never sees a
half-usable encounter. Curled Tail's reroll works as authored. The encounter's
full-art source card can be any catalog card; it is illustration, not supply.

**Adapted actions:**

| Effect family | D97 behavior |
| --- | --- |
| Card grants (draft-card pick 1 of 4, take-cards, choose-pack, transfigured-card-draft, copy-offered-deck-card) | New copies enter reserve. Offers draw from the campaign pool with the action's existing selection policy, respecting the copy allowance |
| Deck-wide changes (increase-spark-all, make-fast-all and similar) | Apply to the copies in the active deck at that moment; the changes stay on those copies |
| Single-card changes (transfigure-selected and similar) | Choose among owned copies in the active deck |
| Next-battle modifiers (opening hand, starting energy) | Apply to the next battle |
| Essence (double-essence, lose-half-essence-and-free-purchases) | As authored; free purchases apply at the next card shop |
| Dreamsigns (gain-offered-dreamsign, replace-all-dreamsigns-random) | As authored, from the D97 pool, with the cap's replacement flow |
| Add a site (add-site, choose-site-type) | Spawns a single-use lair holding that site within 6 tiles, priced as a town of the realm |
| Avatar choice (choose-avatar) | Swaps the Avatar; the campaign pool is unchanged |

**Unpreparable** (encounters containing one are skipped):

- purge-duplicates-and-grant-reclaim;
- purge-for-essence;
- purge-and-copy;
- reduce-cost-all-and-gain-nightmares;
- every other removal or Nightmare action.

## D5. Augury

Augury keeps its two-offers-from-different-families rule over D97-eligible
archetypes:

| Archetype | D97 |
| --- | --- |
| fit_card_grant, fit_card_draft, copies_draft, strong_card, category_draft_known, card_bundle, transfigured_draft | Kept. Candidates come from the campaign pool. Affinity uses the active deck; "already owned" uses the collection |
| transfigure | Kept; targets an active-deck copy |
| duplicate | Kept; the copy is plain and free |
| dreamsign | Kept |
| add_site | Spawns a single-use lair holding a Card Shop, Transfiguration or Duplication site, priced as a town of the realm |
| purge | Not used |
| starter_transfigure | Not used |

## D6. Dreamsigns

**The D97 pool** holds live, authored Dreamsigns whose effects have D97
meaning, plus the ten world magic Dreamsigns (Appendix A §A12). World magic is
sold only at its assigned settlements. Pending Dreamsigns join the pool when
authored. The 12-held cap and its replacement flow are unchanged, and a player
holds at most one copy of each Dreamsign.

**Scaling rule.** A journey effect that triggers "after each battle" was tuned
for a seven-battle run; a D97 campaign has about sixty battles. In D97 such
effects trigger after each castle victory and each completed dungeon expedition
instead, about 10–15 times per campaign.

| Dreamsign | Status | D97 treatment |
| --- | --- | --- |
| Battle-only Dreamsigns | live | Unchanged |
| Banded Worm | live | 20% of current Essence on first entering each realm |
| Star Badge, Pearl Shell | live | Apply to Essence lair events |
| Rosemary | live | Enhances Dreamsign Reward and Revelation lair events |
| Leaf Ledger | live | Two transfigurations per Transfiguration session |
| Spell Tome | live | Unchanged: transfiguring an Event adds a plain copy |
| Green Slime | live | Scaling rule: after each castle victory or completed expedition |
| Blue Crystal | live | Each copy bought at a card shop gains a random applicable transfiguration |
| Brown Acorn | live | Each acquired Warrior copy gains +1 spark |
| Curled Tail | live | Unchanged |
| Clam Shell, Sea Urchin | live | Excluded (draft) |
| Strange Fruit, Sickle, Slug | live | Excluded (purge) |
| Raven Skull | live | Excluded (Nightmare) |
| Rainbow Mushroom | live | Excluded (dreamscape sites) |
| Scorpion, Paired Teeth, Tortoise Shell, Mushroom Caps, Twisted Herbs, Witch Coin | pending | Excluded (purge, draft, Nightmare or paid restock) |
| Shop and Bazaar modifiers (Charm Staff, Cracked Mirror, Cracked Orb, Purple Crystal, Red Shard) | pending | Apply to card shop and Bazaar purchases when authored |
| Transfiguration modifiers (Glow Pouch, Glowing Crystal, White Rat, Rainbow Jellyfish, Star Anise) | pending | Apply to the Transfiguration service when authored |
| Red Cheese, Spider | pending | Scaling rule when authored |
| Spiral Shell | pending | Duplication yields 2 copies instead of 4 when authored |
| Carved Bone, Mortal Skull | pending | Unchanged when authored. Their Essence-per-kill income is a deliberate Dreamsign exception to battles paying no Essence |

**Opponent Dreamsigns** come only from live Dreamsigns with battle effects.

## D7. Avatars

- **Player.** All 32 Avatars are selectable, and the choice deals the campaign
  pool. The selection screen marks the nine without a live ability.
- **Monsters.** Every Avatar except the player's lives in realm rosters:
  - signatured Avatars live in the realms featuring their facets;
  - signatureless Avatars live in the home realm, borrowing the player's
    archetype, and top up thin rosters (Appendix B §B7).

  An Avatar can belong to several facet realms.
- **Avatar swaps.** Exploration's choose-Avatar actions (four encounters) swap
  the player's Avatar without changing the pool or the rosters.

## D8. Transfigurations

All nine forms are unchanged. A transfiguration is a permanent per-copy
modification on an owned copy, at most one per copy.

**Sources:**

- the Transfiguration service;
- Gamble's Spades result;
- Augury and Exploration;
- Green Slime and Blue Crystal;
- Perfected treasure (Appendix C §C2);
- opponent decks at higher tiers (Appendix B §B7).

Transfigurations never change buy or sale prices (Appendix A §A4), and
Duplication copies are plain.

## D9. Content D97 does not use

- Draft sites, draft offers and the draft engine's remaining-copies bag. The
  pool is dealt once and drawn from as an unlimited catalog (Q35).
- The Dream Atlas, dreamscape nodes, Firstlight Meadow and Limbo.
- Completion levels, the seven-battle structure and battle Essence rewards.
- Resonance as a mechanic. It is presentation only (Q34–Q36).
- Purge sites, card-removal outcomes, Nightmare and Bane effects (Q27).
- The Dreamsigns excluded in D6.
- The Special card Contemplation as a supply card. It remains available as the
  token created by Seer of the Fallen.
