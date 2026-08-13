import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import {
  RANDOM_SITE_DESTINATION_TYPES,
  SITE_TYPES,
} from "../src/types/site-type.ts";

const SITE_TYPE_SET = new Set(SITE_TYPES);
const RANDOM_DESTINATION_SET = new Set(RANDOM_SITE_DESTINATION_TYPES);
const GUIDE_SITE_TYPES = SITE_TYPES.filter(
  (siteType) => !["Battle", "Draft", "Essence", "Reward"].includes(siteType),
);
const GUIDE_DIALOGUE_CONTEXTS = new Set([
  "site",
  "random-site",
  "gamble-three-gate",
  "gamble-ladder-climb",
  "gamble-starway-stairs",
  "gamble-four-suit-reprise",
  "gamble-blackjack",
]);

function fail(file, path, message) {
  throw new Error(`${file} ${path}: ${message}`);
}

function table(value, file, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(file, path, "expected a table");
  }
  return value;
}

function keys(value, file, path, expected) {
  const source = table(value, file, path);
  for (const key of expected) {
    if (!(key in source)) fail(file, path, `missing key ${key}`);
  }
  for (const key of Object.keys(source)) {
    if (!expected.includes(key)) fail(file, `${path}.${key}`, "unknown key");
  }
  return source;
}

function array(value, file, path) {
  if (!Array.isArray(value)) fail(file, path, "expected an array");
  return value;
}

function string(value, file, path) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(file, path, "expected a non-empty string");
  }
  return value;
}

function boolean(value, file, path) {
  if (typeof value !== "boolean") fail(file, path, "expected a boolean");
  return value;
}

function number(value, file, path, { min = 0, max, integer = true } = {}) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < min ||
    (max !== undefined && value > max)
  ) {
    fail(
      file,
      path,
      `expected a${integer ? "n integer" : " finite number"} ${max === undefined ? `>= ${String(min)}` : `between ${String(min)} and ${String(max)}`}`,
    );
  }
  return value;
}

function exactIdentity(value, expected, file, path) {
  const result = string(value, file, path);
  if (result !== expected) fail(file, path, `expected ${expected}`);
  return result;
}

