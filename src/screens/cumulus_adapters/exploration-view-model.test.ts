import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import {
  EXPLORATION_CARD_IDS,
  buildExplorationSiteView,
  resolveExplorationCardPool,
  resolveExplorationGuide,
  selectExplorationCard,
} from "./exploration-view-model";

function card(id: CardData["id"], cardNumber: number): CardData {
  return {
    id,
    name: asCardName(`Fixture Card ${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

const explorationSite: SiteState & { type: "Exploration" } = {
  id: "site-exploration-fixture",
  type: "Exploration",
  isEnhanced: true,
  isVisited: false,
};

const guide: DreamGuideContent = {
  id: "fixture-layaway",
  name: "Fixture Guide",
  homeDreamscapeId: "fixture-dreamscape",
  siteType: "Exploration",
  dialog: ["Every card dreams. Draw one, and we'll delve inside."],
  homeSpecialty: "Fixture specialty.",
};

describe("exploration-view-model", () => {
  it("keeps only UUIDs from the prototype pool that exist in the loaded catalog", () => {
    const first = card(EXPLORATION_CARD_IDS[0], 101);
    const last = card(
      EXPLORATION_CARD_IDS[EXPLORATION_CARD_IDS.length - 1],
      202,
    );
    const unrelated = card(asCardId("unrelated-card-id"), 303);
    const database = new Map(
      [last, unrelated, first].map((entry) => [entry.cardNumber, entry]),
    );

    expect(
      resolveExplorationCardPool(database).map((entry) => entry.id),
    ).toEqual([first.id, last.id]);
  });

  it("selects the same UUID for the same room seed and site id", () => {
    const cards = EXPLORATION_CARD_IDS.slice(0, 3).map((id, index) =>
      card(id, index + 1),
    );
    const database = new Map(cards.map((entry) => [entry.cardNumber, entry]));

    const first = selectExplorationCard({
      cardDatabase: database,
      journeySeed: "fixture-room-seed",
      siteId: explorationSite.id,
    });
    const second = selectExplorationCard({
      cardDatabase: database,
      journeySeed: "fixture-room-seed",
      siteId: explorationSite.id,
    });

    expect(first?.id).toBe(second?.id);
    expect(EXPLORATION_CARD_IDS).toContain(first?.id);
  });

  it("builds a UUID-backed card and Layaway presentation from synthetic data", () => {
    const selected = card(EXPLORATION_CARD_IDS[2], 17);
    const view = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      card: selected,
    });

    expect(resolveExplorationGuide([guide])).toBe(guide);
    expect(view).toMatchObject({
      siteId: explorationSite.id,
      scene: null,
      isEnhanced: true,
      fullArt: {
        kind: "exploration-card",
        imageNumber: selected.imageNumber,
      },
      guide: {
        id: guide.id,
        name: guide.name,
        line: guide.dialog[0],
      },
      card: {
        cardId: selected.id,
        displaySnapshot: selected,
      },
    });
  });

  it("returns null when none of the prototype UUIDs exist in the catalog", () => {
    expect(
      selectExplorationCard({
        cardDatabase: new Map(),
        journeySeed: "fixture-room-seed",
        siteId: explorationSite.id,
      }),
    ).toBeNull();
  });
});
