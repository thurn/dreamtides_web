import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import {
  RANDOM_SITE_DESTINATION_TYPES,
  SITE_TYPES,
} from "../src/types/site-type.ts";

const LAYER_ORDER = ["one", "two", "three", "four", "five", "six", "seven"];
const SITE_TYPE_SET = new Set(SITE_TYPES);
const RANDOM_SITE_DESTINATION_SET = new Set(RANDOM_SITE_DESTINATION_TYPES);
const LAYER_SET = new Set(LAYER_ORDER);
const LAYER_ROLES = new Set(["starter", "standard", "boss"]);
// Both values are persisted on the boss node (`dreamscapeId` and `biomeName`),
// so changing either must invalidate a coop fold even though the remaining boss
// fields are presentation-only.
const HASH_RELEVANT_BOSS_KEYS = ["dreamscapeId", "place"];

function fail(path, message) {
  throw new Error(`atlas.toml ${path}: ${message}`);
}

function record(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected a table");
  }
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function string(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "expected a non-empty string");
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function finiteNumber(value, path, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "expected a finite number");
  }
  if (value < min || value > max) {
    fail(path, `expected a value from ${String(min)} to ${String(max)}`);
  }
  return value;
}

function integer(value, path, options = {}) {
  const result = finiteNumber(value, path, options);
  if (!Number.isInteger(result)) fail(path, "expected an integer");
  return result;
}

function range(value, path) {
  const source = record(value, path);
  const min = integer(source.min, `${path}.min`, { min: 0 });
  const max = integer(source.max, `${path}.max`, { min: 0 });
  if (min > max) fail(path, "min must not exceed max");
  return { min, max };
}

function layerName(value, path) {
  const result = string(value, path);
  if (!LAYER_SET.has(result)) fail(path, `unknown layer ${JSON.stringify(result)}`);
  return result;
}

function siteType(value, path) {
  const result = string(value, path);
  if (!SITE_TYPE_SET.has(result)) fail(path, `unknown site type ${JSON.stringify(result)}`);
  return result;
}

function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, "values must be unique");
  return values;
}

function siteCountMap(value, path) {
  const source = record(value, path);
  const result = {};
  for (const [key, rawCount] of Object.entries(source)) {
    const type = siteType(key, `${path}.${key}`);
    const count = integer(rawCount, `${path}.${key}`, { min: 0 });
    if (count > 0) result[type] = count;
  }
  return result;
}

function siteWeightMap(value, path) {
  const source = record(value, path);
  const result = {};
  for (const [key, rawWeight] of Object.entries(source)) {
    const type = siteType(key, `${path}.${key}`);
    result[type] = finiteNumber(rawWeight, `${path}.${key}`, { min: 0 });
  }
  return result;
}

function placeholders(template) {
  return [...template.matchAll(/\{([^{}]+)\}/gu)].map((match) => match[1]);
}

function template(value, path, allowed) {
  const result = string(value, path);
  const found = placeholders(result);
  const unknown = found.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) fail(path, `unsupported placeholder {${unknown[0]}}`);
  for (const required of allowed) {
    if (!found.includes(required)) fail(path, `missing placeholder {${required}}`);
  }
  return result;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

/**
 * Collect the authored Atlas asset filenames when the local source-art catalog
 * is available. A checkout without the external art directories still compiles
 * data and lets the asset linker report its ordinary missing-art warnings.
 */
export function collectAtlasAssetSources({
  bossSceneDir,
  bossIconDir,
  bossFigureDir,
}) {
  if (
    !existsSync(bossSceneDir) ||
    !existsSync(bossIconDir) ||
    !existsSync(bossFigureDir)
  ) {
    return undefined;
  }
  const bossIcons = new Set(readdirSync(bossIconDir));
  return {
    bossScenes: new Set(readdirSync(bossSceneDir)),
    bossIcons,
    bossFigures: new Set(readdirSync(bossFigureDir)),
    frames: bossIcons,
  };
}

