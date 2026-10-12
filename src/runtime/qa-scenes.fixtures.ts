// Journey content the QA scene tests build scenes from.

import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../testing/atlas-fixtures";
import type { CardData } from "../types/cards";
import type { JourneyContent } from "../data/journey-content";
import type {
  ApollyonIncarnationContent,
  AvatarContent,
} from "../types/content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../testing/pool-context";
import {
  makeTutorialConfiguration,
  TEST_TUTORIAL_PLAYER_AVATAR_ID,
} from "../testing/tutorial-configuration-fixture";
import type { SiteId } from "../types/identifiers";
import type { JourneyState } from "../types/journey";
import { activeSiteIdOf } from "../rules/journey/sites";
import {
  testApollyonIncarnationId,
  testCardId,
  testAvatarId,
  testDreamsignId,
  testDreamwellCardId,
  testDreamwellCardName,
  testJourneySeed,
} from "../types/test-identities";

export const TUTORIAL_AVATAR_ID = TEST_TUTORIAL_PLAYER_AVATAR_ID;

export const SCENE_OPTIONS = { journeySeed: testJourneySeed("qa-scenes") };

export function activeSiteOf(state: JourneyState | null): SiteId | null {
  return state === null ? null : activeSiteIdOf(state);
}

export function makeAvatar(id = "avatar-1"): AvatarContent {
  return {
    id: testAvatarId(id),
    name: "Test Avatar",
    title: "Caller of Tests",
    renderedText: "Test ability.",
    imageNumber: "0001",
    startingEssence: 250,
  };
}

function makeIncarnations(): ApollyonIncarnationContent[] {
  return [
    {
      id: testApollyonIncarnationId("incarnation-1"),
      title: "First Incarnation",
      description: "A test incarnation.",
      deckType: "test-deck",
      aspect: { id: testAvatarId("incarnation-aspect-1"), renderedText: "", proposedAbilities: () => [], pending: true },
      deckRecipe: { poolAvatarId: testAvatarId("avatar-1"), archetypeTideIds: [], signatureCardIds: [] },
      dreamsignIds: [testDreamsignId("dreamsign-1")],
    },
    {
      id: testApollyonIncarnationId("incarnation-2"),
      title: "Second Incarnation",
      description: "Another test incarnation.",
      deckType: "test-deck",
      aspect: { id: testAvatarId("incarnation-aspect-2"), renderedText: "", proposedAbilities: () => [], pending: true },
      deckRecipe: { poolAvatarId: testAvatarId("avatar-1"), archetypeTideIds: [], signatureCardIds: [] },
      dreamsignIds: [testDreamsignId("dreamsign-1")],
    },
  ];
}

export function makeJourneyContent(
  incarnations: ApollyonIncarnationContent[] = makeIncarnations(),
): JourneyContent {
  const cardDatabase = new Map<number, CardData>(
    buildTestCorpusCards().map((card) => [card.cardNumber, card]),
  );
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase,
    tutorial: makeTutorialConfiguration(),
    avatars: [makeAvatar()],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
    apollyonIncarnations: incarnations,
    poolContext: makeTestPoolContext(["dreamsign-1", "dreamsign-2"]),
  };
}

/** Journey content whose starter cards and Dreamwell a battle can deal. */
export function battleSceneContent(): JourneyContent {
  const base = makeJourneyContent();
  const cardDatabase = new Map(base.cardDatabase);
  const [template] = cardDatabase.values();
  for (const cardNumber of base.poolContext.starterCardNumbers) {
    cardDatabase.set(cardNumber, {
      ...template,
      id: testCardId(`qa-scene-starter-${String(cardNumber)}`),
      cardNumber,
      imageNumber: cardNumber,
      isStarter: true,
    });
  }
  return {
    ...base,
    cardDatabase,
    dreamwellCards: [
      {
        id: testDreamwellCardId("qa-scene-dreamwell"),
        name: testDreamwellCardName("QA Scene Dreamwell"),
        renderedText: "Synthetic Dreamwell fixture.",
        order: 1,
        energyAdded: 1,
        cardNumber: 1,
      },
    ],
  };
}
