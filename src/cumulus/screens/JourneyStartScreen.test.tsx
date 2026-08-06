// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JourneyStartScreen,
  type DreamAvatarOfferView,
} from "./JourneyStartScreen";
import { CumulusRoot } from "../CumulusRoot";
import { lookupGlossaryTerm } from "../../data/glossary";

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

const OFFERED: DreamAvatarOfferView[] = [
  {
    id: "caller-1",
    name: "Mira of Lanterns",
    title: "Keeper of the Threshold Flame",
    imageNumber: "0009",
    renderedText: "First dreamAvatar.",
    startingEssence: 230,
    signatureCards: [{ id: "sig-1-0", name: "Lantern Seer" }],
    tides: [],
  },
  {
    id: "caller-2",
    name: "Vey of Embers",
    title: "The Ashen Cartographer",
    imageNumber: "0010",
    renderedText: "Second dreamAvatar.",
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
  globalThis.ResizeObserver = ResizeObserverStub;
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

describe("Cumulus JourneyStartScreen (carousel)", () => {
  it("renders every portrait page and a glass console for the active DreamAvatar", () => {
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Choose Your Avatar");
    expect(container.innerHTML).not.toMatch(
      new RegExp(["dream", "caller"].join(""), "i"),
    );
    for (const dc of OFFERED) {
      expect(
        container.querySelector(`[data-dream-avatar-page="${dc.id}"]`),
      ).not.toBeNull();
    }
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(
      1,
    );
    expect(
      container.querySelector('[data-dream-avatar-console="caller-1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-choose-dream-avatar="caller-1"] [data-glass-placement="onGlass"]',
      ),
    ).not.toBeNull();
    const essence = container.querySelector(
      '[data-starting-essence-value="caller-1"]',
    );
    expect(essence?.textContent).toContain(String(OFFERED[0].startingEssence));

    act(() => {
      root.unmount();
    });
  });

  it("shows the tides cluster only for DreamAvatars that have tides", () => {
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    // caller-1 has no tides → no cluster.
    expect(
      container.querySelector(`[data-dream-avatar-tides="caller-1"]`),
    ).toBeNull();

    const next = container.querySelector<HTMLButtonElement>(
      '[aria-label="Next"]',
    );
    act(() => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // caller-2 has two tides → its active console shows two collapsed discs.
    const cluster = container.querySelector(
      `[data-dream-avatar-tides="caller-2"]`,
    );
    expect(cluster).not.toBeNull();
    expect(cluster?.querySelectorAll("[data-tide-disc]")).toHaveLength(2);
    const label = container.querySelector<HTMLElement>(
      '[data-dream-avatar-console="caller-2"] [data-tides-info-label]',
    );
    expect(label?.getAttribute("aria-label")).toBe("Tides information");
    expect(label?.querySelector("i")?.className).toBe("bxf bx-info-circle");
    expect(label?.dataset.revealPrimaryVariant).toBe("text");
    expect(label?.dataset.revealFeedback).toBe("stationary");

    act(() => {
      root.unmount();
    });
  });

  it("calls onPick with the DreamAvatar's id when its Choose action is pressed", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={OFFERED}
        onPick={onPick}
        onReroll={vi.fn()}
      />,
    );

    const next = container.querySelector<HTMLButtonElement>(
      '[aria-label="Next"]',
    );
    act(() => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const button = container.querySelector<HTMLButtonElement>(
      `[data-choose-dream-avatar="caller-2"] button`,
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
      <JourneyStartScreen
        dreamAvatars={OFFERED}
        onPick={vi.fn()}
        onReroll={onReroll}
      />,
    );

    const control = container.querySelector<HTMLElement>(
      "[data-dream-avatar-reroll-control]",
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="reroll-dream-avatars"]',
    );
    expect(control?.style.position).toBe("absolute");
    expect(control?.style.right).not.toBe("");
    expect(button?.getAttribute("aria-label")).toBe("Reroll Avatars");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onReroll).toHaveBeenCalledOnce();

    act(() => {
      root.unmount();
    });
  });

  it("shows one tutorial page without the reroll or carousel navigation controls", () => {
    const tutorialDreamAvatar = OFFERED[0];
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={[tutorialDreamAvatar]}
        onPick={vi.fn()}
      />,
    );

    expect(
      container.querySelectorAll("[data-dream-avatar-page]"),
    ).toHaveLength(1);
    expect(
      container.querySelector(
        `[data-dream-avatar-page="${tutorialDreamAvatar.id}"]`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-dream-avatar-reroll-control]"),
    ).toBeNull();
    expect(container.querySelector('[aria-label="Previous"]')).toBeNull();
    expect(container.querySelector('[aria-label="Next"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("fades in Mira's tutorial guidance with highlighted Dream Avatar copy", () => {
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={[OFFERED[0]]}
        guideDialogue={{
          model: {
            portrait: { kind: "character-portrait", characterId: "mira" },
            portraitAlt: "Mira",
            speakerName: "Mira",
            text: "Choose a [purple]Dream Avatar[/purple].",
          },
          horizontalOffset: 30,
          verticalOffset: 10,
          bubbleWidth: 500,
        }}
        onPick={vi.fn()}
      />,
    );

    const dialogue = container.querySelector(
      '[data-testid="journey-start-tutorial-dialogue"]',
    );
    expect(dialogue?.getAttribute("aria-label")).toBe("Mira speaks");
    expect(dialogue?.getAttribute("data-character-dialogue-visible")).toBe(
      "true",
    );
    expect(dialogue?.getAttribute("data-character-dialogue-size")).toBe(
      "compact",
    );
    const anchor = container.querySelector<HTMLElement>(
      "[data-journey-start-guide-dialogue]",
    );
    expect(anchor?.style.transform).toBe("translate(30px, 10px)");
    expect(anchor?.style.left).toBe(
      "calc(max(var(--safe-area-inset-left), var(--gutter)) + 0px)",
    );
    expect(anchor?.style.right).toBe(
      "calc(max(var(--safe-area-inset-right), var(--gutter)) + 30px)",
    );
    const highlighted = dialogue?.querySelector<HTMLElement>(
      '[data-tutorial-instruction-highlight="purple"]',
    );
    expect(highlighted?.textContent).toBe("Dream Avatar");

    act(() => {
      root.unmount();
    });
  });

  it("reveals every defined term from the whole DreamAvatar ability box", () => {
    const reclaim = lookupGlossaryTerm("reclaim");
    const bane = lookupGlossaryTerm("bane");
    if (reclaim === undefined || bane === undefined) {
      throw new Error("Expected representative glossary fixtures");
    }
    const ability = `Reclaim Nightmare, the Bane card, then ${reclaim.variants?.[0] ?? "reclaim"} it.`;
    const dreamAvatar = { ...OFFERED[0], renderedText: ability };
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={[dreamAvatar]}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    const source = container.querySelector<HTMLElement>(
      `[data-rules-text-source="${dreamAvatar.id}"]`,
    );
    expect(source?.dataset.rulesTextOwner).toBe("dreamAvatar");
    expect(source?.getAttribute("aria-describedby")).toBeTruthy();
    expect(source?.dataset.revealPrimaryVariant).toBe("source");
    expect(source?.dataset.revealSecondaryTitles).toBe("");
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

describe("Cumulus JourneyStartScreen (desktop)", () => {
  beforeEach(() => {
    stubViewport(true);
  });

  it("renders every DreamAvatar as a standalone column, not a carousel", () => {
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Choose Your Avatar");
    // No carousel pages on desktop.
    expect(container.querySelector("[data-dream-avatar-page]")).toBeNull();
    for (const dc of OFFERED) {
      expect(
        container.querySelector(`[data-dream-avatar-column="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-choose-dream-avatar="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(
          `[data-choose-dream-avatar="${dc.id}"] [data-glass-variant="accent"]`,
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(
          `[data-choose-dream-avatar="${dc.id}"] [data-glass-placement="onGlass"]`,
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(
          `[data-testid="dream-avatar-glass-panel-${dc.id}"][data-glass-panel-height-contract="content"]`,
        ),
      ).not.toBeNull();
      const essence = container.querySelector(
        `[data-starting-essence-value="${dc.id}"]`,
      );
      expect(essence?.textContent).toContain(String(dc.startingEssence));
    }
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(
      OFFERED.length,
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders the tutorial DreamAvatar as the only desktop column", () => {
    const tutorialDreamAvatar = OFFERED[0];
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={[tutorialDreamAvatar]}
        onPick={vi.fn()}
      />,
    );

    expect(
      container.querySelectorAll("[data-dream-avatar-column]"),
    ).toHaveLength(1);
    expect(
      container.querySelector(
        `[data-dream-avatar-column="${tutorialDreamAvatar.id}"]`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-dream-avatar-reroll-control]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders tutorial guidance at the prominent desktop scale", () => {
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={[OFFERED[0]]}
        guideDialogue={{
          model: {
            portrait: { kind: "character-portrait", characterId: "mira" },
            portraitAlt: "Mira",
            speakerName: "Mira",
            text: "Choose a [purple]Dream Avatar[/purple].",
          },
          horizontalOffset: 30,
          verticalOffset: 10,
          bubbleWidth: 500,
        }}
        onPick={vi.fn()}
      />,
    );

    const dialogue = container.querySelector(
      '[data-testid="journey-start-tutorial-dialogue"]',
    );
    expect(dialogue?.getAttribute("data-character-dialogue-size")).toBe(
      "prominent",
    );
    const anchor = container.querySelector<HTMLElement>(
      "[data-journey-start-guide-dialogue]",
    );
    expect(anchor?.style.width).toBe("500px");
    expect(anchor?.style.maxWidth).toBe("calc(50vw - 250px)");
    expect(anchor?.style.transform).toBe(
      "translate(30px, calc(-50% + 10px))",
    );

    act(() => {
      root.unmount();
    });
  });

  it("shows a hover-only tide disc per tide for tided DreamAvatars", () => {
    const { container, root } = mount(
      <JourneyStartScreen
        dreamAvatars={OFFERED}
        onPick={vi.fn()}
        onReroll={vi.fn()}
      />,
    );

    // caller-1 has no tides → no tides node.
    expect(
      container.querySelector(`[data-dream-avatar-tides="caller-1"]`),
    ).toBeNull();

    // caller-2 has two tides → one hover-only disc per tide (no expand/collapse).
    const tides = container.querySelector(
      `[data-dream-avatar-tides="caller-2"]`,
    );
    expect(tides).not.toBeNull();
    expect(tides?.querySelectorAll("[data-tide-disc]")).toHaveLength(2);
    expect(
      container.querySelector(
        '[data-dream-avatar-column="caller-2"] [data-tides-info-label]',
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
