import type { DraftData } from "../types/draft-data";
import { testContentHash, testFoldHash } from "../types/test-identities";

export function draftDataFixture(
  overrides: Partial<DraftData> = {},
): DraftData {
  return {
    schemaVersion: 1,
    contentHash: testContentHash("a"),
    foldHash: testFoldHash("b"),
    presentation: { progress: "Draft ({pick_number}/{pick_total})" },
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
