// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { screenMocks } from "./__test-helpers__/tutorial-screen-stubs";
import {
  TUTORIAL_DREAMWELL_CARD,
  battle,
  installTutorialScreenHarness,
  renderTutorialScreen,
  setDesktopViewport,
  setRect,
  tutorialView,
} from "./__test-helpers__/tutorial-screen-fixtures";
import type { TutorialView } from "./TutorialScreen";
import {
  testDreamwellCardId,
  testTutorialActionId,
} from "../../types/test-identities";
import {
  parseTutorialRunId,
  type DreamwellCardId,
  type TutorialActionId,
  type TutorialRunId,
} from "../../types/identifiers";
import type { TutorialHowToPlayTrigger } from "../../types/tutorial";

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

const emptyRanks = {
  enemy: { backRank: [], frontRank: [], deckCardIds: [] },
  player: { backRank: [], frontRank: [] },
};

/** A How to Play action with its matching view, optionally paired with a Dreamwell card. */
function howToPlayView(
  runId: TutorialRunId,
  actionId: TutorialActionId,
  text: string,
  trigger: TutorialHowToPlayTrigger,
  companion: { readonly cardWidth: number } | null = null,
): TutorialView {
  return tutorialView(runId, {
    currentAction: {
      id: actionId,
      action: "display-how-to-play",
      trigger,
      ...(companion === null ? {} : { companion: "dreamwell-card" }),
      text,
      wait: 0,
    },
    howToPlay: {
      actionId,
      text,
      wait: 0,
      trigger,
      ...(companion === null
        ? {}
        : { cardWidth: companion.cardWidth, companion: TUTORIAL_DREAMWELL_CARD }),
    },
    battle: battle({
      ...(companion === null
        ? {}
        : { dreamwell: { side: "enemy", model: TUTORIAL_DREAMWELL_CARD } }),
      ...emptyRanks,
    }),
  });
}

/** A Dreamwell draw action with the drawn card staged on the battlefield. */
function dreamwellDrawView(
  runId: TutorialRunId,
  actionId: TutorialActionId,
  owner: "enemy" | "player",
  cardId: DreamwellCardId,
  fields: { readonly wait: number; readonly revealDuration?: number },
): TutorialView {
  return tutorialView(runId, {
    currentAction: {
      id: actionId,
      action: "draw-dreamwell-card",
      owner,
      cardId,
      ...fields,
    },
    battle: battle({
      dreamwell: {
        side: owner,
        model: {
          cardId,
          displaySnapshot: {
            ...TUTORIAL_DREAMWELL_CARD.displaySnapshot,
            id: cardId,
          },
        },
      },
      ...emptyRanks,
    }),
  });
}

function stagedVisibility(container: HTMLElement, stage: string) {
  return container.querySelector<HTMLElement>(
    `[data-tutorial-how-to-play-stage="${stage}"]`,
  )?.style.visibility;
}

