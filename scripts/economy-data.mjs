import { createHash } from "node:crypto";

const FORMS = [
  "Amplified",
  "Attuned",
  "Inspired",
  "Enduring",
  "Resonant",
  "Perfected",
];

function fail(path, message) {
  throw new Error(`economy.toml ${path}: ${message}`);
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
function range(value, path) {
  const source = keys(value, path, ["min", "max"]);
  const min = count(source.min, `${path}.min`);
  const max = count(source.max, `${path}.max`);
  if (min > max) fail(path, "min must not exceed max");
  return { min, max };
}
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
function band(value, path, transfiguration) {
  const source = keys(value, path, ["base", "jitter", "floor"]);
  const result = {
    base: count(source.base, `${path}.base`),
    jitter: count(source.jitter, `${path}.jitter`),
    floor: count(source.floor, `${path}.floor`),
  };
  for (const [key, value] of Object.entries(result)) {
    if (value % transfiguration.step !== 0)
      fail(`${path}.${key}`, "must be a multiple of step");
  }
  if (
    result.base < transfiguration.minimumCost ||
    result.base > transfiguration.maximumCost ||
    result.floor < transfiguration.minimumCost ||
    result.floor > transfiguration.maximumCost
  )
    fail(path, "base and floor must be within global bounds");
  return result;
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

/** Compile and strictly validate the parsed economy.toml document. */
export function compileEconomyData(sourceValue) {
  const root = keys(sourceValue, "root", [
    "schema-version",
    "journey",
    "shop",
    "site-rewards",
    "purge",
    "transfiguration",
    "battle-reward",
    "exploration",
  ]);
  if (number(root["schema-version"], "schema-version") !== 1)
    fail("schema-version", "only schema version 1 is supported");
  const journey = keys(root.journey, "journey", [
    "default-starting-essence",
    "dreamsign-cap",
  ]);
  const shop = keys(root.shop, "shop", [
    "prices",
    "stock",
    "discounts",
    "reroll",
  ]);
  const prices = keys(shop.prices, "shop.prices", [
    "standard-card",
    "specialty-card",
    "dreamsign",
  ]);
  const stocks = keys(shop.stock, "shop.stock", [
    "card-shop",
    "specialty-shop",
    "dreamsign-market",
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
  const siteRewards = keys(root["site-rewards"], "site-rewards", [
    "essence",
    "reward",
    "dreamsign-revelation",
  ]);
  const essence = keys(siteRewards.essence, "site-rewards.essence", [
    "standard",
    "enhanced",
  ]);
  const reward = keys(siteRewards.reward, "site-rewards.reward", [
    "fallback-essence",
  ]);
  const revelation = keys(
    siteRewards["dreamsign-revelation"],
    "site-rewards.dreamsign-revelation",
    ["standard-offer-count", "enhanced-offer-count"],
  );
  const purge = keys(root.purge, "purge", [
    "marginal-costs",
    "enhanced-discount-percent",
  ]);
  const marginalCosts = list(
    purge["marginal-costs"],
    "purge.marginal-costs",
  ).map((entry, index) =>
    count(entry, `purge.marginal-costs[${String(index)}]`),
  );
  if (marginalCosts.length === 0)
    fail("purge.marginal-costs", "must not be empty");
  const transfiguration = keys(root.transfiguration, "transfiguration", [
    "minimum-cost",
    "maximum-cost",
    "step",
    "free-band",
    "form-bands",
    "stat-delta-bands",
  ]);
  const transfigurationShape = {
    minimumCost: count(
      transfiguration["minimum-cost"],
      "transfiguration.minimum-cost",
    ),
    maximumCost: count(
      transfiguration["maximum-cost"],
      "transfiguration.maximum-cost",
    ),
    step: number(transfiguration.step, "transfiguration.step", { min: 1 }),
  };
  if (transfigurationShape.minimumCost > transfigurationShape.maximumCost)
    fail("transfiguration", "minimum-cost must not exceed maximum-cost");
  const formBands = {};
  for (const [index, raw] of list(
    transfiguration["form-bands"],
    "transfiguration.form-bands",
  ).entries()) {
    const path = `transfiguration.form-bands[${String(index)}]`;
    const source = keys(raw, path, ["form", "base", "jitter", "floor"]);
    const form = source.form;
    if (typeof form !== "string" || !FORMS.includes(form))
      fail(`${path}.form`, "unknown form");
    if (form in formBands) fail(`${path}.form`, "duplicate form");
    const { form: _form, ...bandSource } = source;
    formBands[form] = band(bandSource, path, transfigurationShape);
  }
  for (const form of FORMS)
    if (!(form in formBands))
      fail("transfiguration.form-bands", `missing form ${form}`);
  const statDeltaBands = list(
    transfiguration["stat-delta-bands"],
    "transfiguration.stat-delta-bands",
  ).map((raw, index) => {
    const path = `transfiguration.stat-delta-bands[${String(index)}]`;
    const source = table(raw, path);
    const expected =
      index === 3
        ? ["minimum-delta", "base", "jitter", "floor"]
        : ["minimum-delta", "maximum-delta", "base", "jitter", "floor"];
    keys(source, path, expected);
    const minimumDelta = number(
      source["minimum-delta"],
      `${path}.minimum-delta`,
      { min: 1 },
    );
    const maximumDelta =
      source["maximum-delta"] === undefined
        ? null
        : number(source["maximum-delta"], `${path}.maximum-delta`, {
            min: minimumDelta,
          });
    const bandSource = {
      base: source.base,
      jitter: source.jitter,
      floor: source.floor,
    };
    return {
      minimumDelta,
      maximumDelta,
      ...band(bandSource, path, transfigurationShape),
    };
  });
  const expectedDeltas = [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, null],
  ];
  if (
    statDeltaBands.length !== 4 ||
    statDeltaBands.some(
      (entry, index) =>
        entry.minimumDelta !== expectedDeltas[index][0] ||
        entry.maximumDelta !== expectedDeltas[index][1],
    )
  )
    fail(
      "transfiguration.stat-delta-bands",
      "must define delta identities 1, 2, 3, and 4+",
    );
  const battle = keys(root["battle-reward"], "battle-reward", [
    "base-essence",
    "essence-per-completion-level",
    "minimum-essence",
  ]);
  const exploration = keys(root.exploration, "exploration", [
    "default-essence-per-spark",
  ]);
  const freeBand = band(
    transfiguration["free-band"],
    "transfiguration.free-band",
    transfigurationShape,
  );
  if (freeBand.base !== 0 || freeBand.jitter !== 0 || freeBand.floor !== 0) {
    fail("transfiguration.free-band", "must remain zero-cost");
  }
  const payload = {
    schemaVersion: 1,
    journey: {
      defaultStartingEssence: count(
        journey["default-starting-essence"],
        "journey.default-starting-essence",
      ),
      dreamsignCap: count(journey["dreamsign-cap"], "journey.dreamsign-cap"),
    },
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
        dreamsignMarket: stock(
          stocks["dreamsign-market"],
          "shop.stock.dreamsign-market",
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
    siteRewards: {
      essence: {
        standard: range(essence.standard, "site-rewards.essence.standard"),
        enhanced: range(essence.enhanced, "site-rewards.essence.enhanced"),
      },
      reward: {
        fallbackEssence: range(
          reward["fallback-essence"],
          "site-rewards.reward.fallback-essence",
        ),
      },
      dreamsignRevelation: {
        standardOfferCount: count(
          revelation["standard-offer-count"],
          "site-rewards.dreamsign-revelation.standard-offer-count",
        ),
        enhancedOfferCount: count(
          revelation["enhanced-offer-count"],
          "site-rewards.dreamsign-revelation.enhanced-offer-count",
        ),
      },
    },
    purge: {
      marginalCosts,
      enhancedDiscountPercent: percent(
        purge["enhanced-discount-percent"],
        "purge.enhanced-discount-percent",
      ),
    },
    transfiguration: {
      ...transfigurationShape,
      freeBand,
      formBands,
      statDeltaBands,
    },
    battleReward: {
      baseEssence: count(battle["base-essence"], "battle-reward.base-essence"),
      essencePerCompletionLevel: count(
        battle["essence-per-completion-level"],
        "battle-reward.essence-per-completion-level",
      ),
      minimumEssence: count(
        battle["minimum-essence"],
        "battle-reward.minimum-essence",
      ),
    },
    exploration: {
      defaultEssencePerSpark: count(
        exploration["default-essence-per-spark"],
        "exploration.default-essence-per-spark",
      ),
    },
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
