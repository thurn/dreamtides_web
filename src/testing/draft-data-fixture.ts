import type { DraftData } from "../types/draft-data";

export function draftDataFixture(
  overrides: Partial<DraftData> = {},
): DraftData {
  return {
    schemaVersion: 1,
    contentHash: "draft-content-fixture",
    foldHash: "draft-fold-fixture",
    offers: {
      cardsPerOffer: 4,
      picksPerSite: 5,
    },
    rarityCaps: [
      {
        rarity: "Legendary",
        poolCopyCap: 1,
        maxPicksPerRun: 1,
      },
    ],
    pool: {
      defaultStrategy: "tides4",
      tides4: {
        dealSize: 150,
        copyCap: 2,
        maxFacets: 3,
      },
    },
    ...overrides,
  };
}
