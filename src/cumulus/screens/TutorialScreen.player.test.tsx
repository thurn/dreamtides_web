// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { screenMocks } from "./__test-helpers__/tutorial-screen-stubs";
import {
  ResizeObserverStub,
  TUTORIAL_OPPONENT_CARD,
  TUTORIAL_PLAYER_CARD,
  battle,
  installTutorialScreenHarness,
  renderTutorialScreen,
  setDesktopViewport,
  setRect,
  tutorialView,
} from "./__test-helpers__/tutorial-screen-fixtures";
import type { TutorialView } from "./TutorialScreen";
import {
  parseBattleSlotViewId,
  parseTutorialRunId,
  type BattleSlotViewId,
  type TutorialRunId,
} from "../../types/identifiers";
import { testTutorialActionId } from "../../types/test-identities";

vi.mock("framer-motion", async () => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return stubs.framerMotionStub;
});
vi.mock("../components/overlay/CharacterDialogue", async () => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return { CharacterDialogue: stubs.CharacterDialogueStub };
});
vi.mock("./MobileBattleScreen", async (importOriginal) => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return {
    ...(await importOriginal<typeof import("./MobileBattleScreen")>()),
    MobileBattleScreen: stubs.MobileBattleScreenStub,
  };
});

installTutorialScreenHarness();

function endTurnView(
  runId: TutorialRunId,
  ready: boolean,
  battleFields: Record<string, unknown> = {},
): TutorialView {
  return tutorialView(runId, {
    currentAction: {
      id: testTutorialActionId("end-turn"),
      action: "end-turn",
      wait: 0,
    },
    endTurn: {
      actionId: testTutorialActionId("end-turn"),
      triggerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
      ready,
    },
    battle: battle({
      nearHand: { owner:"player",position:"near", cards: [], cardIds: [] },
      far: { backRank: [], frontRank: [], deckCardIds: [] },
      near: { backRank: [], frontRank: [] },
      ...battleFields,
    }),
  });
}

const clearedPending = {
  pendingCardId: null,
  pendingCardSource: null,
  pendingCardOwner: null,
};

