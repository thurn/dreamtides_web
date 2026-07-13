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
  const first = card(1);
  const second = card(2);
  return {
    siteId: "augury-site",
    scene: null,
    encounterSignature: "encounter-fixture",
    guide: {
      id: "aldric_the_seer",
      name: "Aldric, the Seer",
      art: artRef.dreamGuide("aldric_the_seer"),
    },
    offers: [
      {
        id: "A",
        ordinal: "I",
        headline: "Choose a Card",
        requiresSelection: true,
        visual: {
          kind: "cardChoices",
          doubled: false,
          choices: [
            {
              id: "choice-1",
              card: {
                id: first.id,
                model: { cardId: first.id, displaySnapshot: first },
              },
            },
          ],
        },
      },
      {
        id: "B",
        ordinal: "II",
        headline: "A New Card",
        requiresSelection: false,
        visual: {
          kind: "cards",
          cards: [
            {
              id: second.id,
              model: { cardId: second.id, displaySnapshot: second },
            },
          ],
        },
      },
    ],
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
  stubMatchMedia(true);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("DreamAugurySiteScreen", () => {
  it("stages Aldric between two equal choices under one explicit instruction", () => {
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    expect(container.textContent).toContain("Choose One");
    expect(container.querySelectorAll("[data-augury-offer]")).toHaveLength(2);
    expect(
      container
        .querySelector("[data-augury-guide]")
        ?.getAttribute("data-guide-id"),
    ).toBe("aldric_the_seer");
    expect(
      container.querySelectorAll('[data-glass-variant="accent"]'),
    ).toHaveLength(2);
  });

  it("requires an inner candidate pick, then confirms the selected offer", () => {
    const onChoose = vi.fn(() => ({ ok: true } as const));
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={onChoose} onClose={() => undefined} />,
    );
    const confirm = container.querySelector(
      '[data-testid="cumulus-dream-augury-confirm-A"]',
    );
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");

    click(container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'));
    click(confirm);
    expect(onChoose).toHaveBeenCalledWith("A", "choice-1");
  });

  it("confirms a direct offer without an inner selection", () => {
    const onChoose = vi.fn(() => ({ ok: true } as const));
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={onChoose} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-confirm-B"]',
      ),
    );
    expect(onChoose).toHaveBeenCalledWith("B", null);
  });
});
