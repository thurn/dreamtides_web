// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import { artRef } from "../primitives/art";
import { CumulusRoot } from "../CumulusRoot";
import { MENU_EDGE_INSET_MOBILE_PX } from "../primitives/chrome-geometry";
import { BattleStartScreen, type BattleStartView } from "./BattleStartScreen";
import { localizedDreamsignFixture } from "../test-helpers/dreamsign-fixture";
import { parseBattleId } from "../../types/identifiers";
import {
  testCardId,
  testDreamscapeId,
  testDreamsignId,
  testOpponentId,
} from "../../types/test-identities";
import { testPresentationId } from "../../types/test-identities";

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverStub;
  stubMatchMedia(true);
});

function stubMatchMedia(desktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

function makeView(): BattleStartView {
  const cards: CardData[] = Array.from({ length: 3 }, (_, index) => ({
    name: parseCardName(`Signature ${String(index + 1)}`),
    id: testCardId(
      `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    ),
    cardNumber: index + 1,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: index + 1,
    spark: index + 2,
    isFast: false,
    renderedText: "A stable test ability.",
    imageNumber: index + 1,
    artOwned: true,
  }));
  return {
    battleId: parseBattleId("battle-test"),
    scene: artRef.dreamscapeScene(testDreamscapeId("test_dreamscape")),
    avatar: {
      id: testOpponentId("opponent-uuid"),
      name: "Aeris, the Prism Guide",
      title: "Storm Archivist",
      imageNumber: "001",
      ability: "Whenever an event resolves, gain momentum.",
      abilityActive: true,
    },
    dreamsigns: [
      localizedDreamsignFixture({
        id: testDreamsignId("battle-test:dreamsign:0"),
        name: "Sign of Quiet Thunder",
        effectDescription: "The first event each turn costs 1 less.",
        imageName: "quiet-thunder.webp",
      }),
    ],
    signatureCards: cards.map((card) => ({
      cardId: card.id,
      model: { cardId: card.id, displaySnapshot: card },
    })),
    pointsToWin: 12,
    essenceReward: 80,
  };
}

function mount(view = makeView()): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <BattleStartScreen view={view} onBegin={vi.fn()} />
      </CumulusRoot>,
    );
  });
  return { container, root };
}

function expectDormantAbility(container: HTMLElement): void {
  const ability = container.querySelector(
    '[data-battle-start-panel-section="ability"]',
  );
  expect(ability?.textContent).not.toContain(
    "Whenever an event resolves, gain momentum.",
  );
  expect(ability?.textContent).not.toBe("");
}

describe("Cumulus BattleStartScreen", () => {
  it("renders the untouched scene, opponent, dense preview details, and stakes", () => {
    const view = makeView();
    const { container, root } = mount(view);

    expect(
      container.querySelector('[data-testid="cumulus-battle-start-scene"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-battle-start-panel]")).not.toBeNull();
    expect(
      container
        .querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent"),
    ).toBe(view.avatar.id);
    expect(container.querySelector("h1")?.textContent).not.toBe("");
    expect(container.querySelector("h1")?.textContent).not.toContain(
      view.avatar.id,
    );
    expect(
      container.querySelector(
        '[data-battle-start-panel-section="signature-cards"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-battle-start-panel-section="dreamsigns"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-battle-start-signature-objects]"),
    ).toBeNull();
    expect(container.querySelectorAll("[data-signature-card-id]")).toHaveLength(
      3,
    );
    expect(
      container.querySelectorAll(
        '[data-signature-card-id] [data-reveal-complete-game-card="true"]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelector('[data-battle-start-stake="reward"]')
        ?.textContent,
    ).toContain("80");
    const pointsValue = container.querySelector(
      '[data-battle-start-stake="points"] > div',
    );
    expect(pointsValue?.children[0]?.textContent).toBe("12");
    expect(pointsValue?.children[1]?.matches("[data-inline-glyph]")).toBe(true);
    expect(pointsValue?.children[1]?.querySelector("i")?.className).toContain(
      "bxf bx-star-circle",
    );

    act(() => root.unmount());
  });

  it("uses the accented glass action and reports begin", () => {
    const onBegin = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleStartScreen view={makeView()} onBegin={onBegin} />
        </CumulusRoot>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-begin"]',
    );
    expect(button?.getAttribute("data-glass-placement")).toBe("onGlass");
    expect(button?.getAttribute("data-glass-variant")).toBe("accent");
    act(() => button?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("reveals first-battle Mira guidance one second after the screen loads", () => {
    vi.useFakeTimers();
    const onGuideDialogueShown = vi.fn();
    const view: BattleStartView = {
      ...makeView(),
      guideDialogue: {
        id: testPresentationId("first-battle-guidance"),
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "Before each dream battle, you can view cards from your opponent's deck and see the ⍟ required to win",
        },
        delaySeconds: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
      },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleStartScreen
            view={view}
            onBegin={vi.fn()}
            onGuideDialogueShown={onGuideDialogueShown}
          />
        </CumulusRoot>,
      );
    });

    const dialogue = () =>
      container.querySelector<HTMLElement>(
        '[data-testid="battle-start-tutorial-dialogue"]',
      );
    expect(dialogue()?.dataset.characterDialogueVisible).toBe("false");
    expect(onGuideDialogueShown).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(dialogue()?.dataset.characterDialogueVisible).toBe("false");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dialogue()?.dataset.characterDialogueVisible).toBe("true");
    expect(dialogue()?.textContent).toContain(
      "Before each dream battle, you can view cards from your opponent's deck and see the",
    );
    expect(dialogue()?.querySelector("[data-inline-glyph]")).not.toBeNull();
    expect(dialogue()?.textContent).toContain("required to win");
    expect(onGuideDialogueShown).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("shows the complete desktop dossier in one compact mobile glass panel", () => {
    stubMatchMedia(false);
    const onBegin = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleStartScreen view={makeView()} onBegin={onBegin} />
        </CumulusRoot>,
      );
    });

    const layout = container.querySelector<HTMLElement>(
      '[data-battle-start-layout="mobile"]',
    );
    expect(layout).not.toBeNull();
    const panel = layout?.querySelector<HTMLElement>(
      "[data-battle-start-panel]",
    );
    expect(panel?.style.position).toBe("absolute");
    expect(panel?.style.top).toBe("");
    expect(panel?.style.bottom).toBe(
      JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
    );
    expect(panel?.style.left).toBe("var(--space-s)");
    expect(panel?.style.width).toBe("calc(100vw - (var(--space-s) * 2))");
    expect(panel?.style.maxHeight).toBe(
      `calc(100dvh - ${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE} - var(--space-s))`,
    );
    expect(panel?.style.alignSelf).toBe("");
    expect(panel?.style.justifySelf).toBe("");
    expect(panel?.style.justifyContent).toBe("");
    expect(panel?.getAttribute("data-battle-start-panel-density")).toBe(
      "compact",
    );
    expect(
      layout?.querySelector("[data-battle-start-opponent]"),
    ).not.toBeNull();
    expect(
      layout
        ?.querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent-framing"),
    ).toBe("cutout");
    const opponent = layout?.querySelector<HTMLElement>(
      "[data-battle-start-opponent]",
    );
    expect(opponent?.style.left).toBe(
      `max(var(--safe-area-inset-left), ${String(MENU_EDGE_INSET_MOBILE_PX)}px)`,
    );
    expect(opponent?.style.bottom).toBe(
      JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
    );
    expect(panel?.textContent).toContain("Aeris, the Prism Guide");
    expect(panel?.textContent).toContain("Storm Archivist");
    expect(
      panel?.querySelector('[data-battle-start-panel-section="ability"]')
        ?.textContent,
    ).toContain(
      "Whenever an event resolves, gain momentum.",
    );
    const objectSection = panel?.querySelector<HTMLElement>(
      "[data-battle-start-signature-objects]",
    );
    expect(
      objectSection?.querySelectorAll("[data-signature-card-id]"),
    ).toHaveLength(3);
    expect(
      objectSection?.querySelectorAll(
        '[data-reveal-complete-game-card="true"]',
      ),
    ).toHaveLength(3);
    expect(
      objectSection?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(1);
    expect(
      panel?.querySelector('[data-battle-start-panel-section="dreamsigns"]'),
    ).toBeNull();
    expect(
      panel?.querySelector('[data-battle-start-stake="points"]'),
    ).not.toBeNull();
    expect(
      panel?.querySelector('[data-battle-start-stake="reward"]'),
    ).not.toBeNull();
    expect(
      panel?.querySelector('[data-testid="cumulus-battle-start-begin"]'),
    ).not.toBeNull();
    expect(
      layout?.querySelector('[data-testid^="cumulus-battle-start-carousel-"]'),
    ).toBeNull();
    const action = panel?.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-begin"]',
    );
    expect(action?.getAttribute("data-glass-variant")).toBe("accent");
    expect(action?.getAttribute("data-glass-placement")).toBe("onGlass");
    act(() => action?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("relabels the combined object section when no Dreamsigns are present", () => {
    stubMatchMedia(false);
    const view = makeView();
    const sectionLabel = (container: HTMLElement) =>
      container.querySelector("[data-battle-start-signature-objects]")
        ?.previousElementSibling?.textContent ?? "";
    const withDreamsigns = mount(view);
    const combinedLabel = sectionLabel(withDreamsigns.container);
    act(() => withDreamsigns.root.unmount());
    const { container, root } = mount({ ...view, dreamsigns: [] });

    const objectSection = container.querySelector<HTMLElement>(
      "[data-battle-start-signature-objects]",
    );
    expect(combinedLabel).not.toBe("");
    expect(sectionLabel(container)).not.toBe("");
    expect(sectionLabel(container)).not.toBe(combinedLabel);
    expect(
      objectSection?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(0);

    act(() => root.unmount());
  });

  it("replaces the ability text in the mobile briefing while it is dormant", () => {
    stubMatchMedia(false);
    const view = makeView();
    const { container, root } = mount({
      ...view,
      avatar: { ...view.avatar, abilityActive: false },
    });

    expectDormantAbility(container);

    act(() => root.unmount());
  });

  it("replaces the ability text while the opponent ability is dormant", () => {
    const view = makeView();
    const { container, root } = mount({
      ...view,
      avatar: { ...view.avatar, abilityActive: false },
    });
    expectDormantAbility(container);
    act(() => root.unmount());
  });
});
