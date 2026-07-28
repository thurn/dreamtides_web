import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import {
  TEMPORAL_FORK_CARD_IDS,
  buildTemporalForkSiteView,
  resolveTemporalForkCardPool,
  resolveTemporalForkGuide,
  selectTemporalForkCard,
} from "./temporal-fork-view-model";

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

const temporalForkSite: SiteState & { type: "TemporalFork" } = {
  id: "site-temporal-fixture",
  type: "TemporalFork",
  isEnhanced: true,
  isVisited: false,
};

const guide: DreamGuideContent = {
  id: "fixture-layaway",
  name: "Fixture Guide",
  homeDreamscapeId: "fixture-dreamscape",
  siteType: "TemporalFork",
  dialog: ["The future is already accruing interest."],
  homeSpecialty: "Fixture specialty.",
};

describe("temporal-fork-view-model", () => {
  it("keeps only UUIDs from the prototype pool that exist in the loaded catalog", () => {
    const first = card(TEMPORAL_FORK_CARD_IDS[0], 101);
    const last = card(
      TEMPORAL_FORK_CARD_IDS[TEMPORAL_FORK_CARD_IDS.length - 1],
      202,
    );
    const unrelated = card(asCardId("unrelated-card-id"), 303);
    const database = new Map(
      [last, unrelated, first].map((entry) => [entry.cardNumber, entry]),
    );

    expect(
      resolveTemporalForkCardPool(database).map((entry) => entry.id),
    ).toEqual([first.id, last.id]);
  });

  it("selects the same UUID for the same room seed and site id", () => {
    const cards = TEMPORAL_FORK_CARD_IDS.slice(0, 3).map((id, index) =>
      card(id, index + 1),
    );
    const database = new Map(
      cards.map((entry) => [entry.cardNumber, entry]),
    );

    const first = selectTemporalForkCard({
      cardDatabase: database,
      journeySeed: "fixture-room-seed",
      siteId: temporalForkSite.id,
    });
    const second = selectTemporalForkCard({
      cardDatabase: database,
      journeySeed: "fixture-room-seed",
      siteId: temporalForkSite.id,
    });

    expect(first?.id).toBe(second?.id);
    expect(TEMPORAL_FORK_CARD_IDS).toContain(first?.id);
  });

  it("builds a UUID-backed card and Layaway presentation from synthetic data", () => {
    const selected = card(TEMPORAL_FORK_CARD_IDS[2], 17);
    const view = buildTemporalForkSiteView({
      sceneNode: null,
      site: temporalForkSite,
      guide,
      card: selected,
    });

    expect(resolveTemporalForkGuide([guide])).toBe(guide);
    expect(view).toMatchObject({
      siteId: temporalForkSite.id,
      scene: null,
      isEnhanced: true,
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
      selectTemporalForkCard({
        cardDatabase: new Map(),
        journeySeed: "fixture-room-seed",
        siteId: temporalForkSite.id,
      }),
    ).toBeNull();
  });
});
