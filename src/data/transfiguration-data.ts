import type { TransfigurationType } from "../types/journey";
import type {
  TransfigurationData,
  TransfigurationFormDefinition,
} from "../types/transfiguration-data";

const PATH = "/transfiguration-data.json";
const HASH = /^[0-9a-f]{64}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCostBand(value: unknown): boolean {
  return (
    isRecord(value) &&
    finite(value.base) &&
    finite(value.jitter) &&
    finite(value.floor)
  );
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

function isPricing(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    value.kind === "free" ||
    value.kind === "statDelta" ||
    (value.kind === "band" && isCostBand(value))
  );
}

function isRewardScore(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.kind === "flat" && finite(value.value)) ||
    (value.kind === "statDelta" && finite(value.divisor) && value.divisor > 0)
  );
}

function isFormId(value: unknown): value is TransfigurationType {
  return dataFormIds().some((expected) => expected === value);
}

function isTransfigurationGlyph(value: unknown): boolean {
  return dataFormIds().some((id) => value === `transfiguration${id}`);
}

export function parseTransfigurationData(value: unknown): TransfigurationData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !HASH.test(String(value.contentHash)) ||
    !HASH.test(String(value.foldHash)) ||
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
    !value.site.pricing.statDeltaBands.every(
      (band) =>
        isRecord(band) &&
        finite(band.minimumDelta) &&
        band.minimumDelta > 0 &&
        (band.maximumDelta === undefined || finite(band.maximumDelta)) &&
        isCostBand(band.band),
    ) ||
    !Array.isArray(value.forms) ||
    value.forms.length < 1 ||
    value.forms.length > dataFormIds().length
  )
    throw new Error(
      "Failed to load Transfiguration data: malformed transfiguration-data.json",
    );
  const formIds = new Set<TransfigurationType>();
  for (const form of value.forms) {
    if (!isRecord(form) || !isFormId(form.id) || formIds.has(form.id)) {
      throw new Error(
        "Failed to load Transfiguration data: malformed transfiguration-data.json",
      );
    }
    formIds.add(form.id);
  }
  const valid = value.forms.every(
    (form) =>
      isRecord(form) &&
      isFormId(form.id) &&
      typeof form.name === "string" &&
      form.name.trim() !== "" &&
      typeof form.description === "string" &&
      form.description.trim() !== "" &&
      COLOR.test(String(form.accentColor)) &&
      COLOR.test(String(form.tintColor)) &&
      typeof form.glossaryUuid === "string" &&
      isTransfigurationGlyph(form.glyph) &&
      isPricing(form.pricing) &&
      isRewardScore(form.rewardScore),
  );
  if (!valid)
    throw new Error(
      "Failed to load Transfiguration data: malformed transfiguration-data.json",
    );
  return value as unknown as TransfigurationData;
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
