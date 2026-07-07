import { describe, expect, it } from "vitest";
import { LayerName } from "../../types/layer-name";
import type {
  DreamAtlas,
  DreamscapeNode,
  QuestState,
} from "../../types/quest";
import type { QuestContent } from "../../data/quest-content";
import { MINIMAL_ATLAS_CONFIG } from "../../__test-helpers__/atlas-fixtures";
import {
  ATLAS_LAYOUT_DESKTOP,
  ATLAS_LAYOUT_MOBILE,
  ATLAS_STAGE_HEIGHT,
  ATLAS_STAGE_LANDSCAPE_HEIGHT,
  ATLAS_STAGE_LANDSCAPE_WIDTH,
  ATLAS_STAGE_WIDTH,
  atlasChoiceLayer,
  atlasEdgeKind,
  buildAtlasHudView,
  buildAtlasMapEdges,
  buildAtlasMapNodes,
  buildAtlasView,
  resolveAtlasNodeGeometry,
} from "./atlas-view-model";

/** A structurally valid but content-free QuestContent for builder tests. */
const EMPTY_CONTENT: QuestContent = {
  cardDatabase: new Map(),
  dreamcallers: [],
  dreamwellCards: [],
  dreamsignTemplates: [],
  dreamscapes: [],
  affiliations: [],
  guides: [],
  atlasConfig: MINIMAL_ATLAS_CONFIG,
};

function makeNode(
  id: string,
  layer: LayerName,
  position: { x: number; y: number },
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer,
    indexInLayer: 0,
    dreamscapeId: null,
    biomeName: "",
    biomeColor: "",
    sites: [],
    position,
    state: "unrevealed",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
    ...overrides,
  };
}

/**
 * A three-layer atlas: a completed starter, an available middle node, and the
 * boss at the deepest layer, wired starter → middle → boss.
 */
function makeVerticalAtlas(): DreamAtlas {
  const starter = makeNode("starter", LayerName.One, { x: 0, y: 0 }, {
    state: "completed",
    forwardIds: ["middle"],
  });
  const middle = makeNode("middle", LayerName.Two, { x: 100, y: -40 }, {
    state: "available",
    forwardIds: ["boss"],
  });
  const boss = makeNode("boss", LayerName.Seven, { x: 600, y: 40 }, {
    state: "revealedLocked",
  });
  return {
    layers: [["starter"], ["middle"], [], [], [], [], ["boss"]],
    nodes: { starter, middle, boss },
    startingNodeId: "starter",
    bossNodeId: "boss",
    currentNodeId: null,
    knownDreamsignCarrierIds: [],
  };
}

/**
 * A run where the player, at the layer-two frontier, chose `chosen` over its
 * sibling `passed`; both wire forward to the boss. `passed` is therefore
 * unreachable, so the builders fade it and blank its revealed content.
 */
function makeForgoneAtlas(): DreamAtlas {
  const starter = makeNode("starter", LayerName.One, { x: 0, y: 0 }, {
    state: "completed",
    forwardIds: ["chosen", "passed"],
  });
  const chosen = makeNode("chosen", LayerName.Two, { x: 100, y: -40 }, {
    state: "available",
    forwardIds: ["boss"],
    dreamscapeId: "ds_chosen",
    knownDreamsignId: "sign_chosen",
  });
  const passed = makeNode("passed", LayerName.Two, { x: 100, y: 40 }, {
    state: "forgone",
    forwardIds: ["boss"],
    dreamscapeId: "ds_passed",
    knownDreamsignId: "sign_passed",
  });
  const boss = makeNode("boss", LayerName.Seven, { x: 600, y: 0 }, {
    state: "revealedLocked",
  });
  return {
    layers: [["starter"], ["chosen", "passed"], [], [], [], [], ["boss"]],
    nodes: { starter, chosen, passed, boss },
    startingNodeId: "starter",
    bossNodeId: "boss",
    currentNodeId: null,
    knownDreamsignCarrierIds: [],
  };
}

