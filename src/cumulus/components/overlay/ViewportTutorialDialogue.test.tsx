// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import {
  mountCumulus,
  fixtureDialogue,
} from "../../test-helpers/component-test-fixtures";
import { useTutorialAnchor, useTutorialObstacle } from "./tutorial-placement";
import { ViewportTutorialDialogue } from "./ViewportTutorialDialogue";

const resizeCallbacks: ResizeObserverCallback[] = [];
const animationFrames: FrameRequestCallback[] = [];

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe(): void {}
  disconnect(): void {}
}

function PlacementHost() {
  const anchorRef = useTutorialAnchor("anchor");
  const obstacleRef = useTutorialObstacle("obstacle", "chrome");
  return (
    <>
      <div ref={anchorRef} data-fixture-anchor="" />
      <div ref={obstacleRef} data-fixture-obstacle="" />
      <ViewportTutorialDialogue
        presentationId="tutorial"
        dialogue={fixtureDialogue}
        context="site"
        placement={{ kind: "anchored", anchorId: "anchor" }}
        visible
        diagnostics={{ triggerId: "trigger", messageIndex: 1 }}
      />
    </>
  );
}

function DuplicateAnchorHost() {
  const [showFirst, setShowFirst] = useState(true);
  const firstRef = useTutorialAnchor("duplicate");
  const secondRef = useTutorialAnchor("duplicate");
  return (
    <>
      {showFirst && <div ref={firstRef} data-first-anchor="" />}
      <div ref={secondRef} data-second-anchor="" />
      <button type="button" onClick={() => setShowFirst(false)}>
        Remove first
      </button>
      <ViewportTutorialDialogue
        presentationId="duplicate-tutorial"
        dialogue={fixtureDialogue}
        context="site"
        placement={{ kind: "anchored", anchorId: "duplicate" }}
        visible
      />
    </>
  );
}

function ReplacementAnchorHost() {
  const [replacement, setReplacement] = useState(false);
  const anchorRef = useTutorialAnchor("route-anchor");
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
        presentationId="route-tutorial"
        dialogue={fixtureDialogue}
        context="site"
        placement={{ kind: "anchored", anchorId: "route-anchor" }}
        visible
      />
    </>
  );
}

function MovingObstacleHost() {
  const [moved, setMoved] = useState(false);
  const obstacleRef = useTutorialObstacle("moving-card", "card");
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
        presentationId="moving-tutorial"
        dialogue={{
          ...fixtureDialogue,
          text: assertLocalized(
            "A long tutorial explanation stays measured and moves when its registered obstacle changes position.",
          ),
        }}
        context="card"
        placement={{ kind: "floating", avoidance: "cards-and-chrome" }}
        visible
      />
    </>
  );
}

beforeEach(() => {
  resizeCallbacks.length = 0;
  animationFrames.length = 0;
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute("data-fixture-anchor"))
        return {
          left: 100,
          top: 400,
          right: 300,
          bottom: 450,
          width: 200,
          height: 50,
          x: 100,
          y: 400,
          toJSON: () => ({}),
        };
      if (this.hasAttribute("data-first-anchor"))
        return {
          left: 60,
          top: 360,
          right: 260,
          bottom: 410,
          width: 200,
          height: 50,
          x: 60,
          y: 360,
          toJSON: () => ({}),
        };
      if (this.hasAttribute("data-second-anchor"))
        return {
          left: 140,
          top: 420,
          right: 340,
          bottom: 470,
          width: 200,
          height: 50,
          x: 140,
          y: 420,
          toJSON: () => ({}),
        };
      if (this.hasAttribute("data-fixture-obstacle"))
        return {
          left: 0,
          top: 0,
          right: 80,
          bottom: 80,
          width: 80,
          height: 80,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      if (this.dataset.routeAnchor === "first")
        return {
          left: 80,
          top: 360,
          right: 280,
          bottom: 410,
          width: 200,
          height: 50,
          x: 80,
          y: 360,
          toJSON: () => ({}),
        };
      if (this.dataset.routeAnchor === "second")
        return {
          left: 500,
          top: 620,
          right: 700,
          bottom: 670,
          width: 200,
          height: 50,
          x: 500,
          y: 620,
          toJSON: () => ({}),
        };
      if (this.hasAttribute("data-moving-obstacle")) {
        const left = this.dataset.moved === "true" ? 620 : 100;
        const top = this.dataset.moved === "true" ? 200 : 300;
        return {
          left,
          top,
          right: left + 150,
          bottom: top + 180,
          width: 150,
          height: 180,
          x: left,
          y: top,
          toJSON: () => ({}),
        };
      }
      return {
        left: 0,
        top: 0,
        right: 240,
        bottom: 120,
        width: 240,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ViewportTutorialDialogue", () => {
  it("positions from coordinator registrations without product selector discovery", () => {
    const querySpy = vi.spyOn(document, "querySelectorAll");
    const { container, root } = mountCumulus(<PlacementHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-site-tutorial-dialogue-layout]",
    );
    expect(layout?.style.visibility).toBe("visible");
    expect(layout?.style.bottom).not.toBe("");
    expect(querySpy).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("keeps the surviving duplicate anchor registered when its sibling unmounts", () => {
    const { container, root } = mountCumulus(<DuplicateAnchorHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-site-tutorial-dialogue-layout]",
    );
    const initialBottom = layout?.style.bottom;
    expect(initialBottom).not.toBe("");
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(layout?.style.bottom).toBe(initialBottom);
    act(() => root.unmount());
  });

  it("keeps hidden dialogue out of the accessibility announcement channel", () => {
    const { container, root } = mountCumulus(
      <ViewportTutorialDialogue
        presentationId="hidden"
        dialogue={fixtureDialogue}
        context="card"
        placement={{ kind: "floating", avoidance: "cards-and-chrome" }}
        visible={false}
      />,
    );
    const guidance = container.querySelector<HTMLElement>(
      "[data-card-tutorial-guidance]",
    );
    expect(guidance?.getAttribute("aria-live")).toBe("off");
    expect(guidance?.getAttribute("aria-hidden")).toBe("true");
    act(() => root.unmount());
  });

  it("replaces route-local anchors and cleans up the departed element", () => {
    const { container, root } = mountCumulus(<ReplacementAnchorHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-site-tutorial-dialogue-layout]",
    )!;
    const firstLeft = layout.style.left;
    const firstBottom = layout.style.bottom;
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(layout.style.left).not.toBe(firstLeft);
    expect(layout.style.bottom).not.toBe(firstBottom);
    expect(container.querySelector('[data-route-anchor="first"]')).toBeNull();
    act(() => root.unmount());
  });

  it("remeasures long dialogue after a registered obstacle moves", () => {
    const { container, root } = mountCumulus(<MovingObstacleHost />);
    const layout = container.querySelector<HTMLElement>(
      "[data-card-tutorial-dialogue-layout]",
    )!;
    const initialPosition = `${layout.style.left}:${layout.style.top}`;
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    act(() => {
      for (const callback of resizeCallbacks)
        callback([], {} as ResizeObserver);
      for (const callback of animationFrames.splice(0)) callback(0);
    });
    expect(`${layout.style.left}:${layout.style.top}`).not.toBe(
      initialPosition,
    );
    expect(layout.style.visibility).toBe("visible");
    act(() => root.unmount());
  });
});
