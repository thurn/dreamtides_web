import { createHash } from "node:crypto";

const ARCHETYPE_FAMILY = new Map(Object.entries({
  fit_card_grant: "grant", fit_card_draft: "grant", copies_draft: "grant",
  strong_card: "grant", category_draft_known: "grant", card_bundle: "grant",
  transfigured_draft: "grant", transfigure: "improve", starter_transfigure: "improve",
  keyword_mod: "improve", tribal_change: "improve", purge: "remove",
  purge_replace: "remove", duplicate: "duplicate", dreamsign: "dreamsign",
  dreamsign_draft: "dreamsign", add_site: "site",
}));
const POLICIES = new Set([
  "fixed", "uniform", "card-fit", "card-fit-quality", "card-bundle",
  "purge-misfit", "duplicate-value", "deck-entry-centrality",
  "transfiguration-value", "dreamsign-match", "site-uniform",
]);
const COPY_SLOTS = new Set([
  "card", "cards", "count", "count-word", "category", "site", "subtype",
  "transfiguration",
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

function text(value, path) {
  if (typeof value !== "string") fail(path, "expected a string");
  return value;
}

function positive(value, path) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) fail(path, "expected a positive integer");
  return value;
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

function template(value, path) {
  const result = text(value, path);
  for (const match of result.matchAll(/\{([^{}]+)\}/gu)) {
    if (!COPY_SLOTS.has(match[1])) fail(path, `unknown copy slot {${match[1]}}`);
  }
  return result;
}

/** Compile and strictly validate the parsed augury.toml document. */
export function compileAuguryData(sourceValue) {
  const root = exact(sourceValue, "root", ["schema-version", "encounter", "dialogue", "archetype"]);
  if (positive(root["schema-version"], "schema-version") !== 1) fail("schema-version", "only schema version 1 is supported");
  const encounter = exact(root.encounter, "encounter", ["offer-count", "distinct-families", "allow-decline"]);
  if (encounter["offer-count"] !== 2) fail("encounter.offer-count", "Augury requires exactly 2 offers");
  if (encounter["distinct-families"] !== true) fail("encounter.distinct-families", "must be true");
  if (typeof encounter["allow-decline"] !== "boolean") fail("encounter.allow-decline", "expected a boolean");
  const dialogue = exact(root.dialogue, "dialogue", ["fallback-line", "accept-reactions"]);
  if (!Array.isArray(dialogue["accept-reactions"]) || dialogue["accept-reactions"].length === 0) {
    fail("dialogue.accept-reactions", "expected a non-empty string array");
  }
  const acceptReactions = dialogue["accept-reactions"].map((line, index) => nonempty(line, `dialogue.accept-reactions[${String(index)}]`));
  if (!Array.isArray(root.archetype)) fail("archetype", "expected an array of tables");
  const seen = new Set();
  const archetypes = root.archetype.map((raw, index) => {
    const path = `archetype[${String(index)}]`;
    const source = exact(raw, path, ["id", "enabled", "family", "weight", "selection-policy-id", "dialogue-lines", "quantities", "copy"]);
    const id = nonempty(source.id, `${path}.id`);
    const expectedFamily = ARCHETYPE_FAMILY.get(id);
    if (expectedFamily === undefined) fail(`${path}.id`, "unknown archetype id");
    if (seen.has(id)) fail(`${path}.id`, "duplicate archetype id");
    seen.add(id);
    if (source.family !== expectedFamily) fail(`${path}.family`, `must be ${expectedFamily}`);
    if (typeof source.enabled !== "boolean") fail(`${path}.enabled`, "expected a boolean");
    if (!POLICIES.has(source["selection-policy-id"])) fail(`${path}.selection-policy-id`, "unknown selection policy");
    if (!Array.isArray(source["dialogue-lines"]) || source["dialogue-lines"].length === 0) fail(`${path}.dialogue-lines`, "expected a non-empty string array");
    const quantities = table(source.quantities, `${path}.quantities`);
    if (Object.keys(quantities).length === 0) fail(`${path}.quantities`, "requires at least one quantity");
    const copy = exact(source.copy, `${path}.copy`, ["title", "summary", "prompt", "candidate-title", "candidate-summary", "detail-headline", "detail-subtitle"]);
    return {
      id,
      enabled: source.enabled,
      family: source.family,
      weight: positive(source.weight, `${path}.weight`),
      selectionPolicyId: source["selection-policy-id"],
      quantities: Object.fromEntries(Object.entries(quantities).map(([key, value]) => [camel(key), positive(value, `${path}.quantities.${key}`)])),
      dialogueLines: source["dialogue-lines"].map((line, lineIndex) => nonempty(line, `${path}.dialogue-lines[${String(lineIndex)}]`)),
      copy: {
        title: template(copy.title, `${path}.copy.title`),
        summary: template(copy.summary, `${path}.copy.summary`),
        prompt: template(copy.prompt, `${path}.copy.prompt`),
        candidateTitle: template(copy["candidate-title"], `${path}.copy.candidate-title`),
        candidateSummary: template(copy["candidate-summary"], `${path}.copy.candidate-summary`),
        detailHeadline: template(copy["detail-headline"], `${path}.copy.detail-headline`),
        detailSubtitle: template(copy["detail-subtitle"], `${path}.copy.detail-subtitle`),
      },
    };
  });
  for (const id of ARCHETYPE_FAMILY.keys()) if (!seen.has(id)) fail("archetype", `missing archetype ${id}`);
  if (archetypes.filter((entry) => entry.enabled).length < 2) fail("archetype", "at least two archetypes must be enabled");
  const payload = {
    schemaVersion: 1,
    encounter: { offerCount: 2, distinctFamilies: true, allowDecline: encounter["allow-decline"] },
    dialogue: { fallbackLine: nonempty(dialogue["fallback-line"], "dialogue.fallback-line"), acceptReactions },
    archetypes,
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
