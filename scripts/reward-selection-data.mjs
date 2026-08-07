import { createHash } from "node:crypto";

const TRANSFIGURATIONS = new Set([
  "Empowered", "Amplified", "Kindled", "Inspired", "Enduring",
  "Hastened", "Resonant", "Attuned", "Perfected",
]);
const SITE_TYPES = new Set(["Shop", "Purge", "Transfiguration", "Duplication"]);

function fail(path, message) {
  throw new Error(`reward_selection.toml ${path}: ${message}`);
}

function table(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected a table");
  }
  return value;
}

function exact(value, path, expected) {
  const source = table(value, path);
  for (const key of expected) if (!(key in source)) fail(path, `missing key ${key}`);
  for (const key of Object.keys(source)) {
    if (!expected.includes(key)) fail(`${path}.${key}`, "unknown key");
  }
  return source;
}

function number(value, path, { minimum = 0, maximum = Infinity, integer = false } = {}) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < minimum || value > maximum || (integer && !Number.isInteger(value))
  ) fail(path, `expected ${integer ? "an integer" : "a number"} in [${String(minimum)}, ${String(maximum)}]`);
  return value;
}

function string(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
  return value;
}

function stringList(value, path, allowed) {
  if (!Array.isArray(value) || value.length === 0) fail(path, "expected a non-empty string array");
  const seen = new Set();
  return value.map((entry, index) => {
    const result = string(entry, `${path}[${String(index)}]`);
    if (allowed !== undefined && !allowed.has(result)) fail(`${path}[${String(index)}]`, "unknown value");
    if (seen.has(result)) fail(`${path}[${String(index)}]`, "duplicate value");
    seen.add(result);
    return result;
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function band(raw, path) {
  const source = exact(raw, path, ["fraction", "minimum"]);
  return {
    fraction: number(source.fraction, `${path}.fraction`, { minimum: 0, maximum: 1 }),
    minimum: number(source.minimum, `${path}.minimum`, { minimum: 1, integer: true }),
  };
}

function blend(raw, path, names) {
  const source = exact(raw, path, names);
  const result = Object.fromEntries(names.map((name) => [name, number(source[name], `${path}.${name}`, { minimum: 0, maximum: 1 })]));
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) fail(path, "weights must sum to 1");
  return result;
}

/** Compile and strictly validate the parsed reward_selection.toml document. */
export function compileRewardSelectionData(sourceValue) {
  const root = exact(sourceValue, "root", [
    "schema-version", "rules-version", "bands", "eligibility", "bundle",
    "blends", "categories", "centrality", "dreamsign", "cost-bands",
    "transfiguration", "site", "tribes",
  ]);
  if (number(root["schema-version"], "schema-version", { minimum: 1, integer: true }) !== 1) {
    fail("schema-version", "only schema version 1 is supported");
  }
  if (root["rules-version"] !== "1") fail("rules-version", 'only rules version "1" is supported');

  const bands = exact(root.bands, "bands", ["default", "strong-card", "dreamsign", "tribal-change"]);
  const defaultBand = band(bands.default, "bands.default");
  const strongBand = band(bands["strong-card"], "bands.strong-card");
  const dreamsignBand = band(bands.dreamsign, "bands.dreamsign");
  const tribalBand = band(bands["tribal-change"], "bands.tribal-change");

  const eligibility = exact(root.eligibility, "eligibility", [
    "min-deck-for-fit", "min-deck-for-purge", "purge-misfit-fraction",
    "starter-purge-bonus", "tribal-threshold", "subtype-min-pool-cards",
  ]);
  const bundle = exact(root.bundle, "bundle", ["growth-band-size"]);
  const blends = exact(root.blends, "blends", ["strong-card", "copies-draft", "duplicate", "transfiguration", "bundle"]);
  const categories = exact(root.categories, "categories", ["affine-weight", "deck-affine-minimum", "cluster-affine-minimum"]);
  const centrality = exact(root.centrality, "centrality", ["prior-weight", "cooccurrence-weight", "fallback", "spark-threshold", "spark-bonus"]);
  const centralityWeights = blend({ prior: centrality["prior-weight"], cooccurrence: centrality["cooccurrence-weight"] }, "centrality weights", ["prior", "cooccurrence"]);
  const dreamsign = exact(root.dreamsign, "dreamsign", ["full-coverage-count", "featureless-coverage", "quality-weight"]);
  const quality = exact(dreamsign["quality-weight"], "dreamsign.quality-weight", ["1", "2", "3"]);
  const costBands = exact(root["cost-bands"], "cost-bands", ["cheap-maximum", "mid-minimum", "mid-maximum", "big-minimum", "cheap-character-maximum"]);
  const transfiguration = exact(root.transfiguration, "transfiguration", ["allowed-forms", "empowered-cost-divisor", "kindled-spark-divisor", "flat-benefit"]);
  const flatBenefit = exact(transfiguration["flat-benefit"], "transfiguration.flat-benefit", ["Amplified", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"]);
  const site = exact(root.site, "site", ["placeable-types"]);
  const tribes = exact(root.tribes, "tribes", ["values"]);

  const tuning = {
    bandFraction: defaultBand.fraction,
    bandMinimum: defaultBand.minimum,
    strongBandFraction: strongBand.fraction,
    strongBandMinimum: strongBand.minimum,
    dreamsignBandFraction: dreamsignBand.fraction,
    dreamsignBandMinimum: dreamsignBand.minimum,
    tribalBandFraction: tribalBand.fraction,
    tribalBandMinimum: tribalBand.minimum,
    minDeckForFit: number(eligibility["min-deck-for-fit"], "eligibility.min-deck-for-fit", { minimum: 1, integer: true }),
    minDeckForPurge: number(eligibility["min-deck-for-purge"], "eligibility.min-deck-for-purge", { minimum: 1, integer: true }),
    purgeMisfitFraction: number(eligibility["purge-misfit-fraction"], "eligibility.purge-misfit-fraction", { minimum: 0, maximum: 1 }),
    starterPurgeBonus: number(eligibility["starter-purge-bonus"], "eligibility.starter-purge-bonus", { minimum: 0 }),
    tribalThreshold: number(eligibility["tribal-threshold"], "eligibility.tribal-threshold", { minimum: 1, integer: true }),
    subtypeMinPoolCards: number(eligibility["subtype-min-pool-cards"], "eligibility.subtype-min-pool-cards", { minimum: 1, integer: true }),
    bundleGrowthBandSize: number(bundle["growth-band-size"], "bundle.growth-band-size", { minimum: 1, integer: true }),
    strongBlend: blend(blends["strong-card"], "blends.strong-card", ["fit", "quality"]),
    copiesBlend: blend(blends["copies-draft"], "blends.copies-draft", ["fit", "quality"]),
    duplicateBlend: (() => { const value = blend(blends.duplicate, "blends.duplicate", ["quality", "fit-loo"]); return { quality: value.quality, fitLoo: value["fit-loo"] }; })(),
    transfigureBlend: blend(blends.transfiguration, "blends.transfiguration", ["benefit", "centrality"]),
    bundleBlend: blend(blends.bundle, "blends.bundle", ["seed", "bundle", "fit"]),
    categoryAffineWeight: number(categories["affine-weight"], "categories.affine-weight", { minimum: 0, maximum: 1 }),
    categoryDeckAffineMinimum: number(categories["deck-affine-minimum"], "categories.deck-affine-minimum", { minimum: 1, integer: true }),
    categoryClusterAffineMinimum: number(categories["cluster-affine-minimum"], "categories.cluster-affine-minimum", { minimum: 1, integer: true }),
    centrality: {
      priorWeight: centralityWeights.prior,
      cooccurrenceWeight: centralityWeights.cooccurrence,
      fallback: number(centrality.fallback, "centrality.fallback", { minimum: 0, maximum: 1 }),
      sparkThreshold: number(centrality["spark-threshold"], "centrality.spark-threshold", { minimum: 0, integer: true }),
      sparkBonus: number(centrality["spark-bonus"], "centrality.spark-bonus", { minimum: 0, maximum: 1 }),
    },
    dreamsign: {
      fullCoverageCount: number(dreamsign["full-coverage-count"], "dreamsign.full-coverage-count", { minimum: 1, integer: true }),
      featurelessCoverage: number(dreamsign["featureless-coverage"], "dreamsign.featureless-coverage", { minimum: 0, maximum: 1 }),
      qualityWeight: {
        "1": number(quality["1"], "dreamsign.quality-weight.1", { minimum: 0 }),
        "2": number(quality["2"], "dreamsign.quality-weight.2", { minimum: 0 }),
        "3": number(quality["3"], "dreamsign.quality-weight.3", { minimum: 0 }),
      },
    },
    costBands: {
      cheapMaximum: number(costBands["cheap-maximum"], "cost-bands.cheap-maximum", { minimum: 0, integer: true }),
      midMinimum: number(costBands["mid-minimum"], "cost-bands.mid-minimum", { minimum: 0, integer: true }),
      midMaximum: number(costBands["mid-maximum"], "cost-bands.mid-maximum", { minimum: 0, integer: true }),
      bigMinimum: number(costBands["big-minimum"], "cost-bands.big-minimum", { minimum: 0, integer: true }),
      cheapCharacterMaximum: number(costBands["cheap-character-maximum"], "cost-bands.cheap-character-maximum", { minimum: 0, integer: true }),
    },
    allowedTransfigurations: stringList(transfiguration["allowed-forms"], "transfiguration.allowed-forms", TRANSFIGURATIONS),
    transfigurationBenefit: {
      empoweredCostDivisor: number(transfiguration["empowered-cost-divisor"], "transfiguration.empowered-cost-divisor", { minimum: 1 }),
      kindledSparkDivisor: number(transfiguration["kindled-spark-divisor"], "transfiguration.kindled-spark-divisor", { minimum: 1 }),
      flat: Object.fromEntries(Object.entries(flatBenefit).map(([key, value]) => [key, number(value, `transfiguration.flat-benefit.${key}`, { minimum: 0 })])),
    },
    placeableSiteTypes: stringList(site["placeable-types"], "site.placeable-types", SITE_TYPES),
    tribes: stringList(tribes.values, "tribes.values"),
  };
  if (!(tuning.costBands.cheapMaximum < tuning.costBands.midMinimum && tuning.costBands.midMinimum <= tuning.costBands.midMaximum && tuning.costBands.midMaximum < tuning.costBands.bigMinimum)) {
    fail("cost-bands", "bands must be ordered and non-overlapping");
  }
  const payload = { schemaVersion: 1, rulesVersion: "1", tuning };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
