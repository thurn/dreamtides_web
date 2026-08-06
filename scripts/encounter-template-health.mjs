import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const DEFAULT_TEMPLATE_CATALOG_PATH = join("data", "templates.json");
export const DEFAULT_TEMPLATE_BALANCE_SCRIPT_PATH = join(
  ".llms",
  "skills",
  "exploration-encounter-designer",
  "scripts",
  "list-template-candidates.py",
);

const VALID_STATUSES = new Set([
  "hidden",
  "warning",
  "reintroduced",
  "unused",
  "available",
]);
const VALID_REASONS = new Set(["production"]);
const VALID_BALANCE_CLASSES = new Set(["unique_effect"]);

function objectRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requiredNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

function requiredInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be nonblank text.`);
  }
  return value;
}

function parseTemplateDiagnostic(raw, index) {
  const entry = objectRecord(raw, `template_diagnostics[${String(index)}]`);
  const status = requiredString(entry.status, `template_diagnostics[${String(index)}].status`);
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`template_diagnostics[${String(index)}].status is not recognized.`);
  }
  if (!Array.isArray(entry.reasons) || entry.reasons.some((reason) => !VALID_REASONS.has(reason))) {
    throw new Error(`template_diagnostics[${String(index)}].reasons is not recognized.`);
  }
  const balanceClass = entry.balance_class ?? null;
  if (balanceClass !== null && !VALID_BALANCE_CLASSES.has(balanceClass)) {
    throw new Error(`template_diagnostics[${String(index)}].balance_class is not recognized.`);
  }
  return {
    templateId: requiredInteger(entry.template_id, `template_diagnostics[${String(index)}].template_id`),
    template: requiredString(entry.template, `template_diagnostics[${String(index)}].template`),
    usageCount: requiredInteger(entry.usage_count, `template_diagnostics[${String(index)}].usage_count`),
    balanceClass,
    status,
    reasons: entry.reasons,
  };
}

export function readEncounterTemplateHealth({
  rootDir = ROOT,
  explorationPath = join("data", "tabula", "exploration.toml"),
  catalogPath = DEFAULT_TEMPLATE_CATALOG_PATH,
  balanceScriptPath = DEFAULT_TEMPLATE_BALANCE_SCRIPT_PATH,
  pythonExecutable = "python3",
  execute = execFileSync,
} = {}) {
  const stdout = execute(
    pythonExecutable,
    [
      resolve(rootDir, balanceScriptPath),
      "--template-catalog",
      resolve(rootDir, catalogPath),
      "--exploration-data",
      resolve(rootDir, explorationPath),
    ],
    { encoding: "utf8", maxBuffer: 2_000_000 },
  );
  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("Template balance script returned invalid JSON.");
  }
  const output = objectRecord(raw, "Template balance output");
  const balance = objectRecord(output.balance, "Template balance output.balance");
  if (!Array.isArray(output.template_diagnostics)) {
    throw new Error("Template balance output.template_diagnostics must be an array.");
  }
  const templates = output.template_diagnostics.map(parseTemplateDiagnostic);
  const templateIds = new Set(templates.map((entry) => entry.templateId));
  if (templateIds.size !== templates.length) {
    throw new Error("Template balance diagnostics contain duplicate template IDs.");
  }
  return {
    productionEncounters: requiredInteger(balance.production_encounters, "balance.production_encounters"),
    recordedTemplateUses: requiredInteger(balance.recorded_template_uses, "balance.recorded_template_uses"),
    catalogTemplateCount: requiredInteger(balance.catalog_template_count, "balance.catalog_template_count"),
    meanUsesPerTemplate: requiredNumber(balance.mean_uses_per_template, "balance.mean_uses_per_template"),
    softWarningThreshold: requiredInteger(balance.soft_warning_threshold, "balance.soft_warning_threshold"),
    omissionThreshold: requiredInteger(balance.omission_threshold, "balance.omission_threshold"),
    uniqueEffectOmissionThreshold: requiredInteger(
      balance.unique_effect_omission_threshold,
      "balance.unique_effect_omission_threshold",
    ),
    requiredTemplateCount: requiredInteger(
      balance.required_template_count,
      "balance.required_template_count",
    ),
    guidance: requiredString(balance.soft_warning_guidance, "balance.soft_warning_guidance"),
    templates,
  };
}
