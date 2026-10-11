import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import {
  parseBattleEntryKey,
  parseOpponentId,
} from "../../types/identifiers";
import {
  testDreamsignId,
  testDreamscapeArtKey,
} from "../../types/test-identities";
import { createTestBattleInit } from "../../testing/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../../battle/test-support";
import { buildBattleStartView } from "./battle-start-view-model";
import { ART_CATALOG } from "./dreamscape-view-model.fixtures";

describe("battle-start-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function makeInit() {
    const cardDatabase = makeBattleTestCardDatabase();
    const state = makeBattleTestState();
    const { init: base } = createTestBattleInit({
      battleEntryKey: parseBattleEntryKey("battle-entry"),
      site: makeBattleTestSite(),
      state,
      cardDatabase,
      avatars: makeBattleTestAvatars(),
      dreamwellCards: [],
      seedOverride: 1234,
    });
    const signature = [...cardDatabase.values()].slice(0, 2);
    const init = {
      ...base,
      essenceReward: 90,
      enemyDescriptor: {
        ...base.enemyDescriptor,
        id: parseOpponentId("opponent-uuid"),
        name: "The Long-Named Opponent",
        subtitle: "Keeper of the Last Horizon",
        abilityText: "Whenever you score, foresee 1.",
        dreamsigns: [
          {
            id: testDreamsignId("dreamsign-catalog-uuid"),
            name: "A Test Sign",
            effectDescription: "A stable test effect.",
            imageName: "test.webp",
            imageAlt: "A test Dreamsign",
          },
        ],
        signatureCards: signature.map((card) => ({
          cardId: card.id,
          cardNumber: card.cardNumber,
          name: card.name,
        })),
      },
    };
    const node =
      base.nodeId === null ? null : (state.atlas.nodes[base.nodeId] ?? null);
    return {
      cardDatabase,
      preview: { init, scoreToWin: 15, node },
    };
  }

  /** `preview` with its battle starting at `completionLevelAtStart`. */
  function atLevel(
    preview: ReturnType<typeof makeInit>["preview"],
    completionLevelAtStart: number,
  ) {
    return { ...preview, init: { ...preview.init, completionLevelAtStart } };
  }

  describe("buildBattleStartView", () => {
    it("maps opponent identity, scene, signature UUIDs, dreamsign ids, and stakes", () => {
      const { preview, cardDatabase } = makeInit();
      const view = buildBattleStartView(preview, cardDatabase, ART_CATALOG);

      expect(view.scene).toEqual({
        kind: "dreamscape-scene",
        artKey: testDreamscapeArtKey("test_dreamscape"),
      });
      expect(view.avatar).toMatchObject({
        id: "opponent-uuid",
        name: "The Long-Named Opponent",
        title: "Keeper of the Last Horizon",
        ability: "Whenever you score, foresee 1.",
        abilityActive: true,
      });
      expect(view.signatureCards.map((card) => card.cardId)).toEqual(
        preview.init.enemyDescriptor.signatureCards.map((card) => card.cardId),
      );
      expect(view.dreamsigns[0]).toMatchObject({
        id: preview.init.enemyDescriptor.dreamsigns[0]?.id,
        imageName: "test.webp",
      });
      expect(view.dreamsigns[0]?.imageAlt).toEqual(expect.any(String));
      expect(view.pointsToWin).toBe(15);
      expect(view.essenceReward).toBe(90);
    });

    it("maps authored Mira guidance for the first two tutorial-journey battles", () => {
      const { preview, cardDatabase } = makeInit();
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
      const firstBattle = atLevel(preview, 0);
      const secondBattle = atLevel(preview, 1);

      expect(
        buildBattleStartView(firstBattle, cardDatabase, ART_CATALOG, {
          isTutorialJourney: true,
          configuration,
        }).guideDialogue,
      ).toEqual({
        id: `${preview.init.battleId}:first-battle-start-guidance`,
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
        buildBattleStartView(secondBattle, cardDatabase, ART_CATALOG, {
          isTutorialJourney: true,
          configuration,
        }).guideDialogue,
      ).toEqual({
        id: `${preview.init.battleId}:second-battle-start-guidance`,
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
        buildBattleStartView(secondBattle, cardDatabase, ART_CATALOG, {
          isTutorialJourney: false,
          configuration,
        }).guideDialogue,
      ).toBeUndefined();
      expect(
        buildBattleStartView(
          atLevel(preview, 2),
          cardDatabase,
          ART_CATALOG,
          { isTutorialJourney: true, configuration },
        ).guideDialogue,
      ).toBeUndefined();
    });
  });
});
