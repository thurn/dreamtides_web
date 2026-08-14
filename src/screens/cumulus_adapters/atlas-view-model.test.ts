import { testJourneySeed } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { resolveSource } from "../../runtime/localization/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { LayerName } from "../../types/layer-name";
import type {
  DreamAtlas,
  DreamscapeNode,
  JourneyState,
} from "../../types/journey";
import type { JourneyContent } from "../../data/journey-content";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../__test-helpers__/atlas-fixtures";
import {
  ATLAS_LAYOUT_DESKTOP,
  ATLAS_LAYOUT_MOBILE,
  ATLAS_STAGE_HEIGHT,
  ATLAS_STAGE_LANDSCAPE_HEIGHT,
  ATLAS_STAGE_LANDSCAPE_WIDTH,
  ATLAS_STAGE_WIDTH,
  atlasChoiceLayer,
  atlasEdgeKind,
  buildAtlasGuidanceLog,
  buildAtlasGuideDialogue,
  buildAtlasMapEdges,
  buildAtlasMapNodes,
  buildAtlasView,
  resolveAtlasNodeGeometry,
} from "./atlas-view-model";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseJourneyId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import { testAffiliationId, testDreamscapeId, testDreamsignId, testGuideId, testTideId } from "../../types/test-identities";

const STARTER_NODE_ID = parseAtlasNodeId("starter");
const MIDDLE_NODE_ID = parseAtlasNodeId("middle");
const BOSS_NODE_ID = parseAtlasNodeId("boss");
const CHOSEN_NODE_ID = parseAtlasNodeId("chosen");
const PASSED_NODE_ID = parseAtlasNodeId("passed");

/** A structurally valid but content-free JourneyContent for builder tests. */
const EMPTY_CONTENT: JourneyContent = {
  ...CONFIG_DATA_FIXTURE,
  draftData: draftDataFixture(),
  cardDatabase: new Map(),
  dreamAvatars: [],
  dreamwellCards: [],
  dreamsignTemplates: [],
  dreamscapes: [],
  affiliations: [],
  guides: [],
  atlasData: MINIMAL_ATLAS_DATA,
  sitesData: MINIMAL_SITES_DATA,
  economyData: economyFixture(),
  opponentsData: opponentsFixture(),
};

