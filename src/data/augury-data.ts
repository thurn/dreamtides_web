import type { AuguryArchetypeData, AuguryData } from "../types/augury-data";
import type { AuguryArchetypeId } from "../journey_v2/archetypes/types";
import type { AuguryOfferFamily } from "../journey_v2/archetypes/types";
import type { RewardSelectionPolicyId } from "../reward-selection/types";
import { parseContentHash, parseFoldHash } from "../types/content-hash";
import { auguryArchetypeIdFromUnknown } from "../types/identifiers";
import { auguryDocument } from "../content/documents";
import { requireText } from "../runtime/text";

export type { AuguryArchetypeData, AuguryData } from "../types/augury-data";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAuguryData(value: unknown): AuguryData {
  if (
    !isRecord(value) || value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" || !SHA256_HEX.test(value.contentHash) || value.foldHash !== value.contentHash ||
    !isRecord(value.selection) || !isInteger(value.selection.subtypeMinPoolCards) ||
    !isRecord(value.selection.costBands) ||
    Object.values(value.selection.costBands).some((entry) => !isInteger(entry) || entry < 0) ||
    !isRecord(value.encounter) || typeof value.encounter.allowDecline !== "boolean" ||
    !Array.isArray(value.archetypes) || value.archetypes.length < 2
  ) throw new Error("Failed to load Augury data: malformed Augury document");
  const archetypes = value.archetypes.map(archetypeFromUnknown);
  if (archetypes.some((entry) => entry === null)) {
    throw new Error("Failed to load Augury data: malformed Augury document");
  }
  const decodedArchetypes = archetypes.filter(
    (entry): entry is AuguryArchetypeData => entry !== null,
  );
  const ids = new Set(decodedArchetypes.map((entry) => entry.id));
  const families = new Set(
    decodedArchetypes.filter((entry) => entry.enabled).map((entry) => entry.family),
  );
  if (
    ids.size !== decodedArchetypes.length ||
    decodedArchetypes.filter((entry) => entry.enabled).length < 2 ||
    families.size < 2
  ) throw new Error("Failed to load Augury data: malformed Augury document");
  return {
    schemaVersion: 1,
    contentHash: parseContentHash(value.contentHash),
    foldHash: parseFoldHash(value.foldHash),
    selection: {
      subtypeMinPoolCards: value.selection.subtypeMinPoolCards,
      costBands: {
        cheapMaximum: requireNonnegativeInteger(value.selection.costBands.cheapMaximum),
        midMinimum: requireNonnegativeInteger(value.selection.costBands.midMinimum),
        midMaximum: requireNonnegativeInteger(value.selection.costBands.midMaximum),
        bigMinimum: requireNonnegativeInteger(value.selection.costBands.bigMinimum),
        cheapCharacterMaximum: requireNonnegativeInteger(
          value.selection.costBands.cheapCharacterMaximum,
        ),
      },
    },
    encounter: { allowDecline: value.encounter.allowDecline },
    archetypes: decodedArchetypes,
  };
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function presentationTextFromUnknown(
  value: unknown,
): AuguryArchetypeData["presentation"]["headline"] | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "text":
      if (!isNonemptyString(value.text)) return null;
      return {
        kind: "text",
        text: requireText(value.text, "Augury presentation text"),
      };
    case "count":
      if (!isNonemptyString(value.one) || !isNonemptyString(value.other)) {
        return null;
      }
      return {
        kind: "count",
        one: requireText(value.one, "Augury presentation one"),
        other: requireText(value.other, "Augury presentation other"),
      };
    case "category": {
      const fields = [
        value.character,
        value.event,
        value.cheap,
        value.midCost,
        value.expensive,
        value.fast,
        value.subtype,
        value.package,
      ];
      if (!fields.every(isNonemptyString)) return null;
      return {
        kind: "category",
        character: requireText(value.character, "Augury presentation character"),
        event: requireText(value.event, "Augury presentation event"),
        cheap: requireText(value.cheap, "Augury presentation cheap"),
        midCost: requireText(value.midCost, "Augury presentation midCost"),
        expensive: requireText(value.expensive, "Augury presentation expensive"),
        fast: requireText(value.fast, "Augury presentation fast"),
        subtype: requireText(value.subtype, "Augury presentation subtype"),
        package: requireText(value.package, "Augury presentation package"),
      };
    }
    default:
      return null;
  }
}

function archetypeFromUnknown(value: unknown): AuguryArchetypeData | null {
  if (!isRecord(value)) return null;
  const id = auguryArchetypeIdFromUnknown(value.id);
  if (id === null || !isRecord(value.presentation)) return null;
  const headline = presentationTextFromUnknown(value.presentation.headline);
  const subtitle = presentationTextFromUnknown(value.presentation.subtitle);
  const requiresBackgroundArt = id === "dreamsign" || id === "add_site";
  const backgroundArt = value.presentation.backgroundArt;
  if (
    typeof value.name !== "string" || value.name.trim() === "" ||
    headline === null ||
    subtitle === null ||
    (backgroundArt !== undefined) !== requiresBackgroundArt ||
    typeof value.enabled !== "boolean" ||
    !isAuguryOfferFamily(value.family) ||
    typeof value.weight !== "number" || !Number.isFinite(value.weight) || value.weight <= 0 ||
    !isRewardSelectionPolicyId(value.selectionPolicyId) ||
    !isRecord(value.quantities)
  ) return null;
  let normalizedBackgroundArt:
    | { source: "card"; imageNumber: number }
    | undefined;
  if (backgroundArt !== undefined) {
    if (
      !isRecord(backgroundArt) ||
      backgroundArt.source !== "card" ||
      !isInteger(backgroundArt.imageNumber) ||
      backgroundArt.imageNumber <= 0
    ) return null;
    normalizedBackgroundArt = {
      source: "card",
      imageNumber: backgroundArt.imageNumber,
    };
  }
  const quantities: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(value.quantities)) {
    if (!isInteger(quantity) || quantity <= 0) return null;
    quantities[key] = quantity;
  }
  return {
    id,
    name: value.name,
    presentation: {
      headline,
      subtitle,
      ...(normalizedBackgroundArt === undefined
        ? {}
        : { backgroundArt: normalizedBackgroundArt }),
    },
    enabled: value.enabled,
    family: value.family,
    weight: value.weight,
    selectionPolicyId: value.selectionPolicyId,
    quantities,
  };
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function requireNonnegativeInteger(value: unknown): number {
  if (!isInteger(value) || value < 0) {
    throw new Error("Failed to load Augury data: malformed Augury document");
  }
  return value;
}

function isAuguryOfferFamily(value: unknown): value is AuguryOfferFamily {
  return value === "grant" || value === "improve" || value === "remove" ||
    value === "duplicate" || value === "dreamsign" || value === "site";
}

function isRewardSelectionPolicyId(
  value: unknown,
): value is RewardSelectionPolicyId {
  return value === "fixed" || value === "uniform" || value === "card-fit" ||
    value === "card-fit-quality" || value === "card-bundle" ||
    value === "purge-misfit" || value === "duplicate-value" ||
    value === "deck-entry-centrality" || value === "transfiguration-value" ||
    value === "dreamsign-match" || value === "site-uniform";
}

/** Validates the Augury document assembled from the content modules. */
export function loadAuguryData(): AuguryData {
  return parseAuguryData(auguryDocument());
}

export function auguryArchetype(data: AuguryData, id: AuguryArchetypeId): AuguryArchetypeData {
  const result = data.archetypes.find((entry) => entry.id === id);
  if (result === undefined) throw new Error(`Augury data is missing archetype ${id}`);
  return result;
}
