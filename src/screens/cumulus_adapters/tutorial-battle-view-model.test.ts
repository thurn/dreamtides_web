import { describe, expect, it, vi } from "vitest";
import type { MobileBattleView } from "../../cumulus/screens/MobileBattleScreen";
import type { BattleFoldState } from "../../rules/battle/fold";
import type { TutorialBattleControllerPlan } from "../../battle/tutorial-battle-controller";
import { buildMobileBattleView } from "./mobile-battle-view-model";
import { buildTutorialBattleView } from "./tutorial-battle-view-model";

vi.mock("./mobile-battle-view-model", () => ({
  buildMobileBattleView: vi.fn(),
}));

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
              : { dissolved: [] }),
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
