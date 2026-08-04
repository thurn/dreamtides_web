import { describe, expect, it } from "vitest";
import { createBattleInit } from "../../battle/integration/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../../battle/test-support";
import { buildBattleStartView } from "./battle-start-view-model";

function makeInit() {
  const cardDatabase = makeBattleTestCardDatabase();
  const base = createBattleInit({
    battleEntryKey: "battle-entry",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase,
    dreamAvatars: makeBattleTestDreamAvatars(),
    dreamwellCards: [],
    seedOverride: 1234,
  });
  const signature = [...cardDatabase.values()].slice(0, 2);
  return {
    cardDatabase,
    init: {
      ...base,
      scoreToWin: 15,
      essenceReward: 90,
      enemyDescriptor: {
        ...base.enemyDescriptor,
        id: "opponent-uuid",
        name: "The Long-Named Opponent",
        subtitle: "Keeper of the Last Horizon",
        abilityText: "Whenever you score, foresee 1.",
        dreamsigns: [
          {
            id: "dreamsign-catalog-uuid",
            name: "A Test Sign",
            effectDescription: "A stable test effect.",
            imageName: "test.webp",
            imageAlt: "A test Dreamsign",
            isNegative: false,
          },
        ],
        signatureCards: signature.map((card) => ({
          cardId: card.id,
          cardNumber: card.cardNumber,
          name: card.name,
        })),
      },
    },
  };
}

describe("buildBattleStartView", () => {
  it("maps opponent identity, scene, signature UUIDs, dreamsign ids, and stakes", () => {
    const { init, cardDatabase } = makeInit();
    const view = buildBattleStartView(init, cardDatabase);

    expect(view.scene).toEqual({
      kind: "dreamscape-scene",
      dreamscapeId: "test_dreamscape",
    });
    expect(view.dreamAvatar).toMatchObject({
      id: "opponent-uuid",
      name: "The Long-Named Opponent",
      title: "Keeper of the Last Horizon",
      ability: "Whenever you score, foresee 1.",
      abilityActive: true,
    });
    expect(view.signatureCards.map((card) => card.cardId)).toEqual(
      init.enemyDescriptor.signatureCards.map((card) => card.cardId),
    );
    expect(view.dreamsigns[0]).toMatchObject({
      id: "dreamsign-catalog-uuid",
      imageName: "test.webp",
      imageAlt: "A test Dreamsign",
    });
    expect(view.pointsToWin).toBe(15);
    expect(view.essenceReward).toBe(90);
  });

  it("keeps the opponent ability dormant in the opening battle", () => {
    const { init, cardDatabase } = makeInit();
    const view = buildBattleStartView(
      { ...init, completionLevelAtStart: 0 },
      cardDatabase,
    );

    expect(view.dreamAvatar.abilityActive).toBe(false);
  });

  it("maps authored Mira guidance for the first two tutorial-journey battles", () => {
    const { init, cardDatabase } = makeInit();
    const configuration = {
      firstBattle: {
        speechBubble: {
          speaker: "mira" as const,
          delay: 1,
          horizontalOffset: -4,
          verticalOffset: 6,
          bubbleWidth: 650,
          text: "Review the first opponent.",
        },
      },
      secondBattle: {
        speechBubble: {
          speaker: "mira" as const,
          delay: 1,
          horizontalOffset: 12,
          verticalOffset: -8,
          bubbleWidth: 700,
          text: "Prepare for the second battle.",
        },
      },
    };
    const firstBattle = { ...init, completionLevelAtStart: 0 };
    const secondBattle = { ...init, completionLevelAtStart: 1 };

    expect(
      buildBattleStartView(firstBattle, cardDatabase, {
        isTutorialJourney: true,
        configuration,
      }).guideDialogue,
    ).toEqual({
      id: `${init.battleId}:first-battle-start-guidance`,
      model: {
        portrait: { kind: "character-portrait", characterId: "mira" },
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Review the first opponent.",
      },
      delaySeconds: 1,
      horizontalOffset: -4,
      verticalOffset: 6,
      bubbleWidth: 650,
    });
    expect(
      buildBattleStartView(secondBattle, cardDatabase, {
        isTutorialJourney: true,
        configuration,
      }).guideDialogue,
    ).toEqual({
      id: `${init.battleId}:second-battle-start-guidance`,
      model: {
        portrait: { kind: "character-portrait", characterId: "mira" },
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Prepare for the second battle.",
      },
      delaySeconds: 1,
      horizontalOffset: 12,
      verticalOffset: -8,
      bubbleWidth: 700,
    });
    expect(
      buildBattleStartView(secondBattle, cardDatabase, {
        isTutorialJourney: false,
        configuration,
      }).guideDialogue,
    ).toBeUndefined();
    expect(
      buildBattleStartView(
        { ...init, completionLevelAtStart: 2 },
        cardDatabase,
        { isTutorialJourney: true, configuration },
      ).guideDialogue,
    ).toBeUndefined();
  });

  it("filters a missing card by number instead of rendering broken data", () => {
    const { init, cardDatabase } = makeInit();
    const missingNumber = 999_999;
    const view = buildBattleStartView(
      {
        ...init,
        enemyDescriptor: {
          ...init.enemyDescriptor,
          signatureCards: [
            ...init.enemyDescriptor.signatureCards,
            {
              cardId: "missing-uuid",
              cardNumber: missingNumber,
              name: "Missing",
            },
          ],
        },
      },
      cardDatabase,
    );
    expect(
      view.signatureCards.some((card) => card.cardId === "missing-uuid"),
    ).toBe(false);
  });
});
