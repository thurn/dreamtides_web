// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AtlasNode,
  atlasPrimaryInfoCard,
  type AtlasNodeModel,
  type AtlasNodePrimary,
} from "../components/atlas/AtlasNode";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { renderInCumulus } from "../testing/render";
import { parseAtlasNodeId, parseDreamsignId } from "../../types/identifiers";
import {
  testArtAssetKey,
  testDreamscapeArtKey,
  testGuideId,
  testPresentationId,
} from "../../types/test-identities";
import {
  AtlasScreen,
  type AtlasNodePlacementView,
  type AtlasView,
} from "./AtlasScreen";

/** `desktop` answers `min-width` queries; `fine` answers hover/pointer ones. */
function stubViewport(desktop: boolean, fine = true): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width")
      ? desktop
      : query.includes("hover")
        ? fine
        : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

let originalVisualViewport: PropertyDescriptor | undefined;

beforeEach(() => {
  originalVisualViewport = Object.getOwnPropertyDescriptor(
    window,
    "visualViewport",
  );
  stubViewport(false);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  if (originalVisualViewport === undefined) {
    Reflect.deleteProperty(window, "visualViewport");
  } else {
    Object.defineProperty(window, "visualViewport", originalVisualViewport);
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function pointer(
  type: "pointerover" | "pointerdown" | "pointerup" | "pointercancel",
  pointerType: "mouse" | "touch",
  options: {
    pointerId?: number;
    x?: number;
    y?: number;
    timeStamp?: number;
  } = {},
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: options.x ?? 100,
    clientY: options.y ?? 100,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: options.pointerId ?? 1 },
    ...(options.timeStamp === undefined
      ? {}
      : { timeStamp: { value: options.timeStamp } }),
  });
  return event;
}

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

const KNOWN_PRIMARY: AtlasNodePrimary = {
  sceneArt: artRef.dreamscapeScene(testDreamscapeArtKey("wilderveil")),
  figureArt: artRef.dreamGuide(testGuideId("aldric")),
  placeName: "Wilderveil",
  guideName: "Aldric, the Seer",
  title: "Aldric, the Seer",
  body: "A curated vision.",
};

const UNSEEN_PRIMARY: AtlasNodePrimary = {
  sceneArt: null,
  figureArt: null,
  placeName: null,
  guideName: null,
  title: "An Unseen Dream",
  body: "Travel onward.",
};

function nodeModel(
  idSeed: string,
  state: AtlasNodeModel["state"],
  overrides: Partial<AtlasNodeModel> = {},
): AtlasNodeModel {
  return {
    id: parseAtlasNodeId(idSeed),
    name: idSeed,
    state,
    role: "regular",
    isReachable: true,
    iconRef: null,
    unrevealedFrameRef: artRef.atlasAsset(testArtAssetKey("fixture-frame.png")),
    siteBadgeGlyph: null,
    knownDreamsignRef: null,
    primary: UNSEEN_PRIMARY,
    dreamsign: null,
    site: null,
    affiliation: null,
    ...overrides,
  };
}

