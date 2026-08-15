import {
  EXPLORATION_CHOOSABLE_SITE_TYPES,
  type ExplorationChoosableSiteType,
  type ExplorationFixedSiteType,
} from "../data/exploration";
import { stableDigest } from "../reward-selection/stable";
import type { SelectionRulesVersion } from "../reward-selection/types";
import type {
  ExplorationSiteInsertionPreparation,
  ExplorationSiteTypeChoicePreparation,
  JourneyState,
  SiteState,
} from "../types/journey";
import type { AtlasNodeId, SiteId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { ExplorationActionId } from "../types/identifiers";
import { parseSiteId } from "../types/identifiers";
import type { SelectionContentRevision } from "../types/selection-content-revision";

function orderedSiteIds(sites: readonly SiteState[]): SiteId[] {
  return sites.map(({ id }) => id);
}

function siteIdExists(journey: JourneyState, siteId: SiteId): boolean {
  return Object.values(journey.atlas.nodes).some((node) =>
    node.sites.some((site) => site.id === siteId),
  );
}

function ownerNodeId(
  journey: JourneyState,
  sourceSiteId: SiteId,
): AtlasNodeId | null {
  const owners = Object.values(journey.atlas.nodes).filter((node) =>
    node.sites.some((site) => site.id === sourceSiteId),
  );
  return owners.length === 1 ? (owners[0]?.id ?? null) : null;
}

function signaturePayload(input: {
  encounterCardId: CardId;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  preparation: Omit<ExplorationSiteInsertionPreparation, "planSignature">;
}): unknown {
  return {
    canonicalMechanicId: "add-site",
    selectionPolicyId: "fixed",
    selectionRulesVersion: input.selectionRulesVersion,
    selectionContentRevision: input.selectionContentRevision,
    encounterCardId: input.encounterCardId,
    sourceSiteId: input.preparation.sourceSiteId,
    sourceActionId: input.preparation.sourceActionId,
    targetNodeId: input.preparation.targetNodeId,
    destinationSiteType: input.preparation.insertedSite.type,
    insertionIndex: input.preparation.insertionIndex,
    siblingSiteIdsBefore: input.preparation.siblingSiteIdsBefore,
    insertedSite: input.preparation.insertedSite,
  };
}

/** Build the exact append-only site insertion committed when Exploration opens. */
export function prepareExplorationSiteInsertion(input: {
  journey: JourneyState;
  sourceSite: SiteState;
  sourceActionId: ExplorationActionId;
  encounterCardId: CardId;
  siteType: ExplorationFixedSiteType;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
}): ExplorationSiteInsertionPreparation | null {
  const targetNodeId = ownerNodeId(input.journey, input.sourceSite.id);
  if (
    input.sourceSite.type !== "Exploration" ||
    targetNodeId === null ||
    targetNodeId !== input.journey.currentDreamscape ||
    targetNodeId !== input.journey.atlas.currentNodeId
  ) {
    return null;
  }
  const targetNode = input.journey.atlas.nodes[targetNodeId];
  if (targetNode === undefined) return null;
  const insertedSite: ExplorationSiteInsertionPreparation["insertedSite"] = {
    id: parseSiteId(
      `site-exploration-${input.sourceSite.id}-${input.sourceActionId}`,
    ),
    type: input.siteType,
    isEnhanced: false,
    isVisited: false,
  };
  if (siteIdExists(input.journey, insertedSite.id)) return null;
  const unsigned: Omit<ExplorationSiteInsertionPreparation, "planSignature"> = {
    sourceSiteId: input.sourceSite.id,
    sourceActionId: input.sourceActionId,
    targetNodeId: targetNodeId,
    insertionIndex: targetNode.sites.length,
    siblingSiteIdsBefore: orderedSiteIds(targetNode.sites).map(parseSiteId),
    insertedSite,
  };
  return {
    ...unsigned,
    planSignature: stableDigest(
      signaturePayload({
        encounterCardId: input.encounterCardId,
        selectionRulesVersion: input.selectionRulesVersion,
        selectionContentRevision: input.selectionContentRevision,
        preparation: unsigned,
      }),
    ),
  };
}

function sameSite(left: SiteState, right: SiteState): boolean {
  const exactKeys = ["id", "isEnhanced", "isVisited", "type"];
  return (
    Object.keys(left).sort().join("|") === exactKeys.join("|") &&
    Object.keys(right).sort().join("|") === exactKeys.join("|") &&
    left.id === right.id &&
    left.type === right.type &&
    left.isEnhanced === right.isEnhanced &&
    left.isVisited === right.isVisited
  );
}

function choiceSignaturePayload(input: {
  encounterCardId: CardId;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  preparation: Omit<ExplorationSiteTypeChoicePreparation, "planSignature">;
}): unknown {
  return {
    canonicalMechanicId: "add-site",
    selectionPolicyId: "site-uniform",
    selectionRulesVersion: input.selectionRulesVersion,
    selectionContentRevision: input.selectionContentRevision,
    encounterCardId: input.encounterCardId,
    sourceSiteId: input.preparation.sourceSiteId,
    sourceActionId: input.preparation.sourceActionId,
    targetNodeId: input.preparation.targetNodeId,
    insertionIndex: input.preparation.insertionIndex,
    siblingSiteIdsBefore: input.preparation.siblingSiteIdsBefore,
    choices: input.preparation.choices,
    selectorSignature: input.preparation.selectorSignature,
  };
}

/** Build the signed alternatives for a player-chosen append-only site insertion. */
export function prepareExplorationSiteTypeChoice(input: {
  journey: JourneyState;
  sourceSite: SiteState;
  sourceActionId: ExplorationActionId;
  encounterCardId: CardId;
  siteTypes: readonly ExplorationChoosableSiteType[];
  selectorSignature: string;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
}): ExplorationSiteTypeChoicePreparation | null {
  const targetNodeId = ownerNodeId(input.journey, input.sourceSite.id);
  const distinctSiteTypes = new Set(input.siteTypes);
  if (
    input.sourceSite.type !== "Exploration" ||
    input.siteTypes.length !== 3 ||
    distinctSiteTypes.size !== input.siteTypes.length ||
    input.siteTypes.some(
      (siteType) => !EXPLORATION_CHOOSABLE_SITE_TYPES.includes(siteType),
    ) ||
    input.selectorSignature.length === 0 ||
    targetNodeId === null ||
    targetNodeId !== input.journey.currentDreamscape ||
    targetNodeId !== input.journey.atlas.currentNodeId
  ) {
    return null;
  }
  const targetNode = input.journey.atlas.nodes[targetNodeId];
  if (targetNode === undefined) return null;
  const insertedSiteId = `site-exploration-${input.sourceSite.id}-${input.sourceActionId}`;
  if (siteIdExists(input.journey, parseSiteId(insertedSiteId))) return null;
  const choices = input.siteTypes.map((siteType) => ({
    siteType,
    insertedSite: {
      id: parseSiteId(insertedSiteId),
      type: siteType,
      isEnhanced: false,
      isVisited: false,
    },
  }));
  const unsigned: Omit<ExplorationSiteTypeChoicePreparation, "planSignature"> =
    {
      sourceSiteId: input.sourceSite.id,
      sourceActionId: input.sourceActionId,
      targetNodeId: targetNodeId,
      insertionIndex: targetNode.sites.length,
      siblingSiteIdsBefore: orderedSiteIds(targetNode.sites).map(parseSiteId),
      choices: choices,
      selectorSignature: input.selectorSignature,
    };
  return {
    ...unsigned,
    planSignature: stableDigest(
      choiceSignaturePayload({
        encounterCardId: input.encounterCardId,
        selectionRulesVersion: input.selectionRulesVersion,
        selectionContentRevision: input.selectionContentRevision,
        preparation: unsigned,
      }),
    ),
  };
}

/** Exact comparison used to reject a tampered or stale chooser plan. */
export function explorationSiteTypeChoicePreparationsEqual(
  left: ExplorationSiteTypeChoicePreparation,
  right: ExplorationSiteTypeChoicePreparation,
): boolean {
  return (
    left.sourceSiteId === right.sourceSiteId &&
    left.sourceActionId === right.sourceActionId &&
    left.targetNodeId === right.targetNodeId &&
    left.insertionIndex === right.insertionIndex &&
    left.selectorSignature === right.selectorSignature &&
    left.planSignature === right.planSignature &&
    left.siblingSiteIdsBefore.length === right.siblingSiteIdsBefore.length &&
    left.siblingSiteIdsBefore.every(
      (siteId, index) => siteId === right.siblingSiteIdsBefore[index],
    ) &&
    left.choices.length === right.choices.length &&
    left.choices.every((choice, index) => {
      const candidate = right.choices[index];
      return (
        candidate !== undefined &&
        choice.siteType === candidate.siteType &&
        choice.insertedSite.type === choice.siteType &&
        candidate.insertedSite.type === candidate.siteType &&
        sameSite(choice.insertedSite, candidate.insertedSite)
      );
    })
  );
}

/** Exact comparison used to reject persisted-plan tampering and stale atlas state. */
export function explorationSiteInsertionPreparationsEqual(
  left: ExplorationSiteInsertionPreparation,
  right: ExplorationSiteInsertionPreparation,
): boolean {
  return (
    left.sourceSiteId === right.sourceSiteId &&
    left.sourceActionId === right.sourceActionId &&
    left.targetNodeId === right.targetNodeId &&
    left.insertionIndex === right.insertionIndex &&
    left.planSignature === right.planSignature &&
    left.siblingSiteIdsBefore.length === right.siblingSiteIdsBefore.length &&
    left.siblingSiteIdsBefore.every(
      (siteId, index) => siteId === right.siblingSiteIdsBefore[index],
    ) &&
    sameSite(left.insertedSite, right.insertedSite)
  );
}
