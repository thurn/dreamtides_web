# Dream Journey Screen — Design Mockup Brief

A starting brief for redesigning the **Dream Journey** screen. It covers what
the screen does, the full inventory of offers it can present, and an index of
rendered game-object assets captured for use in mockups.

Assets live in [`dream_journey_mockup/assets/`](./dream_journey_mockup/assets/).

---

## 1. What the screen does

The Dream Journey is a **merchant encounter**: a between-battles site on the
Dream Atlas where the player is shown a small set of run-shaping offers and
picks one (or walks away). It is the main "deck-shaping" surface of a run —
where the player adds cards, upgrades cards, thins the deck, gains dreamsigns,
or reshapes the map.

**Where it sits in the flow.** A quest is a sequence of **dreamscapes**. Each
dreamscape is a list of **sites** the player visits in any order (Draft,
Dreamsign, Purge, Battle, etc.); clearing the required sites unlocks the
dreamscape's Battle and advances the run. `DreamJourney` is one such site type.
The player taps it from the dreamscape list (`screen-dreamscape.png`) and lands
on the merchant screen (`screen-dream-journey.png`).

**The current layout (the thing being redesigned).** Three columns:

- **Offer A** (left) — a single offer with its title, a one-line description,
  the relevant game object(s) (a card, a dreamsign tile, a transfigure target,
  etc.), and a primary action button (`Take` / `Choose` / `Draft`).
- **Dream Merchant** (center) — a portrait/image slot, a flavor line, and a
  `Walk away` button that declines both offers and leaves the site.
- **Offer B** (right) — a second offer, always drawn from a **different offer
  family** than Offer A, so the two choices are mechanically distinct.

A persistent HUD at the bottom shows the run currencies — **Essence**,
**Omens**, **Cards** (deck size) — plus the active Dreamcaller and a
View Deck / Glossary affordance.

**Generation model.** The encounter is **precommitted**: the two offers are
sampled and frozen when the dreamscape becomes available, so the choice is
deterministic and reproducible rather than rerolled on open. Offers are
scored against the player's current deck (fit, quality, leave-one-out misfit,
dreamsign-match signals) so what's shown is relevant to the deck in hand.

**Key files**

| Concern | Path |
|---|---|
| Screen UI | `src/journey_v2/ui/DreamMerchantScreen.tsx` |
| Encounter generation | `src/journey_v2/encounter/generateMerchantEncounter.ts` |
| Context from quest state | `src/journey_v2/context/buildMerchantContext.ts` |
| Archetype registry | `src/journey_v2/archetypes/registry.ts` |
| Offer/family types | `src/journey_v2/archetypes/types.ts` |
| Site type + routing | `src/types/quest.ts`, `src/components/ScreenRouter.tsx` |

---

## 2. Offer inventory

Offers are built from **17 archetypes** grouped into **6 families**. An
encounter shows two offers; Offer B is always from a different family than
Offer A. Source: `src/journey_v2/archetypes/types.ts` (`MerchantArchetypeId`,
`MerchantOfferFamily`, `ARCHETYPE_FAMILY`).

### Family: GRANT — add new cards to the deck
| Archetype | What the player gets |
|---|---|
| `fit_card_grant` | A single gifted card chosen to fit the current deck (no choice). |
| `fit_card_draft` | Pick 1 of ~4 deck-fitting cards to add. |
| `copies_draft` | Pick 1 of ~4 **extra copies** of cards already owned. |
| `strong_card` | A single gifted high-quality card (strong in general, not fit-based). |
| `category_draft_known` | Pick 1 of ~4 cards from a named category (cheap cards, a subtype, etc.). |
| `card_bundle` | A themed/synergistic "package" — pick several from a larger pack. |
| `transfigured_draft` | Pick 1 of ~4 cards that arrive with a transfiguration already applied. |