describe("AtlasScreen", () => {
  function placement(model: AtlasNodeModel): AtlasNodePlacementView {
    return { model, left: 500, top: 400, boxSize: 132 };
  }

  function makeView(): AtlasView {
    return {
      stageWidth: 1080,
      stageHeight: 1920,
      nodes: [
        placement(nodeModel("starter", "completed", { role: "starter" })),
        placement(nodeModel("frontier", "available")),
        placement(nodeModel("boss", "revealedLocked", { role: "boss" })),
      ],
      edges: [
        {
          key: "starter-frontier",
          x1: 500,
          y1: 210,
          x2: 500,
          y2: 900,
          kind: "open",
        },
      ],
    };
  }

  it("renders every node, leaves journey chrome to the router, and enters an available node", () => {
    const onEnterNode = vi.fn();
    const { container } = renderInCumulus(
      <AtlasScreen view={makeView()} onEnterNode={onEnterNode} />,
    );

    expect(container.querySelector("[data-cumulus-atlas]")).not.toBeNull();
    expect(container.querySelectorAll("[data-node-state]")).toHaveLength(3);
    expect(container.querySelector("[data-node-starting]")).not.toBeNull();
    expect(container.querySelector("[data-node-boss]")).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    act(() => {
      container
        .querySelector<HTMLElement>('[data-node-state="available"]')
        ?.click();
    });
    expect(onEnterNode).toHaveBeenCalledWith("frontier");
  });

  it("shows delayed tutorial guidance and reports it once visible", () => {
    vi.useFakeTimers();
    const onGuideDialogueShown = vi.fn();
    const view: AtlasView = {
      ...makeView(),
      guideDialogue: {
        id: testPresentationId("tutorial-run:atlas-guidance"),
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "Choose a dream.",
        },
        delaySeconds: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
      },
    };
    const { container } = renderInCumulus(
      <AtlasScreen
        view={view}
        onEnterNode={vi.fn()}
        onGuideDialogueShown={onGuideDialogueShown}
      />,
    );
    const visible = () =>
      container
        .querySelector('[data-testid="atlas-tutorial-dialogue"]')
        ?.getAttribute("data-character-dialogue-visible");

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(visible()).toBe("false");
    expect(onGuideDialogueShown).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(visible()).toBe("true");
    expect(onGuideDialogueShown).toHaveBeenCalledTimes(1);
  });

  it("places touch reveals from the node's live screen rect in a body portal outside stage clipping", async () => {
    stubViewport(false, false);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.revealMeasure === "primary") {
          return domRect(0, 0, 248, 200);
        }
        if (this.dataset.revealMeasure === "secondary") {
          return domRect(0, 0, 180, 120);
        }
        return domRect(0, 0, 0, 0);
      },
    );
    const { container } = renderInCumulus(
      <AtlasScreen view={makeView()} onEnterNode={vi.fn()} />,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-node-state="available"]',
    )!;
    const sourceRect = vi.fn(() => domRect(20, 40, 60, 60));
    source.getBoundingClientRect = sourceRect;
    const placedPrimary = () => {
      const primary = document.querySelector<HTMLElement>(
        '[data-cumulus-reveal-card="primary"]',
      )!;
      return {
        x: Number.parseFloat(primary.style.left),
        y: Number.parseFloat(primary.style.top),
        width: Number.parseFloat(primary.style.width),
        height: Number.parseFloat(primary.style.height),
      };
    };

    await act(async () => {
      source.dispatchEvent(
        pointer("pointerdown", "touch", { pointerId: 31, x: 30, y: 70 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull();
    });
    expect(placedPrimary()).toEqual({
      x: 201.5,
      y: 0,
      width: 175.5,
      height: 141.53225806451613,
    });
    expect(
      document.body.querySelector(":scope > [data-cumulus-reveal-portal]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-cumulus-reveal-portal]")).toBeNull();

    act(() => {
      source.dispatchEvent(
        pointer("pointercancel", "touch", { pointerId: 31, x: 30, y: 70 }),
      );
    });
    sourceRect.mockImplementation(() => domRect(310, 40, 60, 60));
    await act(async () => {
      source.dispatchEvent(
        pointer("pointerdown", "touch", { pointerId: 32, x: 360, y: 70 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await vi.waitFor(() => expect(placedPrimary().x).toBe(13));
  });
});

describe("AtlasNode", () => {
  const NODE_ID = "00000000-0000-4000-8000-000000000051";

  function residentModel(
    state: AtlasNodeModel["state"],
    overrides: Partial<AtlasNodeModel> = {},
  ): AtlasNodeModel {
    return nodeModel(NODE_ID, state, {
      iconRef: artRef.dreamscapeIcon(testDreamscapeArtKey("wilderveil")),
      siteBadgeGlyph: GLYPHS.water,
      knownDreamsignRef: artRef.dreamsign("known.png"),
      primary: KNOWN_PRIMARY,
      dreamsign: {
        id: parseDreamsignId("00000000-0000-4000-8000-000000000052"),
        name: "Known Sign",
        art: artRef.dreamsign("known.png"),
        rulesText: "Your first vision costs less.",
      },
      site: {
        name: "Augury",
        blurb: "Study a curated vision.",
        icon: GLYPHS.water,
      },
      affiliation: { title: "Fixture affiliation", body: "Fixture cards." },
      ...overrides,
    });
  }

  function renderNode(value: AtlasNodeModel) {
    const onActivate = vi.fn();
    const { container } = renderInCumulus(
      <AtlasNode model={value} onPress={onActivate} />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-atlas-node-id]",
    )!;
    source.getBoundingClientRect = () => domRect(80, 90, 132, 132);
    return { container, source, onActivate };
  }

  it("selects the scene reveal for a known place and text for an unseen dream", () => {
    expect(atlasPrimaryInfoCard(KNOWN_PRIMARY)).toMatchObject({
      variant: "atlasReveal",
      title: KNOWN_PRIMARY.placeName,
      subtitle: KNOWN_PRIMARY.guideName,
    });
    expect(atlasPrimaryInfoCard(UNSEEN_PRIMARY)).toMatchObject({
      variant: "text",
      title: UNSEEN_PRIMARY.title,
    });
  });

  it("pairs the Atlas primary with site and affiliation secondaries", () => {
    const value = residentModel("available");
    const { source } = renderNode(value);

    expect(source.dataset.atlasNodeId).toBe(NODE_ID);
    expect(source.dataset.revealEntityType).toBe("atlas-node");
    expect(source.dataset.revealEntityId).toBe(NODE_ID);
    expect(source.dataset.revealPrimaryVariant).toBe("atlasReveal");
    expect(source.dataset.revealSecondaryTitles?.split("\u001f")).toEqual([
      value.site!.name,
      value.affiliation!.title,
    ]);
    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).not.toContain(value.dreamsign!.name);
  });

  it("gives the known Dreamsign its own reveal target without activating the node", () => {
    const { container, onActivate } = renderNode(residentModel("available"));
    const dreamsign = container.querySelector<HTMLElement>(
      "[data-atlas-known-dreamsign-id]",
    )!;

    expect(dreamsign.dataset.revealEntityType).toBe("dreamsign");
    expect(dreamsign.dataset.revealPrimaryVariant).toBe("object");
    act(() => dreamsign.click());
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("activates only an available, reachable node while keeping others focusable", () => {
    const available = renderNode(residentModel("available"));
    act(() => available.source.click());
    expect(available.onActivate).toHaveBeenCalledWith(NODE_ID);

    for (const value of [
      residentModel("completed"),
      residentModel("revealedLocked", { isReachable: false }),
    ]) {
      const blocked = renderNode(value);
      expect(blocked.source.tabIndex).toBe(0);
      expect(blocked.source.getAttribute("aria-disabled")).toBe("true");
      act(() => blocked.source.focus());
      expect(document.activeElement).toBe(blocked.source);
      act(() => blocked.source.click());
      expect(blocked.onActivate).not.toHaveBeenCalled();
    }
  });

  it("activates a quick touch once, suppresses its compatibility click, then accepts keyboard activation", () => {
    const { source, onActivate } = renderNode(residentModel("available"));
    act(() => {
      source.dispatchEvent(pointer("pointerdown", "touch", { pointerId: 7 }));
    });
    act(() => {
      source.dispatchEvent(pointer("pointerup", "touch", { pointerId: 7 }));
    });
    expect(onActivate).toHaveBeenCalledTimes(1);

    act(() => {
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onActivate).toHaveBeenCalledTimes(1);

    act(() => {
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 0 }),
      );
    });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("suppresses touch-hold activation and its compatibility click", () => {
    vi.useFakeTimers();
    const { source, onActivate } = renderNode(residentModel("available"));
    act(() => {
      source.dispatchEvent(
        pointer("pointerdown", "touch", { pointerId: 8, timeStamp: 100 }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(35);
    });
    act(() => {
      source.dispatchEvent(
        pointer("pointerup", "touch", { pointerId: 8, timeStamp: 401 }),
      );
    });
    act(() => {
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("marks the node revealed and pauses ambient glow while hovered", () => {
    const { source } = renderNode(residentModel("available"));
    act(() => {
      source.dispatchEvent(pointer("pointerover", "mouse"));
    });

    expect(source.dataset.revealActive).toBe("true");
    const ambient = source.querySelectorAll("[data-ambient-paused]");
    expect(ambient.length).toBeGreaterThan(0);
    for (const element of ambient) {
      expect(element.getAttribute("data-ambient-paused")).toBe("true");
    }
  });
});
