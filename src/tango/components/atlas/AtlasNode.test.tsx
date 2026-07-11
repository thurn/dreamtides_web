// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerName } from "../../../types/layer-name";
import { TangoRoot } from "../../TangoRoot";
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
      name: "Dream Augury",
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
  } as unknown as typeof ResizeObserver;
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
      <TangoRoot>
        <div className="dream-atlas">
          <AtlasNode model={value} onActivate={onActivate} />
        </div>
      </TangoRoot>,
    );
  });
  return {
    source: container.querySelector<HTMLElement>("[data-atlas-node-id]")!,
    onActivate,
  };
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
      "Dream Augury",
      "Affiliation: Figments",
    ]);
    expect(source.dataset.revealFeedback).toBe("measured");
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
      expect(source.getAttribute("aria-describedby")).toMatch(
        /^tango-reveal-description-/,
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
    act(() => available.source.click());
    expect(available.onActivate).toHaveBeenCalledWith(NODE_ID);

    const unavailable = renderNode(model("completed"));
    act(() => unavailable.source.click());
    expect(unavailable.onActivate).not.toHaveBeenCalled();
    expect(unavailable.source.getAttribute("aria-disabled")).toBe("true");
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
    const event = new MouseEvent("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    act(() => {
      source.dispatchEvent(event);
    });

    expect(source.dataset.revealActive).toBe("true");
    expect(source.style.getPropertyValue("--reveal-hover-scale")).not.toBe("");
    expect(source.querySelector(".node-glow")?.getAttribute("data-ambient-paused"))
      .toBe("true");
  });
});
