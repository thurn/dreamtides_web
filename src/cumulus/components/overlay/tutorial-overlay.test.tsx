// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDialogue } from "../../test-helpers/component-test-fixtures";
import { renderInCumulus } from "../../testing/render";
import { artRef, resolveArtRef } from "../../primitives/art";
import { CharacterDialogue } from "./CharacterDialogue";
import { TutorialFeatureCallout } from "./TutorialFeatureCallout";
import { useTutorialAnchor, useTutorialObstacle } from "./tutorial-placement";
import { ViewportTutorialDialogue } from "./ViewportTutorialDialogue";
import { parsePresentationId } from "../../../types/identifiers";
import { testTutorialTriggerId } from "../../../types/test-identities";

class ResizeObserverStub {
  static callbacks: ResizeObserverCallback[] = [];
  constructor(callback: ResizeObserverCallback) {
    ResizeObserverStub.callbacks.push(callback);
  }
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}

beforeEach(() => {
  ResizeObserverStub.callbacks = [];
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function PlacementHost() {
  const anchorRef = useTutorialAnchor("tutorial-anchor:anchor");
  const obstacleRef = useTutorialObstacle(
    "tutorial-obstacle:obstacle",
    "chrome",
  );
  return (
    <>
      <div ref={anchorRef} data-fixture-anchor="" />
      <div ref={obstacleRef} data-fixture-obstacle="" />
      <ViewportTutorialDialogue
        presentationId={parsePresentationId("tutorial")}
        dialogue={fixtureDialogue}
        context="site"
        placement={{ kind: "anchored", anchorId: "tutorial-anchor:anchor" }}
        visible
        diagnostics={{
          triggerId: testTutorialTriggerId("trigger"),
          messageIndex: 1,
        }}
      />
    </>
  );
}

function DuplicateAnchorHost() {
  const [showFirst, setShowFirst] = useState(true);
  const firstRef = useTutorialAnchor("tutorial-anchor:duplicate");
  const secondRef = useTutorialAnchor("tutorial-anchor:duplicate");
  return (
    <>
      {showFirst && <div ref={firstRef} data-first-anchor="" />}
      <div ref={secondRef} data-second-anchor="" />
      <button type="button" onClick={() => setShowFirst(false)}>
        Remove first
      </button>
      <ViewportTutorialDialogue
        presentationId={parsePresentationId("duplicate-tutorial")}
        dialogue={fixtureDialogue}
        context="site"
        placement={{ kind: "anchored", anchorId: "tutorial-anchor:duplicate" }}
        visible
      />
    </>
  );
}

function ReplacementAnchorHost() {
  const [replacement, setReplacement] = useState(false);
  const anchorRef = useTutorialAnchor("tutorial-anchor:route-anchor");
  return (
    <>
      <div
        key={replacement ? "second-route" : "first-route"}
        ref={anchorRef}
        data-route-anchor={replacement ? "second" : "first"}
      />
      <button type="button" onClick={() => setReplacement(true)}>
        Replace route
      </button>
      <ViewportTutorialDialogue
        presentationId={parsePresentationId("route-tutorial")}
        dialogue={fixtureDialogue}
        context="site"
        placement={{
          kind: "anchored",
          anchorId: "tutorial-anchor:route-anchor",
        }}
        visible
      />
    </>
  );
}

function MovingObstacleHost() {
  const [moved, setMoved] = useState(false);
  const obstacleRef = useTutorialObstacle(
    "tutorial-obstacle:moving-card",
    "card",
  );
  return (
    <>
      <div
        ref={obstacleRef}
        data-moving-obstacle=""
        data-moved={moved ? "true" : "false"}
      />
      <button type="button" onClick={() => setMoved(true)}>
        Move obstacle
      </button>
      <ViewportTutorialDialogue
        presentationId={parsePresentationId("moving-tutorial")}
        dialogue={{
          ...fixtureDialogue,
          text: "A long tutorial explanation stays measured and moves when its registered obstacle changes position.",
        }}
        context="card"
        placement={{ kind: "floating" }}
        visible
      />
    </>
  );
}

describe("ViewportTutorialDialogue", () => {
  const animationFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    animationFrames.length = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute("data-fixture-anchor"))
          return rect(100, 400, 200, 50);
        if (this.hasAttribute("data-first-anchor"))
          return rect(60, 360, 200, 50);
        if (this.hasAttribute("data-second-anchor"))
          return rect(140, 420, 200, 50);
        if (this.hasAttribute("data-fixture-obstacle"))
          return rect(0, 0, 80, 80);
        if (this.dataset.routeAnchor === "first") return rect(80, 360, 200, 50);
        if (this.dataset.routeAnchor === "second")
          return rect(500, 620, 200, 50);
        if (this.hasAttribute("data-moving-obstacle")) {
          return this.dataset.moved === "true"
            ? rect(620, 200, 150, 180)
            : rect(100, 300, 150, 180);
        }
        return rect(0, 0, 240, 120);
      },
    );
  });

  it("positions from coordinator registrations without product selector discovery", () => {
    const querySpy = vi.spyOn(document, "querySelectorAll");
    const { container } = renderInCumulus(<PlacementHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-site-tutorial-dialogue-layout]",
    );
    expect(layout?.style.visibility).toBe("visible");
    expect(layout?.style.bottom).not.toBe("");
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("keeps the surviving duplicate anchor registered when its sibling unmounts", () => {
    const { container } = renderInCumulus(<DuplicateAnchorHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-site-tutorial-dialogue-layout]",
    );
    const initialBottom = layout?.style.bottom;
    expect(initialBottom).not.toBe("");
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(layout?.style.bottom).toBe(initialBottom);
  });

  it("keeps hidden dialogue out of the accessibility announcement channel", () => {
    const { container } = renderInCumulus(
      <ViewportTutorialDialogue
        presentationId={parsePresentationId("hidden")}
        dialogue={fixtureDialogue}
        context="card"
        placement={{ kind: "floating" }}
        visible={false}
      />,
    );
    const guidance = container.querySelector<HTMLElement>(
      "[data-card-tutorial-guidance]",
    );
    expect(guidance?.getAttribute("aria-live")).toBe("off");
    expect(guidance?.getAttribute("aria-hidden")).toBe("true");
  });

  it("replaces route-local anchors and cleans up the departed element", () => {
    const { container } = renderInCumulus(<ReplacementAnchorHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-site-tutorial-dialogue-layout]",
    )!;
    const firstLeft = layout.style.left;
    const firstBottom = layout.style.bottom;
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(layout.style.left).not.toBe(firstLeft);
    expect(layout.style.bottom).not.toBe(firstBottom);
    expect(container.querySelector('[data-route-anchor="first"]')).toBeNull();
  });

  it("remeasures long dialogue after a registered obstacle moves", () => {
    const { container } = renderInCumulus(<MovingObstacleHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-card-tutorial-dialogue-layout]",
    )!;
    const initialPosition = `${layout.style.left}:${layout.style.top}`;
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    act(() => {
      for (const callback of ResizeObserverStub.callbacks)
        callback([], {} as ResizeObserver);
      for (const callback of animationFrames.splice(0)) callback(0);
    });
    expect(`${layout.style.left}:${layout.style.top}`).not.toBe(
      initialPosition,
    );
    expect(layout.style.visibility).toBe("visible");
  });
});