function unique(values, file, path) {
  if (new Set(values).size !== values.length)
    fail(file, path, "values must be unique");
  return values;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function placeholders(value) {
  return [...value.matchAll(/\{([^{}]+)\}/gu)].map((match) => match[1]);
}

function dialogueLines(
  value,
  file,
  path,
  allowedSlots = [],
  requiredSlots = [],
) {
  const lines = array(value, file, path).map((entry, index) =>
    string(entry, file, `${path}[${String(index)}]`),
  );
  if (lines.length === 0) fail(file, path, "must not be empty");
  const allowed = new Set(allowedSlots);
  const found = lines.flatMap(placeholders);
  for (const slot of found) {
    if (!allowed.has(slot))
      fail(file, path, `unsupported placeholder {${slot}}`);
  }
  for (const slot of requiredSlots) {
    if (!found.includes(slot))
      fail(file, path, `missing placeholder {${slot}}`);
  }
  return lines;
}

function siteType(value, file, path) {
  const result = string(value, file, path);
  if (!SITE_TYPE_SET.has(result))
    fail(file, path, `unknown site type ${result}`);
  return result;
}

/** Return the available portrait basenames when the external art catalog exists. */
export function collectGuidePortraitSources(directory) {
  return existsSync(directory) ? new Set(readdirSync(directory)) : undefined;
}

/** Strictly compile dream_guides.toml and validate canonical ownership. */
export function compileDreamGuidesData(sourceValue, catalogs = {}) {
  const file = "dream_guides.toml";
  const root = keys(sourceValue, file, "root", ["schema-version", "guides"]);
  if (number(root["schema-version"], file, "schema-version") !== 1) {
    fail(file, "schema-version", "only schema version 1 is supported");
  }
  const guides = array(root.guides, file, "guides").map((rawGuide, index) => {
    const path = `guides[${String(index)}]`;
    const guide = keys(rawGuide, file, path, [
      "id",
      "name",
      "home-dreamscape-id",
      "site-type",
      "portrait-source",
      "home-specialty",
      "dialogue",
    ]);
    const dialogueSource = table(guide.dialogue, file, `${path}.dialogue`);
    for (const context of Object.keys(dialogueSource)) {
      if (!GUIDE_DIALOGUE_CONTEXTS.has(context)) {
        fail(file, `${path}.dialogue.${context}`, "unknown dialogue context");
      }
    }
    const dialogue = {};
    for (const [context, rawLines] of Object.entries(dialogueSource)) {
      const slots = context === "gamble-ladder-climb" ? ["win-essence"] : [];
      dialogue[context] = dialogueLines(
        rawLines,
        file,
        `${path}.dialogue.${context}`,
        slots,
        slots,
      );
    }
    if (dialogue.site === undefined)
      fail(file, `${path}.dialogue`, "missing site context");
    const normalized = {
      id: string(guide.id, file, `${path}.id`),
      name: string(guide.name, file, `${path}.name`),
      homeDreamscapeId: string(
        guide["home-dreamscape-id"],
        file,
        `${path}.home-dreamscape-id`,
      ),
      siteType: siteType(guide["site-type"], file, `${path}.site-type`),
      portraitSource: string(
        guide["portrait-source"],
        file,
        `${path}.portrait-source`,
      ),
      homeSpecialty: string(
        guide["home-specialty"],
        file,
        `${path}.home-specialty`,
      ),
      dialogue,
    };
    if (
      normalized.siteType === "RandomSite" &&
      dialogue["random-site"] === undefined
    ) {
      fail(
        file,
        `${path}.dialogue`,
        "RandomSite guide requires random-site context",
      );
    }
    if (normalized.siteType === "Gamble") {
      for (const context of [
        "gamble-three-gate",
        "gamble-ladder-climb",
        "gamble-starway-stairs",
        "gamble-four-suit-reprise",
        "gamble-blackjack",
      ]) {
        if (dialogue[context] === undefined)
          fail(file, `${path}.dialogue`, `missing ${context} context`);
      }
    }
    if (
      catalogs.portraitSources !== undefined &&
      !catalogs.portraitSources.has(normalized.portraitSource)
    ) {
      fail(
        file,
        `${path}.portrait-source`,
        `unresolved portrait source ${normalized.portraitSource}`,
      );
    }
    return normalized;
  });
  unique(
    guides.map((guide) => guide.id),
    file,
    "guides.id",
  );
  unique(
    guides.map((guide) => guide.homeDreamscapeId),
    file,
    "guides.home-dreamscape-id",
  );
  unique(
    guides.map((guide) => guide.siteType),
    file,
    "guides.site-type",
  );
  const authoredGuideSiteTypes = [
    ...guides.map((guide) => guide.siteType),
  ].sort();
  if (
    JSON.stringify(authoredGuideSiteTypes) !==
    JSON.stringify([...GUIDE_SITE_TYPES].sort())
  ) {
    fail(
      file,
      "guides.site-type",
      "must cover each guide-bearing site type exactly once",
    );
  }
  if (catalogs.dreamscapes !== undefined) {
    const nonStarterIds = catalogs.dreamscapes
      .filter(
        (dreamscape) =>
          dreamscape["is-starter"] !== true && dreamscape.isStarter !== true,
      )
      .map((dreamscape) => dreamscape.id);
    unique(nonStarterIds, file, "dreamscapes.id");
    const homes = new Set(guides.map((guide) => guide.homeDreamscapeId));
    for (const id of nonStarterIds)
      if (!homes.has(id))
        fail(file, "guides", `missing guide for dreamscape ${id}`);
    for (const home of homes)
      if (!nonStarterIds.includes(home))
        fail(file, "guides", `unknown or starter home dreamscape ${home}`);
  }
  const normalized = { schemaVersion: 1, guides };
  return { ...normalized, contentHash: hash(normalized) };
}

/** Derive runtime guide and signature-site fields from the canonical guide catalog. */
export function deriveDreamscapesData(sourceDreamscapes, guideCatalog) {
  if (!Array.isArray(sourceDreamscapes)) {
    sourceDreamscapes = sourceDreamscapes?.dreamscapes;
  }
  if (!Array.isArray(sourceDreamscapes))
    fail("dreamscapes.toml", "dreamscapes", "must be an array");
  const guideByHome = new Map(
    guideCatalog.guides.map((guide) => [guide.homeDreamscapeId, guide]),
  );
  return sourceDreamscapes.map((rawDreamscape) => {
    const dreamscape = Object.fromEntries(
      Object.entries(rawDreamscape).map(([key, value]) => [
        key.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase()),
        value,
      ]),
    );
    const isStarter = dreamscape.isStarter === true;
    const guide = guideByHome.get(dreamscape.id);
    if (isStarter && guide !== undefined)
      fail("dreamscapes.toml", dreamscape.id, "starter cannot have a guide");
    if (!isStarter && guide === undefined)
      fail(
        "dreamscapes.toml",
        dreamscape.id,
        "non-starter requires a canonical guide",
      );
    if (
      !isStarter &&
      (dreamscape.guideId !== undefined ||
        dreamscape.signatureSite !== undefined)
    ) {
      fail(
        "dreamscapes.toml",
        dreamscape.id,
        "non-starter guide and signature site are guide-owned",
      );
    }
    return {
      ...dreamscape,
      guideId: guide?.id ?? null,
      signatureSite: isStarter
        ? siteType(
            dreamscape.signatureSite,
            "dreamscapes.toml",
            `${dreamscape.id}.signature-site`,
          )
        : guide.siteType,
      affiliationId: dreamscape.affiliationId ?? null,
      isStarter,
      dreamAvatarIds: Array.isArray(dreamscape.dreamAvatarIds)
        ? dreamscape.dreamAvatarIds
        : [],
    };
  });
}

