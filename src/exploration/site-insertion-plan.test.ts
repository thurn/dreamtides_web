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

const sourceSite: SiteState = {
  id: "source-site",
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

const battleSite: SiteState = {
  id: "battle-site",
  type: "Battle",
  isEnhanced: false,
  isVisited: false,
};

function journey(): JourneyState {
  const base = createDefaultState();
  return {
    ...base,
    currentDreamscape: "current-node",
    atlas: {
      ...base.atlas,
      currentNodeId: "current-node",
      nodes: {
        "current-node": {
          id: "current-node",
          layer: LayerName.Two,
          indexInLayer: 0,
          dreamscapeId: "fixture-dreamscape",
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
    sourceActionId,
    encounterCardId: "encounter-card",
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
      sourceActionId: "fixed-action",
      targetNodeId: "current-node",
      insertionIndex: 2,
      siblingSiteIdsBefore: [sourceSite.id, battleSite.id],
      insertedSite: {
        id: "site-exploration-source-site-fixed-action",
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
    offNode.atlas.currentNodeId = "elsewhere";
    expect(prepare(offNode)).toBeNull();

    const duplicated = journey();
    const node = duplicated.atlas.nodes["current-node"];
    if (node === undefined) throw new Error("Expected fixture node");
    node.sites.push({
      id: "site-exploration-source-site-fixed-action",
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
      { ...plan, targetNodeId: "forged" },
      { ...plan, insertionIndex: plan.insertionIndex + 1 },
      {
        ...plan,
        siblingSiteIdsBefore: [...plan.siblingSiteIdsBefore].reverse(),
      },
      { ...plan, insertedSite: { ...plan.insertedSite, id: "forged" } },
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
            presentingGuideId: "forged-guide",
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
    sourceActionId: "choice-action",
    encounterCardId: "encounter-card",
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
      sourceActionId: "choice-action",
      targetNodeId: "current-node",
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
          id: "site-exploration-source-site-choice-action",
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        },
      },
      {
        siteType: "Purge",
        insertedSite: {
          id: "site-exploration-source-site-choice-action",
          type: "Purge",
          isEnhanced: false,
          isVisited: false,
        },
      },
      {
        siteType: "Duplication",
        insertedSite: {
          id: "site-exploration-source-site-choice-action",
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
        sourceActionId: "choice-action",
        encounterCardId: "encounter-card",
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
        sourceActionId: "choice-action",
        encounterCardId: "encounter-card",
        siteTypes: ["Shop", "Shop", "Purge"],
        selectorSignature: "selector-signature",
        selectionRulesVersion: "rules-v1",
        selectionContentRevision: "content-v1",
      }),
    ).toBeNull();

    const stale = journey();
    stale.atlas.nodes["current-node"]?.sites.push({
      id: "site-exploration-source-site-choice-action",
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
      { ...plan, targetNodeId: "forged" },
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
                insertedSite: { ...choice.insertedSite, id: "forged" },
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