describe("TutorialFeatureCallout", () => {
  it("marks resource features with an inline glyph and leaves others plain", () => {
    const glyphByFeature = {
      ability: false,
      cardType: false,
      cost: true,
      spark: true,
    } as const;
    for (const [feature, hasGlyph] of Object.entries(glyphByFeature)) {
      const { container, unmount } = renderInCumulus(
        <TutorialFeatureCallout
          feature={feature as keyof typeof glyphByFeature}
        />,
      );
      const callout = container.querySelector("[data-tutorial-feature-callout]");
      expect(callout).not.toBeNull();
      expect(callout?.querySelector("[data-inline-glyph]") !== null).toBe(
        hasGlyph,
      );
      unmount();
    }
  });
});

describe("CharacterDialogue", () => {
  const portrait = artRef.characterPortrait("mira");

  function dialogue(text: string) {
    return { portrait, portraitAlt: "Mira", speakerName: "Mira", text };
  }

  beforeEach(() => {
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
  });

  it("pairs typed art with speech and exposes its visible and hidden fade states", () => {
    const { container, rerender } = renderInCumulus(
      <CharacterDialogue
        dialogue={dialogue("Welcome, Dreamer.")}
        visible
        testId="welcome-dialogue"
      />,
    );

    const root = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    expect(root?.dataset.characterDialogueVisible).toBe("true");
    expect(root?.dataset.characterDialogueSize).toBe("compact");
    expect(root?.getAttribute("aria-hidden")).toBe("false");
    expect(
      container
        .querySelector("[data-character-dialogue-portrait]")
        ?.getAttribute("src"),
    ).toBe(resolveArtRef(portrait));
    expect(container.textContent).toContain("Welcome, Dreamer.");

    rerender(
      <CharacterDialogue
        dialogue={dialogue("Welcome, Dreamer.")}
        visible={false}
      />,
    );
    const hidden = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    expect(hidden?.dataset.characterDialogueVisible).toBe("false");
    expect(hidden?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the prominent size with highlight markup and rules symbols", () => {
    const { container } = renderInCumulus(
      <CharacterDialogue
        dialogue={dialogue(
          "Welcome, [yellow]Dreamer[/yellow]. An [purple]event[purple] resolves once. Score ⍟ equal to your spark ✦.",
        )}
        size="prominent"
        visible
      />,
    );

    expect(
      container.querySelector<HTMLElement>("[data-character-dialogue]")
        ?.dataset.characterDialogueSize,
    ).toBe("prominent");
    const bubble = container.querySelector<HTMLElement>(
      "[data-character-dialogue] aside",
    );
    expect(
      bubble?.querySelector('[data-tutorial-instruction-highlight="yellow"]')
        ?.textContent,
    ).toBe("Dreamer");
    expect(
      bubble?.querySelector('[data-tutorial-instruction-highlight="purple"]')
        ?.textContent,
    ).toBe("event");
    expect(bubble?.textContent).not.toMatch(/\[(yellow|purple)\]|[⍟✦]/u);
    expect(bubble?.querySelectorAll("[data-inline-glyph]")).toHaveLength(2);
  });

  it("keeps the Unicode trigger as text and substitutes the remaining rules-symbol vocabulary", () => {
    const { container } = renderInCumulus(
      <CharacterDialogue
        dialogue={dialogue(
          "A ▸Dissolved ability may cost 1● and ☾, store 1⧗, gain 2⍟ and 1✦, spend ◆ essence, or use ❖.",
        )}
        visible
      />,
    );

    expect(container.querySelectorAll("[data-inline-glyph]")).toHaveLength(7);
    expect(container.textContent).toContain("▸Dissolved");
    expect(container.textContent).not.toMatch(/[●☾⧗⍟✦◆❖]/u);
  });
});