function makeNode(
  id: AtlasNodeId,
  layer: LayerName,
  position: { x: number; y: number },
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer,
    indexInLayer: 0,
    dreamscapeId: null,
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
  const starter = makeNode(
    STARTER_NODE_ID,
    LayerName.One,
    { x: 0, y: 0 },
    {
      state: "completed",
      forwardIds: [MIDDLE_NODE_ID],
    },
  );
  const middle = makeNode(
    MIDDLE_NODE_ID,
    LayerName.Two,
    { x: 100, y: -40 },
    {
      state: "available",
      forwardIds: [BOSS_NODE_ID],
    },
  );
  const boss = makeNode(
    BOSS_NODE_ID,
    LayerName.Seven,
    { x: 600, y: 40 },
    {
      state: "revealedLocked",
    },
  );
  return {
    layers: [
      [STARTER_NODE_ID],
      [MIDDLE_NODE_ID],
      [],
      [],
      [],
      [],
      [BOSS_NODE_ID],
    ],
    nodes: {
      [STARTER_NODE_ID]: starter,
      [MIDDLE_NODE_ID]: middle,
      [BOSS_NODE_ID]: boss,
    },
    startingNodeId: STARTER_NODE_ID,
    bossNodeId: BOSS_NODE_ID,
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
  const starter = makeNode(
    STARTER_NODE_ID,
    LayerName.One,
    { x: 0, y: 0 },
    {
      state: "completed",
      forwardIds: [CHOSEN_NODE_ID, PASSED_NODE_ID],
    },
  );
  const chosen = makeNode(
    CHOSEN_NODE_ID,
    LayerName.Two,
    { x: 100, y: -40 },
    {
      state: "available",
      forwardIds: [BOSS_NODE_ID],
      dreamscapeId: testDreamscapeId("ds_chosen"),
      knownDreamsignId: testDreamsignId("sign_chosen"),
    },
  );
  const passed = makeNode(
    PASSED_NODE_ID,
    LayerName.Two,
    { x: 100, y: 40 },
    {
      state: "forgone",
      forwardIds: [BOSS_NODE_ID],
      dreamscapeId: testDreamscapeId("ds_passed"),
      knownDreamsignId: testDreamsignId("sign_passed"),
    },
  );
  const boss = makeNode(
    BOSS_NODE_ID,
    LayerName.Seven,
    { x: 600, y: 0 },
    {
      state: "revealedLocked",
    },
  );
  return {
    layers: [
      [STARTER_NODE_ID],
      [CHOSEN_NODE_ID, PASSED_NODE_ID],
      [],
      [],
      [],
      [],
      [BOSS_NODE_ID],
    ],
    nodes: {
      [STARTER_NODE_ID]: starter,
      [CHOSEN_NODE_ID]: chosen,
      [PASSED_NODE_ID]: passed,
      [BOSS_NODE_ID]: boss,
    },
    startingNodeId: STARTER_NODE_ID,
    bossNodeId: BOSS_NODE_ID,
    currentNodeId: null,
    knownDreamsignCarrierIds: [],
  };
}

describe("resolveAtlasNodeGeometry", () => {
  it("runs the layer axis vertically bottom-up: starter at the bottom, boss at the top", () => {
    const geometry = resolveAtlasNodeGeometry(makeVerticalAtlas());
    const starter = geometry.get(STARTER_NODE_ID);
    const middle = geometry.get(MIDDLE_NODE_ID);
    const boss = geometry.get(BOSS_NODE_ID);
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
    expect(geometry.get(STARTER_NODE_ID)!.size).toBe(geometry.get(BOSS_NODE_ID)!.size);
    expect(geometry.get(MIDDLE_NODE_ID)!.size).toBeLessThan(
      geometry.get(STARTER_NODE_ID)!.size,
    );
    expect(geometry.get(STARTER_NODE_ID)!.role).toBe("starter");
    expect(geometry.get(BOSS_NODE_ID)!.role).toBe("boss");
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
    const starter = geometry.get(STARTER_NODE_ID);
    const middle = geometry.get(MIDDLE_NODE_ID);
    const boss = geometry.get(BOSS_NODE_ID);
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
    expect(mobile.get(MIDDLE_NODE_ID)!.size).toBeGreaterThan(
      desktop.get(MIDDLE_NODE_ID)!.size,
    );
    expect(mobile.get(STARTER_NODE_ID)!.size).toBeGreaterThan(
      desktop.get(STARTER_NODE_ID)!.size,
    );
  });
});

describe("atlasChoiceLayer", () => {
  it("reports the layer of the available frontier", () => {
    expect(atlasChoiceLayer(makeVerticalAtlas())).toBe(LayerName.Two);
  });

  it("is null once no node is available", () => {
    const atlas = makeVerticalAtlas();
    atlas.nodes[MIDDLE_NODE_ID].state = "completed";
    expect(atlasChoiceLayer(atlas)).toBeNull();
  });
});

describe("buildAtlasGuideDialogue", () => {
  const configuration = {
    speechBubble: {
      speaker: "mira" as const,
      delay: 1,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      text: "On the [purple]Atlas[/purple] screen, choose a dream.",
    },
  };

  it("builds guidance only on the tutorial journey's first Atlas visit", () => {
    const firstAtlasState = {
      isTutorialJourney: true,
      completionLevel: 1,
      runId: parseJourneyId("tutorial-run"),
      seed: testJourneySeed("tutorial-seed"),
    } as JourneyState;

    expect(
      buildAtlasGuideDialogue(firstAtlasState, configuration),
    ).toMatchObject({
      id: "tutorial-run:atlas-guidance",
      delaySeconds: 1,
      bubbleWidth: 700,
      model: {
        speakerName: "Mira",
        text: "On the [purple]Atlas[/purple] screen, choose a dream.",
      },
    });
    expect(
      buildAtlasGuideDialogue(
        { ...firstAtlasState, completionLevel: 2 },
        configuration,
      ),
    ).toBeUndefined();
    expect(
      buildAtlasGuideDialogue(
        { ...firstAtlasState, isTutorialJourney: false },
        configuration,
      ),
    ).toBeUndefined();

    const dialogue = buildAtlasGuideDialogue(firstAtlasState, configuration);
    expect(dialogue).toBeDefined();
    expect(buildAtlasGuidanceLog(firstAtlasState, dialogue!)).toEqual({
      key: "tutorial-atlas-guidance:tutorial-run",
      fields: {
        completionLevel: 1,
        delaySeconds: 1,
        horizontalOffsetPx: 0,
        verticalOffsetPx: 0,
        bubbleWidthPx: 700,
        text: "On the [purple]Atlas[/purple] screen, choose a dream.",
      },
    });
  });
});

describe("atlasEdgeKind", () => {
  const from = (state: DreamscapeNode["state"], layer: LayerName) =>
    makeNode(parseAtlasNodeId("f"), layer, { x: 0, y: 0 }, { state });
  const to = (state: DreamscapeNode["state"], layer: LayerName) =>
    makeNode(parseAtlasNodeId("t"), layer, { x: 0, y: 0 }, { state });

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
    const content: JourneyContent = {
      ...EMPTY_CONTENT,
      atlasData: {
        ...MINIMAL_ATLAS_DATA,
        boss: {
          ...MINIMAL_ATLAS_DATA.boss,
          place: "Synthetic boss place",
          sceneArtId: testDreamscapeId("synthetic-boss-scene"),
        },
      },
    };
    const items = buildAtlasMapNodes(makeVerticalAtlas(), content);
    expect(items).toHaveLength(3);
    const boss = items.find((item) => item.model.id === "boss");
    expect(boss?.model.role).toBe("boss");
    expect(resolveSource(boss!.model.primary.placeName!)).toBe(
      "Synthetic boss place",
    );
    expect(boss?.model.primary.sceneArt).toEqual({
      kind: "dreamscape-scene",
      dreamscapeId: testDreamscapeId("synthetic-boss-scene"),
    });
    // An available (revealed) node's card is not the unrevealed variant, even
    // with no dreamscape content resolved.
    const middle = items.find((item) => item.model.id === "middle");
    expect(middle?.model.primary.sceneArt).toBeNull(); // available but no dreamscape content
  });

  it("fades a forgone sibling and renders it as an unrevealed, badge-free frame", () => {
    const items = buildAtlasMapNodes(makeForgoneAtlas(), EMPTY_CONTENT);
    const chosen = items.find((item) => item.model.id === "chosen");
    const passed = items.find((item) => item.model.id === "passed");
    // Every positioned node still renders — the passed-by sibling is faded, not
    // dropped.
    expect(items).toHaveLength(4);
    expect(chosen?.model.isReachable).toBe(true);
    expect(passed?.model.isReachable).toBe(false);
    // The unreachable node reveals nothing: no dreamscape icon, no site badge,
    // no known-dreamsign card, and its reveal card reads as unrevealed.
    expect(passed?.model.iconRef).toBeNull();
    expect(passed?.model.siteBadgeGlyph).toBeNull();
    expect(passed?.model.knownDreamsignRef).toBeNull();
    expect(passed?.model.dreamsign).toBeNull();
    expect(passed?.model.primary.sceneArt).toBeNull();
  });

  it("carries a resident dreamscape's signature site as a standard site info card", () => {
    const atlas = makeVerticalAtlas();
    atlas.nodes[MIDDLE_NODE_ID].dreamscapeId = testDreamscapeId("wilderveil");
    atlas.nodes[MIDDLE_NODE_ID].sites = [
      {
        id: parseSiteId("00000000-0000-4000-8000-000000000091"),
        type: "Augury",
        isEnhanced: false,
        isVisited: false,
      },
    ];
    const content: JourneyContent = {
      ...EMPTY_CONTENT,
      atlasData: {
        ...MINIMAL_ATLAS_DATA,
        presentation: {
          ...MINIMAL_ATLAS_DATA.presentation,
          affiliationTitleTemplate: "Fixture title {name}",
          affiliationBodyTemplate: "Fixture body {card-theme}",
        },
      },
      sitesData: {
        ...MINIMAL_SITES_DATA,
        siteTypes: {
          ...MINIMAL_SITES_DATA.siteTypes,
          Augury: {
            ...MINIMAL_SITES_DATA.siteTypes.Augury,
            icon: "fixture-atlas-icon",
          },
        },
      },
      dreamscapes: [
        {
          id: testDreamscapeId("wilderveil"),
          name: "Wilderveil",
          guideId: testGuideId("aldric"),
          signatureSite: "Augury",
          affiliationId: testAffiliationId("figments"),
          isStarter: false,
          dreamAvatarIds: [],
        },
      ],
      guides: [
        {
          id: testGuideId("aldric"),
          name: "Aldric, the Seer",
          homeDreamscapeId: testDreamscapeId("wilderveil"),
          siteType: "Augury",
          portraitSource: "fixture-guide.png",
          dialogue: { site: [] },
          homeSpecialty: "Aldric offers curated visions of the future.",
        },
      ],
      affiliations: [
        {
          id: testAffiliationId("figments"),
          name: "Figments",
          atlasCardTheme: "Figment",
          tideIds: [testTideId("tide-a"), testTideId("tide-b"), testTideId("tide-c")],
        },
      ],
    };

    const items = buildAtlasMapNodes(atlas, content);
    const middle = items.find((item) => item.model.id === "middle");

    expect(resolveSource(middle!.model.site!.name)).toBe("Augury");
    expect(resolveSource(middle!.model.site!.blurb).length).toBeGreaterThan(0);
    expect(middle?.model.site?.icon).toBe("fixture-atlas-icon");
    expect(resolveSource(middle!.model.affiliation!.title)).toBe(
      "Fixture title Figments",
    );
    expect(resolveSource(middle!.model.affiliation!.body)).toBe(
      "Fixture body Figment",
    );
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

describe("buildAtlasView", () => {
  it("assembles the portrait stage, nodes, and edges", () => {
    const view = buildAtlasView(makeVerticalAtlas(), EMPTY_CONTENT);
    expect(view.stageWidth).toBe(ATLAS_STAGE_WIDTH);
    expect(view.stageHeight).toBe(ATLAS_STAGE_HEIGHT);
    expect(view.nodes).toHaveLength(3);
    // starter → middle and middle → boss.
    expect(view.edges).toHaveLength(2);
  });

  it("assembles a landscape stage on desktop", () => {
    const view = buildAtlasView(makeVerticalAtlas(), EMPTY_CONTENT, true);
    expect(view.stageWidth).toBe(ATLAS_STAGE_LANDSCAPE_WIDTH);
    expect(view.stageHeight).toBe(ATLAS_STAGE_LANDSCAPE_HEIGHT);
    expect(view.stageWidth).toBeGreaterThan(view.stageHeight);
  });
});