### Family: IMPROVE — upgrade a card already in the deck
| Archetype | What the player gets |
|---|---|
| `transfigure` | Apply a colored transfiguration to one eligible deck card. |
| `starter_transfigure` | Same, targeted at weak starting cards. |
| `keyword_mod` | Add a keyword/ability (e.g. Reclaim, Fast) to a chosen card. |
| `tribal_change` | Change a card's type or subtype to unlock synergies. |

### Family: REMOVE — thin or swap cards
| Archetype | What the player gets |
|---|---|
| `purge` | Permanently remove a weak/starter card from the deck. |
| `purge_replace` | Remove one card and add a replacement in the same action. |

### Family: DUPLICATE
| Archetype | What the player gets |
|---|---|
| `duplicate` | Add a second copy of one of the deck's strongest cards. |

### Family: DREAMSIGN — passive run modifiers
| Archetype | What the player gets |
|---|---|
| `dreamsign` | Gain a single dreamsign suited to the deck. |
| `dreamsign_draft` | Pick 1 of several suited dreamsigns. |

### Family: SITE — reshape the map
| Archetype | What the player gets |
|---|---|
| `add_site` | Add a new reward site (Shop, Essence, Purge, Transfiguration, Duplication, Dreamsign, Reward, …) to the current dreamscape. |

### Game objects an offer can surface
Across these archetypes, the screen needs to render: **cards** (printed and
transfigured), **dreamsign tiles**, **transfigure-target cards** (before/after),
**keyword/type badges**, **dreamsigns**, **site tiles/icons**, and the run
**currencies** (Essence, Omens, Cards).

---

## 3. Asset index

Captured at 3× device-scale from the live app. Use these as reference fills in
the mockup. Cards render at a 2:3 portrait aspect ratio; dreamsign tiles are
square; Dreamcaller cards are a tall framed portrait.

| File | Object | Notes |
|---|---|---|
| `card-01.png` … `card-06.png` | Cards | Mix of Event and Character cards, varied art. |
| `dreamsign-01.png` … `dreamsign-04.png` | Dreamsign tiles | Square art tile + name + effect line. |
| `transfigured-01.png`, `transfigured-02.png` | Transfigured cards | Note the transfiguration gem in the name bar and highlighted stat/text. |
| `transfig-pair-printed.png` / `transfig-pair-transfigured.png` | Before/after | Same card printed vs. transfigured. |
| `dreamcaller-01.png` … `dreamcaller-03.png` | Dreamcaller cards | Framed portrait + ability + Starting Essence. |
| `screen-dream-journey.png` | **Current screen** | The layout being redesigned (Offer A / Merchant / Offer B + HUD). |
| `screen-dreamscape.png` | Context | Site list with the Dream Journey entry + bottom HUD currencies. |
| `screen-dreamcaller-select.png` | Context | Dreamcaller selection, full framed-portrait treatment. |

### Where the source art lives
| Object | Component | Image dir | Format |
|---|---|---|---|
| Card | `src/components/CardView.tsx` | `public/cards/` | `.webp` (keyed by image number) |
| Dreamsign | `src/components/DreamsignArtTile.tsx` | `public/dreamsigns/` | `.png` (keyed by filename) |
| Dreamcaller | `src/components/DreamcallerPortrait.tsx` | `public/dreamcallers/` | `.png` (keyed by image number) |
| Card frame chrome | `src/components/CardStatOrb.tsx` | `public/card-frame/` | `.png` |

### Recreating / capturing more assets
Run a QA Vite server on a non-default port and screenshot the standalone
component routes at a high device-scale:

```bash
npm run dev -- --port 5174
agent-browser set viewport 1400 1000 3      # 3x retina capture
agent-browser open http://localhost:5174/editor                 # all cards
agent-browser open http://localhost:5174/dreamsigns             # all dreamsigns
agent-browser open "http://localhost:5174/?demo=transfiguration" # printed vs transfigured pairs
```

Screenshot an individual object by tagging its element and clipping to it
(`el.id='shot'; agent-browser screenshot "#shot" out.png`). The live React
element must stay un-mutated — clone/scale tricks drop the JS-measured chrome
(stat numbers, rules box), so raise device-scale instead of CSS-zooming.
