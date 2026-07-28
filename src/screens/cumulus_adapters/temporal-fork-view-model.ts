// Pure view-model construction for the Temporal Fork prototype encounter.

import type { GameCardModel } from "../../cumulus/components/card/CardView";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type { TemporalForkSiteView } from "../../cumulus/screens/TemporalForkSiteScreen";
import { guideForSiteType } from "../../data/dreamscapes";
import { hashStringToSeed } from "../../data/journey-content";
import { asCardId, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, SiteState } from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

// Resolved from the user-supplied Shutterstock image numbers. The three image
// numbers without cards_v2 TOML records are intentionally absent.
export const TEMPORAL_FORK_CARD_IDS = [
  asCardId("161482b6-af07-4d9e-822d-8c738672beb9"), // 2022594419
  asCardId("738a5af0-f848-4d48-bceb-9a43c9b11066"), // 2287436067
  asCardId("401bb341-8385-41e9-8f6f-7b48e9ce174d"), // 2278837667
  asCardId("8b5eb29c-146f-46fb-9407-55004128fba7"), // 2155438705
  asCardId("954e8d50-d494-4fb2-b4c7-74979083b774"), // 1726923523
  asCardId("b8ecc46d-bd92-4826-a416-7ce177e69cbf"), // 717263287
  asCardId("e2f542eb-090f-4a22-a42c-a120eb6caaa3"), // 1723965970
  asCardId("46783333-78f9-4146-a8ec-0d1b81e1bf2f"), // 1169640025
  asCardId("886c9d49-b25f-4ddd-97f0-2ec4b42eda89"), // 2256745747
] as const satisfies readonly CardId[];

const FALLBACK_GUIDE_ID = "layaway";
const FALLBACK_GUIDE_NAME = '"Layaway"';
const FALLBACK_GUIDE_LINE = "Time is just another currency.";

/** Resolve Layaway, the resident guide for Temporal Fork. */
export function resolveTemporalForkGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "TemporalFork");
}

/** Resolve the UUID pool against the loaded catalog, preserving authored order. */
export function resolveTemporalForkCardPool(
  cardDatabase: ReadonlyMap<number, CardData>,
): readonly CardData[] {
  const cardsById = new Map<CardId, CardData>();
  for (const card of cardDatabase.values()) cardsById.set(card.id, card);
  return TEMPORAL_FORK_CARD_IDS.flatMap((cardId) => {
    const card = cardsById.get(cardId);
    return card === undefined ? [] : [card];
  });
}

/**
 * Select one prototype card from the room seed and stable site id. This keeps
 * the draw random across rooms while every connected client sees the same card.
 */
export function selectTemporalForkCard(params: {
  cardDatabase: ReadonlyMap<number, CardData>;
  journeySeed: string;
  siteId: string;
}): CardData | null {
  const pool = resolveTemporalForkCardPool(params.cardDatabase);
  if (pool.length === 0) return null;
  const hash = hashStringToSeed(
    `${params.journeySeed}:${params.siteId}:temporal-fork-card`,
  );
  return pool[hash % pool.length] ?? null;
}

/** Build the complete Temporal Fork presentation from resolved domain data. */
export function buildTemporalForkSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "TemporalFork" };
  guide: DreamGuideContent | null;
  card: CardData;
}): TemporalForkSiteView {
  const guideId = params.guide?.id ?? FALLBACK_GUIDE_ID;
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  const card: GameCardModel = {
    cardId: params.card.id,
    displaySnapshot: params.card,
  };
  return {
    siteId: params.site.id,
    scene,
    isEnhanced: params.site.isEnhanced,
    fullArt: artRef.temporalForkCard(params.card.imageNumber),
    guide: {
      id: guideId,
      name: params.guide?.name ?? FALLBACK_GUIDE_NAME,
      line: params.guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
      art: artRef.dreamGuide(guideId),
    },
    card,
  };
}