describe("TutorialScreen player actions", () => {
  it("bridges the tutorial hand card after the how-to-play action completes", () => {
    const onPlayerCardPlay = vi.fn();
    renderTutorialScreen(
      endTurnView(parseTutorialRunId("event:player-turn"), false, {
        nearHand: { owner:"player",position:"near", cards: [TUTORIAL_PLAYER_CARD], cardIds: ([TUTORIAL_PLAYER_CARD]).map(card => card.id) },
        near: { backRank: [{ id: parseBattleSlotViewId("B4"), card: null }], frontRank: [] },
      }),
      { onPlayerCardPlay },
    );

    expect(screenMocks.props?.interactions).toMatchObject({
      canInteract: true,
      ...clearedPending,
    });

    act(() => {
      screenMocks.props?.interactions?.onCardDragStart(
        TUTORIAL_PLAYER_CARD.id,
        "near-hand",
      );
    });
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: TUTORIAL_PLAYER_CARD.id,
      pendingCardSource: "near-hand",
      pendingCardOwner: "player",
    });

    act(() => {
      screenMocks.props?.interactions?.onSlotDrop({
        owner: "player",
        rank: "back",
        slotId: parseBattleSlotViewId("B4"),
      });
    });
    expect(onPlayerCardPlay).toHaveBeenCalledWith(
      "event:player-turn",
      TUTORIAL_PLAYER_CARD.id,
      TUTORIAL_PLAYER_CARD.model.cardId,
      "B4",
    );
    expect(screenMocks.props?.interactions).toMatchObject(clearedPending);
  });

  it("places the played UUID-backed tutorial card in the fifth desktop back-rank slot", () => {
    setDesktopViewport(true);
    renderTutorialScreen(
      endTurnView(parseTutorialRunId("event:player-card-position"), true, {
        near: {
          backRank: [
            { id: "player-back-0", card: TUTORIAL_PLAYER_CARD },
            { id: "player-back-1", card: null },
            { id: "player-back-2", card: null },
          ],
          frontRank: [],
        },
      }),
    );

    const backRank = screenMocks.props?.view.near.backRank;
    expect(backRank).toHaveLength(10);
    expect(backRank?.[4]?.card?.model.cardId).toBe(
      TUTORIAL_PLAYER_CARD.model.cardId,
    );
    expect(backRank?.[4]?.id).toBe("player-back-0");
    expect(backRank?.[5]?.card).toBeNull();
  });

  it("highlights the opposing lane and bridges the guided player block", () => {
    const onPlayerCharacterReposition = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:block"), {
        currentAction: {
          id: testTutorialActionId("block-opponent"),
          action: "reposition-player-character",
          cardId: TUTORIAL_PLAYER_CARD.model.cardId,
          opposingCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
          wait: 0,
        },
        playerReposition: {
          actionId: testTutorialActionId("block-opponent"),
          cardInstanceId: TUTORIAL_PLAYER_CARD.id,
          cardId: TUTORIAL_PLAYER_CARD.model.cardId,
          opposingCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
        },
        battle: battle({
          nearHand: { owner:"player",position:"near", cards: [], cardIds: [] },
          far: {
            backRank: [],
            frontRank: [{ id: "enemy-front-0", card: TUTORIAL_OPPONENT_CARD }],
            deckCardIds: [],
          },
          near: {
            backRank: [{ id: "player-back-0", card: TUTORIAL_PLAYER_CARD }],
            frontRank: [
              { id: "player-front-0", card: null },
              { id: "player-front-1", card: null },
            ],
          },
        }),
      }),
      { onPlayerCharacterReposition },
    );

    for (const rank of ["enemy-front", "player-front"]) {
      container.querySelectorAll(`[data-battle-rank="${rank}"] [data-battle-slot-id]`).forEach((slot, index) => setRect(slot, { x: index * 50, width: 40, height: 40 }));
    }
    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => ResizeObserverStub.flush());

    expect(screenMocks.props?.guidedSlotHighlight).toMatchObject({
      owner: "player",
      rank: "front",
      slotId: "player-front-0",
    });
    expect(screenMocks.props?.guidedSlotHighlight?.label).not.toBe("");

    act(() => {
      screenMocks.props?.interactions?.onCardDragStart(
        TUTORIAL_PLAYER_CARD.id,
        "battlefield",
      );
    });
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: TUTORIAL_PLAYER_CARD.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
    });

    const drop = (slotId: BattleSlotViewId) =>
      act(() => {
        screenMocks.props?.interactions?.onSlotDrop({
          owner: "player",
          rank: "front",
          slotId,
        });
      });
    drop(parseBattleSlotViewId("player-front-1"));
    expect(onPlayerCharacterReposition).not.toHaveBeenCalled();

    drop(parseBattleSlotViewId("player-front-0"));
    expect(onPlayerCharacterReposition).toHaveBeenCalledWith(
      "event:block",
      testTutorialActionId("block-opponent"),
      TUTORIAL_PLAYER_CARD.model.cardId,
      TUTORIAL_OPPONENT_CARD.model.cardId,
      "player-front-0",
    );
  });

  it("lifts the challenge pair, dissolves the lower-spark card, and completes after rematerialization", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:challenge"), {
        currentAction: {
          id: testTutorialActionId("resolve-challenge"),
          action: "resolve-challenge",
          challengerCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
          blockerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
          wait: 0,
        },
        playerReposition: null,
        challenge: {
          actionId: testTutorialActionId("resolve-challenge"),
          challenger: { owner: "enemy", card: TUTORIAL_OPPONENT_CARD, spark: 2 },
          blocker: { owner: "player", card: TUTORIAL_PLAYER_CARD, spark: 4 },
          winnerOwner: "player",
          loserOwner: "enemy",
        },
        battle: battle({
          phase: "challenge",
          nearHand: { owner:"player",position:"near", cards: [], cardIds: [] },
          far: {
            backRank: [],
            frontRank: [{ id: "enemy-front-0", card: TUTORIAL_OPPONENT_CARD }],
            deckCardIds: [],
          },
          near: {
            backRank: [],
            frontRank: [{ id: "player-front-0", card: TUTORIAL_PLAYER_CARD }],
          },
        }),
      }),
      { onActionComplete },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const animation = container.querySelector(
      "[data-tutorial-challenge-animation]",
    );
    expect(animation).not.toBeNull();
    expect(
      animation?.getAttribute("data-tutorial-challenge-winner-card-id"),
    ).toBe(TUTORIAL_PLAYER_CARD.model.cardId);
    expect(
      animation?.getAttribute("data-tutorial-challenge-loser-card-id"),
    ).toBe(TUTORIAL_OPPONENT_CARD.model.cardId);
    expect(
      container.querySelectorAll("[data-tutorial-challenge-mote]").length,
    ).toBeGreaterThan(0);
    for (const rank of ["enemy-front", "player-front"]) {
      expect(
        container.querySelector<HTMLElement>(
          `[data-battle-rank="${rank}"] [data-battle-card-id]`,
        )?.style.visibility,
      ).toBe("");
      expect(
        container.querySelector<HTMLElement>(
          `[data-battle-rank="${rank}"] [data-battle-card-motion]`,
        )?.style.visibility,
      ).toBe("hidden");
    }
    expect(screenMocks.props?.preserveOccupiedSlotOutlines).toBe(true);
    expect(
      container.querySelector(
        '[data-battle-rank="enemy-front"] [data-battle-slot-id="enemy-front-0"] [data-battle-slot-outline]',
      ),
    ).not.toBeNull();
    expect(screenMocks.props?.view.phase).toBe("challenge");

    act(() => screenMocks.challengeRematerializedAnimationComplete?.());
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:challenge",
      testTutorialActionId("resolve-challenge"),
    );
  });

  it("offers End Turn after the shared card play and submits the authored action", () => {
    const onEndTurn = vi.fn();
    renderTutorialScreen(endTurnView(parseTutorialRunId("event:player-turn"), true), { onEndTurn });

    expect(screenMocks.props?.phaseNavigation).toBe("end-turn");
    expect(screenMocks.props?.interactions?.canInteract).toBe(true);
    act(() => screenMocks.props?.interactions?.onNextPhase());
    expect(onEndTurn).toHaveBeenCalledWith(
      "event:player-turn",
      testTutorialActionId("end-turn"),
    );
  });
});

