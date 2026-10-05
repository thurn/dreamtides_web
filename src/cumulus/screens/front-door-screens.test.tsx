// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOADING_SCREEN_DURATION_MS } from "../../runtime/front-door-timing";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import {
  testAvatarId,
  testCardId,
  testPresentationId,
  testTideId,
} from "../../types/test-identities";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { renderInCumulus } from "../testing/render";
import {
  ApplicationStateScreen,
  type ApplicationStateView,
} from "./ApplicationStateScreen";
import { JourneyStartScreen, type AvatarOfferView } from "./JourneyStartScreen";
import { LoadingScreen, type LoadingView } from "./LoadingScreen";
import { MainMenuScreen, type MainMenuView } from "./MainMenuScreen";
import {
  PackageDebugDialog,
  type PackageDebugView,
} from "./PackageDebugDialog";

/** `desktop` answers the `min-width` breakpoint queries. */
function stubViewport(desktop: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width") ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  stubViewport(false);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function click(element: Element | null | undefined): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function fixtureCard(
  idSeed: string,
  cardNumber: number,
  cardType: CardData["cardType"],
): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName(`Fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: cardType === "Character" ? "Warrior" : "",
    isStarter: true,
    energyCost: cardNumber,
    spark: cardType === "Character" ? 3 : null,
    isFast: false,
    renderedText: "Fixture ability.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

describe("JourneyStartScreen", () => {
  const OFFERED: AvatarOfferView[] = [
    {
      id: testAvatarId("caller-1"),
      name: "Mira of Lanterns",
      title: "Keeper of the Threshold Flame",
      imageNumber: "0009",
      renderedText: "First avatar.",
      startingEssence: 230,
      signatureCards: [{ id: testCardId("sig-1-0"), name: "Lantern Seer" }],
      tides: [],
    },
    {
      id: testAvatarId("caller-2"),
      name: "Vey of Embers",
      title: "The Ashen Cartographer",
      imageNumber: "0010",
      renderedText: "Second avatar.",
      startingEssence: 250,
      signatureCards: [],
      tides: [
        {
          id: testTideId("tide-01"),
          label: "Ember Rush",
          description: "Aggressive early pressure.",
          tide: "ember",
        },
        {
          id: testTideId("tide-02"),
          label: "Verdant Growth",
          description: "Ramps into large threats.",
          tide: "wild",
        },
      ],
    },
  ];

  function swipeLeft(target: Element): void {
    const event = (type: string, clientX: number) =>
      new MouseEvent(type, { bubbles: true, clientX, clientY: 300 });
    act(() => {
      target.dispatchEvent(event("pointerdown", 300));
    });
    act(() => {
      target.dispatchEvent(event("pointermove", 100));
    });
    act(() => {
      target.dispatchEvent(event("pointerup", 100));
    });
  }

  it("swipes the mobile carousel to the next Avatar and picks it by id", () => {
    const onPick = vi.fn();
    const onReroll = vi.fn();
    const { container } = renderInCumulus(
      <JourneyStartScreen
        avatars={OFFERED}
        onPick={onPick}
        onReroll={onReroll}
      />,
    );

    for (const avatar of OFFERED) {
      expect(
        container.querySelector(`[data-avatar-page="${avatar.id}"]`),
      ).not.toBeNull();
    }
    expect(
      container.querySelector(`[data-avatar-console="${OFFERED[0].id}"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-avatar-tides="${OFFERED[0].id}"]`),
    ).toBeNull();

    swipeLeft(
      container.querySelector(`[data-avatar-page="${OFFERED[0].id}"]`)!,
    );
    expect(
      container.querySelector(`[data-avatar-console="${OFFERED[1].id}"]`),
    ).not.toBeNull();
    expect(
      container
        .querySelector(`[data-avatar-tides="${OFFERED[1].id}"]`)
        ?.querySelectorAll("[data-tide-disc]"),
    ).toHaveLength(2);

    click(
      container.querySelector(`[data-choose-avatar="${OFFERED[1].id}"] button`),
    );
    expect(onPick).toHaveBeenCalledWith(OFFERED[1].id);
    click(container.querySelector('[data-testid="reroll-avatars"]'));
    expect(onReroll).toHaveBeenCalledOnce();
  });

  it("shows a single tutorial Avatar with guidance and no reroll control", () => {
    const { container } = renderInCumulus(
      <JourneyStartScreen
        avatars={[OFFERED[0]]}
        guideDialogue={{
          id: testPresentationId("journey-start-guide-dialogue"),
          model: {
            portrait: { kind: "character-portrait", characterId: "mira" },
            portraitAlt: "Mira",
            speakerName: "Mira",
            text: "Choose an Avatar.",
          },
          horizontalOffset: 30,
          verticalOffset: 10,
          bubbleWidth: 500,
        }}
        onPick={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("[data-avatar-page]")).toHaveLength(1);
    expect(container.querySelector("[data-avatar-reroll-control]")).toBeNull();
    expect(
      container
        .querySelector('[data-testid="journey-start-tutorial-dialogue"]')
        ?.getAttribute("data-character-dialogue-visible"),
    ).toBe("true");
  });

  it("renders every Avatar as a desktop column with its own choose action", () => {
    stubViewport(true);
    const onPick = vi.fn();
    const { container } = renderInCumulus(
      <JourneyStartScreen
        avatars={OFFERED}
        onPick={onPick}
        onReroll={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-avatar-page]")).toBeNull();
    for (const avatar of OFFERED) {
      expect(
        container.querySelector(`[data-avatar-column="${avatar.id}"]`),
      ).not.toBeNull();
    }
    expect(
      container
        .querySelector(`[data-avatar-tides="${OFFERED[1].id}"]`)
        ?.querySelectorAll("[data-tide-disc]"),
    ).toHaveLength(2);
    click(
      container.querySelector(`[data-choose-avatar="${OFFERED[0].id}"] button`),
    );
    expect(onPick).toHaveBeenCalledWith(OFFERED[0].id);
  });
});

describe("MainMenuScreen", () => {
  const VIEW: MainMenuView = {
    title: "Dreamtides",
    background: artRef.mainMenuBackground(),
    actions: [
      { id: "new-journey", label: "New Journey" },
      { id: "dream-codex", label: "Dream Codex" },
      { id: "settings", label: "Settings" },
      { id: "about", label: "About" },
      { id: "quit", label: "Quit" },
    ],
    socials: [
      { id: "github", label: "GitHub", glyph: GLYPHS.github },
      { id: "discord", label: "Discord", glyph: GLYPHS.discord },
      { id: "reddit", label: "Reddit", glyph: GLYPHS.reddit },
    ],
  };

  it("renders every action and reports menu and social activation by stable ids", () => {
    const onAction = vi.fn();
    const onSocial = vi.fn();
    const { container } = renderInCumulus(
      <MainMenuScreen view={VIEW} onAction={onAction} onSocial={onSocial} />,
    );

    expect(container.querySelector("[data-main-menu-title]")).not.toBeNull();
    expect(
      container.querySelectorAll("[data-main-menu-actions] button"),
    ).toHaveLength(VIEW.actions.length);
    click(
      container.querySelector('[data-testid="main-menu-action-dream-codex"]'),
    );
    click(container.querySelector('[data-testid="main-menu-social-reddit"]'));
    expect(onAction).toHaveBeenCalledWith("dream-codex");
    expect(onSocial).toHaveBeenCalledWith("reddit");
  });
});

describe("LoadingScreen", () => {
  const CHARACTER = fixtureCard(
    "11111111-1111-4111-8111-111111111111",
    1,
    "Character",
  );
  const EVENT = fixtureCard("22222222-2222-4222-8222-222222222222", 2, "Event");
  const VIEW: LoadingView = {
    loadingCharacter: { cardId: CHARACTER.id, displaySnapshot: CHARACTER },
    loadingEvent: { cardId: EVENT.id, displaySnapshot: EVENT },
  };

  it("anchors the four callouts to the rendered card regions", () => {
    const { container } = renderInCumulus(
      <LoadingScreen view={VIEW} playbackSpeed={1} onBegin={vi.fn()} />,
    );
    const character = container.querySelector(
      '[data-loading-card-group="loadingCharacter"]',
    );
    const event = container.querySelector(
      '[data-loading-card-group="loadingEvent"]',
    );

    expect(
      character?.querySelector(`[data-card-id="${CHARACTER.id}"]`),
    ).not.toBeNull();
    expect(event?.querySelector(`[data-card-id="${EVENT.id}"]`)).not.toBeNull();
    expect(
      [
        ...container.querySelectorAll<HTMLElement>("[data-loading-callout]"),
      ].map((callout) => callout.dataset.loadingCallout),
    ).toEqual(["cost", "spark", "ability", "cardType"]);
    expect(
      character?.querySelector('[data-card-stat="energy"]'),
    ).not.toBeNull();
    expect(character?.querySelector('[data-card-stat="spark"]')).not.toBeNull();
    expect(character?.querySelector("[data-card-rules-text]")).not.toBeNull();
    expect(event?.querySelector("[data-card-type-line]")).not.toBeNull();
    expect(event?.querySelector('[data-card-stat="spark"]')).toBeNull();
  });

  it("replaces the loading indicator with Begin after the playback-scaled duration", () => {
    vi.useFakeTimers();
    const onBegin = vi.fn();
    const playbackSpeed = 4;
    const { container } = renderInCumulus(
      <LoadingScreen
        view={VIEW}
        playbackSpeed={playbackSpeed}
        onBegin={onBegin}
      />,
    );
    const begin = () =>
      container.querySelector<HTMLButtonElement>(
        '[data-testid="loading-begin"]',
      );

    act(() => {
      vi.advanceTimersByTime(LOADING_SCREEN_DURATION_MS / playbackSpeed - 1);
    });
    expect(container.querySelector("[data-loading-indicator]")).not.toBeNull();
    expect(begin()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector("[data-loading-indicator]")).toBeNull();
    expect(begin()?.closest("[data-loading-footer]")).not.toBeNull();
    act(() => begin()?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);
  });
});

describe("ApplicationStateScreen", () => {
  const COPY = "Synthetic application-state copy";

  it("renders every strict application state", () => {
    const views: ApplicationStateView[] = [
      { kind: "loading", title: COPY, message: COPY, busyLabel: COPY },
      { kind: "roomCreation", title: COPY, message: COPY, busyLabel: COPY },
      { kind: "recoverableError", title: COPY, message: COPY },
      { kind: "fatalConfiguration", title: COPY, message: COPY },
      { kind: "versionGate", title: COPY, message: COPY },
      { kind: "contentConfigGate", title: COPY, message: COPY, comparison: [] },
      { kind: "unreadableRoom", title: COPY, message: COPY },
      { kind: "unreachableRoom", title: COPY, message: COPY },
    ];
    for (const view of views) {
      const { container, unmount } = renderInCumulus(
        <ApplicationStateScreen view={view} />,
      );
      expect(
        container.querySelector(`[data-application-state="${view.kind}"]`),
      ).not.toBeNull();
      unmount();
    }
  });

  it("renders structured comparisons and reports actions through callbacks", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <ApplicationStateScreen
        view={{
          kind: "contentConfigGate",
          title: COPY,
          message: COPY,
          comparison: [
            {
              id: "atlas",
              label: COPY,
              expected: { kind: "raw", value: "Room" },
              actual: { kind: "raw", value: "Local" },
              differs: true,
            },
          ],
          actions: [{ id: "primary", label: COPY, onPress }],
        }}
      />,
    );
    expect(
      container.querySelector("[data-application-state-comparison]"),
    ).not.toBeNull();
    click(
      container.querySelector("[data-testid=application-state-action-primary]"),
    );
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe("PackageDebugDialog", () => {
  const EMPTY_VIEW: PackageDebugView = {
    values: [],
    avatar: null,
    validation: [],
    remainingDreamsigns: [],
    spentDreamsigns: [],
    currentOffer: [],
    topRemainingCards: [],
  };

  it("offers portable save and load actions", () => {
    const onSave = vi.fn();
    const onLoad = vi.fn();
    const { container } = renderInCumulus(
      <PackageDebugDialog
        isOpen
        view={EMPTY_VIEW}
        saveName="before atlas"
        saveStatus={null}
        saveError={null}
        busy={false}
        canSave
        canLoad
        canForceLegendaryOffer={false}
        onClose={vi.fn()}
        onSaveNameChange={vi.fn()}
        onSave={onSave}
        onLoad={onLoad}
        onForceLegendaryOffer={vi.fn()}
      />,
    );

    expect(
      container.querySelector("[data-package-debug-save-file]"),
    ).not.toBeNull();
    click(container.querySelector('[data-testid="debug-save-journey"]'));
    click(container.querySelector('[data-testid="debug-load-journey"]'));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onLoad).toHaveBeenCalledOnce();
  });
});
