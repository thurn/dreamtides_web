import { createHash } from "node:crypto";
import { CARD_RARITIES } from "../src/types/cards.ts";

const RARITIES = new Set(CARD_RARITIES);

function fail(path, message) {
  throw new Error(`draft.toml ${path}: ${message}`);
}

function table(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected a table");
  }
  return value;
}

function list(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function keys(value, path, expected) {
  const source = table(value, path);
  for (const key of expected) {
    if (!(key in source)) fail(path, `missing key ${key}`);
  }
  for (const key of Object.keys(source)) {
    if (!expected.includes(key)) fail(`${path}.${key}`, "unknown key");
  }
  return source;
}

function positiveInteger(value, path) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    fail(path, "expected a positive integer");
  }
  return value;
}

function isSourceMessageRef(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.format === "trox-source-message-ref" &&
    typeof value.entry_id === "string" &&
    typeof value.source_signature === "string" &&
    typeof value.contract_signature === "string";
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

/** Compile and strictly validate the parsed draft.toml document. */
export function compileDraftData(sourceValue) {
  const root = keys(sourceValue, "root", [
    "schema-version",
    "presentation",
    "offers",
    "rarity-caps",
    "pool",
  ]);
  if (positiveInteger(root["schema-version"], "schema-version") !== 1) {
    fail("schema-version", "only schema version 1 is supported");
  }
  const presentationSource = keys(root.presentation, "presentation", [
    "progress",
  ]);
  const progress = presentationSource.progress;
  const progressSlots = typeof progress === "string"
    ? [...progress.matchAll(/\{([^{}]+)\}/gu)]
      .map((match) => match[1]
        .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
        .replaceAll("-", "_")
        .toLowerCase())
      .sort()
      .join(",")
    : "";
  if (
    !isSourceMessageRef(progress) && (
    typeof progress !== "string" ||
    progress.trim() === "" ||
    progressSlots !== "pick_number,pick_total")
  ) {
    fail(
      "presentation.progress",
      "expected exactly {pick_number} and {pick_total}",
    );
  }

  const offers = keys(root.offers, "offers", [
    "cards-per-offer",
    "picks-per-site",
  ]);
  const pool = keys(root.pool, "pool", ["default-strategy", "tides4"]);
  if (pool["default-strategy"] !== "tides4") {
    fail("pool.default-strategy", 'only "tides4" is supported');
  }
  const tides4 = keys(pool.tides4, "pool.tides4", [
    "deal-size",
    "copy-cap",
    "max-facets",
  ]);

  const cardsPerOffer = positiveInteger(
    offers["cards-per-offer"],
    "offers.cards-per-offer",
  );
  const picksPerSite = positiveInteger(
    offers["picks-per-site"],
    "offers.picks-per-site",
  );
  const dealSize = positiveInteger(
    tides4["deal-size"],
    "pool.tides4.deal-size",
  );
  const copyCap = positiveInteger(tides4["copy-cap"], "pool.tides4.copy-cap");
  const maxFacets = positiveInteger(
    tides4["max-facets"],
    "pool.tides4.max-facets",
  );

  const minimumDistinctCards = Math.ceil(dealSize / copyCap);
  const cardsShownPerSite = cardsPerOffer * picksPerSite;
  if (minimumDistinctCards < cardsShownPerSite) {
    fail(
      "pool.tides4",
      `deal-size and copy-cap guarantee only ${String(minimumDistinctCards)} distinct cards, but one site can show ${String(cardsShownPerSite)}`,
    );
  }

  const seenRarities = new Set();
  const rarityCaps = list(root["rarity-caps"], "rarity-caps")
    .map((raw, index) => {
      const path = `rarity-caps[${String(index)}]`;
      const source = keys(raw, path, [
        "rarity",
        "pool-copy-cap",
        "max-picks-per-run",
      ]);
      const rarity = source.rarity;
      if (typeof rarity !== "string" || !RARITIES.has(rarity)) {
        fail(`${path}.rarity`, "unknown rarity");
      }
      if (seenRarities.has(rarity)) {
        fail(`${path}.rarity`, "duplicate rarity");
      }
      seenRarities.add(rarity);
      const poolCopyCap = positiveInteger(
        source["pool-copy-cap"],
        `${path}.pool-copy-cap`,
      );
      if (poolCopyCap > copyCap) {
        fail(`${path}.pool-copy-cap`, "must not exceed pool.tides4.copy-cap");
      }
      return {
        rarity,
        poolCopyCap,
        maxPicksPerRun: positiveInteger(
          source["max-picks-per-run"],
          `${path}.max-picks-per-run`,
        ),
      };
    })
    .sort((a, b) => a.rarity.localeCompare(b.rarity));

  const payload = {
    schemaVersion: 1,
    presentation: { progress },
    offers: { cardsPerOffer, picksPerSite },
    rarityCaps,
    pool: {
      defaultStrategy: "tides4",
      tides4: { dealSize, copyCap, maxFacets },
    },
  };
  const contentHash = hash(payload);
  const behavior = {
    schemaVersion: payload.schemaVersion,
    offers: payload.offers,
    rarityCaps: payload.rarityCaps,
    pool: payload.pool,
  };
  return { ...payload, contentHash, foldHash: hash(behavior) };
}
