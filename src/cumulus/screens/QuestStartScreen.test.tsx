// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QuestStartScreen,
  type DreamcallerOfferView,
} from "./QuestStartScreen";
import { CumulusRoot } from "../CumulusRoot";
import { lookupGlossaryTerm } from "../../data/glossary";

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

/** Stub matchMedia so the desktop breakpoint (`min-width`) reports `desktop`,
 * driving the screen onto its side-by-side layout. */
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
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Default to the mobile carousel; desktop tests opt in via stubViewport(true).
  stubViewport(false);
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

describe("Cumulus QuestStartScreen (carousel)", () => {
  it("renders a page with identity, essence, and a Choose action per Dreamcaller", () => {
    const { container, root } = mount(
      <QuestStartScreen
        dreamcallers={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Choose Your Dreamcaller");
    for (const dc of OFFERED) {
      expect(
        container.querySelector(`[data-dreamcaller-page="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-choose-dreamcaller="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(
          `[data-choose-dreamcaller="${dc.id}"] [data-glass-variant="accent"]`,
        ),
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
      <QuestStartScreen
        dreamcallers={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
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
      <QuestStartScreen
        dreamcallers={OFFERED}
        onPick={onPick}
        onReroll={vi.fn()}
      />,
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

  it("renders the top-right reroll icon and reports its debug action", () => {
    const onReroll = vi.fn();
    const { container, root } = mount(
      <QuestStartScreen
        dreamcallers={OFFERED}
        onPick={vi.fn()}
        onReroll={onReroll}
      />,
    );

    const control = container.querySelector<HTMLElement>(
      "[data-dreamcaller-reroll-control]",
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="reroll-dreamcallers"]',
    );
    expect(control?.style.position).toBe("absolute");
    expect(control?.style.right).not.toBe("");
    expect(button?.getAttribute("aria-label")).toBe("Reroll Dreamcallers");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onReroll).toHaveBeenCalledOnce();

    act(() => {
      root.unmount();
    });
  });

  it("reveals every defined term from the whole Dreamcaller ability box", () => {
    const reclaim = lookupGlossaryTerm("reclaim");
    const bane = lookupGlossaryTerm("bane");
    if (reclaim === undefined || bane === undefined) {
      throw new Error("Expected representative glossary fixtures");
    }
    const ability = `Reclaim a bane, then ${reclaim.variants?.[0] ?? "reclaim"} it.`;
    const dreamcaller = { ...OFFERED[0], renderedText: ability };
    const { container, root } = mount(
      <QuestStartScreen
        dreamcallers={[dreamcaller]}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    const source = container.querySelector<HTMLElement>(
      `[data-dreamcaller-ability="${dreamcaller.id}"]`,
    );
    expect(source?.dataset.revealPrimaryVariant).toBe("source");
    expect(source?.dataset.revealSecondaryTitles).toBe(
      [reclaim.term, bane.term].join("\u001f"),
    );
    expect(source?.querySelector("[data-glossary-term]")).toBeNull();

    const description = document.querySelector(
      "[data-cumulus-reveal-descriptions]",
    )?.textContent;
    expect(description).toContain(reclaim.definition);
    expect(description).toContain(bane.definition);

    act(() => {
      source?.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
    });
    expect(source?.dataset.revealActive).toBe("true");

    act(() => {
      root.unmount();
    });
  });
});

describe("Cumulus QuestStartScreen (desktop)", () => {
  beforeEach(() => {
    stubViewport(true);
  });

  it("renders every Dreamcaller as a standalone column, not a carousel", () => {
    const { container, root } = mount(
      <QuestStartScreen
        dreamcallers={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Choose Your Dreamcaller");
    // No carousel pages on desktop.
    expect(container.querySelector("[data-dreamcaller-page]")).toBeNull();
    for (const dc of OFFERED) {
      expect(
        container.querySelector(`[data-dreamcaller-column="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-choose-dreamcaller="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(
          `[data-choose-dreamcaller="${dc.id}"] [data-glass-variant="accent"]`,
        ),
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

  it("shows a hover-only tide disc per tide for tided Dreamcallers", () => {
    const { container, root } = mount(
      <QuestStartScreen
        dreamcallers={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    // caller-1 has no tides → no tides node.
    expect(
      container.querySelector(`[data-dreamcaller-tides="caller-1"]`),
    ).toBeNull();

    // caller-2 has two tides → one hover-only disc per tide (no expand/collapse).
    const tides = container.querySelector(
      `[data-dreamcaller-tides="caller-2"]`,
    );
    expect(tides).not.toBeNull();
    expect(tides?.querySelectorAll("[data-tide-disc]")).toHaveLength(2);

    act(() => {
      root.unmount();
    });
  });
});