function compileChoiceLimit(value, file, path) {
  if (value === "all") return null;
  return number(value, file, path, { min: 1 });
}

const PRESENTATION_KEYS = {
  battle: ["kind", "label", "final-boss-label", "locked-guidance"],
  draft: ["kind", "label"],
  shop: [
    "kind",
    "title",
    "restocked",
    "restock-offers-action",
    "restock-action",
    "free-price",
  ],
  purge: ["kind", "title", "instruction", "purge-action"],
  "dreamsign-bazaar": [
    "kind",
    "title",
    "restocked",
    "restock-offers-action",
    "restock-action",
    "free-price",
    "replacement-title",
  ],
  "dreamsign-revelation": ["kind", "loading", "exhausted"],
  "random-site": ["kind", "title"],
};
const PRESENTATION_KIND_BY_SITE = {
  Battle: "battle",
  Draft: "draft",
  Shop: "shop",
  Purge: "purge",
  DreamsignBazaar: "dreamsign-bazaar",
  DreamsignRevelation: "dreamsign-revelation",
  RandomSite: "random-site",
};

function presentationTemplate(value, file, path, slots) {
  const result = string(value, file, path);
  const found = placeholders(result).sort();
  if (found.join(",") !== [...slots].sort().join(",")) {
    fail(
      file,
      path,
      `expected exactly ${slots.map((slot) => `{${slot}}`).join(" and ")}`,
    );
  }
  return result;
}

