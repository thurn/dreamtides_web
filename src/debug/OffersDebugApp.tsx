import { assertLocalized } from "@trox/runtime";
import { useEffect, useState, type ReactElement } from "react";
import { resolveChecked } from "../runtime/localization/runtime";
import { loadCardDatabase } from "../data/card-database";
import { loadSitesData, siteTypeIcon } from "../data/sites-data";
import {
  OfferTile,
  type OfferTileFourCards,
  type OfferTileModel,
} from "../cumulus/components/controls/OfferTile";
import { offerTileDescription } from "../cumulus/components/controls/offer-tile-descriptions";
import { artRef, resolveArtRef } from "../cumulus/primitives/art";
import { glyph } from "../cumulus/primitives/glyph";
import { token } from "../cumulus/primitives/tokens";
import { useIsDesktop } from "../cumulus/primitives/use-is-desktop";
import auguryJson from "../generated/config/augury-data.json";
import { auguryArchetype, parseAuguryData } from "../data/augury-data";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../journey_v2/archetypes/registry";
import type { MerchantArchetypeId } from "../journey_v2/archetypes/types";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { SitesData } from "../types/sites-data";
import type { CardId } from "../types/card-identity";
import { asDreamscapeId } from "../types/identifiers";

const AUGURY_DATA = parseAuguryData(auguryJson);

const fixtureCard = (
  cardId: CardId,
  name: string,
  imageNumber: number,
): Readonly<CardData> => {
  const id = asCardId(cardId);
  return {
    id,
    name: asCardName(name),
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
  };
};

const GENERAL_DRAFT_A: OfferTileFourCards = [
  fixtureCard(
    asCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"),
    "Windcutter",
    287269511,
  ),
  fixtureCard(
    asCardId("161482b6-af07-4d9e-822d-8c738672beb9"),
    "Starlight Guide",
    2022594419,
  ),
  fixtureCard(
    asCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"),
    "Light of Emergence",
    618071684,
  ),
  fixtureCard(
    asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
    "Kindlehorn",
    1196004046,
  ),
];

const GENERAL_DRAFT_B: OfferTileFourCards = [
  fixtureCard(
    asCardId("967c714f-40c5-4a77-8e22-40691a2755d4"),
    "Passage Through Oblivion",
    2212744813,
  ),
  fixtureCard(
    asCardId("3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1"),
    "Graywatch",
    2218612335,
  ),
  fixtureCard(
    asCardId("25d00336-5ad7-433b-8ced-71720a9f074a"),
    "Wheel of the Heavens",
    1480584617,
  ),
  fixtureCard(
    asCardId("68978d92-aa8b-4873-bb0b-6e52f12b0849"),
    "Chronicle Claimer",
    1633431265,
  ),
];

// Four actual Spirit Animal cards form a realistic subtype draft and bundle.
const CATEGORY_DRAFT: OfferTileFourCards = [
  fixtureCard(
    asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
    "Kindlehorn",
    1196004046,
  ),
  fixtureCard(
    asCardId("401bb341-8385-41e9-8f6f-7b48e9ce174d"),
    "Soulflame Predator",
    2278837667,
  ),
  fixtureCard(
    asCardId("eae928f6-aab2-415e-b4b1-b9c3ed8e6818"),
    "Driftcaller Sovereign",
    447372529,
  ),
  fixtureCard(
    asCardId("c8579b20-95ff-4b1d-b4c6-6bd049fc4760"),
    "Ghostlight Wolves",
    2127752129,
  ),
];

const PURGE_TARGET = fixtureCard(
  asCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
  "Marked Direwolf",
  2654359867,
);

const STARTER_TARGETS = [
  fixtureCard(
    asCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8"),
    "Nocturne Strummer",
    507269458,
  ),
  fixtureCard(
    asCardId("647f5150-b2e0-424b-9480-27557642524e"),
    "Ringwatcher",
    1016596168,
  ),
] as const;

