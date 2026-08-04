// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerName } from "../../../types/layer-name";
import { CumulusRoot } from "../../CumulusRoot";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import { AtlasNode, type AtlasNodeModel } from "./AtlasNode";

const NODE_ID = "00000000-0000-4000-8000-000000000051";
const DREAMSIGN_ID = "00000000-0000-4000-8000-000000000052";
const SITE_ID = "00000000-0000-4000-8000-000000000053";
const AFFILIATION_ID = "00000000-0000-4000-8000-000000000054";

function model(
  state: AtlasNodeModel["node"]["state"],
  overrides: Partial<AtlasNodeModel> = {},
): AtlasNodeModel {
  return {
    node: {
      id: NODE_ID,
      layer: LayerName.Two,
      indexInLayer: 0,
      dreamscapeId: "wilderveil",
      biomeName: "Wilderveil",
      biomeColor: "violet",
      sites: [],
      position: { x: 1, y: 0 },
      state,
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: DREAMSIGN_ID,
    },
    left: 500,
    top: 400,
    size: 132,
    isStarter: false,
    isBoss: false,
    isReachable: true,
    iconRef: artRef.dreamscapeIcon("wilderveil"),
    siteBadgeGlyph: GLYPHS.water,
    knownDreamsignRef: artRef.dreamsign("known.png"),
    primary: {
      sceneArt: artRef.dreamscapeScene("wilderveil"),
      figureArt: artRef.dreamGuide("aldric"),
      placeName: "Wilderveil",
      guideName: "Aldric, the Seer",
      title: "Aldric, the Seer",
      body: "Aldric offers curated visions of the future.",
    },
    dreamsign: {
      id: DREAMSIGN_ID,
      name: "Known Sign",
      art: artRef.dreamsign("known.png"),
      rulesText: "Your first vision costs less.",
    },
    site: {
      id: SITE_ID,
      name: "Augury",
      blurb: "Study a curated vision of what waits ahead.",
      icon: GLYPHS.water,
    },
    affiliation: {
      id: AFFILIATION_ID,
      name: "Figments",
      cardTheme: "Figment",
    },
    ...overrides,
  };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).ResizeObserver;
});

function renderNode(value: AtlasNodeModel, onActivate = vi.fn()) {
  act(() => {
    root.render(
      <CumulusRoot>
        <div className="dream-atlas">
          <AtlasNode model={value} onActivate={onActivate} />
        </div>
      </CumulusRoot>,
    );
  });
  return {
    source: container.querySelector<HTMLElement>("[data-atlas-node-id]")!,
    onActivate,
  };
}

function pointer(
  type: "pointerover" | "pointerdown" | "pointerup" | "pointercancel",
  options: { pointerType: "mouse" | "touch"; pointerId?: number; clientX?: number; clientY?: number; timeStamp?: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: options.clientX ?? 100,
    clientY: options.clientY ?? 100,
  });
  Object.defineProperties(event, {
    pointerType: { value: options.pointerType },
    pointerId: { value: options.pointerId ?? 1 },
    ...(options.timeStamp === undefined ? {} : { timeStamp: { value: options.timeStamp } }),
  });
  return event;
}