function realCellView(ready = false, selected = -1): TutorialView {
  return endTurnView(parseTutorialRunId("real-slot-contract"), ready, {
    nearHand: { owner: "player", position: "near", cards: ready ? [] : [TUTORIAL_PLAYER_CARD], cardIds: ready ? [] : [TUTORIAL_PLAYER_CARD.id] },
    near: { backRank: [0, 1, 2].map(index => ({ id: parseBattleSlotViewId(`B${index}`), card: index === selected ? TUTORIAL_PLAYER_CARD : null })), frontRank: [] },
  });
}
function startCardDrag() {
  act(() => screenMocks.props?.interactions?.onCardDragStart(TUTORIAL_PLAYER_CARD.id, "near-hand"));
}
describe("tutorial centred slot identity and gesture boundaries", () => {
  it.each([true, false])("centres whole source IDs with their physical cards, desktop=%s", desktop => {
    setDesktopViewport(desktop);
    const { container } = renderTutorialScreen(realCellView(true, 1));
    const back = screenMocks.props!.view.near.backRank;
    const position = desktop ? 5 : 3;
    expect(back[position]?.id).toBe("B1");
    expect(back[position]?.card?.id).toBe(TUTORIAL_PLAYER_CARD.id);
    expect(container.querySelector(`[data-battle-card-id="${TUTORIAL_PLAYER_CARD.id}"]`)?.closest("[data-battle-slot-id]")?.getAttribute("data-battle-slot-id")).toBe("B1");
    expect(new Set(back.map(slot => slot.id)).size).toBe(back.length);
    expect(back.filter(slot => slot.id !== "B1").every(slot => slot.card === null)).toBe(true);
  });
  it.each([true, false])("preserves a high occupied canonical ID without duplicate padding, desktop=%s", desktop => {
    setDesktopViewport(desktop);
    const view = realCellView(true);
    renderTutorialScreen({ ...view, battle: { ...view.battle, near: { ...view.battle.near, backRank: [...view.battle.near.backRank, { id: parseBattleSlotViewId("B9"), card: TUTORIAL_PLAYER_CARD }] } } });
    const back = screenMocks.props!.view.near.backRank;
    expect(back).toHaveLength(10);
    expect(back.find(slot => slot.card?.id === TUTORIAL_PLAYER_CARD.id)?.id).toBe("B9");
    expect(new Set(back.map(slot => slot.id)).size).toBe(back.length);
  });
  it("accepts real empty source cells and denies decorative, occupied and foreign targets", () => {
    renderTutorialScreen(realCellView(), { onPlayerCardPlay: vi.fn() });
    const current = screenMocks.props!, predicate = current.interactions?.isSlotDropEligible;
    const padding = current.view.near.backRank.find(slot => !["B0", "B1", "B2"].includes(slot.id))!;
    expect(predicate?.({ owner: "player", rank: "back", slotId: parseBattleSlotViewId("B1") })).toBe(true);
    for (const target of [{ owner: "player", rank: "back", slotId: padding.id }, { owner: "enemy", rank: "back", slotId: parseBattleSlotViewId("B1") }, { owner: "player", rank: "front", slotId: parseBattleSlotViewId("B1") }, { owner: "player", rank: "back", slotId: parseBattleSlotViewId("absent") }] as const) expect(predicate?.(target)).toBe(false);
  });
  it("denies an occupied real cell while other empty cells remain eligible", () => {
    const view = realCellView();
    const occupied = { ...TUTORIAL_PLAYER_CARD, id: TUTORIAL_OPPONENT_CARD.id };
    renderTutorialScreen({ ...view, battle: { ...view.battle, near: { ...view.battle.near, backRank: view.battle.near.backRank.map(slot => slot.id === "B1" ? { ...slot, card: occupied } : slot) } } }, { onPlayerCardPlay: vi.fn() });
    const predicate = screenMocks.props!.interactions?.isSlotDropEligible;
    expect(predicate?.({ owner: "player", rank: "back", slotId: parseBattleSlotViewId("B1") })).toBe(false);
    expect(predicate?.({ owner: "player", rank: "back", slotId: parseBattleSlotViewId("B0") })).toBe(true);
  });
  it.each(["padding", "missing", "unhandled"] as const)("a %s drag cannot silently auto-play, and a fresh real B1 drag still commits once", kind => {
    const onPlayerCardPlay = vi.fn(), onPlayerCardDropRejected = vi.fn();
    renderTutorialScreen(realCellView(), { onPlayerCardPlay, onPlayerCardDropRejected });
    expect(screenMocks.props?.interactions?.handDropPolicy).toBe("exact-cell");
    const padding = screenMocks.props!.view.near.backRank.find(slot => !["B0", "B1", "B2"].includes(slot.id))!;
    startCardDrag();
    if (kind !== "unhandled") act(() => screenMocks.props?.interactions?.onHandCardDrop?.(kind === "missing" ? undefined : { owner: "player", rank: "back", slotId: padding.id }));
    act(() => screenMocks.props?.interactions?.onCardDragEnd());
    expect(onPlayerCardPlay).not.toHaveBeenCalled();
    expect(onPlayerCardDropRejected).toHaveBeenCalledExactlyOnceWith({ runId: parseTutorialRunId("real-slot-contract"), battleId: screenMocks.props!.view.battleId, cardInstanceId: TUTORIAL_PLAYER_CARD.id, cardId: TUTORIAL_PLAYER_CARD.model.cardId, target: kind === "padding" ? { owner: "player", rank: "back", slotId: padding.id } : null, reason: kind === "unhandled" ? "unresolved-drop" : "invalid-target" });
    expect(screenMocks.props?.interactions).toMatchObject(clearedPending);
    startCardDrag();
    act(() => screenMocks.props?.interactions?.onHandCardDrop?.({ owner: "player", rank: "back", slotId: parseBattleSlotViewId("B1") }));
    act(() => screenMocks.props?.interactions?.onCardDragEnd());
    expect(onPlayerCardPlay).toHaveBeenCalledExactlyOnceWith("real-slot-contract", TUTORIAL_PLAYER_CARD.id, TUTORIAL_PLAYER_CARD.model.cardId, "B1");
  });
  it.each(["invalid", "unresolved"] as const)("controller %s denial contains observer errors, clears pending and permits fresh legal recovery", kind => {
    const onPlayerCardPlay = vi.fn();
    const onPlayerCardDropRejected = vi.fn(() => {
      // Re-enter through the public callback: cleared pending identity prevents another observation.
      screenMocks.props?.interactions?.onHandCardDropRejected?.(null);
      throw new Error("synthetic observer failure");
    });
    renderTutorialScreen(realCellView(), { onPlayerCardPlay, onPlayerCardDropRejected });
    startCardDrag();
    expect(() => act(() => {
      if (kind === "invalid") screenMocks.props?.interactions?.onHandCardDropRejected?.(null);
      else screenMocks.props?.interactions?.onCardDragEnd();
    })).not.toThrow();
    expect(screenMocks.props?.interactions).toMatchObject(clearedPending);
    expect(onPlayerCardDropRejected).toHaveBeenCalledExactlyOnceWith({ runId: parseTutorialRunId("real-slot-contract"), battleId: screenMocks.props!.view.battleId, cardInstanceId: TUTORIAL_PLAYER_CARD.id, cardId: TUTORIAL_PLAYER_CARD.model.cardId, target: null, reason: kind === "invalid" ? "invalid-target" : "unresolved-drop" });
    expect(onPlayerCardPlay).not.toHaveBeenCalled();
    startCardDrag();
    act(() => screenMocks.props?.interactions?.onHandCardDrop?.({ owner: "player", rank: "back", slotId: parseBattleSlotViewId("B1") }));
    expect(onPlayerCardPlay).toHaveBeenCalledExactlyOnceWith("real-slot-contract", TUTORIAL_PLAYER_CARD.id, TUTORIAL_PLAYER_CARD.model.cardId, "B1");
  });
  it("explicit activation preserves null automatic placement", () => {
    const onPlayerCardPlay = vi.fn();
    renderTutorialScreen(realCellView(), { onPlayerCardPlay });
    act(() => screenMocks.props?.interactions?.onHandCardActivate(TUTORIAL_PLAYER_CARD.id));
    expect(onPlayerCardPlay).toHaveBeenCalledExactlyOnceWith("real-slot-contract", TUTORIAL_PLAYER_CARD.id, TUTORIAL_PLAYER_CARD.model.cardId, null);
  });
});