function validateCatalogs(result, catalogs) {
  const dreamscapes = catalogs?.dreamscapes ?? [];
  const guides = catalogs?.guides ?? [];
  const affiliations = catalogs?.affiliations ?? [];
  const glossaryIds = new Set(catalogs?.glossaryIds ?? []);

  if (dreamscapes.length === 0) {
    fail("random-site", "dreamscape catalog is required to resolve its owner");
  }
  const randomOwners = dreamscapes.filter(
    (entry) => entry["signature-site"] === "RandomSite" || entry.signatureSite === "RandomSite",
  );
  if (randomOwners.length !== 1) {
    fail("random-site", "exactly one dreamscape must own RandomSite as its signature site");
  }
  const ownerGuide = randomOwners[0]["guide-id"] ?? randomOwners[0].guideId;
  if (typeof ownerGuide !== "string" || ownerGuide === "") {
    fail("random-site", "its owning dreamscape must reference a guide");
  }
  result.randomSite.guideId = ownerGuide;
  if (
    catalogs?.guides !== undefined &&
    !guides.some((entry) => entry.id === ownerGuide)
  ) {
    fail("random-site", `unresolved guide id ${ownerGuide}`);
  }

  if (dreamscapes.some((entry) => entry.id === result.boss.dreamscapeId)) {
    fail("boss.dreamscape-id", "the special boss id must not duplicate a normal dreamscape");
  }
  if (affiliations.length > 0) {
    const affiliationIds = new Set(affiliations.map((entry) => entry.id));
    for (const dreamscape of dreamscapes) {
      const affiliationId = dreamscape["affiliation-id"] ?? dreamscape.affiliationId;
      const starter = dreamscape["is-starter"] === true || dreamscape.isStarter === true;
      if (!starter && !affiliationIds.has(affiliationId)) {
        fail(
          `dreamscapes.${String(dreamscape.id)}.affiliation-id`,
          `unresolved affiliation id ${String(affiliationId)}`,
        );
      }
    }
  }

  if (affiliations.length > 0) {
    for (const affiliation of affiliations) {
      const theme = affiliation["atlas-card-theme"] ?? affiliation.atlasCardTheme;
      if (typeof theme !== "string" || theme.trim() === "") {
        fail(`affiliations.${String(affiliation.id)}.atlas-card-theme`, "expected authored Atlas copy");
      }
    }
  }

  if (glossaryIds.size > 0) {
    for (const [type, metadata] of Object.entries(result.siteTypes)) {
      if (!glossaryIds.has(metadata.glossaryId)) {
        fail(`site-types.${type}.glossary-id`, `unresolved glossary id ${metadata.glossaryId}`);
      }
    }
  }

  if (catalogs?.assetSources !== undefined) {
    const groups = catalogs.assetSources;
    const checks = [
      ["assets.boss-scene-source", result.assets.bossSceneSource, groups.bossScenes],
      ["assets.boss-icon-source", result.assets.bossIconSource, groups.bossIcons],
      ["assets.boss-figure-source", result.assets.bossFigureSource, groups.bossFigures],
      ["assets.unrevealed-frame-source", result.assets.unrevealedFrameSource, groups.frames],
    ];
    for (const [path, source, entries] of checks) {
      if (!(entries instanceof Set) || !entries.has(source)) {
        fail(path, `unresolved asset source ${source}`);
      }
    }
  }
}

