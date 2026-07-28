import { describe, expect, it, vi } from "vitest";
import type { MobileBattleView } from "../../cumulus/screens/MobileBattleScreen";
import type { BattleFoldState } from "../../rules/battle/fold";
import type { TutorialBattleControllerPlan } from "../../battle/tutorial-battle-controller";
import type { BattleCardInstance } from "../../battle/types";
import { buildMobileBattleView } from "./mobile-battle-view-model";
import { buildTutorialBattleView } from "./tutorial-battle-view-model";

vi.mock("./mobile-battle-view-model", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./mobile-battle-view-model")>();
  return {
    ...actual,
    buildMobileBattleView: vi.fn(),
  };
});

const player = {
  owner: "player",
  position: "near",
  status: {
    dreamAvatar: null,
    dreamAvatarProfile: {
      id: "player-avatar-uuid",
      ability: "Player printed ability.",
    },
    currentEnergy: 4,
    maxEnergy: 4,
    points: 0,
  },
} as MobileBattleView["player"];

const enemy = {
  owner: "enemy",
  position: "far",
  status: {
    dreamAvatar: null,
    dreamAvatarProfile: {
      id: "enemy-avatar-uuid",
      ability: "Enemy printed ability.",
    },
    currentEnergy: 4,
    maxEnergy: 4,
    points: 0,
  },
} as MobileBattleView["enemy"];

