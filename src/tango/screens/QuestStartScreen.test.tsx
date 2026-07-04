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
    signatureCards: [{ id: "sig-1-0", name: "Lantern Seer" }],
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
      { id: "tide-01", label: "Ember Rush", description: "Aggressive early pressure.", tide: "ember" },
      { id: "tide-02", label: "Verdant Growth", description: "Ramps into large threats.", tide: "wild" },
    ],
  },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("Tango QuestStartScreen (carousel)", () => {
  it("renders a page with identity, essence, and a Choose action per Dreamcaller", () => {
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={vi.fn()} />,
    );

    expect(container.textContent).toContain("Choose Your Dreamcaller");
    for (const dc of OFFERED) {
      expect(
        container.querySelector(`[data-dreamcaller-page="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-choose-dreamcaller="${dc.id}"]`),
      ).not.toBeNull();
      const essence = container.querySelector(
        `[data-starting-essence-value="${dc.id}"]`,
      );
      expect(essence?.textContent).toContain(String(dc.startingEssence));
    }

    act(() => {
      root.unmount();
    });
  });

  it("shows the tides cluster only for Dreamcallers that have tides", () => {
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={vi.fn()} />,
    );

    // caller-1 has no tides → no cluster.
    expect(
      container.querySelector(`[data-dreamcaller-tides="caller-1"]`),
    ).toBeNull();

    // caller-2 has two tides → cluster with two collapsed discs.
    const cluster = container.querySelector(
      `[data-dreamcaller-tides="caller-2"]`,
    );
    expect(cluster).not.toBeNull();
    expect(cluster?.querySelectorAll("[data-tide-disc]")).toHaveLength(2);

    act(() => {
      root.unmount();
    });
  });

  it("calls onPick with the Dreamcaller's id when its Choose action is pressed", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={onPick} />,
    );

    const button = container.querySelector<HTMLButtonElement>(
      `[data-choose-dreamcaller="caller-2"] button`,
    );
    if (button === null) {
      throw new Error("Missing Choose button");
    }
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledWith("caller-2");

    act(() => {
      root.unmount();
    });
  });
});
