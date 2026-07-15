// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { artRef } from "../primitives/art";
import { CumulusRoot } from "../CumulusRoot";
import {
  DreamAugurySiteScreen,
  type DreamAugurySiteView,
} from "./DreamAugurySiteScreen";

vi.mock("../components/card/CardView", async () => {
  const { Pressable } = await import("../primitives/Pressable");
  return {
    CardView: ({ card }: { card: { id: string } }) => (
      <div data-card-view-id={card.id} />
    ),
    GameCard: ({
      model,
      onActivate,
      selected,
      testId,
    }: {
      model: { cardId: string };
      onActivate?: () => void;
      selected?: boolean;
      testId?: string;
    }) => (
      <Pressable
        as="button"
        data-testid={testId}
        data-card-id={model.cardId}
        data-selected={selected ? "true" : "false"}
        onClick={onActivate}
      />
    ),
  };
});

const roots: Root[] = [];

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function card(index: number): CardData {
  return {
    id: asCardId(`81000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    name: asCardName(`Fixture ${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
}

function view(): DreamAugurySiteView {
  const choices = [card(1), card(2), card(3), card(4)];
  const direct = card(5);
  return {
    siteId: "augury-site",
    scene: null,
    encounterSignature: "encounter-fixture",
    guide: {
      id: "aldric_the_seer",
      name: "Aldric, the Seer",
      line: "Choose one path for your dream.",
      art: artRef.dreamGuide("aldric_the_seer"),
    },
    offers: [
      {
        id: "A",
        headline: "Choose a Card",
        requiresSelection: true,
        tile: {
          id: "encounter-fixture:A",
          kind: "card-draft",
          cards: choices.map((choice) => ({ cardId: choice.id, displaySnapshot: choice })) as never,
        },
        visual: {
          kind: "cardChoices",
          doubled: false,
          choices: choices.map((choice, index) => ({
            id: `choice-${String(index + 1)}`,
            card: {
              id: choice.id,
              model: { cardId: choice.id, displaySnapshot: choice },
            },
          })),
        },
      },
      {
        id: "B",
        headline: "A New Card",
        requiresSelection: false,
        tile: {
          id: "encounter-fixture:B",
          kind: "card-gift",
          card: { cardId: direct.id, displaySnapshot: direct },
        },
        visual: {
          kind: "cards",
          cards: [
            {
              id: direct.id,
              model: { cardId: direct.id, displaySnapshot: direct },
            },
          ],
        },
      },
    ],
    unavailableMessage: null,
  };
}

function mount(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return container;
}

function click(element: Element | null): void {
  if (!(element instanceof HTMLElement)) throw new Error("missing element");
  act(() => element.click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  stubMatchMedia(true);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("DreamAugurySiteScreen", () => {
  it("stages two offer tiles with Aldric's instruction and decline action", () => {
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    expect(
      container.querySelector<HTMLElement>("[data-augury-phase]")?.dataset.auguryPhase,
    ).toBe("comparison");
    expect(container.textContent).not.toContain("Dream Augury");
    expect(container.querySelectorAll("[data-offer-tile]")).toHaveLength(2);
    expect(
      container
        .querySelector("[data-guide-gallery-guide]")
        ?.getAttribute("data-guide-id"),
    ).toBe("aldric_the_seer");
    expect(container.textContent).toContain("Choose one path for your dream.");
    expect(container.querySelector('[data-testid="cumulus-dream-augury-decline"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(0);
    expect(
      container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-detail"]'),
    ).toBeNull();
  });

  it("opens one vision before exposing its detailed candidate pick", () => {
    const onInspectOffer = vi.fn();
    const container = mount(
      <DreamAugurySiteScreen
        view={view()}
        onInspectOffer={onInspectOffer}
        onChoose={() => ({ ok: true })}
        onClose={() => undefined}
      />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );

    expect(onInspectOffer).toHaveBeenCalledWith("A");
    expect(
      container.querySelector<HTMLElement>("[data-augury-phase]")?.dataset.auguryPhase,
    ).toBe("detail");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-dream-augury-detail"]',
      )?.dataset.offerId,
    ).toBe("A");
    expect(container.querySelectorAll("[data-offer-tile]")).toHaveLength(0);
    expect(container.querySelector('[data-testid="cumulus-dream-augury-speech"]')).toBeNull();
    expect(container.querySelector('[data-testid="cumulus-dream-augury-guide-art"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-offer-B"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid^="cumulus-augury-choice-"]'),
    ).toHaveLength(4);
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-choose-again"]'),
    ).not.toBeNull();
  });

  it("requires an inner candidate pick in detail, then confirms the selected offer", () => {
    const onChoose = vi.fn(() => ({ ok: true } as const));
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={onChoose} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );
    const confirm = container.querySelector(
      '[data-testid="cumulus-dream-augury-confirm-A"]',
    );
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");

    click(container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'));
    click(confirm);
    expect(onChoose).toHaveBeenCalledWith("A", "choice-1");
  });

  it("previews a direct offer before enabling its separate confirmation", () => {
    const onChoose = vi.fn(() => ({ ok: true } as const));
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={onChoose} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-B"]',
      ),
    );
    expect(onChoose).not.toHaveBeenCalled();
    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-confirm-B"]',
      ),
    );
    expect(onChoose).toHaveBeenCalledWith("B", null);
  });

  it("returns to both previews and clears an abandoned inner choice", () => {
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );
    click(
      container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'),
    );
    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-choose-again"]',
      ),
    );
    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );

    expect(
      container
        .querySelector('[data-testid="cumulus-augury-choice-choice-1"]')
        ?.getAttribute("data-selected"),
    ).toBe("false");
    expect(
      container
        .querySelector('[data-testid="cumulus-dream-augury-confirm-A"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("declines from the initial state", () => {
    const onClose = vi.fn();
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={onClose} />,
    );
    click(container.querySelector('[data-testid="cumulus-dream-augury-decline"]'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps rejected-action feedback inside the selected detail panel", () => {
    const container = mount(
      <DreamAugurySiteScreen
        view={view()}
        onChoose={() => ({ ok: false, message: "The visions shifted. Choose again." })}
        onClose={() => undefined}
      />,
    );
    click(container.querySelector('[data-testid="cumulus-dream-augury-offer-B"]'));
    click(container.querySelector('[data-testid="cumulus-dream-augury-confirm-B"]'));
    expect(container.querySelector('[data-testid="cumulus-dream-augury-error"]')?.textContent).toBe(
      "The visions shifted. Choose again.",
    );
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(1);
  });

  it("shows Aldric's unavailable explanation with one exit action", () => {
    const unavailable = {
      ...view(),
      encounterSignature: null,
      offers: [],
      unavailableMessage: "The visions are clouded. Walk on for now.",
    };
    const container = mount(
      <DreamAugurySiteScreen view={unavailable} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );
    expect(container.textContent).toContain("The visions are clouded. Walk on for now.");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("[data-glass-panel-frame]")).toBeNull();
  });
});
