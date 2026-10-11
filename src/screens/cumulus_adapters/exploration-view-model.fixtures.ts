// Shared fixtures for the exploration view model tests: the view builder
// over the transfiguration fixture, a source card, the site, and its guide.
import type { JourneyContent } from "../../data/journey-content";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import { buildExplorationSiteView as buildExplorationSiteViewImpl } from "./exploration-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseSiteId } from "../../types/identifiers";
import {
  testDreamscapeId,
  testGuideArtKey,
  testGuideId,
  testCardId,
} from "../../types/test-identities";

function withTransfiguration(content: JourneyContent): JourneyContent {
  return { ...content, transfigurationData: transfigurationFixture() };
}

export const buildExplorationSiteView = (
  params: Parameters<typeof buildExplorationSiteViewImpl>[0],
) =>
  buildExplorationSiteViewImpl({
    ...params,
    content: withTransfiguration(params.content),
  });

export const sourceId = testCardId("161482b6-af07-4d9e-822d-8c738672beb9");

export function card(id: CardData["id"], cardNumber: number): CardData {
  return {
    id,
    name: parseCardName(`Fixture Card ${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "Survivor",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

export const explorationSite: SiteState & { type: "Exploration" } = {
  id: parseSiteId("site-exploration-fixture"),
  type: "Exploration",
  isEnhanced: true,
  isVisited: false,
};

export const guide: DreamGuideContent = {
  id: testGuideId("fixture-layaway"),
  name: "Fixture Guide",
  homeDreamscapeId: testDreamscapeId("fixture-dreamscape"),
  siteType: "Exploration",
  portraitSource: "fixture-guide.png",
  artKey: testGuideArtKey("fixture-guide"),
  headTargetX: 0.6,
  dialogue: { site: ["Every card dreams. Draw one, and we'll step inside."] },
  homeSpecialty: "Fixture specialty.",
};
