import type { TransfigurationType } from "../types/journey";
import type {
  TransfigurationCostBand,
  TransfigurationData,
  TransfigurationFormDefinition,
  TransfigurationPricing,
  TransfigurationRewardScore,
  TransfigurationStatDeltaBand,
} from "../types/transfiguration-data";
import { parseContentHash, parseFoldHash } from "../types/content-hash";
import { glossaryEntryIdFromUnknown } from "../types/identifiers";

const PATH = "/transfiguration-data.json";
const HASH = /^[0-9a-f]{64}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function costBandFromUnknown(value: unknown): TransfigurationCostBand | null {
  if (
    !isRecord(value) ||
    !finite(value.base) ||
    !finite(value.jitter) ||
    !finite(value.floor)
  ) return null;
  return { base: value.base, jitter: value.jitter, floor: value.floor };
}

function dataFormIds(): readonly TransfigurationType[] {
  return [
    "Empowered",
    "Amplified",
    "Kindled",
    "Inspired",
    "Enduring",
    "Hastened",
    "Resonant",
    "Attuned",
    "Perfected",
  ];
}

function pricingFromUnknown(value: unknown): TransfigurationPricing | null {
  if (!isRecord(value)) return null;
  if (value.kind === "free" || value.kind === "statDelta") {
    return { kind: value.kind };
  }
  if (value.kind !== "band") return null;
  const band = costBandFromUnknown(value);
  return band === null ? null : { kind: "band", ...band };
}

function rewardScoreFromUnknown(
  value: unknown,
): TransfigurationRewardScore | null {
  if (!isRecord(value)) return null;
  if (value.kind === "flat" && finite(value.value)) {
    return { kind: "flat", value: value.value };
  }
  if (
    value.kind === "statDelta" &&
    finite(value.divisor) &&
    value.divisor > 0
  ) {
    return { kind: "statDelta", divisor: value.divisor };
  }
  return null;
}

function isFormId(value: unknown): value is TransfigurationType {
  return dataFormIds().some((expected) => expected === value);
}

function isTransfigurationGlyph(
  value: unknown,
): value is TransfigurationFormDefinition["glyph"] {
  return dataFormIds().some((id) => value === `transfiguration${id}`);
}

function isColor(value: unknown): value is `#${string}` {
  return typeof value === "string" && COLOR.test(value);
}

function statDeltaBandFromUnknown(
  value: unknown,
): TransfigurationStatDeltaBand | null {
  if (!isRecord(value)) return null;
  const band = costBandFromUnknown(value.band);
  if (
    !finite(value.minimumDelta) ||
    value.minimumDelta <= 0 ||
    value.maximumDelta !== undefined && !finite(value.maximumDelta) ||
    band === null
  ) return null;
  return {
    minimumDelta: value.minimumDelta,
    ...(value.maximumDelta === undefined
      ? {}
      : { maximumDelta: value.maximumDelta }),
    band,
  };
}

function formFromUnknown(value: unknown): TransfigurationFormDefinition | null {
  if (!isRecord(value) || !isFormId(value.id)) return null;
  const glossaryUuid = glossaryEntryIdFromUnknown(value.glossaryUuid);
  const pricing = pricingFromUnknown(value.pricing);
  const rewardScore = rewardScoreFromUnknown(value.rewardScore);
  if (
    glossaryUuid === null ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    typeof value.description !== "string" ||
    value.description.trim() === "" ||
    !isTransfigurationGlyph(value.glyph) ||
    !isColor(value.accentColor) ||
    !isColor(value.tintColor) ||
    pricing === null ||
    rewardScore === null
  ) return null;
  return {
    id: value.id,
    glossaryUuid,
    name: value.name,
    description: value.description,
    glyph: value.glyph,
    accentColor: value.accentColor,
    tintColor: value.tintColor,
    pricing,
    rewardScore,
  };
}

export function parseTransfigurationData(value: unknown): TransfigurationData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !HASH.test(value.contentHash) ||
    typeof value.foldHash !== "string" ||
    !HASH.test(value.foldHash) ||
    !isRecord(value.site) ||
    !(
      value.site.standardChoiceLimit === null ||
      (finite(value.site.standardChoiceLimit) &&
        value.site.standardChoiceLimit > 0)
    ) ||
    !(
      value.site.enhancedChoiceLimit === null ||
      (finite(value.site.enhancedChoiceLimit) &&
        value.site.enhancedChoiceLimit > 0)
    ) ||
    !isRecord(value.site.pricing) ||
    !finite(value.site.pricing.minimumCost) ||
    !finite(value.site.pricing.maximumCost) ||
    !finite(value.site.pricing.step) ||
    value.site.pricing.step <= 0 ||
    !Array.isArray(value.site.pricing.statDeltaBands) ||
    value.site.pricing.statDeltaBands.length === 0 ||
    !Array.isArray(value.forms) ||
    value.forms.length < 1 ||
    value.forms.length > dataFormIds().length
  )
    throw new Error(
      "Failed to load Transfiguration data: malformed transfiguration-data.json",
    );
  const statDeltaBands = value.site.pricing.statDeltaBands.map(
    statDeltaBandFromUnknown,
  );
  const forms = value.forms.map(formFromUnknown);
  if (
    statDeltaBands.some((band) => band === null) ||
    forms.some((form) => form === null) ||
    new Set(forms.map((form) => form?.id)).size !== forms.length
  )
    throw new Error(
      "Failed to load Transfiguration data: malformed transfiguration-data.json",
    );
  return {
    schemaVersion: 1,
    contentHash: parseContentHash(value.contentHash),
    foldHash: parseFoldHash(value.foldHash),
    site: {
      standardChoiceLimit: value.site.standardChoiceLimit,
      enhancedChoiceLimit: value.site.enhancedChoiceLimit,
      pricing: {
        minimumCost: value.site.pricing.minimumCost,
        maximumCost: value.site.pricing.maximumCost,
        step: value.site.pricing.step,
        statDeltaBands: statDeltaBands.filter(
          (band): band is TransfigurationStatDeltaBand => band !== null,
        ),
      },
    },
    forms: forms.filter(
      (form): form is TransfigurationFormDefinition => form !== null,
    ),
  };
}

export async function loadTransfigurationData(): Promise<TransfigurationData> {
  const response = await fetch(PATH);
  if (!response.ok)
    throw new Error(
      `Failed to load Transfiguration data: ${String(response.status)} ${response.statusText}`,
    );
  const value: unknown = await response.json();
  return parseTransfigurationData(value);
}

export function transfigurationForm(
  data: TransfigurationData,
  id: TransfigurationType,
): TransfigurationFormDefinition {
  const form = data.forms.find((candidate) => candidate.id === id);
  if (form === undefined) throw new Error(`Missing Transfiguration form ${id}`);
  return form;
}
