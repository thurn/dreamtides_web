import { testJourneySeed } from "../../types/test-identities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  loadTestAffiliations,
  loadTestAtlasData,
  loadTestSitesData,
  loadTestDreamGuides,
  loadTestDreamscapes,
} from "../../testing/atlas-fixtures";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type {
  AvatarContent,
  ResolvedAvatarPackage,
} from "../../types/content";
import type { JourneyContent } from "../../data/journey-content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
  TEST_STARTER_CARD_NUMBERS,
} from "../../testing/pool-context";
import type { PoolDraftState } from "../../types/draft";
import { toJourneyAvatar } from "../../data/avatar-selection";
import { testJourneyState } from "../../testing/journey-genesis";
import { startJourneyFromAvatar } from "./lifecycle-provider";
import { seededJourneyRng } from "./rng-stream";
import { testAvatarId, testDreamsignId, testCardId } from "../../types/test-identities";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: parseCardName(`Card ${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Event",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
    ...overrides,
  };
}

function makeAvatar(): AvatarContent {
  return {
    id: testAvatarId("avatar-1"),
    name: "Test Avatar",
    title: "State Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    portraitFocus: { x: 0.42, y: 0.18 },
    startingEssence: 275,
    signatureCards: [parseCardName("Alpha Card 1")],
  };
}

function makeJourneyContent(
  avatar: AvatarContent = makeAvatar(),
): JourneyContent {
  const starterCards = TEST_STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, { isStarter: true }),
  );
  const corpusCards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...corpusCards].map((card) => [card.cardNumber, card]),
  );

  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase,
    avatars: [avatar],

    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: loadTestDreamscapes(),
    affiliations: loadTestAffiliations(),
    guides: loadTestDreamGuides(),
    atlasData: loadTestAtlasData(),
    sitesData: loadTestSitesData(),
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
    poolContext: makeTestPoolContext(["dreamsign-a", "dreamsign-b"]),
  };
}

beforeEach(() => {
  // Restore first so each test starts with a clean console.log spy: journey start
  // now emits a `draft_pool_constructed` log, and without clearing, that call
  // count would leak into later tests' `not.toHaveBeenCalled()` assertions.
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("startJourneyFromAvatar", () => {
  it("starts a journey from an Avatar in one state transition", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const avatar = makeAvatar();
    const journeyContent = makeJourneyContent(avatar);
    const prev = testJourneyState();

    const next = startJourneyFromAvatar({
      prev,
      avatar,
      journeyContent,
      seed: testJourneySeed("journey-seed-1"),
      atlasRng: seededJourneyRng(testJourneySeed("journey-seed-1"), "atlas"),
    });
    const firstAvailableNode = Object.values(next.atlas.nodes).find(
      (node) => node.state === "available",
    );

    expect(next.avatar).toEqual(toJourneyAvatar(avatar));
    expect(next.avatar?.portraitFocus).toEqual({ x: 0.42, y: 0.18 });
    expect(next.avatar?.startingEssence).toBe(275);
    expect(next.essence).toBe(avatar.startingEssence);
    expect(prev.essence).toBe(testJourneyState().essence);
    // The package is built from the run pool context at journey start; assert a
    // non-empty draft pool was produced rather than checking exact card numbers.
    expect(next.resolvedPackage).not.toBeNull();
    expect(next.resolvedPackage?.draftPoolSize).toBeGreaterThan(0);
    expect(
      Object.keys(next.resolvedPackage?.draftPoolCopiesByCard ?? {}).length,
    ).toBeGreaterThan(0);
    // The state seed matches the seed the pool was built from.
    expect(next.seed).toBe("journey-seed-1");
    // The remaining dreamsign pool is the resolved pool minus any dreamsigns the
    // atlas granted as pre-revealed known dreamsigns, and is a fresh array.
    const knownIds = new Set(
      next.atlas.knownDreamsignCarrierIds
        .map((id) => next.atlas.nodes[id]?.knownDreamsignId)
        .filter((id): id is NonNullable<typeof id> => id != null),
    );
    expect(next.remainingDreamsignPool).toEqual(
      (next.resolvedPackage?.dreamsignPoolIds ?? []).filter(
        (id) => !knownIds.has(id),
      ),
    );
    expect(next.remainingDreamsignPool).not.toBe(
      next.resolvedPackage?.dreamsignPoolIds,
    );
    expect(next.deck.map((entry) => entry.cardNumber)).toEqual(
      TEST_STARTER_CARD_NUMBERS,
    );
    expect(next.deck.map((entry) => entry.entryId)).toEqual(
      TEST_STARTER_CARD_NUMBERS.map((_, index) => `deck-${String(index + 1)}`),
    );
    const nextPoolState = next.draftState;
    expect(nextPoolState?.draftPoolCopiesByCard).toEqual(
      next.resolvedPackage?.draftPoolCopiesByCard,
    );
    expect(nextPoolState?.remainingCopiesByCard).toEqual(
      next.resolvedPackage?.draftPoolCopiesByCard,
    );
    expect(next.draftState?.currentOffer).toEqual([]);
    expect(next.draftState?.pickNumber).toBe(1);
    expect(next.draftState?.sitePicksCompleted).toBe(0);
    expect(firstAvailableNode).toBeDefined();
    expect(next.currentDreamscape).toBe(firstAvailableNode?.id);
    expect(next.screen).toEqual({ type: "dreamscape" });
    // The starter-deck reveal popup is gated entirely by the
    // `hasSeenStartingDeckPopup` flag. A fresh journey start leaves the flag
    // at the default `false` so the popup opens once when the avatar
    // is first picked.
    expect(next.hasSeenStartingDeckPopup).toBe(false);
    // Journey start builds the draft pool, which emits exactly one provenance log
    // recording the algorithm and seed the pool was constructed from.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const constructed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(constructed.event).toBe("draft_pool_constructed");
    expect(constructed.avatarId).toBe(avatar.id);
    expect(typeof constructed.seed).toBe("number");
  });

  it("uses an authored package override for a tutorial journey start", () => {
    const avatar = makeAvatar();
    const journeyContent = makeJourneyContent(avatar);
    const authoredCardNumbers = [...journeyContent.cardDatabase.keys()]
      .filter(
        (cardNumber) =>
          !TEST_STARTER_CARD_NUMBERS.includes(
            cardNumber as (typeof TEST_STARTER_CARD_NUMBERS)[number],
          ),
      )
      .slice(0, 2);
    const authoredCopies = {
      [String(authoredCardNumbers[0])]: 2,
      [String(authoredCardNumbers[1])]: 1,
    };
    const dreamsignAId = testDreamsignId("dreamsign-a");
    const authoredPackage: ResolvedAvatarPackage = {
      avatar,
      draftPoolCopiesByCard: authoredCopies,
      openingDreamsignOfferIds: [dreamsignAId],
      dreamsignPoolIds: [
        dreamsignAId,
        testDreamsignId("dreamsign-b"),
      ],
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
    };

    const next = startJourneyFromAvatar({
      prev: testJourneyState(),
      avatar,
      journeyContent,
      seed: testJourneySeed("tutorial-seed"),
      atlasRng: () => 0,
      resolvedPackageOverride: authoredPackage,
      isTutorialJourney: true,
    });

    expect(next.resolvedPackage).toBe(authoredPackage);
    expect(next.isTutorialJourney).toBe(true);
    expect(next.draftState?.mode).toBe("tides4");
    expect((next.draftState as PoolDraftState).draftPoolCopiesByCard).toEqual(
      authoredCopies,
    );
    expect(next.remainingDreamsignPool).toContain(dreamsignAId);
    expect(
      next.atlas.knownDreamsignCarrierIds
        .map((id) => next.atlas.nodes[id]?.knownDreamsignId)
        .filter(
          (id): id is NonNullable<typeof id> => id !== null && id !== undefined,
        ),
    ).not.toContain(dreamsignAId);
  });
});
