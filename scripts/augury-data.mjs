import { createHash } from "node:crypto";
import { mechanicSupportsPolicy } from "./reward-selection-contracts.mjs";

const quantity = (minimum, maximum) => ({ minimum, maximum });
const text = (...slots) => ({ kind: "text", slots });
const count = (one, other) => ({ kind: "count", one, other });
const category = {
  kind: "category",
  character: [], event: [], cheap: [], "mid-cost": [], expensive: [], fast: [],
  subtype: ["categoryName"], package: ["categoryName"],
};
const presentation = (headline, subtitle) => ({ headline, subtitle });
const ARCHETYPE_CONTRACTS = new Map(Object.entries({
  fit_card_grant: { family: "grant", mechanicId: "gain-card", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "granted-copies": quantity(1, 4) }, presentation: presentation(text(), text("cardName")) },
  fit_card_draft: { family: "grant", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) }, presentation: presentation(text(), text()) },
  copies_draft: { family: "grant", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) }, presentation: presentation(text(), count(["count"], ["count"])) },
  strong_card: { family: "grant", mechanicId: "gain-card", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "granted-copies": quantity(1, 4) }, presentation: presentation(text(), text("cardName")) },
  category_draft_known: { family: "grant", mechanicId: "catalog-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) }, presentation: presentation(text(), category) },
  card_bundle: { family: "grant", mechanicId: "gain-card", policies: ["card-bundle"], quantities: { "bundle-size": quantity(2, 3), "minimum-bundle-size": quantity(2, 3) }, presentation: presentation(count(["count"], ["count"]), count(["count"], ["count"])) },
  transfigured_draft: { family: "grant", mechanicId: "transfigured-card-chooser", policies: ["uniform", "card-fit", "card-fit-quality"], quantities: { "chooser-size": quantity(2, 4), "granted-copies": quantity(1, 4) }, presentation: presentation(text(), text()) },
  transfigure: { family: "improve", mechanicId: "transfigure-deck-entry", policies: ["uniform", "transfiguration-value"], quantities: {}, presentation: presentation(text(), text("cardName")) },
  starter_transfigure: { family: "improve", mechanicId: "transfigure-deck-entry", policies: ["uniform", "transfiguration-value"], quantities: { "maximum-targets": quantity(1, 2) }, presentation: presentation(text(), count(["count", "cardName"], ["count", "firstCardName", "secondCardName"])) },
  purge: { family: "remove", mechanicId: "purge-deck-entry", policies: ["uniform", "purge-misfit"], quantities: {}, presentation: presentation(text(), text("cardName")) },
  duplicate: { family: "duplicate", mechanicId: "duplicate-deck-entry", policies: ["uniform", "duplicate-value"], quantities: { "chooser-size": quantity(1, 3), "granted-copies": quantity(1, 4) }, presentation: presentation(count(["count"], ["count"]), count(["count", "cardName"], ["count", "cardName"])) },
  dreamsign: { family: "dreamsign", mechanicId: "gain-dreamsign", policies: ["uniform", "dreamsign-match"], quantities: {}, presentation: presentation(text(), text("dreamsignName")) },
  add_site: { family: "site", mechanicId: "add-site", policies: ["site-uniform"], quantities: {}, presentation: presentation(text(), text("siteName")) },
}));
const PRESENTATION_SLOTS = new Set([
  "cardName", "categoryName", "count", "dreamsignName", "firstCardName",
  "secondCardName", "siteName", "subtypeName",
]);
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

function template(value, path, availableSlots) {
  const result = nonempty(value, path);
  for (const match of result.matchAll(/\{([^{}]+)\}/gu)) {
    if (!PRESENTATION_SLOTS.has(match[1])) fail(path, `unknown presentation slot {${match[1]}}`);
    if (!availableSlots.includes(match[1])) fail(path, `presentation slot {${match[1]}} is unavailable for this archetype`);
  }
  return result;
}

function presentationText(value, path, contract) {
  const source = table(value, path);
  if (source.kind !== contract.kind) fail(`${path}.kind`, `must be ${contract.kind}`);
  if (source.kind === "text") {
    const text = exact(source, path, ["kind", "text"]);
    return { kind: "text", text: template(text.text, `${path}.text`, contract.slots) };
  }
  if (source.kind === "count") {
    const count = exact(source, path, ["kind", "one", "other"]);
    return {
      kind: "count",
      one: template(count.one, `${path}.one`, contract.one),
      other: template(count.other, `${path}.other`, contract.other),
    };
  }
  if (source.kind === "category") {
    const category = exact(source, path, [
      "kind", "character", "event", "cheap", "mid-cost", "expensive",
      "fast", "subtype", "package",
    ]);
    return {
      kind: "category",
      character: template(category.character, `${path}.character`, contract.character),
      event: template(category.event, `${path}.event`, contract.event),
      cheap: template(category.cheap, `${path}.cheap`, contract.cheap),
      midCost: template(category["mid-cost"], `${path}.mid-cost`, contract["mid-cost"]),
      expensive: template(category.expensive, `${path}.expensive`, contract.expensive),
      fast: template(category.fast, `${path}.fast`, contract.fast),
      subtype: template(category.subtype, `${path}.subtype`, contract.subtype),
      package: template(category.package, `${path}.package`, contract.package),
    };
  }
  fail(`${path}.kind`, "expected text, count, or category");
}

/** Compile and strictly validate the parsed augury.toml document. */
export function compileAuguryData(sourceValue) {
  const root = exact(sourceValue, "root", ["schema-version", "encounter", "archetype"]);
  if (positive(root["schema-version"], "schema-version") !== 1) fail("schema-version", "only schema version 1 is supported");
  const encounter = exact(root.encounter, "encounter", ["allow-decline"]);
  if (typeof encounter["allow-decline"] !== "boolean") fail("encounter.allow-decline", "expected a boolean");
  if (!Array.isArray(root.archetype)) fail("archetype", "expected an array of tables");
  const seen = new Set();
  const archetypes = root.archetype.map((raw, index) => {
    const path = `archetype[${String(index)}]`;
    const source = exact(raw, path, ["id", "name", "presentation", "enabled", "family", "weight", "selection-policy-id", "quantities"]);
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
    const hasBackgroundArt = id === "dreamsign" || id === "add_site";
    const presentation = exact(source.presentation, `${path}.presentation`, [
      "headline",
      "subtitle",
      ...(hasBackgroundArt ? ["background-art-image-number"] : []),
    ]);
    return {
      id,
      name: nonempty(source.name, `${path}.name`),
      presentation: {
        headline: presentationText(presentation.headline, `${path}.presentation.headline`, contract.presentation.headline),
        subtitle: presentationText(presentation.subtitle, `${path}.presentation.subtitle`, contract.presentation.subtitle),
        ...(hasBackgroundArt ? {
          backgroundArt: {
            source: "card",
            imageNumber: positive(
              presentation["background-art-image-number"],
              `${path}.presentation.background-art-image-number`,
            ),
          },
        } : {}),
      },
      enabled: source.enabled,
      family: source.family,
      weight: positive(source.weight, `${path}.weight`),
      selectionPolicyId,
      quantities,
    };
  });
  const enabled = archetypes.filter((entry) => entry.enabled);
  if (enabled.length < 2) fail("archetype", "at least two archetypes must be enabled");
  if (new Set(enabled.map((entry) => entry.family)).size < 2) {
    fail("archetype", "enabled archetypes must span at least two families");
  }
  const payload = {
    schemaVersion: 1,
    encounter: { allowDecline: encounter["allow-decline"] },
    archetypes,
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