/** Compile and strictly validate the parsed atlas.toml document. */
export function compileAtlasData(sourceValue, catalogs = {}) {
  const source = record(sourceValue, "root");
  const schemaVersion = integer(source["schema-version"], "schema-version");
  if (schemaVersion !== 1) fail("schema-version", "only schema version 1 is supported");

  const layers = array(source.layers, "layers").map((rawLayer, index) => {
    const path = `layers[${String(index)}]`;
    const layer = record(rawLayer, path);
    const name = layerName(layer.name, `${path}.name`);
    const role = string(layer.role, `${path}.role`);
    if (!LAYER_ROLES.has(role)) fail(`${path}.role`, `unknown role ${JSON.stringify(role)}`);
    const nodeCount = range(layer["node-count"], `${path}.node-count`);
    const siteCount = layer["site-count"] === undefined
      ? null
      : range(layer["site-count"], `${path}.site-count`);
    const fillProfile = layer["fill-profile"] === undefined
      ? null
      : string(layer["fill-profile"], `${path}.fill-profile`);
    const mandatorySites = siteCountMap(layer["mandatory-sites"], `${path}.mandatory-sites`);
    return { name, role, nodeCount, siteCount, fillProfile, mandatorySites };
  });
  unique(layers.map((layer) => layer.name), "layers.name");
  if (layers.length !== LAYER_ORDER.length) fail("layers", "must define exactly seven layers");
  for (let index = 0; index < LAYER_ORDER.length; index += 1) {
    if (layers[index].name !== LAYER_ORDER[index]) {
      fail(`layers[${String(index)}].name`, `expected ${LAYER_ORDER[index]}`);
    }
  }
  if (layers[0].role !== "starter" || layers.at(-1)?.role !== "boss") {
    fail("layers", "the first layer must be starter and the last layer must be boss");
  }
  if (layers.slice(1, -1).some((layer) => layer.role !== "standard")) {
    fail("layers", "interior layers must use the standard role");
  }
  if (layers[0].nodeCount.min !== 1 || layers[0].nodeCount.max !== 1 ||
      layers.at(-1)?.nodeCount.min !== 1 || layers.at(-1)?.nodeCount.max !== 1) {
    fail("layers", "starter and boss layers must contain exactly one node");
  }

  const graphSource = record(source.graph, "graph");
  const bonusSource = record(graphSource["bonus-reveal"], "graph.bonus-reveal");
  const bonusRange = range(bonusSource, "graph.bonus-reveal");
  const graph = {
    connectionAverage: finiteNumber(graphSource["connection-average"], "graph.connection-average", { min: 0 }),
    revealLookaheadLayers: integer(graphSource["reveal-lookahead-layers"], "graph.reveal-lookahead-layers", { min: 1, max: 6 }),
    bonusReveal: {
      ...bonusRange,
      mode: integer(bonusSource.mode, "graph.bonus-reveal.mode", bonusRange),
      eligibleLayers: unique(array(bonusSource["eligible-layers"], "graph.bonus-reveal.eligible-layers").map(
        (entry, index) => layerName(entry, `graph.bonus-reveal.eligible-layers[${String(index)}]`),
      ), "graph.bonus-reveal.eligible-layers"),
    },
  };
  if (graph.bonusReveal.eligibleLayers.some((name) => {
    return layers[LAYER_ORDER.indexOf(name)].role !== "standard";
  })) {
    fail("graph.bonus-reveal.eligible-layers", "only standard layers are eligible");
  }

  const selectionSource = record(source["dreamscape-selection"], "dreamscape-selection");
  const exhaustionFallback = string(selectionSource["exhaustion-fallback"], "dreamscape-selection.exhaustion-fallback");
  if (exhaustionFallback !== "allow-repeats") {
    fail("dreamscape-selection.exhaustion-fallback", "only allow-repeats is supported");
  }
  const dreamscapeSelection = {
    baseWeight: finiteNumber(selectionSource["base-weight"], "dreamscape-selection.base-weight", { min: Number.MIN_VALUE }),
    repeatDiscourageStrength: finiteNumber(selectionSource["repeat-discourage-strength"], "dreamscape-selection.repeat-discourage-strength", { min: 1 }),
    excludeConnectedRepeats: boolean(selectionSource["exclude-connected-repeats"], "dreamscape-selection.exclude-connected-repeats"),
    excludeSameLayerRepeats: boolean(selectionSource["exclude-same-layer-repeats"], "dreamscape-selection.exclude-same-layer-repeats"),
    exhaustionFallback,
  };

  const compositionSource = record(source["site-composition"], "site-composition");
  const siteComposition = {
    uniqueNonDraftSites: boolean(compositionSource["unique-non-draft-sites"], "site-composition.unique-non-draft-sites"),
    knownDreamsignSite: siteType(compositionSource["known-dreamsign-site"], "site-composition.known-dreamsign-site"),
    mandatoryCapacityBehavior: string(
      compositionSource["mandatory-capacity-behavior"],
      "site-composition.mandatory-capacity-behavior",
    ),
  };
  if (!siteComposition.uniqueNonDraftSites) {
    fail("site-composition.unique-non-draft-sites", "the current generator supports unique non-Draft sites");
  }
  if (siteComposition.mandatoryCapacityBehavior !== "omit-fill") {
    fail("site-composition.mandatory-capacity-behavior", "only omit-fill is supported");
  }

  const fillProfiles = {};
  for (const [index, rawProfile] of array(source["fill-profiles"], "fill-profiles").entries()) {
    const path = `fill-profiles[${String(index)}]`;
    const profile = record(rawProfile, path);
    const id = string(profile.id, `${path}.id`);
    if (fillProfiles[id] !== undefined) fail(`${path}.id`, `duplicate profile ${id}`);
    fillProfiles[id] = {
      id,
      signatureSiteWeight: finiteNumber(profile["signature-site-weight"], `${path}.signature-site-weight`, { min: 0 }),
      siteWeights: siteWeightMap(profile["site-weights"], `${path}.site-weights`),
    };
    if (Object.hasOwn(fillProfiles[id].siteWeights, "Battle") ||
        Object.hasOwn(fillProfiles[id].siteWeights, "Draft")) {
      fail(`${path}.site-weights`, "Battle and Draft cannot be fill candidates");
    }
  }
  for (const [index, layer] of layers.entries()) {
    if (layer.role === "starter") {
      if (layer.siteCount !== null || layer.fillProfile !== null) {
        fail(`layers[${String(index)}]`, "starter composition comes from dreamscapes.toml fixed-sites");
      }
      continue;
    }
    if (layer.siteCount === null || layer.fillProfile === null) {
      fail(`layers[${String(index)}]`, "non-starter layers require site-count and fill-profile");
    }
    if (fillProfiles[layer.fillProfile] === undefined) {
      fail(`layers[${String(index)}].fill-profile`, `unknown profile ${layer.fillProfile}`);
    }
    const mandatoryCount = Object.values(layer.mandatorySites).reduce((sum, count) => sum + count, 0);
    if ((layer.mandatorySites.Battle ?? 0) > 0) {
      fail(`layers[${String(index)}].mandatory-sites.Battle`, "Battle is appended structurally");
    }
    const structuralCount = mandatoryCount + 1 + (layer.role === "standard" ? 1 : 0);
    if (structuralCount > layer.siteCount.max) {
      fail(`layers[${String(index)}].site-count`, "mandatory, home, and Battle sites exceed max");
    }
  }

  const knownSource = record(source["known-dreamsign"], "known-dreamsign");
  const knownDreamsign = {
    maxPerAtlas: integer(knownSource["max-per-atlas"], "known-dreamsign.max-per-atlas", { min: 0 }),
    eligibleLayers: unique(array(knownSource["eligible-layers"], "known-dreamsign.eligible-layers").map(
      (entry, index) => layerName(entry, `known-dreamsign.eligible-layers[${String(index)}]`),
    ), "known-dreamsign.eligible-layers"),
    placementProbability: finiteNumber(knownSource["placement-probability"], "known-dreamsign.placement-probability", { min: 0, max: 1 }),
    earlyRevealBias: finiteNumber(knownSource["early-reveal-bias"], "known-dreamsign.early-reveal-bias", { min: 0 }),
  };
  for (const eligibleLayer of knownDreamsign.eligibleLayers) {
    const layer = layers[LAYER_ORDER.indexOf(eligibleLayer)];
    if (layer.role !== "standard") {
      fail("known-dreamsign.eligible-layers", "only standard layers are eligible");
    }
    const mandatoryCount = Object.values(layer.mandatorySites).reduce((sum, count) => sum + count, 0);
    if (mandatoryCount + 3 > layer.siteCount.max) {
      fail(
        `layers.${eligibleLayer}.site-count`,
        "mandatory, home, known-dreamsign carrier, and Battle sites exceed max",
      );
    }
  }
  const eligibleNodeCapacity = knownDreamsign.eligibleLayers.reduce((sum, name) => {
    return sum + layers[LAYER_ORDER.indexOf(name)].nodeCount.max;
  }, 0);
  if (knownDreamsign.maxPerAtlas > eligibleNodeCapacity) {
    fail("known-dreamsign.max-per-atlas", "exceeds eligible node capacity");
  }

  const randomSource = record(source["random-site"], "random-site");
  const destinations = unique(array(randomSource.destinations, "random-site.destinations").map(
    (entry, index) => siteType(entry, `random-site.destinations[${String(index)}]`),
  ), "random-site.destinations");
  const unsupportedDestination = destinations.find(
    (entry) => !RANDOM_SITE_DESTINATION_SET.has(entry),
  );
  if (unsupportedDestination !== undefined) {
    fail(
      "random-site.destinations",
      `${unsupportedDestination} cannot be materialized by Random Site`,
    );
  }
  const randomSite = {
    destinations,
    homeChoiceCount: integer(randomSource["home-choice-count"], "random-site.home-choice-count", { min: 2 }),
    awayChoiceCount: integer(randomSource["away-choice-count"], "random-site.away-choice-count", { min: 1, max: 1 }),
    guideLine: string(randomSource["guide-line"], "random-site.guide-line"),
  };
  if (randomSite.homeChoiceCount > destinations.length) {
    fail("random-site.home-choice-count", "cannot exceed destination count");
  }

  const siteTypes = {};
  for (const [index, rawMetadata] of array(source["site-types"], "site-types").entries()) {
    const path = `site-types[${String(index)}]`;
    const metadata = record(rawMetadata, path);
    const type = siteType(metadata.type, `${path}.type`);
    if (siteTypes[type] !== undefined) fail(`${path}.type`, `duplicate metadata for ${type}`);
    siteTypes[type] = {
      icon: string(metadata.icon, `${path}.icon`),
      glossaryId: string(metadata["glossary-id"], `${path}.glossary-id`),
    };
  }
  for (const type of SITE_TYPES) {
    if (siteTypes[type] === undefined) fail("site-types", `missing metadata for ${type}`);
  }

  const fallbackSource = record(source["fallback-site-type"], "fallback-site-type");
  const fallbackSiteType = {
    icon: string(fallbackSource.icon, "fallback-site-type.icon"),
    name: string(fallbackSource.name, "fallback-site-type.name"),
    description: string(fallbackSource.description, "fallback-site-type.description"),
  };

  const bossSource = record(source.boss, "boss");
  const boss = {
    dreamscapeId: string(bossSource["dreamscape-id"], "boss.dreamscape-id"),
    place: string(bossSource.place, "boss.place"),
    name: string(bossSource.name, "boss.name"),
    fallbackTitle: string(bossSource["fallback-title"], "boss.fallback-title"),
    fallbackIntroduction: string(bossSource["fallback-introduction"], "boss.fallback-introduction"),
    sceneArtId: string(bossSource["scene-art-id"], "boss.scene-art-id"),
    iconArtId: string(bossSource["icon-art-id"], "boss.icon-art-id"),
    figureArtId: string(bossSource["figure-art-id"], "boss.figure-art-id"),
  };

  const presentationSource = record(source.presentation, "presentation");
  const presentation = {
    unseenTitle: string(presentationSource["unseen-title"], "presentation.unseen-title"),
    unseenBody: string(presentationSource["unseen-body"], "presentation.unseen-body"),
    starterBody: string(presentationSource["starter-body"], "presentation.starter-body"),
    affiliationTitleTemplate: template(presentationSource["affiliation-title-template"], "presentation.affiliation-title-template", new Set(["name"])),
    affiliationBodyTemplate: template(presentationSource["affiliation-body-template"], "presentation.affiliation-body-template", new Set(["card-theme"])),
  };

  const assetsSource = record(source.assets, "assets");
  const assets = {
    unrevealedFrameSource: string(assetsSource["unrevealed-frame-source"], "assets.unrevealed-frame-source"),
    unrevealedFrameKey: string(assetsSource["unrevealed-frame-key"], "assets.unrevealed-frame-key"),
    bossSceneSource: string(assetsSource["boss-scene-source"], "assets.boss-scene-source"),
    bossIconSource: string(assetsSource["boss-icon-source"], "assets.boss-icon-source"),
    bossFigureSource: string(assetsSource["boss-figure-source"], "assets.boss-figure-source"),
  };

  const normalized = {
    schemaVersion,
    layers,
    graph,
    dreamscapeSelection,
    siteComposition,
    fillProfiles,
    knownDreamsign,
    randomSite,
    siteTypes,
    fallbackSiteType,
    boss,
    presentation,
    assets,
  };
  validateCatalogs(normalized, catalogs);

  const foldBoss = Object.fromEntries(HASH_RELEVANT_BOSS_KEYS.map((key) => [key, boss[key]]));
  const foldValue = {
    schemaVersion,
    layers,
    graph,
    dreamscapeSelection,
    siteComposition,
    fillProfiles,
    knownDreamsign,
    randomSite: {
      destinations: randomSite.destinations,
      homeChoiceCount: randomSite.homeChoiceCount,
      awayChoiceCount: randomSite.awayChoiceCount,
      guideId: randomSite.guideId,
    },
    boss: foldBoss,
  };
  return {
    ...normalized,
    contentHash: hash(normalized),
    foldHash: hash(foldValue),
  };
}
