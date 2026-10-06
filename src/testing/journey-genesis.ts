// Synthetic genesis and initial-state inputs shared by unit tests.

import type { ContentConfig } from "../eventlog/types";
import { initialJourneyState, type JourneyEconomy } from "../rules/fold-state";
import type { JourneyState } from "../types/journey";
import { testJourneySeed } from "../types/test-identities";
import { economyFixture } from "./economy-fixture";

/** The fixture economy a synthetic genesis pins. */
const TEST_ECONOMY: JourneyEconomy = economyFixture().journey;

/** A synthetic content configuration with the fixture economy pinned. */
export const TEST_CONTENT_CONFIG: ContentConfig = {
  poolVariant: "tides4",
  ...TEST_ECONOMY,
};

/** A fresh pre-Avatar journey on the fixture economy. */
export function testJourneyState(seed = "default"): JourneyState {
  return initialJourneyState(testJourneySeed(seed), TEST_ECONOMY);
}