function compileSitePresentation(value, type, file, path) {
  const expectedKind = PRESENTATION_KIND_BY_SITE[type];
  if (expectedKind === undefined) {
    if (value !== undefined)
      fail(file, path, `${type} does not define presentation`);
    return null;
  }
  const source = table(value, file, path);
  const kind = exactIdentity(source.kind, expectedKind, file, `${path}.kind`);
  keys(source, file, path, PRESENTATION_KEYS[kind]);
  const text = (key) => string(source[key], file, `${path}.${key}`);
  switch (kind) {
    case "battle":
      return {
        kind,
        label: text("label"),
        finalBossLabel: text("final-boss-label"),
        lockedGuidance: text("locked-guidance"),
      };
    case "draft":
      return {
        kind,
        label: presentationTemplate(source.label, file, `${path}.label`, [
          "pickCount",
        ]),
      };
    case "shop":
      return {
        kind,
        title: text("title"),
        restocked: text("restocked"),
        restockOffersAction: text("restock-offers-action"),
        restockAction: text("restock-action"),
        freePrice: text("free-price"),
      };
    case "purge":
      return {
        kind,
        title: text("title"),
        instruction: text("instruction"),
        purgeAction: presentationTemplate(
          source["purge-action"],
          file,
          `${path}.purge-action`,
          ["count"],
        ),
      };
    case "dreamsign-bazaar":
      return {
        kind,
        title: text("title"),
        restocked: text("restocked"),
        restockOffersAction: text("restock-offers-action"),
        restockAction: text("restock-action"),
        freePrice: text("free-price"),
        replacementTitle: text("replacement-title"),
      };
    case "dreamsign-revelation":
      return { kind, loading: text("loading"), exhausted: text("exhausted") };
    case "random-site":
      return { kind, title: text("title") };
    default:
      throw new Error(`unreachable presentation kind ${kind}`);
  }
}

function compileSiteRules(value, type, file, path) {
  if (type !== "Duplication") {
    if (value !== undefined) fail(file, path, `${type} does not define rules`);
    return null;
  }
  const source = keys(value, file, path, ["kind", "card-choices"]);
  const kind = exactIdentity(source.kind, "duplication", file, `${path}.kind`);
  const choices = keys(source["card-choices"], file, `${path}.card-choices`, [
    "standard-limit",
    "enhanced-limit",
  ]);
  return {
    kind,
    cardChoices: {
      standardLimit: compileChoiceLimit(
        choices["standard-limit"],
        file,
        `${path}.card-choices.standard-limit`,
      ),
      enhancedLimit: compileChoiceLimit(
        choices["enhanced-limit"],
        file,
        `${path}.card-choices.enhanced-limit`,
      ),
    },
  };
}