describe("resolveAtlasNodeGeometry", () => {
  it("runs the layer axis vertically bottom-up: starter at the bottom, boss at the top", () => {
    const geometry = resolveAtlasNodeGeometry(makeVerticalAtlas());
    const starter = geometry.get("starter");
    const middle = geometry.get("middle");
    const boss = geometry.get("boss");
    expect(starter && middle && boss).toBeTruthy();
    // The starter (layer axis min) is lowest on screen (largest `top`); the boss
    // (layer axis max) is highest (smallest `top`); the middle sits between them.
    expect(starter!.top).toBeGreaterThan(middle!.top);
    expect(middle!.top).toBeGreaterThan(boss!.top);
    // The starter is the bottommost node and the boss is the topmost.
    const tops = [starter!.top, middle!.top, boss!.top];
    expect(Math.max(...tops)).toBe(starter!.top);
    expect(Math.min(...tops)).toBe(boss!.top);
  });

  it("sizes the starter and boss larger than a regular node", () => {
    const geometry = resolveAtlasNodeGeometry(makeVerticalAtlas());
    expect(geometry.get("starter")!.size).toBe(geometry.get("boss")!.size);
    expect(geometry.get("middle")!.size).toBeLessThan(
      geometry.get("starter")!.size,
    );
    expect(geometry.get("starter")!.isStarter).toBe(true);
    expect(geometry.get("boss")!.isBoss).toBe(true);
  });

  it("returns an empty map for an atlas with no positioned nodes", () => {
    const atlas = makeVerticalAtlas();
    expect(resolveAtlasNodeGeometry({ ...atlas, nodes: {} }).size).toBe(0);
  });

  it("runs the layer axis left-to-right on the landscape (desktop) profile: starter at the left, boss at the right", () => {
    const geometry = resolveAtlasNodeGeometry(
      makeVerticalAtlas(),
      ATLAS_LAYOUT_DESKTOP,
    );
    const starter = geometry.get("starter");
    const middle = geometry.get("middle");
    const boss = geometry.get("boss");
    expect(starter && middle && boss).toBeTruthy();
    // The starter (layer axis min) is leftmost (smallest `left`); the boss
    // (layer axis max) is rightmost (largest `left`); the middle sits between.
    expect(starter!.left).toBeLessThan(middle!.left);
    expect(middle!.left).toBeLessThan(boss!.left);
    const lefts = [starter!.left, middle!.left, boss!.left];
    expect(Math.min(...lefts)).toBe(starter!.left);
    expect(Math.max(...lefts)).toBe(boss!.left);
    // The within-layer spread fans vertically, so a node's y decides its `top`.
    expect(middle!.top).toBeLessThan(boss!.top);
  });

  it("draws larger nodes on mobile than on desktop so icons stay legible once the narrow viewport scales the stage down", () => {
    const atlas = makeVerticalAtlas();
    const mobile = resolveAtlasNodeGeometry(atlas, ATLAS_LAYOUT_MOBILE);
    const desktop = resolveAtlasNodeGeometry(atlas, ATLAS_LAYOUT_DESKTOP);
    expect(mobile.get("middle")!.size).toBeGreaterThan(
      desktop.get("middle")!.size,
    );
    expect(mobile.get("starter")!.size).toBeGreaterThan(
      desktop.get("starter")!.size,
    );
  });
});

describe("atlasChoiceLayer", () => {
  it("reports the layer of the available frontier", () => {
    expect(atlasChoiceLayer(makeVerticalAtlas())).toBe(LayerName.Two);
  });

  it("is null once no node is available", () => {
    const atlas = makeVerticalAtlas();
    atlas.nodes.middle.state = "completed";
    expect(atlasChoiceLayer(atlas)).toBeNull();
  });
});

describe("atlasEdgeKind", () => {
  const from = (state: DreamscapeNode["state"], layer: LayerName) =>
    makeNode("f", layer, { x: 0, y: 0 }, { state });
  const to = (state: DreamscapeNode["state"], layer: LayerName) =>
    makeNode("t", layer, { x: 0, y: 0 }, { state });

  it("draws a traveled edge between two completed nodes", () => {
    expect(
      atlasEdgeKind(
        from("completed", LayerName.One),
        to("completed", LayerName.Two),
        LayerName.Three,
      ),
    ).toBe("traveled");
  });

  it("draws an open edge from a completed node into the available frontier", () => {
    expect(
      atlasEdgeKind(
        from("completed", LayerName.One),
        to("available", LayerName.Two),
        LayerName.Two,
      ),
    ).toBe("open");
  });

  it("dots an edge that originates deeper than the current frontier", () => {
    expect(
      atlasEdgeKind(
        from("revealedLocked", LayerName.Four),
        to("unrevealed", LayerName.Five),
        LayerName.Two,
      ),
    ).toBe("locked");
  });

  it("draws a dim edge for everything at or before the frontier", () => {
    expect(
      atlasEdgeKind(
        from("available", LayerName.Two),
        to("revealedLocked", LayerName.Three),
        LayerName.Two,
      ),
    ).toBe("dim");
  });
});

