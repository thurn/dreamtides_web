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

function isEligibility(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "positiveEnergyCost":
    case "distinctAuthoredAmplifiedText":
    case "eventWithoutFast":
    case "namedTrigger":
    case "activatedEnergyCost":
      return true;
    case "cardType":
      return value.cardType === "Character" || value.cardType === "Event";
    case "atLeastEligibleForms":
      return finite(value.count) && value.count > 0;
    default:
      return false;
  }
}

function isOperation(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "halveEnergyCost":
      return value.rounding === "Down" && finite(value.minimum);
    case "useAuthoredAmplifiedText":
    case "setFast":
    case "widenNamedTrigger":
      return true;
    case "doubleSpark":
      return finite(value.zeroResult);
    case "appendRulesClause":
      return value.clause === "DrawCard" || value.clause === "Reclaim";
    case "reduceActivatedEnergyCost":
      return finite(value.amount) && value.amount > 0 && finite(value.minimum);
    case "applyEligibleForms":
      return (
        Array.isArray(value.formOrder) &&
        value.formOrder.length > 0 &&
        value.formOrder.every((id) =>
          dataFormIds().some((expected) => expected === id),
        )
      );
    default:
      return false;
  }
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

function isBenefit(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.kind === "flat" && finite(value.value)) ||
    (value.kind === "ratio" && finite(value.divisor) && value.divisor > 0)
  );
}

function isFormAtIndex(
  value: unknown,
  index: number,
): value is TransfigurationType {
  switch (index) {
    case 0:
      return value === "Empowered";
    case 1:
      return value === "Amplified";
    case 2:
      return value === "Kindled";
    case 3:
      return value === "Inspired";
    case 4:
      return value === "Enduring";
    case 5:
      return value === "Hastened";
    case 6:
      return value === "Resonant";
    case 7:
      return value === "Attuned";
    case 8:
      return value === "Perfected";
    default:
      return false;
  }
}

export function parseTransfigurationData(value: unknown): TransfigurationData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !HASH.test(String(value.contentHash)) ||
    !HASH.test(String(value.foldHash)) ||
    !isRecord(value.site) ||
    typeof value.site.rulesVersion !== "string" ||
    value.site.rulesVersion.trim() === "" ||
    !finite(value.site.standardChoiceLimit) ||
    value.site.standardChoiceLimit <= 0 ||
    !(
      value.site.enhancedChoiceLimit === null ||
      (finite(value.site.enhancedChoiceLimit) &&
        value.site.enhancedChoiceLimit > 0)
    ) ||
    !Array.isArray(value.site.formOrder) ||
    value.site.formOrder.length !== 9 ||
    !value.site.formOrder.every(isFormAtIndex) ||
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
    value.forms.length !== 9
  )
    throw new Error(
      "Failed to load Transfiguration data: malformed transfiguration-data.json",
    );
  const valid = value.forms.every(
    (form, index) =>
      isRecord(form) &&
      isFormAtIndex(form.id, index) &&
      form.displayOrder === index &&
      typeof form.name === "string" &&
      form.name.trim() !== "" &&
      COLOR.test(String(form.accentColor)) &&
      COLOR.test(String(form.tintColor)) &&
      typeof form.effectDisclosure === "string" &&
      typeof form.selectedCardDescription === "string" &&
      typeof form.accessibilityDescription === "string" &&
      typeof form.glossaryUuid === "string" &&
      typeof form.glyph === "string" &&
      typeof form.merchantAllowed === "boolean" &&
      isEligibility(form.eligibility) &&
      isOperation(form.operation) &&
      isPricing(form.pricing) &&
      isBenefit(form.benefit),
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
