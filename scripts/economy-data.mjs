import { createHash } from "node:crypto";
import { compileSiteEconomyData } from "./guide-sites-data.mjs";

function fail(path, message) {
  throw new Error(`economy catalogs ${path}: ${message}`);
}
function table(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(path, "expected a table");
  return value;
}
function list(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}
function keys(value, path, expected) {
  const source = table(value, path);
  const actual = Object.keys(source);
  for (const key of expected)
    if (!(key in source)) fail(path, `missing key ${key}`);
  for (const key of actual)
    if (!expected.includes(key)) fail(`${path}.${key}`, "unknown key");
  return source;
}
function number(value, path, { min = 0, max = Infinity, integer = true } = {}) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value))
  )
    fail(path, `expected a${integer ? "n integer" : " finite number"}`);
  if (value < min || value > max)
    fail(path, `expected a value from ${String(min)} to ${String(max)}`);
  return value;
}
const count = (value, path) => number(value, path);
const percent = (value, path) => number(value, path, { max: 100 });
function weighted(value, path, validateValue) {
  const entries = list(value, path);
  if (entries.length === 0) fail(path, "must not be empty");
  const seen = new Set();
  return entries.map((raw, index) => {
    const itemPath = `${path}[${String(index)}]`;
    const item = keys(raw, itemPath, ["value", "weight"]);
    const entryValue = validateValue(item.value, `${itemPath}.value`);
    if (seen.has(entryValue)) fail(`${itemPath}.value`, "duplicate value");
    seen.add(entryValue);
    return {
      value: entryValue,
      weight: number(item.weight, `${itemPath}.weight`, {
        min: Number.MIN_VALUE,
        integer: false,
      }),
    };
  });
}
function stock(value, path) {
  const source = keys(value, path, ["card-slots", "dreamsign-slots"]);
  return {
    cardSlots: count(source["card-slots"], `${path}.card-slots`),
    dreamsignSlots: count(source["dreamsign-slots"], `${path}.dreamsign-slots`),
  };
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

export function compileJourneyData(sourceValue) {
  const journey = keys(sourceValue, "journey", [
    "schema-version",
    "default-starting-essence",
    "dreamsign-cap",
  ]);
  if (number(journey["schema-version"], "journey.schema-version") !== 1)
    fail("journey.schema-version", "only schema version 1 is supported");
  return {
    defaultStartingEssence: count(
      journey["default-starting-essence"],
      "journey.default-starting-essence",
    ),
    dreamsignCap: count(journey["dreamsign-cap"], "journey.dreamsign-cap"),
  };
}

/** Assemble and strictly validate the economy data owned by four canonical catalogs. */
export function compileEconomyData({ journey: journeyValue, shop: shopValue, sites: sitesValue, battle: battleValue }) {
  const journey = compileJourneyData(journeyValue);
  const shop = keys(shopValue, "shop-site", [
    "schema-version",
    "prices",
    "stock",
    "discounts",
    "reroll",
  ]);
  const sites = table(sitesValue, "sites");
  const battleCatalog = table(battleValue, "battle");
  for (const [path, version] of [
    ["shop-site.schema-version", shop["schema-version"]],
    ["sites.schema-version", sites["schema-version"]],
    ["battle.schema-version", battleCatalog["schema-version"]],
  ]) {
    if (number(version, path) !== 1)
      fail(path, "only schema version 1 is supported");
  }
  const prices = keys(shop.prices, "shop.prices", [
    "standard-card",
    "specialty-card",
    "dreamsign",
  ]);
  const stocks = keys(shop.stock, "shop.stock", [
    "card-shop",
    "specialty-shop",
    "dreamsign-bazaar",
  ]);
  const discounts = keys(shop.discounts, "shop.discounts", [
    "slot-counts",
    "percentages",
  ]);
  const reroll = keys(shop.reroll, "shop.reroll", [
    "standard-price",
    "enhanced-price",
    "max-per-visit",
  ]);
  const { rewards: siteRewards, purge } = compileSiteEconomyData(sites, {
    file: "economy catalogs",
    pathPrefix: "sites.",
  });
  const battleRules = table(battleCatalog.battle, "battle.battle");
  const battle = keys(battleRules.reward, "battle.battle.reward", [
    "base-essence",
    "essence-per-completion-level",
    "minimum-essence",
  ]);
  const payload = {
    schemaVersion: 1,
    journey,
    shop: {
      prices: {
        standardCard: count(
          prices["standard-card"],
          "shop.prices.standard-card",
        ),
        specialtyCard: count(
          prices["specialty-card"],
          "shop.prices.specialty-card",
        ),
        dreamsign: count(prices.dreamsign, "shop.prices.dreamsign"),
      },
      stock: {
        cardShop: stock(stocks["card-shop"], "shop.stock.card-shop"),
        specialtyShop: stock(
          stocks["specialty-shop"],
          "shop.stock.specialty-shop",
        ),
        dreamsignBazaar: stock(
          stocks["dreamsign-bazaar"],
          "shop.stock.dreamsign-bazaar",
        ),
      },
      discounts: {
        slotCounts: weighted(
          discounts["slot-counts"],
          "shop.discounts.slot-counts",
          count,
        ),
        percentages: weighted(
          discounts.percentages,
          "shop.discounts.percentages",
          percent,
        ),
      },
      reroll: {
        standardPrice: count(
          reroll["standard-price"],
          "shop.reroll.standard-price",
        ),
        enhancedPrice: count(
          reroll["enhanced-price"],
          "shop.reroll.enhanced-price",
        ),
        maxPerVisit: count(
          reroll["max-per-visit"],
          "shop.reroll.max-per-visit",
        ),
      },
    },
    siteRewards,
    purge,
    battleReward: {
      baseEssence: count(battle["base-essence"], "battle.battle.reward.base-essence"),
      essencePerCompletionLevel: count(
        battle["essence-per-completion-level"],
        "battle.battle.reward.essence-per-completion-level",
      ),
      minimumEssence: count(
        battle["minimum-essence"],
        "battle.battle.reward.minimum-essence",
      ),
    },
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