describe("buildAtlasMapNodes", () => {
  it("produces one item per positioned node, carrying its face and reveal card", () => {
    const items = buildAtlasMapNodes(makeVerticalAtlas(), EMPTY_CONTENT);
    expect(items).toHaveLength(3);
    const boss = items.find((item) => item.view.node.id === "boss");
    expect(boss?.view.isBoss).toBe(true);
    expect(boss?.card.isBoss).toBe(true);
    // An available (revealed) node's card is not the unrevealed variant, even
    // with no dreamscape content resolved.
    const middle = items.find((item) => item.view.node.id === "middle");
    expect(middle?.card.isUnrevealed).toBe(true); // available but no dreamscape content
  });

  it("fades a forgone sibling and renders it as an unrevealed, badge-free frame", () => {
    const items = buildAtlasMapNodes(makeForgoneAtlas(), EMPTY_CONTENT);
    const chosen = items.find((item) => item.view.node.id === "chosen");
    const passed = items.find((item) => item.view.node.id === "passed");
    // Every positioned node still renders — the passed-by sibling is faded, not
    // dropped.
    expect(items).toHaveLength(4);
    expect(chosen?.view.isReachable).toBe(true);
    expect(passed?.view.isReachable).toBe(false);
    // The unreachable node reveals nothing: no dreamscape icon, no site badge,
    // no known-dreamsign card, and its reveal card reads as unrevealed.
    expect(passed?.view.iconRef).toBeNull();
    expect(passed?.view.siteBadgeGlyph).toBeNull();
    expect(passed?.view.knownDreamsignRef).toBeNull();
    expect(passed?.card.dreamsign).toBeNull();
    expect(passed?.card.isUnrevealed).toBe(true);
  });

  it("carries a resident dreamscape's signature site as a standard site info card", () => {
    const atlas = makeVerticalAtlas();
    atlas.nodes.middle.dreamscapeId = "wilderveil";
    atlas.nodes.middle.biomeName = "Wilderveil";
    const content: QuestContent = {
      ...EMPTY_CONTENT,
      dreamscapes: [
        {
          id: "wilderveil",
          name: "Wilderveil",
          aesthetic: "Moonlit forest",
          guideId: "aldric",
          signatureSite: "DreamAugury",
          affiliationId: "abandon",
          siteIcon: "dream-augury",
          isStarter: false,
          dreamcallerIds: [],
        },
      ],
      guides: [
        {
          id: "aldric",
          name: "Aldric, the Seer",
          homeDreamscapeId: "wilderveil",
          siteType: "DreamAugury",
          dialog: [],
          homeSpecialty: "Aldric offers curated visions of the future.",
        },
      ],
      affiliations: [
        {
          id: "abandon",
          name: "Abandon",
          signatureCards: [],
          weightStrength: 1,
          opponentBiasStrength: 1,
        },
      ],
    };

    const items = buildAtlasMapNodes(atlas, content);
    const middle = items.find((item) => item.view.node.id === "middle");

    expect(middle?.card.siteCard).toMatchObject({
      name: "Dream Augury",
    });
    expect(middle?.card.siteCard?.blurb.length).toBeGreaterThan(0);
    expect(middle?.card.siteCard?.icon).toContain("bx");
  });
});

describe("buildAtlasMapEdges", () => {
  it("draws every connector touching an unreachable node dim", () => {
    const edges = buildAtlasMapEdges(makeForgoneAtlas());
    const kindOf = (key: string) =>
      edges.find((edge) => edge.key === key)?.kind;
    // Both edges touching the forgone `passed` node are forced dim; the open
    // route into the node the player is still on keeps its lively styling.
    expect(kindOf("starter-passed")).toBe("dim");
    expect(kindOf("passed-boss")).toBe("dim");
    expect(kindOf("starter-chosen")).toBe("open");
  });
});

describe("buildAtlasHudView", () => {
  it("maps essence and deck size from run state", () => {
    const state = {
      essence: 7,
      deck: [{}, {}, {}],
      dreamcaller: null,
      dreamsigns: [],
    } as unknown as QuestState;
    const hud = buildAtlasHudView(state);
    expect(hud.essence).toBe(7);
    expect(hud.deck).toBe(3);
    expect(hud.dreamcaller).toBeUndefined();
    expect(hud.dreamsigns).toEqual([]);
  });
});

describe("buildAtlasView", () => {
  it("assembles the portrait stage, nodes, edges, and HUD", () => {
    const state = {
      essence: 0,
      deck: [],
      dreamcaller: null,
      dreamsigns: [],
      completionLevel: 1,
    } as unknown as QuestState;
    const view = buildAtlasView(makeVerticalAtlas(), EMPTY_CONTENT, state);
    expect(view.stageWidth).toBe(ATLAS_STAGE_WIDTH);
    expect(view.stageHeight).toBe(ATLAS_STAGE_HEIGHT);
    expect(view.nodes).toHaveLength(3);
    // starter → middle and middle → boss.
    expect(view.edges).toHaveLength(2);
    expect(view.hud.essence).toBe(0);
  });

  it("assembles a landscape stage on desktop", () => {
    const state = {
      essence: 0,
      deck: [],
      dreamcaller: null,
      dreamsigns: [],
      completionLevel: 1,
    } as unknown as QuestState;
    const view = buildAtlasView(makeVerticalAtlas(), EMPTY_CONTENT, state, true);
    expect(view.stageWidth).toBe(ATLAS_STAGE_LANDSCAPE_WIDTH);
    expect(view.stageHeight).toBe(ATLAS_STAGE_LANDSCAPE_HEIGHT);
    expect(view.stageWidth).toBeGreaterThan(view.stageHeight);
  });
});
