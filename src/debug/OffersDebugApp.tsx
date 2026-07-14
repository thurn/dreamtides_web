import { useState, type ReactElement } from "react";
import { siteTypeIcon } from "../atlas/atlas-generator";
import {
  OfferTile,
  type OfferTileCard,
  type OfferTileDreamsign,
  type OfferTileModel,
} from "../cumulus/components/controls/OfferTile";
import { artRef, resolveArtRef } from "../cumulus/primitives/art";
import { glyph } from "../cumulus/primitives/glyph";
import { token } from "../cumulus/primitives/tokens";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import type { MerchantArchetypeId } from "../journey_v2/archetypes/types";
import { asCardId } from "../types/card-identity";

const CARDS: readonly OfferTileCard[] = [
  { cardId: asCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"), imageNumber: 287269511 },
  { cardId: asCardId("161482b6-af07-4d9e-822d-8c738672beb9"), imageNumber: 2022594419 },
  { cardId: asCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"), imageNumber: 618071684 },
  { cardId: asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"), imageNumber: 1196004046 },
  { cardId: asCardId("967c714f-40c5-4a77-8e22-40691a2755d4"), imageNumber: 2212744813 },
  { cardId: asCardId("3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1"), imageNumber: 2218612335 },
  { cardId: asCardId("25d00336-5ad7-433b-8ced-71720a9f074a"), imageNumber: 1480584617 },
  { cardId: asCardId("68978d92-aa8b-4873-bb0b-6e52f12b0849"), imageNumber: 1633431265 },
];

const DREAMSIGNS: readonly OfferTileDreamsign[] = [
  {
    id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
    art: artRef.dreamsign("acorn_gold.png"),
  },
  {
    id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
    art: artRef.dreamsign("aertfact.png"),
  },
  {
    id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
    art: artRef.dreamsign("amanita.png"),
  },
];

const card = (index: number): OfferTileCard => CARDS[index % CARDS.length];
const draft = (offset = 0): readonly OfferTileCard[] =>
  [card(offset), card(offset + 1), card(offset + 2), card(offset + 3)];

/** One representative, UUID-backed specimen for every canonical archetype. */
export const OFFER_TILE_DEBUG_MODELS: Readonly<
  Record<MerchantArchetypeId, OfferTileModel>
> = {
  fit_card_grant: {
    id: "debug:fit_card_grant",
    kind: "card-gift",
    label: "Card Gift",
    description: "Adds one card selected to complement the deck you have built.",
    card: card(0),
  },
  fit_card_draft: {
    id: "debug:fit_card_draft",
    kind: "card-draft",
    label: "Card Draft",
    description: "Lets you choose one of four cards selected to complement your deck.",
    cards: draft(0),
  },
  copies_draft: {
    id: "debug:copies_draft",
    kind: "copies-draft",
    label: "Copies Draft",
    description: "Lets you choose a card and adds multiple copies of that choice.",
    cards: draft(1),
  },
  strong_card: {
    id: "debug:strong_card",
    kind: "power-card",
    label: "Power Gift",
    description: "Adds one especially powerful card to your deck.",
    card: card(4),
  },
  category_draft_known: {
    id: "debug:category_draft_known",
    kind: "category-draft",
    label: "Category Draft",
    description: "Lets you choose one card from a deck-relevant category.",
    cards: draft(2),
  },
  card_bundle: {
    id: "debug:card_bundle",
    kind: "card-bundle",
    label: "Card Bundle",
    description: "Adds a small group of cards that belong together.",
    cards: [card(1), card(4), card(7)],
  },
  transfigured_draft: {
    id: "debug:transfigured_draft",
    kind: "transfigured-draft",
    label: "Transfigured Draft",
    description: "Lets you choose one card that arrives in a transfigured form.",
    cards: draft(4),
  },
  transfigure: {
    id: "debug:transfigure",
    kind: "transfigure-card",
    label: "Transfigure Card",
    description: "Changes one card in your deck into a stronger form.",
    card: card(5),
  },
  starter_transfigure: {
    id: "debug:starter_transfigure",
    kind: "transfigure-starters",
    label: "Refine Starters",
    description: "Transfigures several starter cards already in your deck.",
    cards: [card(0), card(2), card(4)],
  },
  keyword_mod: {
    id: "debug:keyword_mod",
    kind: "keyword-modification",
    label: "Keyword Gift",
    description: "Adds a new keyword ability to one card in your deck.",
    card: card(6),
  },
  tribal_change: {
    id: "debug:tribal_change",
    kind: "tribal-change",
    label: "Kindred Change",
    description: "Changes how one card belongs to a character type.",
    card: card(7),
  },
  purge: {
    id: "debug:purge",
    kind: "purge-card",
    label: "Purge Card",
    description: "Removes one card from your deck.",
    card: card(3),
  },
  purge_replace: {
    id: "debug:purge_replace",
    kind: "trade-card",
    label: "Trade Card",
    description: "Removes one card and replaces it with a new card.",
    outgoing: card(3),
    incoming: card(0),
  },
  duplicate: {
    id: "debug:duplicate",
    kind: "duplicate-card",
    label: "Duplicate Card",
    description: "Adds another copy of one card already in your deck.",
    card: card(2),
  },
  dreamsign: {
    id: "debug:dreamsign",
    kind: "dreamsign-gift",
    label: "Dreamsign Gift",
    description: "Adds one dreamsign to your collection.",
    dreamsign: DREAMSIGNS[0],
  },
  dreamsign_draft: {
    id: "debug:dreamsign_draft",
    kind: "dreamsign-draft",
    label: "Dreamsign Draft",
    description: "Lets you choose one dreamsign from a small group of visions.",
    dreamsigns: DREAMSIGNS,
  },
  add_site: {
    id: "debug:add_site",
    kind: "add-site",
    label: "Add Site",
    description: "Adds another site to a future dreamscape.",
    site: {
      id: "Duplication",
      glyph: glyph(siteTypeIcon("Duplication")),
    },
  },
};

export default function OffersDebugApp(): ReactElement {
  const [lastPressed, setLastPressed] = useState<string | null>(null);
  const models = MERCHANT_ARCHETYPE_BUILDERS.map(
    (builder) => OFFER_TILE_DEBUG_MODELS[builder.archetypeId],
  );
  const selected =
    lastPressed === null
      ? null
      : models.find((model) => model.id === lastPressed) ?? null;
  return (
    <div
      className="cumulus"
      data-testid="offers-debug-page"
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background: token("--bg-app"),
        color: token("--text-primary"),
        fontFamily: token("--font-ui"),
      }}
    >
      <img
        src={resolveArtRef(artRef.dreamscapeScene("wilderveil"))}
        alt=""
        draggable={false}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          userSelect: "none",
        }}
      />
      <main
        style={{
          position: "relative",
          width: "min(1320px, 100%)",
          minHeight: "100vh",
          margin: "0 auto",
          padding: `${token("--space-9")} ${token("--space-8")} ${token("--space-10")}`,
          boxSizing: "border-box",
        }}
      >
        <header
          style={{
            display: "grid",
            justifyItems: "center",
            gap: token("--space-2"),
            marginBottom: token("--space-9"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
          }}
        >
          <p
            style={{
              margin: 0,
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
            }}
          >
            Dream Augury Debug
          </p>
          <h1 style={{ margin: 0, font: token("--t-display") }}>Offer Tiles</h1>
          <p style={{ margin: 0, font: token("--t-body-sm") }}>
            {models.length} category specimens · hover a tile for its category
          </p>
          <p aria-live="polite" style={{ margin: 0, minHeight: 20, font: token("--t-caption") }}>
            {selected === null ? "" : `Pressed ${selected.label}`}
          </p>
        </header>

        <section
          aria-label="Dream Augury offer categories"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(176px, 1fr))",
            alignItems: "start",
            gap: token("--space-8"),
          }}
        >
          {MERCHANT_ARCHETYPE_BUILDERS.map((builder) => {
            const model = OFFER_TILE_DEBUG_MODELS[builder.archetypeId];
            return (
              <figure
                key={builder.archetypeId}
                data-offer-category={builder.archetypeId}
                style={{
                  display: "grid",
                  justifyItems: "center",
                  gap: token("--space-4"),
                  margin: 0,
                }}
              >
                <OfferTile model={model} onPress={setLastPressed} />
                <figcaption
                  style={{
                    font: token("--t-caption"),
                    color: token("--text-on-glass"),
                    textAlign: "center",
                    textShadow: token("--text-outline-media"),
                  }}
                >
                  {model.label}
                </figcaption>
              </figure>
            );
          })}
        </section>
      </main>
    </div>
  );
}