describe("buildTutorialBattleView", () => {
  it("leaves guidance without a board presentation, since its dwell is released elsewhere", () => {
    vi.mocked(buildMobileBattleView).mockReturnValue({
      perspective: "player",
      player,
      enemy,
      near: player,
      far: enemy,
    } as MobileBattleView);

    const view = buildTutorialBattleView(
      {
        init: {
          enemyDescriptor: {
            id: "enemy-avatar-uuid",
            imageNumber: "0025",
            name: "Enemy",
            subtitle: "Opponent",
            abilityText: "Enemy printed ability.",
          },
          dreamwellDeck: [],
        },
        board: { result: null },
        effectQueue: [],
        dawnFired: { player: null, enemy: null },
        pendingPrompt: null,
        tutorialPresentation: {
          id: "tutorial-guidance:1",
          kind: "tutorial-guidance",
          source: { kind: "dreamwell", cardId: "card-uuid", side: "player" },
          messages: [],
          messageIndex: 0,
          continuation: { kind: "commands", commands: [] },
        },
      } as unknown as BattleFoldState,
      {
        status: "driver",
        isCurrentClientDriver: true,
        requiresHumanDecision: false,
        driverClientId: "driver-client",
      } as TutorialBattleControllerPlan,
      null,
    );

    expect(view.presentation).toBeNull();
    expect(view.presentationId).toBeNull();
  });

  it("presents the committed opponent card before exposing its battlefield slot", () => {
    vi.mocked(buildMobileBattleView).mockReturnValue({
      perspective: "player",
      player,
      enemy,
      near: player,
      far: enemy,
    } as MobileBattleView);
    const battleCardId = "enemy-card-instance";
    const cardId = "229ab3a1-3720-41a2-924c-8fe112188f8e";
    const instance = {
      battleCardId,
      owner: "enemy",
      controller: "enemy",
      sparkDelta: 0,
      staticSparkBonus: 0,
      isRevealedToPlayer: false,
      figments: [],
      status: {
        isExhausted: true,
        counters: 0,
        reclaimed: false,
        offering: false,
        ephemeral: false,
        veil: false,
        grantedUnstoppable: false,
        grantedVengeful: false,
        grantedPreeminence: false,
        grantedAwakened: false,
      },
      markers: { isPrevented: false, isCopied: false },
      notes: [],
      provenance: {
        kind: "quest-deck",
        sourceBattleCardId: null,
        chosenSpark: null,
        chosenSubtype: null,
        createdAtTurnNumber: 1,
        createdAtSide: "enemy",
        createdAtMs: 0,
      },
      definition: {
        sourceDeckEntryId: null,
        cardId,
        cardNumber: 520,
        name: "Synthetic opponent card",
        battleCardKind: "character",
        subtype: "Musician",
        energyCost: 2,
        printedEnergyCost: 2,
        printedSpark: 2,
        isFast: false,
        reclaimCost: null,
        renderedText: "",
        imageNumber: 520,
        transfiguration: null,
        isBane: false,
      },
    } as BattleCardInstance;
    const battle = {
      init: {
        enemyDescriptor: {
          id: "enemy-avatar-uuid",
          imageNumber: "0025",
          name: "Enemy",
          subtitle: "Opponent",
          abilityText: "Enemy printed ability.",
        },
        dreamwellDeck: [],
      },
      board: {
        result: null,
        sides: {
          player: { backRank: {}, frontRank: {}, void: [] },
          enemy: {
            backRank: { B4: battleCardId },
            frontRank: {},
            void: [],
          },
        },
        cardInstances: { [battleCardId]: instance },
      },
      effectQueue: [],
      dawnFired: { player: null, enemy: null },
      pendingPrompt: null,
      tutorialPresentation: {
        id: `opponent-play:${battleCardId}`,
        kind: "opponent-play",
        cardId,
        battleCardId,
        cardKind: "character",
      },
    } as unknown as BattleFoldState;

    const view = buildTutorialBattleView(
      battle,
      {
        status: "driver",
        isCurrentClientDriver: true,
        requiresHumanDecision: false,
        driverClientId: "driver-client",
      } as TutorialBattleControllerPlan,
      null,
    );

    const projectedBoard =
      vi.mocked(buildMobileBattleView).mock.lastCall?.[1];
    expect(projectedBoard?.sides.enemy.backRank.B4).toBeNull();
    expect(view.presentation).toMatchObject({
      kind: "opponent-play",
      battleCardId,
      card: { id: battleCardId },
    });

    const eventBattle = {
      ...battle,
      board: {
        ...battle.board,
        sides: {
          ...battle.board.sides,
          enemy: {
            ...battle.board.sides.enemy,
            backRank: { B4: null },
            void: [battleCardId],
          },
        },
        cardInstances: {
          ...battle.board.cardInstances,
          [battleCardId]: {
            ...instance,
            definition: {
              ...instance.definition,
              battleCardKind: "event",
              printedSpark: 0,
            },
          },
        },
      },
      tutorialPresentation: {
        ...battle.tutorialPresentation!,
        cardKind: "event",
      },
    } as unknown as BattleFoldState;
    const eventView = buildTutorialBattleView(
      eventBattle,
      {
        status: "driver",
        isCurrentClientDriver: true,
        requiresHumanDecision: false,
        driverClientId: "driver-client",
      } as TutorialBattleControllerPlan,
      null,
    );
    const projectedEventBoard =
      vi.mocked(buildMobileBattleView).mock.lastCall?.[1];
    expect(projectedEventBoard?.sides.enemy.void).toEqual([]);
    expect(eventView.presentation).toMatchObject({
      kind: "opponent-play",
      cardKind: "event",
      card: { id: battleCardId },
    });
  });

  it("preserves the automation checkpoint when opponent card display data is missing", () => {
    vi.mocked(buildMobileBattleView).mockReturnValue({
      perspective: "player",
      player,
      enemy,
      near: player,
      far: enemy,
    } as MobileBattleView);
    const presentationId = "opponent-play:missing-instance";

    const view = buildTutorialBattleView(
      {
        init: {
          enemyDescriptor: {
            id: "enemy-avatar-uuid",
            imageNumber: "0025",
            name: "Enemy",
            subtitle: "Opponent",
            abilityText: "Enemy printed ability.",
          },
          dreamwellDeck: [],
        },
        board: {
          result: null,
          sides: {
            player: { backRank: {}, frontRank: {}, void: [] },
            enemy: { backRank: {}, frontRank: {}, void: [] },
          },
          cardInstances: {},
        },
        effectQueue: [],
        dawnFired: { player: null, enemy: null },
        pendingPrompt: null,
        tutorialPresentation: {
          id: presentationId,
          kind: "opponent-play",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          battleCardId: "missing-instance",
          cardKind: "character",
        },
      } as unknown as BattleFoldState,
      {
        status: "driver",
        isCurrentClientDriver: true,
        requiresHumanDecision: false,
        driverClientId: "driver-client",
      } as TutorialBattleControllerPlan,
      null,
    );

    expect(view.presentation).toBeNull();
    expect(view.presentationId).toBe(presentationId);
  });

  it.each(["opponent-block", "challenge-resolved"] as const)(
    "preserves the %s dwell checkpoint so the screen can release automation",
    (kind) => {
      vi.mocked(buildMobileBattleView).mockReturnValue({
        perspective: "player",
        player,
        enemy,
        near: player,
        far: enemy,
      } as MobileBattleView);

      const presentationId = `${kind}:enemy:4`;
      const view = buildTutorialBattleView(
        {
          init: {
            enemyDescriptor: {
              id: "enemy-avatar-uuid",
              imageNumber: "0025",
              name: "Enemy",
              subtitle: "Opponent",
              abilityText: "Enemy printed ability.",
            },
            dreamwellDeck: [],
          },
          board: { result: null },
          effectQueue: [],
          dawnFired: { player: null, enemy: null },
          pendingPrompt: null,
          tutorialPresentation: {
            id: presentationId,
            kind,
            activeSide: "enemy",
            ...(kind === "opponent-block"
              ? { blockers: [] }
              : {
                  slotId: "F0",
                  challengerBattleCardId: "enemy-challenger-uuid",
                  defenderBattleCardId: "player-defender-uuid",
                  scored: null,
                  dissolved: [],
                }),
          },
        } as unknown as BattleFoldState,
        {
          status: "driver",
          isCurrentClientDriver: true,
          requiresHumanDecision: false,
          driverClientId: "driver-client",
        } as TutorialBattleControllerPlan,
        null,
      );

      expect(view.presentation).toEqual({
        kind,
        presentationId,
        ...(kind === "challenge-resolved"
          ? { paired: true, scored: null }
          : {}),
      });
    },
  );

  it("keeps both DreamAvatar abilities unavailable after the scripted handoff", () => {
    vi.mocked(buildMobileBattleView).mockReturnValue({
      perspective: "player",
      player,
      enemy,
      near: player,
      far: enemy,
    } as MobileBattleView);

    const view = buildTutorialBattleView(
      {
        init: {
          enemyDescriptor: {
            id: "enemy-avatar-uuid",
            imageNumber: "0025",
            name: "Enemy",
            subtitle: "Opponent",
            abilityText: "Enemy printed ability.",
          },
        },
        board: { result: null },
        pendingPrompt: null,
      } as BattleFoldState,
      {
        status: "driver",
        isCurrentClientDriver: true,
        requiresHumanDecision: false,
        driverClientId: "driver-client",
      } as TutorialBattleControllerPlan,
      null,
    );

    expect(view.battle.player.status.dreamAvatarProfile).toEqual({
      id: "player-avatar-uuid",
      ability: "Avatar ability is not active",
      unavailable: true,
    });
    expect(view.battle.enemy.status.dreamAvatarProfile).toEqual({
      id: "enemy-avatar-uuid",
      ability: "Avatar ability is not active",
      unavailable: true,
    });
    expect(view.battle.near).toBe(view.battle.player);
    expect(view.battle.far).toBe(view.battle.enemy);
  });
});
