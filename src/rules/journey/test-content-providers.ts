// Complete synthetic reducer content providers for unit tests.
//
// Every provider interface the journey reducer consumes has only required
// members, so a test that registers a provider builds it here and overrides
// just the members its scenario exercises. Defaults bounce: generator and
// resolver members return `null` (or `undefined` where the interface uses it),
// and the captured catalogs are the stable synthetic fixtures from
// src/testing/.

import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import { economyFixture } from "../../testing/economy-fixture";
import { gambleFixture } from "../../testing/gamble-fixture";
import type { DraftContentProvider } from "./draft";
import type { JourneyLifecycleContentProvider } from "./lifecycle";
import type { SiteContentProvider } from "./sites";

/** A site provider over the synthetic catalogs whose generators all bounce. */
export function testSiteContentProvider(
  overrides: Partial<SiteContentProvider> = {},
): SiteContentProvider {
  return {
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    gambleData: gambleFixture(),
    openSite: () => null,
    rerollShop: () => null,
    resolveAugury: () => null,
    resolveExploration: () => null,
    ...overrides,
  };
}

/** A draft provider with an empty card database whose lookups all bounce. */
export function testDraftContentProvider(
  overrides: Partial<DraftContentProvider> = {},
): DraftContentProvider {
  return {
    resolveCardNumber: () => null,
    cardDatabase: () => new Map(),
    draftConfigFor: () => undefined,
    transfigurationForCard: () => null,
    ...overrides,
  };
}

/** A lifecycle provider whose run assembly and Atlas rebuild all bounce. */
export function testJourneyLifecycleContentProvider(
  overrides: Partial<JourneyLifecycleContentProvider> = {},
): JourneyLifecycleContentProvider {
  return {
    resolveAvatarPackage: () => null,
    startJourney: () => null,
    regenerateAtlas: () => null,
    ...overrides,
  };
}
