import { createHash } from "node:crypto";
import { mechanicSupportsPolicy } from "./reward-selection-contracts.mjs";

const quantity = (minimum, maximum) => ({ minimum, maximum });
const ARCHETYPE_CONTRACTS = new Map(Object.entries({
  fit_card_grant: { family: "grant", mechanicId: "gain-card", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "granted-copies": quantity(1, 4) } },
  fit_card_draft: { family: "grant", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) } },
  copies_draft: { family: "grant", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) } },
  strong_card: { family: "grant", mechanicId: "gain-card", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "granted-copies": quantity(1, 4) } },
  category_draft_known: { family: "grant", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) } },
  card_bundle: { family: "grant", mechanicId: "gain-card", policies: ["card-bundle"], quantities: { "bundle-size": quantity(2, 3), "minimum-bundle-size": quantity(2, 3) } },
  transfigured_draft: { family: "grant", mechanicId: "transfigured-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) } },
  transfigure: { family: "improve", mechanicId: "transfigure-deck-entry", policies: ["uniform", "transfiguration-value"], quantities: {} },
  starter_transfigure: { family: "improve", mechanicId: "transfigure-deck-entry", policies: ["uniform", "transfiguration-value"], quantities: { "maximum-targets": quantity(1, 2) } },
  keyword_mod: { family: "improve", mechanicId: "change-entry-subtype", policies: ["uniform", "deck-entry-centrality"], quantities: {} },
  tribal_change: { family: "improve", mechanicId: "change-entry-subtype", policies: ["uniform", "deck-entry-centrality"], quantities: {} },
  purge: { family: "remove", mechanicId: "purge-deck-entry", policies: ["uniform", "purge-misfit"], quantities: {} },
  purge_replace: { family: "remove", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4) } },
  duplicate: { family: "duplicate", mechanicId: "duplicate-deck-entry", policies: ["uniform", "duplicate-value"], quantities: { "chooser-size": quantity(1, 3), "granted-copies": quantity(1, 4) } },
  dreamsign: { family: "dreamsign", mechanicId: "gain-dreamsign", policies: ["uniform", "dreamsign-match"], quantities: {} },
  dreamsign_draft: { family: "dreamsign", mechanicId: "gain-dreamsign", policies: ["uniform", "dreamsign-match"], quantities: { "minimum-chooser-size": quantity(2, 4), "maximum-chooser-size": quantity(2, 4) } },
  add_site: { family: "site", mechanicId: "add-site", policies: ["site-uniform"], quantities: {} },
}));
function fail(path, message) {
  throw new Error(`augury.toml ${path}: ${message}`);
}

function table(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected a table");
  return value;
}

function exact(value, path, expected) {
  const source = table(value, path);
  for (const key of expected) if (!(key in source)) fail(path, `missing key ${key}`);
  for (const key of Object.keys(source)) if (!expected.includes(key)) fail(`${path}.${key}`, "unknown key");
  return source;
}

function nonempty(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
  return value;
}

function positive(value, path) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) fail(path, "expected a positive integer");
  return value;
}

function boundedInteger(value, path, bounds) {
  const result = positive(value, path);
  if (result < bounds.minimum || result > bounds.maximum) {
    fail(path, `expected an integer in [${String(bounds.minimum)}, ${String(bounds.maximum)}]`);
  }
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function camel(key) {
  return key.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

/** Compile and strictly validate the parsed augury.toml document. */
export function compileAuguryData(sourceValue) {
  const root = exact(sourceValue, "root", ["schema-version", "encounter", "archetype"]);
  if (positive(root["schema-version"], "schema-version") !== 1) fail("schema-version", "only schema version 1 is supported");
  const encounter = exact(root.encounter, "encounter", ["offer-count", "distinct-families", "allow-decline"]);
  if (encounter["offer-count"] !== 2) fail("encounter.offer-count", "Augury requires exactly 2 offers");
  if (encounter["distinct-families"] !== true) fail("encounter.distinct-families", "must be true");
  if (typeof encounter["allow-decline"] !== "boolean") fail("encounter.allow-decline", "expected a boolean");
  if (!Array.isArray(root.archetype)) fail("archetype", "expected an array of tables");
  const seen = new Set();
  const archetypes = root.archetype.map((raw, index) => {
    const path = `archetype[${String(index)}]`;
    const source = exact(raw, path, ["id", "enabled", "family", "weight", "selection-policy-id", "quantities"]);
    const id = nonempty(source.id, `${path}.id`);
    const contract = ARCHETYPE_CONTRACTS.get(id);
    if (contract === undefined) fail(`${path}.id`, "unknown archetype id");
    if (seen.has(id)) fail(`${path}.id`, "duplicate archetype id");
    seen.add(id);
    if (source.family !== contract.family) fail(`${path}.family`, `must be ${contract.family}`);
    if (typeof source.enabled !== "boolean") fail(`${path}.enabled`, "expected a boolean");
    const selectionPolicyId = source["selection-policy-id"];
    if (!contract.policies.includes(selectionPolicyId)) {
      fail(`${path}.selection-policy-id`, `unsupported for ${id}`);
    }
    if (!mechanicSupportsPolicy(contract.mechanicId, selectionPolicyId)) {
      fail(`${path}.selection-policy-id`, `incompatible with ${contract.mechanicId}`);
    }
    const rawQuantities = exact(source.quantities, `${path}.quantities`, Object.keys(contract.quantities));
    const quantities = Object.fromEntries(Object.entries(contract.quantities).map(([key, bounds]) => [
      camel(key), boundedInteger(rawQuantities[key], `${path}.quantities.${key}`, bounds),
    ]));
    if (id === "card_bundle" && quantities.minimumBundleSize > quantities.bundleSize) {
      fail(`${path}.quantities.minimum-bundle-size`, "must not exceed bundle-size");
    }
    if (id === "dreamsign_draft" && quantities.minimumChooserSize > quantities.maximumChooserSize) {
      fail(`${path}.quantities.minimum-chooser-size`, "must not exceed maximum-chooser-size");
    }
    return {
      id,
      enabled: source.enabled,
      family: source.family,
      weight: positive(source.weight, `${path}.weight`),
      selectionPolicyId,
      quantities,
    };
  });
  for (const id of ARCHETYPE_CONTRACTS.keys()) if (!seen.has(id)) fail("archetype", `missing archetype ${id}`);
  const enabled = archetypes.filter((entry) => entry.enabled);
  if (enabled.length < 2) fail("archetype", "at least two archetypes must be enabled");
  if (new Set(enabled.map((entry) => entry.family)).size < 2) {
    fail("archetype", "enabled archetypes must span at least two families");
  }
  const payload = {
    schemaVersion: 1,
    encounter: { offerCount: 2, distinctFamilies: true, allowDecline: encounter["allow-decline"] },
    archetypes,
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
