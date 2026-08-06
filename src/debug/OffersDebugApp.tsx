import { useEffect, useState, type ReactElement } from "react";
import { loadCardDatabase } from "../data/card-database";
import { loadAtlasData, siteTypeIcon } from "../data/atlas-data";
import {
  OfferTile,
  type OfferTileCard,
  type OfferTileDreamsignChoices,
  type OfferTileFourCards,
  type OfferTileModel,
} from "../cumulus/components/controls/OfferTile";
import { offerTileDescription } from "../cumulus/components/controls/offer-tile-descriptions";
import { artRef, resolveArtRef } from "../cumulus/primitives/art";
import { glyph } from "../cumulus/primitives/glyph";
import { token } from "../cumulus/primitives/tokens";
import { useIsDesktop } from "../cumulus/screens/use-is-desktop";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import type { MerchantArchetypeId } from "../journey_v2/archetypes/types";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { AtlasData } from "../types/atlas-data";

const fixtureCard = (cardId: string, imageNumber: number): OfferTileCard => {
  const id = asCardId(cardId);
  return {
    cardId: id,
    displaySnapshot: {
      id,
      name: asCardName("Loading Card"),
      cardNumber: imageNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: null,
      spark: null,
      isFast: false,
      renderedText: "",
      imageNumber,
      artOwned: true,
    },
  };
};

const GENERAL_DRAFT_A: OfferTileFourCards = [
  fixtureCard("7be2e6d7-abff-4c44-a0c3-35460da1693c", 287269511),
  fixtureCard("161482b6-af07-4d9e-822d-8c738672beb9", 2022594419),
  fixtureCard("b56ef7e8-c634-4d40-ac08-fab591dfbc4a", 618071684),
  fixtureCard("9b9c2743-75b3-499d-b5fb-c3429c92d420", 1196004046),
];

const GENERAL_DRAFT_B: OfferTileFourCards = [
  fixtureCard("967c714f-40c5-4a77-8e22-40691a2755d4", 2212744813),
  fixtureCard("3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1", 2218612335),
  fixtureCard("25d00336-5ad7-433b-8ced-71720a9f074a", 1480584617),
  fixtureCard("68978d92-aa8b-4873-bb0-6e52f12b0849", 1633431265),
];

// Four actual Spirit Animal cards form a realistic subtype draft and bundle.
const CATEGORY_DRAFT: OfferTileFourCards = [
  fixtureCard("9b9c2743-75b3-499d-b5fb-c3429c92d420", 1196004046),
  fixtureCard("401bb341-8385-41e9-8f6f-7b48e9ce174d", 2278837667),
  fixtureCard("eae928f6-aab2-415e-b4b1-b9c3ed8e6818", 447372529),
  fixtureCard("c8579b20-95ff-4b1d-b4c6-6bd049fc4760", 2127752129),
];

// This Event has Reclaim 2 and is therefore a real keyword_mod target.
const KEYWORD_TARGET = fixtureCard(
  "2931e20b-1a80-4ddd-8944-20e68d182886",
  776481901,
);

const PURGE_TARGET = fixtureCard(
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
  2654359867,
);

const STARTER_TARGETS = [
  fixtureCard("5a980eff-6ec7-44d8-9977-b98e66bbc2c8", 507269458),
  fixtureCard("647f5150-b2e0-424b-9480-27557642524e", 1016596168),
] as const;

const DREAMSIGNS: OfferTileDreamsignChoices = [
  {
    id: "1A524712-EF7E-43D9-BD79-5DEA5250BF08",
    name: "Rainbow Horn",
    art: artRef.dreamsign("horn_rainbow .png"),
  },
  {
    id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
    name: "Pyramid Relic",
    art: artRef.dreamsign("aertfact.png"),
  },
  {
    id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
    name: "Amanita",
    art: artRef.dreamsign("amanita.png"),
  },
  {
    id: "49990864-1DB0-4C08-91AE-40A1F04223E4",
    name: "Algae",
    art: artRef.dreamsign("algae.png"),
  },
];

/** One maximal, production-shaped UUID-backed specimen per canonical archetype. */
export function buildOfferTileDebugModels(atlasData: AtlasData): Readonly<
  Record<MerchantArchetypeId, OfferTileModel>
