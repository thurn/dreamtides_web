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
  it("pairs typed character art and the shared speech bubble inside the dialogue frame", () => {
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
    expect(dialogue?.style.gridTemplateColumns).toBe("64px minmax(0, 1fr)");
    expect(bubble?.style.padding).toBe(
      "var(--space-5) var(--space-5) var(--space-5) calc(14px + var(--space-5))",
    );
    expect(bubble?.dataset.speechBubblePointerAlignment).toBe("center");
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
              text: "Welcome, Dreamer.",
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
    expect(bubble?.dataset.speechBubbleSize).toBe("prominent");
    expect(bubble?.style.zoom).toBe("1.25");
    expect(bubblePath?.getAttribute("d")).toContain("L 0 31");

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
