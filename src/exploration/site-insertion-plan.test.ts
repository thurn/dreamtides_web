import { describe, expect, it } from "vitest";
import { createDefaultState } from "../state/journey-context";
import { LayerName } from "../types/layer-name";
import type { JourneyState, SiteState } from "../types/journey";
import {
  explorationSiteInsertionPreparationsEqual,
  explorationSiteTypeChoicePreparationsEqual,
  prepareExplorationSiteInsertion,
  prepareExplorationSiteTypeChoice,
} from "./site-insertion-plan";
import { asSiteId } from "../types/identifiers";
import { asDreamscapeId } from "../types/identifiers";
import { asAtlasNodeId } from "../types/identifiers";
import { asCardId } from "../types/card-identity";
import { asExplorationActionId } from "../types/identifiers";
import { asGuideId } from "../types/identifiers";

const sourceSite: SiteState = {
  id: asSiteId("source-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

const battleSite: SiteState = {
  id: asSiteId("battle-site"),
  type: "Battle",
  isEnhanced: false,
  isVisited: false,
};

function journey(): JourneyState {
  const base = createDefaultState();
  return {
    ...base,
    currentDreamscape: asAtlasNodeId("current-node"),
    atlas: {
      ...base.atlas,
      currentNodeId: asAtlasNodeId("current-node"),
      nodes: {
        [asAtlasNodeId("current-node")]: {
          id: asAtlasNodeId("current-node"),
          layer: LayerName.Two,
          indexInLayer: 0,
          dreamscapeId: asDreamscapeId("fixture-dreamscape"),
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

function prepare(state = journey(), sourceActionId = "fixed-action") {
  return prepareExplorationSiteInsertion({
    journey: state,
    sourceSite,
    sourceActionId: asExplorationActionId(sourceActionId),
    encounterCardId: asCardId("encounter-card"),
    siteType: "DreamsignBazaar",
    selectionRulesVersion: "rules-v1",
    selectionContentRevision: "content-v1",
  });
}

describe("Exploration fixed-site insertion planning", () => {
  it("binds the current owner, exact sibling order, append index, and stable identity", () => {
    const first = prepare();
    const replay = prepare();

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      sourceSiteId: sourceSite.id,
      sourceActionId: asExplorationActionId("fixed-action"),
      targetNodeId: asAtlasNodeId("current-node"),
      insertionIndex: 2,
      siblingSiteIdsBefore: [sourceSite.id, battleSite.id],
      insertedSite: {
        id: asSiteId("site-exploration-source-site-fixed-action"),
        type: "DreamsignBazaar",
        isEnhanced: false,
        isVisited: false,
      },
    });
  });

  it("binds the signature and identity to the source action", () => {
    const first = prepare();
    const second = prepare(journey(), "second-action");

    expect(first?.insertedSite.id).not.toBe(second?.insertedSite.id);
    expect(first?.planSignature).not.toBe(second?.planSignature);
  });

  it("rejects a non-current owner and globally duplicated minted identity", () => {
    const offNode = journey();
    offNode.atlas.currentNodeId = asAtlasNodeId("elsewhere");
    expect(prepare(offNode)).toBeNull();

    const duplicated = journey();
    const node = duplicated.atlas.nodes[asAtlasNodeId("current-node")];
    if (node === undefined) throw new Error("Expected fixture node");
    node.sites.push({
      id: asSiteId("site-exploration-source-site-fixed-action"),
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
      { ...plan, targetNodeId: asAtlasNodeId("forged") },
      { ...plan, insertionIndex: plan.insertionIndex + 1 },
      {
        ...plan,
        siblingSiteIdsBefore: [...plan.siblingSiteIdsBefore].reverse(),
      },
      {
        ...plan,
        insertedSite: { ...plan.insertedSite, id: asSiteId("forged") },
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
            presentingGuideId: asGuideId("forged-guide"),
          },
        },
      },
      { ...plan, planSignature: "forged" },
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
    sourceActionId: asExplorationActionId("choice-action"),
    encounterCardId: asCardId("encounter-card"),
    siteTypes,
    selectorSignature: "selector-signature",
    selectionRulesVersion: "rules-v1",
    selectionContentRevision: "content-v1",
  });
}

describe("Exploration site-type choice planning", () => {
  it("binds three ordered distinct alternatives to one stable site identity", () => {
    const plan = prepareChoice();
    expect(plan).toMatchObject({
      sourceSiteId: sourceSite.id,
      sourceActionId: asExplorationActionId("choice-action"),
      targetNodeId: asAtlasNodeId("current-node"),
      insertionIndex: 2,
      siblingSiteIdsBefore: [sourceSite.id, battleSite.id],
      selectorSignature: "selector-signature",
      choices: [
        { siteType: "Shop" },
        { siteType: "Purge" },
        { siteType: "Duplication" },
      ],
    });
    expect(plan?.choices.map(({ insertedSite }) => insertedSite.id)).toEqual([
      "site-exploration-source-site-choice-action",
      "site-exploration-source-site-choice-action",
      "site-exploration-source-site-choice-action",
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
          id: asSiteId("site-exploration-source-site-choice-action"),
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        },
      },
      {
        siteType: "Purge",
        insertedSite: {
          id: asSiteId("site-exploration-source-site-choice-action"),
          type: "Purge",
          isEnhanced: false,
          isVisited: false,
        },
      },
      {
        siteType: "Duplication",
        insertedSite: {
          id: asSiteId("site-exploration-source-site-choice-action"),
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
        sourceActionId: asExplorationActionId("choice-action"),
        encounterCardId: asCardId("encounter-card"),
        siteTypes: ["Shop", "Purge"],
        selectorSignature: "selector-signature",
        selectionRulesVersion: "rules-v1",
        selectionContentRevision: "content-v1",
      }),
    ).toBeNull();
    expect(
      prepareExplorationSiteTypeChoice({
        journey: journey(),
        sourceSite,
        sourceActionId: asExplorationActionId("choice-action"),
        encounterCardId: asCardId("encounter-card"),
        siteTypes: ["Shop", "Shop", "Purge"],
        selectorSignature: "selector-signature",
        selectionRulesVersion: "rules-v1",
        selectionContentRevision: "content-v1",
      }),
    ).toBeNull();

    const stale = journey();
    stale.atlas.nodes[asAtlasNodeId("current-node")]?.sites.push({
      id: asSiteId("site-exploration-source-site-choice-action"),
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
      { ...plan, selectorSignature: "forged" },
      { ...plan, planSignature: "forged" },
      { ...plan, targetNodeId: asAtlasNodeId("forged") },
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
                  id: asSiteId("forged"),
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
