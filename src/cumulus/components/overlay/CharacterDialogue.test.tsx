// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { artRef, resolveArtRef } from "../../primitives/art";
import { CharacterDialogue } from "./CharacterDialogue";

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("CharacterDialogue", () => {
  it("pairs typed art and speech at the transparent start of its shared fade-in", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const portrait = artRef.characterPortrait("mira");

    act(() => {
      root.render(
        <CumulusRoot>
          <CharacterDialogue
            dialogue={{
              portrait,
              portraitAlt: "Mira",
              speakerName: "Mira",
              text: "Welcome, Dreamer.",
            }}
            visible
            testId="welcome-dialogue"
          />
        </CumulusRoot>,
      );
    });

    const dialogue = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    const portraitImage = container.querySelector<HTMLImageElement>(
      "[data-character-dialogue-portrait]",
    );
    const frameImage = container.querySelector<HTMLImageElement>(
      "[data-character-dialogue-frame]",
    );
    const bubble = container.querySelector<HTMLElement>(
      "[data-character-dialogue] aside",
    );

    expect(dialogue?.dataset.characterDialogueVisible).toBe("true");
    expect(dialogue?.dataset.characterDialogueSize).toBe("compact");
    expect(dialogue?.getAttribute("aria-hidden")).toBe("false");
    expect(dialogue?.style.opacity).toBe("0");
    expect(dialogue?.style.gridTemplateColumns).toBe("64px minmax(0, 1fr)");
    expect(dialogue?.style.maxWidth).toBe("300px");
    expect(bubble?.style.padding).toBe(
      "var(--space-5) var(--space-5) var(--space-5) calc(14px + var(--space-5))",
    );
    expect(bubble?.dataset.speechBubblePointerPlacement).toBe("left-center");
    expect(bubble?.dataset.speechBubbleSize).toBe("standard");
    expect(portraitImage?.getAttribute("src")).toBe(resolveArtRef(portrait));
    expect(frameImage?.getAttribute("src")).toBe("/atlas/Round_frame.png");
    expect(container.textContent).toContain("Mira");
    expect(container.textContent).toContain("Welcome, Dreamer.");

    act(() => root.unmount());
    container.remove();
  });

  it("renders the prominent portrait and bubble with centered pointer geometry", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(169);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(62);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <CharacterDialogue
            dialogue={{
              portrait: artRef.characterPortrait("mira"),
              portraitAlt: "Mira",
              speakerName: "Mira",
              text:
                "Welcome, [yellow]Dreamer[/yellow]. An [purple]event[purple] resolves once. Score ⍟ equal to your spark ✦.",
            }}
            size="prominent"
            visible
          />
        </CumulusRoot>,
      );
    });

    const dialogue = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    const bubble = container.querySelector<HTMLElement>(
      "[data-character-dialogue] aside",
    );
    const bubblePath = container.querySelector<SVGPathElement>(
      "[data-character-dialogue] clipPath path",
    );
    expect(dialogue?.dataset.characterDialogueSize).toBe("prominent");
    expect(dialogue?.style.gridTemplateColumns).toBe("150px minmax(0, 1fr)");
    expect(dialogue?.style.maxWidth).toBe("700px");
    expect(bubble?.dataset.speechBubbleSize).toBe("prominent");
    expect(bubble?.style.zoom).toBe("1.25");
    expect(bubblePath?.getAttribute("d")).toContain("L 0 31");
    const highlight = bubble?.querySelector<HTMLElement>(
      '[data-tutorial-instruction-highlight="yellow"]',
    );
    expect(highlight?.textContent).toBe("Dreamer");
    expect(highlight?.style.color).toBe("var(--spark)");
    const purpleHighlight = bubble?.querySelector<HTMLElement>(
      '[data-tutorial-instruction-highlight="purple"]',
    );
    expect(purpleHighlight?.textContent).toBe("event");
    expect(purpleHighlight?.style.color).toBe("var(--accent-bright)");
    expect(bubble?.textContent).toContain(
      "Welcome, Dreamer. An event resolves once. Score  equal to your spark .",
    );
    expect(bubble?.textContent).not.toContain("[yellow]");
    expect(bubble?.textContent).not.toContain("[purple]");
    const pointsIcon = bubble?.querySelector<HTMLElement>(
      '[aria-label="points"]',
    );
    const sparkIcon = bubble?.querySelector<HTMLElement>(
      '[aria-label="spark"]',
    );
    expect(pointsIcon?.querySelector("i")?.className).toContain(
      "bxf bx-star-circle",
    );
    expect(sparkIcon?.querySelector("i")?.className).toContain("bxf bx-sparkle");
    expect(sparkIcon?.parentElement?.style.color).toContain(
      "var(--cv-rules-spark-color",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("widens desktop dialogue while retaining the compact portrait and bubble scale", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <CharacterDialogue
            dialogue={{
              portrait: artRef.characterPortrait("mira"),
              portraitAlt: "Mira",
              speakerName: "Mira",
              text: "A broad desktop explanation.",
            }}
            size="wide"
            visible
          />
        </CumulusRoot>,
      );
    });

    const dialogue = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    const bubble = container.querySelector<HTMLElement>(
      "[data-character-dialogue] aside",
    );
    expect(dialogue?.dataset.characterDialogueSize).toBe("wide");
    expect(dialogue?.style.gridTemplateColumns).toBe("64px minmax(0, 1fr)");
    expect(dialogue?.style.maxWidth).toBe("700px");
    expect(bubble?.dataset.speechBubbleSize).toBe("standard");

    act(() => root.unmount());
    container.remove();
  });

  it("renders the complete canonical rules-symbol vocabulary through InlineGlyph", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <CharacterDialogue
            dialogue={{
              portrait: artRef.characterPortrait("mira"),
              portraitAlt: "Mira",
              speakerName: "Mira",
              text:
                "A ▸Dissolved ability may cost 1● and ☪, store 1⧗, gain 2⍟ and 1✦, or use ❖.",
            }}
            visible
          />
        </CumulusRoot>,
      );
    });

    expect(container.querySelector("i.bxf.bx-caret-right")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-fire-alt")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-moon")).not.toBeNull();
    expect(container.querySelector("i.fa-solid.fa-brain")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-star-circle")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-sparkle")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-bolt")).not.toBeNull();
    expect(container.querySelectorAll("[data-inline-glyph]")).toHaveLength(7);
    expect(container.textContent).not.toMatch(/[▸●☪⧗⍟✦❖]/u);

    act(() => root.unmount());
    container.remove();
  });

  it("exposes the hidden end of the reusable fade state", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <CharacterDialogue
            dialogue={{
              portrait: artRef.characterPortrait("mira"),
              portraitAlt: "Mira",
              speakerName: "Mira",
              text: "Welcome, Dreamer.",
            }}
            visible={false}
          />
        </CumulusRoot>,
      );
    });

    const dialogue = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    expect(dialogue?.dataset.characterDialogueVisible).toBe("false");
    expect(dialogue?.getAttribute("aria-hidden")).toBe("true");
    expect(dialogue?.style.opacity).toBe("0");

    act(() => root.unmount());
    container.remove();
  });
});