> {
  return {
  fit_card_grant: {
    id: "debug:fit_card_grant",
    kind: "card-gift",
    card: GENERAL_DRAFT_A[0],
  },
  fit_card_draft: {
    id: "debug:fit_card_draft",
    kind: "card-draft",
    cards: GENERAL_DRAFT_A,
  },
  copies_draft: {
    id: "debug:copies_draft",
    kind: "copies-draft",
    copyCount: 2,
    cards: GENERAL_DRAFT_B,
  },
  strong_card: {
    id: "debug:strong_card",
    kind: "card-gift",
    card: GENERAL_DRAFT_B[0],
  },
  category_draft_known: {
    id: "debug:category_draft_known",
    kind: "category-draft",
    categoryName: "spirit animal",
    cards: CATEGORY_DRAFT,
  },
  card_bundle: {
    id: "debug:card_bundle",
    kind: "card-bundle",
    cards: [CATEGORY_DRAFT[0], CATEGORY_DRAFT[1], CATEGORY_DRAFT[2]],
  },
  transfigured_draft: {
    id: "debug:transfigured_draft",
    kind: "transfigured-draft",
    cards: GENERAL_DRAFT_B,
  },
  transfigure: {
    id: "debug:transfigure",
    kind: "transfigure-card",
    card: GENERAL_DRAFT_B[1],
    transfiguration: "Empowered",
  },
  starter_transfigure: {
    id: "debug:starter_transfigure",
    kind: "transfigure-starters",
    cards: STARTER_TARGETS,
  },
  keyword_mod: {
    id: "debug:keyword_mod",
    kind: "keyword-modification",
    card: KEYWORD_TARGET,
    reclaimReduction: 1,
  },
  tribal_change: {
    id: "debug:tribal_change",
    kind: "tribal-change",
    card: GENERAL_DRAFT_A[0],
    newCharacterSubtype: "Warrior",
  },
  purge: {
    id: "debug:purge",
    kind: "purge-card",
    card: PURGE_TARGET,
  },
  purge_replace: {
    id: "debug:purge_replace",
    kind: "trade-card",
    outgoing: GENERAL_DRAFT_A[3],
    incoming: GENERAL_DRAFT_B,
  },
  duplicate: {
    id: "debug:duplicate",
    kind: "duplicate-card",
    cards: [GENERAL_DRAFT_A[0], GENERAL_DRAFT_A[1], GENERAL_DRAFT_A[3]],
  },
  dreamsign: {
    id: "debug:dreamsign",
    kind: "dreamsign-gift",
    dreamsign: DREAMSIGNS[0],
  },
  dreamsign_draft: {
    id: "debug:dreamsign_draft",
    kind: "dreamsign-draft",
    dreamsigns: DREAMSIGNS,
  },
  add_site: {
    id: "debug:add_site",
    kind: "add-site",
    site: {
      id: "Duplication",
      name: "Duplication",
      glyph: glyph(siteTypeIcon(atlasData, "Duplication")),
    },
  },
  };
}

/** Debug-only explanation of the maximal live offer shape each tile represents. */
export const OFFER_TILE_DEBUG_NOTES: Readonly<
  Record<MerchantArchetypeId, string>
> = {
  fit_card_grant: "1 preselected card",
  fit_card_draft: "4 choices · all shown",
  copies_draft: "4 choices · all shown",
  strong_card: "1 preselected card",
  category_draft_known: "4 same-category choices",
  card_bundle: "3 preselected cards",
  transfigured_draft: "4 choices · all shown",
  transfigure: "1 preselected card",
  starter_transfigure: "2 preselected starters",
  keyword_mod: "1 preselected eligible card",
  tribal_change: "1 preselected eligible card",
  purge: "1 preselected card",
  purge_replace: "1 purge target · 4 choices",
  duplicate: "3 choices · all shown",
  dreamsign: "1 preselected dreamsign",
  dreamsign_draft: "4 choices · all shown",
  add_site: "1 preselected site",
};

/** One representative archetype for each distinct player-facing tile shape. */
export const OFFER_TILE_DEBUG_ARCHETYPE_IDS = MERCHANT_ARCHETYPE_BUILDERS.map(
  (builder) => builder.archetypeId,
).filter((archetypeId) => archetypeId !== "strong_card");

function hydrateCard(
  card: OfferTileCard,
  cardsById: ReadonlyMap<string, CardData>,
): OfferTileCard {
  const displaySnapshot = cardsById.get(card.cardId);
  return displaySnapshot === undefined
    ? card
    : { ...card, displaySnapshot };
}

function hydrateCards<T extends readonly OfferTileCard[]>(
  cards: T,
  cardsById: ReadonlyMap<string, CardData>,
): T {
  return cards.map((card) => hydrateCard(card, cardsById)) as unknown as T;
}