describe("TutorialScreen How to Play and Dreamwell", () => {
  it("opens the authored How to Play action after the player turn announcement and completes it from its close control", () => {
    vi.useFakeTimers();
    setDesktopViewport(true);
    const onHowToPlayPresented = vi.fn();
    const onHowToPlayDismissed = vi.fn();
    const onActionComplete = vi.fn();
    const howToPlayActionId = testTutorialActionId("how-to-play");
    const { container } = renderTutorialScreen(
      howToPlayView(
        parseTutorialRunId("event:player-turn"),
        testTutorialActionId("how-to-play"),
        "Play characters and [yellow]challenge[/yellow] with them to score points (⍟) equal to their spark (✦), or [yellow]block[/yellow] a challenger. An [purple]event[purple] resolves once.\n\nScore 12⍟ to win this configured battle.",
        "player-turn-announcement-complete",
      ),
      { onActionComplete, onHowToPlayPresented, onHowToPlayDismissed },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("enemy");
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("player");
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const content = dialog?.querySelector<HTMLElement>(
      "[data-tutorial-how-to-play-content]",
    );
    const paragraphs = [...(content?.querySelectorAll("p") ?? [])];
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).not.toContain("[yellow]");
    const highlights = [
      ...(paragraphs[0]?.querySelectorAll<HTMLElement>(
        '[data-tutorial-instruction-highlight="yellow"]',
      ) ?? []),
    ];
    expect(highlights.map((highlight) => highlight.textContent)).toEqual([
      "challenge",
      "block",
    ]);
    expect(
      paragraphs[0]?.querySelector(
        '[data-tutorial-instruction-highlight="purple"]',
      )?.textContent,
    ).toBe("event");
    expect(paragraphs[0]?.querySelectorAll("[data-inline-glyph]")).toHaveLength(
      2,
    );
    expect(
      paragraphs[0]?.querySelector(
        "[data-tutorial-how-to-play-points-term] [data-inline-glyph]",
      ),
    ).not.toBeNull();
    expect(
      paragraphs[0]?.querySelector(
        "[data-tutorial-how-to-play-spark-term] [data-inline-glyph]",
      ),
    ).not.toBeNull();
    expect(paragraphs[1]?.querySelector("[data-inline-glyph]")).not.toBeNull();
    expect(
      document.querySelector("[data-tutorial-how-to-play-tweaks]"),
    ).toBeNull();
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:player-turn",
      howToPlayActionId,
      "player-turn-announcement-complete",
    );

    act(() => {
      dialog
        ?.querySelector<HTMLButtonElement>(
          "[data-glass-dialog-flowing-close] button",
        )
        ?.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onHowToPlayDismissed).toHaveBeenCalledWith(
      "event:player-turn",
      howToPlayActionId,
      "player-turn-announcement-complete",
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:player-turn",
      howToPlayActionId,
    );
  });

  it("opens a generalized How to Play action after the opponent turn announcement", () => {
    const onHowToPlayPresented = vi.fn();
    const { container } = renderTutorialScreen(
      howToPlayView(
        parseTutorialRunId("event:dreamwell"),
        testTutorialActionId("dreamwell-how-to-play"),
        "Dreamwell guidance (●).",
        "enemy-turn-announcement-complete",
      ),
      { onHowToPlayPresented },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("player");
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("enemy");
    });
    expect(
      container.querySelector(
        '[role="dialog"] [data-tutorial-how-to-play-content]',
      ),
    ).not.toBeNull();
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:dreamwell",
      testTutorialActionId("dreamwell-how-to-play"),
      "enemy-turn-announcement-complete",
    );
  });

  it("emerges the Dreamwell card before pairing it with the immediate instruction", () => {
    vi.useFakeTimers();
    setDesktopViewport(true);
    const onHowToPlayPresented = vi.fn();
    const { container } = renderTutorialScreen(
      howToPlayView(
        parseTutorialRunId("event:dreamwell-pair"),
        testTutorialActionId("dreamwell-how-to-play"),
        "Players draw [yellow]dreamwell[/yellow] cards that increase their energy (●) production.",
        "immediate",
        { cardWidth: 650 },
      ),
      { onHowToPlayPresented },
    );

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(stagedVisibility(container, "staged")).toBe("hidden");
    expect(
      container.querySelector<HTMLElement>("[data-battle-dreamwell-layer]")
        ?.dataset.tutorialDreamwellEmergence,
    ).toBe("emerging");
    const dreamwellSideZone = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-zones"]',
    );
    expect(dreamwellSideZone?.dataset.tutorialDreamwellEmergenceLayer).toBe("");
    expect(screenMocks.props?.view.dreamwell?.model.cardId).toBe(
      TUTORIAL_DREAMWELL_CARD.cardId,
    );

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(stagedVisibility(container, "staged")).toBe("hidden");
    expect(onHowToPlayPresented).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      dialog?.querySelector<HTMLElement>("[data-glass-dialog-companion-layout]")
        ?.dataset.glassDialogCompanionLayout,
    ).toBe("horizontal");
    expect(
      dialog
        ?.querySelector("[data-dreamwell-card]")
        ?.getAttribute("data-dreamwell-card"),
    ).toBe(TUTORIAL_DREAMWELL_CARD.cardId);
    expect(
      dialog?.querySelector<HTMLElement>("[data-tutorial-how-to-play-content]")
        ?.style.width,
    ).toContain("650px");
    expect(
      dialog?.querySelector('[data-tutorial-instruction-highlight="yellow"]')
        ?.textContent,
    ).toBe("dreamwell");
    expect(
      dialog?.querySelector(
        "[data-tutorial-how-to-play-energy-term] [data-inline-glyph]",
      ),
    ).not.toBeNull();
    expect(screenMocks.props?.view.dreamwell).toBeNull();
    expect(
      dreamwellSideZone?.dataset.tutorialDreamwellEmergenceLayer,
    ).toBeUndefined();
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:dreamwell-pair",
      testTutorialActionId("dreamwell-how-to-play"),
      "immediate",
    );
  });

  it("continuously carries the desktop Dreamwell into its paired dialog target", () => {
    setDesktopViewport(true);
    const onHowToPlayPresented = vi.fn();
    const { container, unmount } = renderTutorialScreen(
      howToPlayView(
        parseTutorialRunId("event:dreamwell-continuity"),
        testTutorialActionId("dreamwell-how-to-play"),
        "Dreamwell guidance.",
        "immediate",
        { cardWidth: 500 },
      ),
      { onHowToPlayPresented },
    );

    const layer = container.querySelector<HTMLElement>(
      "[data-battle-dreamwell-layer]",
    );
    setRect(layer, { x: 100, y: 100, width: 360, height: 240 });
    setRect(container.querySelector("[data-tutorial-dreamwell-destination]"), {
      x: 500,
      y: 250,
      width: 360,
      height: 240,
    });
    let finishListener: EventListener | null = null;
    const cancel = vi.fn();
    const animate = vi.fn(
      (
        _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        _options?: number | KeyframeAnimationOptions,
      ) =>
        ({
          addEventListener: (
            type: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            if (type === "finish" && typeof listener === "function") {
              finishListener = listener;
            }
          },
          cancel,
        }) as unknown as Animation,
    );
    Object.defineProperty(layer, "animate", {
      configurable: true,
      value: animate,
    });

    act(() => screenMocks.sceneAnimationComplete?.());

    const [keyframes, options] = animate.mock.calls[0] ?? [];
    expect(keyframes).toEqual([
      { transform: "translate(-50%, -70%) scale(0.72)" },
      { transform: "translateX(-50%) translate(400px, 150px) scale(1)" },
    ]);
    expect(options).toMatchObject({ duration: 1_000, fill: "forwards" });
    expect(layer?.dataset.tutorialDreamwellEmergenceTarget).toBe(
      "paired-dialog",
    );
    expect(stagedVisibility(container, "staged")).toBe("hidden");

    act(() => finishListener?.(new Event("finish")));

    expect(stagedVisibility(container, "visible")).toBe("visible");
    expect(screenMocks.props?.view.dreamwell).toBeNull();
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:dreamwell-continuity",
      testTutorialActionId("dreamwell-how-to-play"),
      "immediate",
    );

    unmount();
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps a tutorial Dreamwell hidden until the opponent announcement completes", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    renderTutorialScreen(
      dreamwellDrawView(
        parseTutorialRunId("event:dreamwell"),
        testTutorialActionId("autumn-glade"),
        "enemy",
        testDreamwellCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
        { wait: 0.5 },
      ),
      { onActionComplete },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    expect(screenMocks.props?.view.dreamwell).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("player");
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("enemy");
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:dreamwell",
      testTutorialActionId("autumn-glade"),
    );
  });

  it("holds an emerged player Dreamwell card for its full reading time", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const { container } = renderTutorialScreen(
      dreamwellDrawView(
        parseTutorialRunId("event:voltsurge"),
        testTutorialActionId("player-voltsurge"),
        "player",
        testDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
        { wait: 0, revealDuration: 5 },
      ),
      { onActionComplete },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => screenMocks.props?.onTurnAnnouncementComplete?.("player"));
    expect(
      container.querySelector<HTMLElement>("[data-battle-dreamwell-layer]")
        ?.dataset.tutorialDreamwellEmergence,
    ).toBe("emerging");
    act(() => {
      vi.advanceTimersByTime(1_001);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:voltsurge",
      testTutorialActionId("player-voltsurge"),
    );
  });
});
