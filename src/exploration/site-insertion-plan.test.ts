import { describe, expect, it } from "vitest";
import { stableDigest } from "../reward-selection/stable";
import { createDefaultState } from "../state/journey-context";
import { LayerName } from "../types/layer-name";
import type { JourneyState, SiteState } from "../types/journey";
import {
  explorationSiteInsertionPreparationsEqual,
  explorationSiteTypeChoicePreparationsEqual,
  prepareExplorationSiteInsertion,
  prepareExplorationSiteTypeChoice,
} from "./site-insertion-plan";
import { parseSiteId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import type { ExplorationActionId } from "../types/identifiers";
import { testCardId, testDreamscapeId, testExplorationActionId, testGuideId } from "../types/test-identities";
import { parseSelectionContentRevision } from "../types/selection-content-revision";
import { parseSelectionRulesVersion } from "../reward-selection/types";

const FIXED_ACTION_ID = testExplorationActionId("fixed-action");
const SECOND_ACTION_ID = testExplorationActionId("second-action");
const CHOICE_ACTION_ID = testExplorationActionId("choice-action");

function insertedSiteId(actionId: ExplorationActionId) {
  return parseSiteId(`site-exploration-${sourceSite.id}-${actionId}`);
}

const sourceSite: SiteState = {
  id: parseSiteId("source-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

const battleSite: SiteState = {
  id: parseSiteId("battle-site"),
  type: "Battle",
  isEnhanced: false,
  isVisited: false,
};

function journey(): JourneyState {
  const base = createDefaultState();
  return {
    ...base,
    currentDreamscape: parseAtlasNodeId("current-node"),
    atlas: {
      ...base.atlas,
      currentNodeId: parseAtlasNodeId("current-node"),
      nodes: {
        [parseAtlasNodeId("current-node")]: {
          id: parseAtlasNodeId("current-node"),
          layer: LayerName.Two,
          indexInLayer: 0,
          dreamscapeId: testDreamscapeId("fixture-dreamscape"),
          sites: [sourceSite, battleSite],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
    },
  };
}

function prepare(
  state = journey(),
  sourceActionId: ExplorationActionId = FIXED_ACTION_ID,
) {
  return prepareExplorationSiteInsertion({
    journey: state,
    sourceSite,
    sourceActionId,
    encounterCardId: testCardId("encounter-card"),
    siteType: "DreamsignBazaar",
    selectionRulesVersion: parseSelectionRulesVersion("rules-v1"),
    selectionContentRevision: parseSelectionContentRevision("content-v1"),
  });
}

describe("Exploration fixed-site insertion planning", () => {
  it("binds the current owner, exact sibling order, append index, and stable identity", () => {
    const first = prepare();
    const replay = prepare();

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      sourceSiteId: sourceSite.id,
      sourceActionId: FIXED_ACTION_ID,
      targetNodeId: parseAtlasNodeId("current-node"),
      insertionIndex: 2,
      siblingSiteIdsBefore: [sourceSite.id, battleSite.id],
      insertedSite: {
        id: insertedSiteId(FIXED_ACTION_ID),
        type: "DreamsignBazaar",
        isEnhanced: false,
        isVisited: false,
      },
    });
  });

  it("binds the signature and identity to the source action", () => {
    const first = prepare();
    const second = prepare(journey(), SECOND_ACTION_ID);

    expect(first?.insertedSite.id).not.toBe(second?.insertedSite.id);
    expect(first?.planSignature).not.toBe(second?.planSignature);
  });

  it("rejects a non-current owner and globally duplicated minted identity", () => {
    const offNode = journey();
    offNode.atlas.currentNodeId = parseAtlasNodeId("elsewhere");
    expect(prepare(offNode)).toBeNull();

    const duplicated = journey();
    const node = duplicated.atlas.nodes[parseAtlasNodeId("current-node")];
    if (node === undefined) throw new Error("Expected fixture node");
    node.sites.push({
      id: insertedSiteId(FIXED_ACTION_ID),
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    });
    expect(prepare(duplicated)).toBeNull();
  });

  it("detects any prepared field tampering", () => {
    const plan = prepare();
    if (plan === null) throw new Error("Expected a plan");
    const variants = [
      { ...plan, targetNodeId: parseAtlasNodeId("forged") },
      { ...plan, insertionIndex: plan.insertionIndex + 1 },
      {
        ...plan,
        siblingSiteIdsBefore: [...plan.siblingSiteIdsBefore].reverse(),
      },
      {
        ...plan,
        insertedSite: { ...plan.insertedSite, id: parseSiteId("forged") },
      },
      {
        ...plan,
        insertedSite: { ...plan.insertedSite, type: "Shop" as const },
      },
      {
        ...plan,
        insertedSite: {
          ...plan.insertedSite,
          randomSite: {
            mode: "single" as const,
            candidateSiteTypes: ["Shop" as const],
            presentingGuideId: testGuideId("forged-guide"),
          },
        },
      },
      { ...plan, planSignature: stableDigest("forged") },
    ];

    for (const variant of variants) {
      expect(explorationSiteInsertionPreparationsEqual(plan, variant)).toBe(
        false,
      );
    }
  });
});

function prepareChoice(
  state = journey(),
  siteTypes = ["Shop", "Purge", "Duplication"] as const,
) {
  return prepareExplorationSiteTypeChoice({
    journey: state,
    sourceSite,
    sourceActionId: CHOICE_ACTION_ID,
    encounterCardId: testCardId("encounter-card"),
    siteTypes,
    selectorSignature: stableDigest("selector-signature"),
    selectionRulesVersion: parseSelectionRulesVersion("rules-v1"),
    selectionContentRevision: parseSelectionContentRevision("content-v1"),
  });
}

describe("Exploration site-type choice planning", () => {
  it("binds three ordered distinct alternatives to one stable site identity", () => {
    const plan = prepareChoice();
    expect(plan).toMatchObject({
      sourceSiteId: sourceSite.id,
      sourceActionId: CHOICE_ACTION_ID,
      targetNodeId: parseAtlasNodeId("current-node"),
      insertionIndex: 2,
      siblingSiteIdsBefore: [sourceSite.id, battleSite.id],
      selectorSignature: stableDigest("selector-signature"),
      choices: [
        { siteType: "Shop" },
        { siteType: "Purge" },
        { siteType: "Duplication" },
      ],
    });
    expect(plan?.choices.map(({ insertedSite }) => insertedSite.id)).toEqual([
      insertedSiteId(CHOICE_ACTION_ID),
      insertedSiteId(CHOICE_ACTION_ID),
      insertedSiteId(CHOICE_ACTION_ID),
    ]);
    expect(
      plan?.choices.map(({ siteType, insertedSite }) => ({
        siteType,
        insertedSite,
      })),
    ).toEqual([
      {
        siteType: "Shop",
        insertedSite: {
          id: insertedSiteId(CHOICE_ACTION_ID),
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        },
      },
      {
        siteType: "Purge",
        insertedSite: {
          id: insertedSiteId(CHOICE_ACTION_ID),
          type: "Purge",
          isEnhanced: false,
          isVisited: false,
        },
      },
      {
        siteType: "Duplication",
        insertedSite: {
          id: insertedSiteId(CHOICE_ACTION_ID),
          type: "Duplication",
          isEnhanced: false,
          isVisited: false,
        },
      },
    ]);
    expect(prepareChoice()).toEqual(plan);
  });

  it("requires exactly three distinct supported alternatives and current topology", () => {
    expect(
      prepareExplorationSiteTypeChoice({
        journey: journey(),
        sourceSite,
        sourceActionId: CHOICE_ACTION_ID,
        encounterCardId: testCardId("encounter-card"),
        siteTypes: ["Shop", "Purge"],
        selectorSignature: stableDigest("selector-signature"),
        selectionRulesVersion: parseSelectionRulesVersion("rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("content-v1"),
      }),
    ).toBeNull();
    expect(
      prepareExplorationSiteTypeChoice({
        journey: journey(),
        sourceSite,
        sourceActionId: CHOICE_ACTION_ID,
        encounterCardId: testCardId("encounter-card"),
        siteTypes: ["Shop", "Shop", "Purge"],
        selectorSignature: stableDigest("selector-signature"),
        selectionRulesVersion: parseSelectionRulesVersion("rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("content-v1"),
      }),
    ).toBeNull();

    const stale = journey();
    stale.atlas.nodes[parseAtlasNodeId("current-node")]?.sites.push({
      id: insertedSiteId(CHOICE_ACTION_ID),
      type: "Purge",
      isEnhanced: false,
      isVisited: false,
    });
    expect(prepareChoice(stale)).toBeNull();
  });

  it("detects selector, topology, order, choice, and inserted-record tampering", () => {
    const plan = prepareChoice();
    if (plan === null) throw new Error("Expected a choice plan");
    const variants = [
      { ...plan, selectorSignature: stableDigest("forged") },
      { ...plan, planSignature: stableDigest("forged") },
      { ...plan, targetNodeId: parseAtlasNodeId("forged") },
      { ...plan, insertionIndex: plan.insertionIndex + 1 },
      {
        ...plan,
        siblingSiteIdsBefore: [...plan.siblingSiteIdsBefore].reverse(),
      },
      { ...plan, choices: [...plan.choices].reverse() },
      {
        ...plan,
        choices: plan.choices.map((choice, index) =>
          index === 0
            ? {
                ...choice,
                insertedSite: {
                  ...choice.insertedSite,
                  id: parseSiteId("forged"),
                },
              }
            : choice,
        ),
      },
    ];
    for (const variant of variants) {
      expect(explorationSiteTypeChoicePreparationsEqual(plan, variant)).toBe(
        false,
      );
    }
  });
});