function hydrateOfferCards(
  model: OfferTileModel,
  cardsById: ReadonlyMap<string, CardData> | null,
): OfferTileModel {
  if (cardsById === null) {
    return model;
  }
  switch (model.kind) {
    case "card-gift":
      return { ...model, card: hydrateCard(model.card, cardsById) };
    case "card-draft":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "category-draft":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "transfigured-draft":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "copies-draft":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "card-bundle":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "transfigure-starters":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "duplicate-card":
      return { ...model, cards: hydrateCards(model.cards, cardsById) };
    case "trade-card":
      return {
        ...model,
        outgoing: hydrateCard(model.outgoing, cardsById),
        incoming: hydrateCards(model.incoming, cardsById),
      };
    case "transfigure-card":
    case "keyword-modification":
    case "tribal-change":
    case "purge-card": {
      return { ...model, card: hydrateCard(model.card, cardsById) };
    }
    default:
      return model;
  }
}

export default function OffersDebugApp(): ReactElement {
  const isDesktop = useIsDesktop();
  const [lastPressed, setLastPressed] = useState<string | null>(null);
  const [cardsById, setCardsById] = useState<ReadonlyMap<string, CardData> | null>(
    null,
  );
  const [cardLoadError, setCardLoadError] = useState<string | null>(null);
  const [atlasData, setAtlasData] = useState<AtlasData | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadCardDatabase()
      .then((database) => {
        if (cancelled) {
          return;
        }
        setCardsById(
          new Map(
            [...database.values()].map((card) => [card.id, card] as const),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCardLoadError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadAtlasData()
      .then((loadedAtlasData) => {
        if (!cancelled) setAtlasData(loadedAtlasData);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCardLoadError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const debugModels = atlasData === null ? null : buildOfferTileDebugModels(atlasData);
  const models = debugModels === null
    ? []
    : OFFER_TILE_DEBUG_ARCHETYPE_IDS.map((archetypeId) =>
        hydrateOfferCards(debugModels[archetypeId], cardsById),
      );
  const selected =
    lastPressed === null
      ? null
      : models.find((model) => model.id === lastPressed) ?? null;
  return (
    <div
      className="cumulus"
      data-testid="offers-debug-page"
      data-card-catalog-status={
        cardLoadError !== null
          ? "error"
          : cardsById === null
            ? "loading"
            : "ready"
      }
      data-card-catalog-error={cardLoadError ?? undefined}
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
          width: "min(1740px, 100%)",
          minHeight: "100vh",
          margin: "0 auto",
          padding: `${token("--space-3xl")} ${token("--space-2xl")} ${token("--space-4xl")}`,
          boxSizing: "border-box",
        }}
      >
        <header
          style={{
            display: "grid",
            justifyItems: "center",
            gap: token("--space-xs"),
            marginBottom: token("--space-3xl"),
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
            Augury Debug
          </p>
          <h1 style={{ margin: 0, font: token("--t-display") }}>Offer Tiles</h1>
          <p style={{ margin: 0, font: token("--t-body-sm") }}>
            {models.length} maximal offer shapes · every surfaced choice shown
          </p>
          <p aria-live="polite" style={{ margin: 0, minHeight: 20, font: token("--t-caption") }}>
            {selected === null ? "" : offerTileDescription(selected)}
          </p>
        </header>

        <section
          aria-label="Augury offer categories"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(${isDesktop ? "300px" : "240px"}, 1fr))`,
            alignItems: "start",
            gap: token("--space-2xl"),
          }}
        >
          {OFFER_TILE_DEBUG_ARCHETYPE_IDS.map((archetypeId) => {
            if (debugModels === null) return null;
            const model = hydrateOfferCards(debugModels[archetypeId], cardsById);
            return (
              <figure
                key={archetypeId}
                id={`offer-${archetypeId}`}
                data-offer-category={archetypeId}
                style={{
                  display: "grid",
                  justifyItems: "center",
                  gap: token("--space-s"),
                  margin: 0,
                }}
              >
                <OfferTile
                  model={model}
                  size={isDesktop ? "standard" : "compact"}
                  onPress={setLastPressed}
                />
                <figcaption
                  style={{
                    display: "grid",
                    gap: token("--space-xxs"),
                    font: token("--t-caption"),
                    color: token("--text-on-glass"),
                    textAlign: "center",
                    textShadow: token("--text-outline-media"),
                  }}
                >
                  <span
                    style={{
                      color: token("--text-on-glass-muted"),
                    }}
                  >
                    {OFFER_TILE_DEBUG_NOTES[archetypeId]}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </section>
      </main>
    </div>
  );
}
