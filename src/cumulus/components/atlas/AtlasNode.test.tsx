import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localizedStringSourceEquality } from "../../../runtime/localization/testing";
import { resolveSource } from "../../../runtime/localization/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { CumulusRoot } from "../../CumulusRoot";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import {
  AtlasNode,
  atlasPrimaryInfoCard,
  type AtlasNodeModel,
} from "./AtlasNode";
import { parseAtlasNodeId } from "../../../types/identifiers";
import {
  testDreamscapeId,
  testGuideId,
  testArtAssetKey,
} from "../../../types/test-identities";

const NODE_ID = parseAtlasNodeId("00000000-0000-4000-8000-000000000051");

describe("atlasPrimaryInfoCard", () => {
  it("selects the scene reveal for a known place and text for an unseen dream", () => {
    expect(
      atlasPrimaryInfoCard({
        sceneArt: artRef.dreamscapeScene(testDreamscapeId("wilderveil")),
        figureArt: artRef.dreamGuide(testGuideId("aldric")),
        placeName: assertLocalized("Wilderveil"),
        guideName: assertLocalized("Aldric, the Seer"),
        title: assertLocalized("Aldric, the Seer"),
        body: assertLocalized("A curated vision."),
      }),
    ).toMatchObject({
      variant: "atlasReveal",
      title: "Wilderveil",
      subtitle: "Aldric, the Seer",
    });
    expect(
      atlasPrimaryInfoCard({
        sceneArt: null,
        figureArt: null,
        placeName: null,
        guideName: null,
        title: assertLocalized("An Unseen Dream"),
        body: assertLocalized("Travel onward."),
      }),
    ).toMatchObject({ variant: "text", title: "An Unseen Dream" });
  });
});

function model(
  state: AtlasNodeModel["state"],
  overrides: Partial<AtlasNodeModel> = {},
): AtlasNodeModel {
  return {
    id: NODE_ID,
    name: assertLocalized("Wilderveil"),
    state,
    role: "regular",
    isReachable: true,
    iconRef: artRef.dreamscapeIcon(testDreamscapeId("wilderveil")),
    unrevealedFrameRef: artRef.atlasAsset(testArtAssetKey("fixture-frame.png")),
    siteBadgeGlyph: GLYPHS.water,
    knownDreamsignRef: artRef.dreamsign("known.png"),
    primary: {
      sceneArt: artRef.dreamscapeScene(testDreamscapeId("wilderveil")),
      figureArt: artRef.dreamGuide(testGuideId("aldric")),
      placeName: assertLocalized("Wilderveil"),
      guideName: assertLocalized("Aldric, the Seer"),
      title: assertLocalized("Aldric, the Seer"),
      body: assertLocalized("Aldric offers curated visions of the future."),
    },
    dreamsign: {
      name: assertLocalized("Known Sign"),
      art: artRef.dreamsign("known.png"),
      rulesText: assertLocalized("Your first vision costs less."),
    },
    site: {
      name: assertLocalized("Augury"),
      blurb: assertLocalized("Study a curated vision of what waits ahead."),
      icon: GLYPHS.water,
    },
    affiliation: {
      title: assertLocalized("Fixture affiliation"),
      body: assertLocalized("Fixture cards are more likely here."),
    },
    ...overrides,
  };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
          <AtlasNode model={value} onPress={onActivate} />
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
  options: {
    pointerType: "mouse" | "touch";
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    timeStamp?: number;
  },
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
    ...(options.timeStamp === undefined
      ? {}
      : { timeStamp: { value: options.timeStamp } }),
  });
  return event;
}

