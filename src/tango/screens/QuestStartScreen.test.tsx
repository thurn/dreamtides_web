// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QuestStartScreen,
  type DreamcallerOfferView,
} from "./QuestStartScreen";

const OFFERED: DreamcallerOfferView[] = [
  {
    id: "caller-1",
    name: "Mira of Lanterns",
    title: "Keeper of the Threshold Flame",
    imageNumber: "0009",
    renderedText: "First dreamcaller.",
    startingEssence: 230,
    signatureCards: [
      { id: "sig-1-0", name: "Lantern Seer" },
      { id: "sig-1-1", name: "Banner Captain" },
    ],
    tides: [],
  },
  {
    id: "caller-2",
    name: "Vey of Embers",
    title: "The Ashen Cartographer",
    imageNumber: "0010",
    renderedText: "Second dreamcaller.",
    startingEssence: 250,
    signatureCards: [],
    tides: [
      {
        id: "tide-fac-01",
        label: "Ember Rush",
        description: "Aggressive early pressure.",
        tide: "ember",
      },
      {
        id: "tide-fac-02",
        label: "Verdant Growth",
        description: "Ramps into large threats.",
        tide: "wild",
      },
    ],
  },
];

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom exposes no `matchMedia`; the Pressable primitive reads it for the
  // reduced-motion preference. Stub a no-match query so the card renders.
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Tango QuestStartScreen", () => {
  it("renders a pickable card per Dreamcaller with its identity and essence", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={onPick} />,
    );

    expect(container.textContent).toContain("Choose Your Dreamcaller");
    expect(container.textContent).toContain("Mira of Lanterns");
    expect(container.textContent).toContain("Vey of Embers");
    // One pickable card button per offered Dreamcaller.
    expect(container.querySelectorAll("button")).toHaveLength(OFFERED.length);

    for (const dreamcaller of OFFERED) {
      const value = container.querySelector(
        `[data-starting-essence-value="${dreamcaller.id}"]`,
      );
      expect(value?.textContent).toContain(String(dreamcaller.startingEssence));
    }

    act(() => {
      root.unmount();
    });
  });

  it("shows signature cards, or tides in their place, per Dreamcaller", () => {
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={vi.fn()} />,
    );

    // Caller 1: signature cards, no tides section.
    expect(
      container.querySelector(`[data-signature-cards-label="caller-1"]`),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        `[data-dreamcaller-signature-card^="caller-1:"]`,
      ),
    ).toHaveLength(2);
    expect(container.textContent).toContain("Lantern Seer");
    expect(
      container.querySelector(`[data-dreamcaller-tides="caller-1"]`),
    ).toBeNull();

    // Caller 2: tides shown, no signature-cards section.
    expect(
      container.querySelector(`[data-dreamcaller-tides="caller-2"]`),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(`[data-dreamcaller-tide^="caller-2:"]`),
    ).toHaveLength(2);
    expect(container.textContent).toContain("Ember Rush");
    expect(
      container.querySelector(`[data-signature-cards-label="caller-2"]`),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("calls onPick with the Dreamcaller's id when its card is pressed", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={onPick} />,
    );

    const secondCard = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Vey of Embers"),
    );
    if (secondCard === undefined) {
      throw new Error("Missing Dreamcaller card button");
    }

    act(() => {
      secondCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledWith("caller-2");

    act(() => {
      root.unmount();
    });
  });
});