const DREAMSIGN = {
  id: "1a524712-ef7e-43d9-bd79-5dea5250bf08",
  name: assertLocalized("Rainbow Horn"),
  art: artRef.dreamsign("horn_rainbow .png"),
} as const;

/** One maximal, production-shaped UUID-backed specimen per canonical archetype. */
export function buildOfferTileDebugModels(
  sitesData: SitesData,
): Readonly<Record<MerchantArchetypeId, OfferTileModel>> {
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
      category: { kind: "subtype", name: assertLocalized("Spirit Animal") },
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
    purge: {
      id: "debug:purge",
      kind: "purge-card",
      card: PURGE_TARGET,
    },
    duplicate: {
      id: "debug:duplicate",
      kind: "duplicate-card",
      cards: [GENERAL_DRAFT_A[0], GENERAL_DRAFT_A[1], GENERAL_DRAFT_A[3]],
    },
    dreamsign: {
      id: "debug:dreamsign",
      kind: "dreamsign-gift",
      dreamsign: DREAMSIGN,
    },
    add_site: {
      id: "debug:add_site",
      kind: "add-site",
      site: {
        id: "Duplication",
        name: assertLocalized("Duplication"),
        glyph: glyph(siteTypeIcon(sitesData, "Duplication")),
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
  purge: "1 preselected card",
  duplicate: "3 choices · all shown",
  dreamsign: "1 preselected dreamsign",
  add_site: "1 preselected site",
};

/** One representative archetype for each distinct player-facing tile shape. */
export const OFFER_TILE_DEBUG_ARCHETYPE_IDS = MERCHANT_ARCHETYPE_BUILDERS.map(
  (builder) => builder.archetypeId,
).filter((archetypeId) => archetypeId !== "strong_card");

function hydrateCard(
  card: Readonly<CardData>,
  cardsById: ReadonlyMap<string, CardData>,
): Readonly<CardData> {
  return cardsById.get(card.id) ?? card;
}

function hydrateCards<T extends readonly Readonly<CardData>[]>(
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
    case "transfigure-card":
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
  const [cardsById, setCardsById] = useState<ReadonlyMap<
    string,
    CardData
  > | null>(null);
  const [cardLoadError, setCardLoadError] = useState<string | null>(null);
  const [sitesData, setSitesData] = useState<SitesData | null>(null);
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
          setCardLoadError(
            cause instanceof Error ? cause.message : String(cause),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadSitesData()
      .then((loadedSitesData) => {
        if (!cancelled) setSitesData(loadedSitesData);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCardLoadError(
            cause instanceof Error ? cause.message : String(cause),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const debugModels =
    sitesData === null ? null : buildOfferTileDebugModels(sitesData);
  const models =
    debugModels === null
      ? []
      : OFFER_TILE_DEBUG_ARCHETYPE_IDS.map((archetypeId) =>
          hydrateOfferCards(debugModels[archetypeId], cardsById),
        );
  const selected =
    lastPressed === null
      ? null
      : (models.find((model) => model.id === lastPressed) ?? null);
  const selectedArchetypeId =
    selected === null
      ? null
      : (OFFER_TILE_DEBUG_ARCHETYPE_IDS[models.indexOf(selected)] ?? null);
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
        src={resolveArtRef(
          artRef.dreamscapeScene(asDreamscapeId("wilderveil")),
        )}
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
          <p
            aria-live="polite"
            style={{ margin: 0, minHeight: 20, font: token("--t-caption") }}
          >
            {selected === null || selectedArchetypeId === null
              ? ""
              : resolveChecked(
                  offerTileDescription(
                    selected,
                    auguryArchetype(AUGURY_DATA, selectedArchetypeId)
                      .presentation,
                  ),
                )}
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
            const model = hydrateOfferCards(
              debugModels[archetypeId],
              cardsById,
            );
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
                  presentation={
                    auguryArchetype(AUGURY_DATA, archetypeId).presentation
                  }
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