/** Strictly compile sites.toml and cross-validate linked catalogs. */
export function compileSitesData(sourceValue, catalogs = {}) {
  const file = "sites.toml";
  const root = keys(sourceValue, file, "root", [
    "schema-version",
    "selection",
    "site-types",
    "random-site",
  ]);
  if (number(root["schema-version"], file, "schema-version") !== 1) {
    fail(file, "schema-version", "only schema version 1 is supported");
  }
  const rawSelection = keys(root.selection, file, "selection", [
    "min-deck-for-purge",
    "placeable-types",
  ]);
  const placeableTypes = unique(
    array(rawSelection["placeable-types"], file, "selection.placeable-types")
      .map((entry, index) => siteType(
        entry,
        file,
        `selection.placeable-types[${String(index)}]`,
      )),
    file,
    "selection.placeable-types",
  );
  const allowedPlaceableTypes = new Set([
    "Shop", "Purge", "Transfiguration", "Duplication",
  ]);
  if (
    placeableTypes.length === 0 ||
    placeableTypes.some((type) => !allowedPlaceableTypes.has(type))
  ) {
    fail(file, "selection.placeable-types", "contains an unsupported site type");
  }
  const selection = {
    minDeckForPurge: number(
      rawSelection["min-deck-for-purge"],
      file,
      "selection.min-deck-for-purge",
      { min: 1 },
    ),
    placeableTypes,
  };
  const siteTypes = {};
  for (const [index, rawMetadata] of array(
    root["site-types"],
    file,
    "site-types",
  ).entries()) {
    const path = `site-types[${String(index)}]`;
    const metadata = keys(rawMetadata, file, path, [
      "type",
      "icon",
      "glossary-id",
      ...(rawMetadata.presentation === undefined ? [] : ["presentation"]),
      ...(rawMetadata.rules === undefined ? [] : ["rules"]),
    ]);
    const type = siteType(metadata.type, file, `${path}.type`);
    if (siteTypes[type] !== undefined)
      fail(file, `${path}.type`, `duplicate metadata for ${type}`);
    siteTypes[type] = {
      icon: string(metadata.icon, file, `${path}.icon`),
      glossaryId: string(metadata["glossary-id"], file, `${path}.glossary-id`),
      presentation: compileSitePresentation(
        metadata.presentation,
        type,
        file,
        `${path}.presentation`,
      ),
      rules: compileSiteRules(metadata.rules, type, file, `${path}.rules`),
    };
  }
  for (const type of SITE_TYPES)
    if (siteTypes[type] === undefined)
      fail(file, "site-types", `missing metadata for ${type}`);
  if (catalogs.glossaryIds !== undefined) {
    const glossaryIds = new Set(catalogs.glossaryIds);
    for (const [type, metadata] of Object.entries(siteTypes)) {
      if (!glossaryIds.has(metadata.glossaryId))
        fail(
          file,
          `site-types.${type}.glossary-id`,
          `unresolved glossary id ${metadata.glossaryId}`,
        );
    }
  }
  const random = keys(root["random-site"], file, "random-site", [
    "destinations",
    "home-choice-count",
    "insufficient-destinations",
  ]);
  const destinations = unique(
    array(random.destinations, file, "random-site.destinations").map(
      (entry, index) => {
        const type = siteType(
          entry,
          file,
          `random-site.destinations[${String(index)}]`,
        );
        if (!RANDOM_DESTINATION_SET.has(type))
          fail(
            file,
            "random-site.destinations",
            `${type} cannot be materialized`,
          );
        return type;
      },
    ),
    file,
    "random-site.destinations",
  );
  const randomSite = {
    destinations,
    homeChoiceCount: number(
      random["home-choice-count"],
      file,
      "random-site.home-choice-count",
      { min: 2, max: 3 },
    ),
    insufficientDestinations: exactIdentity(
      random["insufficient-destinations"],
      "fail",
      file,
      "random-site.insufficient-destinations",
    ),
  };
  if (randomSite.homeChoiceCount > destinations.length)
    fail(
      file,
      "random-site.home-choice-count",
      "cannot exceed destination count",
    );

  const guides = catalogs.guides?.guides ?? catalogs.guides ?? [];
  const guideAssignments = Object.fromEntries(
    guides.map((guide) => [
      guide.siteType,
      { guideId: guide.id, homeDreamscapeId: guide.homeDreamscapeId },
    ]),
  );
  const randomSiteGuideId = guideAssignments.RandomSite?.guideId;
  if (typeof randomSiteGuideId !== "string")
    fail(file, "random-site", "requires exactly one RandomSite guide");
  const gambleGuideId = guideAssignments.Gamble?.guideId;
  if (typeof gambleGuideId !== "string")
    fail(file, "gamble", "requires exactly one Gamble guide");
  const normalized = {
    schemaVersion: 1,
    selection,
    siteTypes,
    randomSite: { ...randomSite, guideId: randomSiteGuideId },
    guideAssignments,
  };
  const behavior = {
    schemaVersion: 1,
    selection,
    randomSite: normalized.randomSite,
    rulesBySiteType: Object.fromEntries(
      Object.entries(siteTypes).flatMap(([type, metadata]) =>
        metadata.rules === null ? [] : [[type, metadata.rules]],
      ),
    ),
    guideAssignments,
  };
  return {
    ...normalized,
    contentHash: hash(normalized),
    foldHash: hash(behavior),
  };
}