describe("AtlasNode semantic reveal contract", () => {
  it("derives the Atlas primary and Dreamsign, site, affiliation secondaries in priority order", () => {
    const { source } = renderNode(model("available"));

    expect(source.dataset.atlasNodeId).toBe(NODE_ID);
    expect(source.dataset.revealEntityType).toBe("atlas-node");
    expect(source.dataset.revealEntityId).toBe(NODE_ID);
    expect(source.dataset.revealPrimaryVariant).toBe("atlasReveal");
    expect(source.dataset.revealSecondaryTitles?.split("\u001f")).toEqual([
      "Known Sign",
      "Augury",
      "Affiliation: Figments",
    ]);
    expect(source.dataset.revealFeedback).toBe("measured");
    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain("Wilderveil");
    expect(description?.textContent).toContain("Known Sign");
    expect(description?.textContent).toContain("Augury");
    expect(description?.textContent).toContain("Affiliation: Figments");
  });

  it("keeps reveal protocol derivation private to the named component", async () => {
    const atlasNodeModule: Record<string, unknown> = await import("./AtlasNode");
    expect(atlasNodeModule).not.toHaveProperty("atlasNodeRevealSpec");
  });

  it.each([
    ["available", false, false],
    ["completed", false, false],
    ["revealedLocked", false, false],
    ["unrevealed", false, false],
    ["completed", true, false],
    ["revealedLocked", false, true],
  ] as const)(
    "keeps %s starter=%s boss=%s focusable and descriptive",
    (state, isStarter, isBoss) => {
      const value = model(state, {
        isStarter,
        isBoss,
        primary:
          state === "unrevealed"
            ? {
                sceneArt: null,
                figureArt: null,
                placeName: null,
                guideName: null,
                title: "An Unseen Dream",
                body: "Travel onward to learn what waits here.",
              }
            : model(state).primary,
      });
      const { source } = renderNode(value);

      expect(source.tabIndex).toBe(0);
      expect(source.style.touchAction).toBe("pan-x pan-y");
      expect(source.getAttribute("aria-describedby")).toMatch(
        /^cumulus-reveal-description-/,
      );
      expect(source.dataset.revealPrimaryVariant).toBe(
        state === "unrevealed" ? "text" : "atlasReveal",
      );
      expect(source.dataset.nodeStarting).toBe(isStarter ? "true" : undefined);
      expect(source.dataset.nodeBoss).toBe(isBoss ? "true" : undefined);
    },
  );

  it("activates only an available node", () => {
    const available = renderNode(model("available"));
    const highlight = available.source.querySelector<HTMLElement>(
      ".node-selectable-highlight",
    );
    const baseHighlight = highlight?.querySelector<HTMLElement>(
      ".node-selectable-highlight-base",
    );
    const pulseHighlight = highlight?.querySelector<HTMLElement>(
      ".node-selectable-highlight-pulse",
    );
    expect(highlight).not.toBeNull();
    expect(highlight?.getAttribute("aria-hidden")).toBe("true");
    expect(baseHighlight?.style.maskImage).toContain(
      "/atlas/Round_frame_main.png?v=1",
    );
    expect(baseHighlight?.style.webkitMaskImage).toContain(
      "/atlas/Round_frame_main.png?v=1",
    );
    expect(pulseHighlight?.style.maskImage).toContain(
      "/atlas/Round_frame_main.png?v=1",
    );
    expect(pulseHighlight?.style.webkitMaskImage).toContain(
      "/atlas/Round_frame_main.png?v=1",
    );
    expect(highlight?.getAttribute("data-ambient-paused")).toBe("false");
    act(() => available.source.click());
    expect(available.onActivate).toHaveBeenCalledWith(NODE_ID);

    const unavailable = renderNode(model("completed"));
    unavailable.source.getBoundingClientRect = () => ({
      x: 80,
      y: 90,
      left: 80,
      top: 90,
      right: 212,
      bottom: 222,
      width: 132,
      height: 132,
      toJSON: () => ({}),
    });
    act(() => {
      unavailable.source.dispatchEvent(
        pointer("pointerdown", { pointerType: "mouse" }),
      );
    });
    expect(unavailable.source.style.transform).toBe("none");
    expect(unavailable.source.style.cursor).toBe("default");
    expect(
      unavailable.source.querySelector(".node-selectable-highlight"),
    ).toBeNull();
    act(() => unavailable.source.click());
    expect(unavailable.onActivate).not.toHaveBeenCalled();
    expect(unavailable.source.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps an unreachable node focusable and suppresses activation", () => {
    const unreachable = renderNode(model("revealedLocked", { isReachable: false }));
    expect(unreachable.source.tabIndex).toBe(0);
    expect(unreachable.source.classList.contains("node-unreachable")).toBe(true);
    expect(unreachable.source.getAttribute("aria-disabled")).toBe("true");
    act(() => unreachable.source.focus());
    expect(document.activeElement).toBe(unreachable.source);
    act(() => unreachable.source.click());
    expect(unreachable.onActivate).not.toHaveBeenCalled();
  });

  it("activates a quick touch once, suppresses its compatibility click, then accepts keyboard activation", () => {
    const available = renderNode(model("available"));
    act(() => { available.source.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 7 })); });
    act(() => { available.source.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 7 })); });
    expect(available.onActivate).toHaveBeenCalledTimes(1);

    act(() => { available.source.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); });
    expect(available.onActivate).toHaveBeenCalledTimes(1);

    act(() => { available.source.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })); });
    expect(available.onActivate).toHaveBeenCalledTimes(2);
  });

  it("suppresses touch-hold activation and only its compatibility click", () => {
    vi.useFakeTimers();
    const available = renderNode(model("available"));
    act(() => { available.source.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 8, timeStamp: 100 })); });
    act(() => { vi.advanceTimersByTime(35); });
    act(() => { available.source.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 8, timeStamp: 401 })); });
    act(() => { available.source.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); });
    expect(available.onActivate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("measures source feedback and pauses ambient glow while revealed", () => {
    const { source } = renderNode(model("available"));
    source.getBoundingClientRect = () => ({
      x: 80,
      y: 90,
      left: 80,
      top: 90,
      right: 212,
      bottom: 222,
      width: 132,
      height: 132,
      toJSON: () => ({}),
    });
    act(() => {
      source.dispatchEvent(pointer("pointerover", { pointerType: "mouse" }));
    });

    expect(source.dataset.revealActive).toBe("true");
    expect(source.style.getPropertyValue("--reveal-hover-scale")).not.toBe("");
    expect(source.style.transform.startsWith("scale(var(")).toBe(true);
    expect(source.style.transform).toContain("reveal-hover-scale");
    expect(source.querySelector<HTMLElement>(".node-art")?.style.transform).toBe("");
    expect(getComputedStyle(source.querySelector<HTMLElement>(".node-art")!).transform).toBe("none");
    expect(source.querySelector(".node-glow")?.getAttribute("data-ambient-paused"))
      .toBe("true");
    expect(
      source.querySelector(".node-selectable-highlight")
        ?.getAttribute("data-ambient-paused"),
    ).toBe("true");
  });

  it("applies touch press feedback once on the root without scaling node art", () => {
    const { source } = renderNode(model("available"));
    source.getBoundingClientRect = () => ({ x: 80, y: 90, left: 80, top: 90, right: 212, bottom: 222, width: 132, height: 132, toJSON: () => ({}) });
    act(() => { source.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 9 })); });
    expect(source.style.transform.startsWith("scale(var(")).toBe(true);
    expect(source.style.transform).toContain("reveal-press-scale");
    expect(source.querySelector<HTMLElement>(".node-art")?.style.transform).toBe("");
    expect(getComputedStyle(source.querySelector<HTMLElement>(".node-art")!).transform).toBe("none");
    act(() => { source.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 9 })); });
    expect(source.style.transform).toBe("none");
  });
});