describe("AtlasNode semantic reveal contract", () => {
  it("derives the Atlas primary and Dreamsign, site, affiliation secondaries in priority order", () => {
    const value = model("available");
    const { source } = renderNode(value);

    expect(source.dataset.atlasNodeId).toBe(NODE_ID);
    expect(source.dataset.revealEntityType).toBe("atlas-node");
    expect(source.dataset.revealEntityId).toBe(NODE_ID);
    expect(source.dataset.revealPrimaryVariant).toBe("atlasReveal");
    expect(source.dataset.revealSecondaryTitles?.split("\u001f")).toEqual([
      "Known Sign",
      "Augury",
      resolveSource(value.affiliation!.title),
    ]);
    expect(source.dataset.revealFeedback).toBe("measured");
    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain("Wilderveil");
    expect(description?.textContent).toContain("Known Sign");
    expect(description?.textContent).toContain("Augury");
    expect(description?.textContent).toContain(
      resolveSource(value.affiliation!.title),
    );
  });

  it("keeps reveal protocol derivation private to the named component", async () => {
    const atlasNodeModule: Record<string, unknown> =
      await import("./AtlasNode");
    expect(atlasNodeModule).not.toHaveProperty("atlasNodeRevealSpec");
  });

  it.each([
    ["available", "regular"],
    ["completed", "regular"],
    ["revealedLocked", "regular"],
    ["unrevealed", "regular"],
    ["completed", "starter"],
    ["revealedLocked", "boss"],
  ] as const)("keeps %s role=%s focusable and descriptive", (state, role) => {
    const value = model(state, {
      role,
      primary:
        state === "unrevealed"
          ? {
              sceneArt: null,
              figureArt: null,
              placeName: null,
              guideName: null,
              title: assertLocalized("An Unseen Dream"),
              body: assertLocalized("Travel onward to learn what waits here."),
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
    expect(source.dataset.nodeStarting).toBe(
      role === "starter" ? "true" : undefined,
    );
    expect(source.dataset.nodeBoss).toBe(role === "boss" ? "true" : undefined);
  });

  it("fills the caller-owned layout box without positioning itself", () => {
    const { source } = renderNode(model("available"));
    expect(source.style.width).toBe("100%");
    expect(source.style.height).toBe("100%");
    expect(source.style.left).toBe("");
    expect(source.style.top).toBe("");
    expect(source.style.marginLeft).toBe("");
    expect(source.style.marginTop).toBe("");
  });

  it("activates only an available node", () => {
    const available = renderNode(model("available"));
    const highlight = available.source.querySelector<HTMLElement>(
      ".cumulus-atlas-node-selectable-highlight",
    );
    const baseHighlight = highlight?.querySelector<HTMLElement>(
      ".cumulus-atlas-node-selectable-highlight-base",
    );
    const pulseHighlight = highlight?.querySelector<HTMLElement>(
      ".cumulus-atlas-node-selectable-highlight-pulse",
    );
    expect(highlight).not.toBeNull();
    expect(highlight?.getAttribute("aria-hidden")).toBe("true");
    expect(baseHighlight?.style.maskImage).toContain(
      "/atlas/fixture-frame.png?v=1",
    );
    expect(baseHighlight?.style.webkitMaskImage).toContain(
      "/atlas/fixture-frame.png?v=1",
    );
    expect(pulseHighlight?.style.maskImage).toContain(
      "/atlas/fixture-frame.png?v=1",
    );
    expect(pulseHighlight?.style.webkitMaskImage).toContain(
      "/atlas/fixture-frame.png?v=1",
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
      unavailable.source.querySelector(
        ".cumulus-atlas-node-selectable-highlight",
      ),
    ).toBeNull();
    act(() => unavailable.source.click());
    expect(unavailable.onActivate).not.toHaveBeenCalled();
    expect(unavailable.source.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps an unreachable node focusable and suppresses activation", () => {
    const unreachable = renderNode(
      model("revealedLocked", { isReachable: false }),
    );
    expect(unreachable.source.tabIndex).toBe(0);
    expect(
      unreachable.source.classList.contains("cumulus-atlas-node-unreachable"),
    ).toBe(true);
    expect(unreachable.source.getAttribute("aria-disabled")).toBe("true");
    act(() => unreachable.source.focus());
    expect(document.activeElement).toBe(unreachable.source);
    act(() => unreachable.source.click());
    expect(unreachable.onActivate).not.toHaveBeenCalled();
  });

  it("activates a quick touch once, suppresses its compatibility click, then accepts keyboard activation", () => {
    const available = renderNode(model("available"));
    act(() => {
      available.source.dispatchEvent(
        pointer("pointerdown", { pointerType: "touch", pointerId: 7 }),
      );
    });
    act(() => {
      available.source.dispatchEvent(
        pointer("pointerup", { pointerType: "touch", pointerId: 7 }),
      );
    });
    expect(available.onActivate).toHaveBeenCalledTimes(1);

    act(() => {
      available.source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(available.onActivate).toHaveBeenCalledTimes(1);

    act(() => {
      available.source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 0 }),
      );
    });
    expect(available.onActivate).toHaveBeenCalledTimes(2);
  });

  it("suppresses touch-hold activation and only its compatibility click", () => {
    vi.useFakeTimers();
    const available = renderNode(model("available"));
    act(() => {
      available.source.dispatchEvent(
        pointer("pointerdown", {
          pointerType: "touch",
          pointerId: 8,
          timeStamp: 100,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(35);
    });
    act(() => {
      available.source.dispatchEvent(
        pointer("pointerup", {
          pointerType: "touch",
          pointerId: 8,
          timeStamp: 401,
        }),
      );
    });
    act(() => {
      available.source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
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
    expect(
      source.querySelector<HTMLElement>(".cumulus-atlas-node-art")?.style
        .transform,
    ).toBe("");
    expect(
      getComputedStyle(
        source.querySelector<HTMLElement>(".cumulus-atlas-node-art")!,
      ).transform,
    ).toBe("none");
    expect(
      source
        .querySelector(".cumulus-atlas-node-glow")
        ?.getAttribute("data-ambient-paused"),
    ).toBe("true");
    expect(
      source
        .querySelector(".cumulus-atlas-node-selectable-highlight")
        ?.getAttribute("data-ambient-paused"),
    ).toBe("true");
  });

  it("applies touch press feedback once on the root without scaling node art", () => {
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
      source.dispatchEvent(
        pointer("pointerdown", { pointerType: "touch", pointerId: 9 }),
      );
    });
    expect(source.style.transform.startsWith("scale(var(")).toBe(true);
    expect(source.style.transform).toContain("reveal-press-scale");
    expect(
      source.querySelector<HTMLElement>(".cumulus-atlas-node-art")?.style
        .transform,
    ).toBe("");
    expect(
      getComputedStyle(
        source.querySelector<HTMLElement>(".cumulus-atlas-node-art")!,
      ).transform,
    ).toBe("none");
    act(() => {
      source.dispatchEvent(
        pointer("pointerup", { pointerType: "touch", pointerId: 9 }),
      );
    });
    expect(source.style.transform).toBe("none");
  });
});
