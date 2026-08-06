import { createHash } from "node:crypto";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRESET_ID = /^[a-z][a-z0-9-]*$/u;
function fail(path, message) {
  throw new Error(`opponents.toml ${path}: ${message}`);
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
  for (const key of expected)
    if (!(key in source)) fail(path, `missing key ${key}`);
  for (const key of Object.keys(source))
    if (!expected.includes(key)) fail(`${path}.${key}`, "unknown key");
  return source;
}
function number(
  value,
  path,
  { min = 0, max = Number.MAX_SAFE_INTEGER, integer = true } = {},
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value))
  )
    fail(path, integer ? "expected an integer" : "expected a finite number");
  if (value < min || value > max)
    fail(path, `expected a value from ${String(min)} to ${String(max)}`);
  return value;
}
function string(value, path) {
  if (typeof value !== "string" || value.length === 0)
    fail(path, "expected a non-empty string");
  return value;
}
function boolean(value, path) {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}
function numbers(value, path, options) {
  const result = list(value, path).map((entry, index) =>
    number(entry, `${path}[${String(index)}]`, options),
  );
  if (result.length === 0) fail(path, "must not be empty");
  return result;
}
function unique(values, path) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) fail(`${path}[${String(index)}]`, "duplicate value");
    seen.add(value);
  }
  return values;
}
function curve(value, path, options, direction) {
  const source = keys(value, path, ["first", "last"]);
  const result = {
    first: number(source.first, `${path}.first`, options),
    last: number(source.last, `${path}.last`, options),
  };
  if (direction === "up" && result.first > result.last)
    fail(path, "must be monotonically non-decreasing");
  if (direction === "down" && result.first < result.last)
    fail(path, "must be monotonically non-increasing");
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

/** Strictly validates and normalizes parsed opponents.toml. */
export function compileOpponentsData(sourceValue, { cardIds } = {}) {
  const root = keys(sourceValue, "root", [
    "schema-version",
    "battle",
    "dreamwell",
    "progression",
    "coherent-draft",
    "corpus-selection",
    "journey-ai-deck",
    "ai",
  ]);
  if (number(root["schema-version"], "schema-version") !== 1)
    fail("schema-version", "only schema version 1 is supported");
  const battle = keys(root.battle, "battle", [
    "minimum-deck-size",
    "player-opening-hand-size",
    "enemy-opening-hand-size",
    "score-targets",
    "turn-limit",
    "energy-cap",
    "hand-limit",
    "starting-side",
    "skip-player-opening-draw",
    "opponent-signature-card-count",
  ]);
  const startingSide = string(battle["starting-side"], "battle.starting-side");
  if (startingSide !== "player" && startingSide !== "enemy")
    fail("battle.starting-side", "expected player or enemy");
  const dreamwell = keys(root.dreamwell, "dreamwell", [
    "opening-orders",
    "recurring-orders",
    "cards-per-recurring-order",
    "minimum-constructed-length",
  ]);
  const openingOrders = unique(
    numbers(dreamwell["opening-orders"], "dreamwell.opening-orders"),
    "dreamwell.opening-orders",
  );
  const recurringOrders = unique(
    numbers(dreamwell["recurring-orders"], "dreamwell.recurring-orders"),
    "dreamwell.recurring-orders",
  );
  for (const order of openingOrders)
    if (recurringOrders.includes(order))
      fail(
        "dreamwell",
        `order ${String(order)} appears in opening and recurring orders`,
      );
  const progression = keys(root.progression, "progression", [
    "ability-active-from-layer",
    "dreamsigns-from-layer",
    "legendaries-from-layer",
    "starter-dilution",
  ]);
  const coherent = keys(root["coherent-draft"], "coherent-draft", [
    "distinct-card-curve",
    "removal-curve",
    "temperature-curve",
    "best-of",
    "affiliation-objective-weight",
    "pack-source-records",
    "coherence",
  ]);
  const coherence = keys(coherent.coherence, "coherent-draft.coherence", [
    "nearest-neighbors",
    "neighbor-weight",
    "cooccurrence-weight",
    "self-consistency-weight",
    "self-distractors",
    "self-recall-k",
  ]);
  const neighborWeight = number(
    coherence["neighbor-weight"],
    "coherent-draft.coherence.neighbor-weight",
    { max: 1, integer: false },
  );
  const cooccurrenceWeight = number(
    coherence["cooccurrence-weight"],
    "coherent-draft.coherence.cooccurrence-weight",
    { max: 1, integer: false },
  );
  const selfConsistencyWeight = number(
    coherence["self-consistency-weight"],
    "coherent-draft.coherence.self-consistency-weight",
    { max: 1, integer: false },
  );
  if (
    Math.abs(neighborWeight + cooccurrenceWeight + selfConsistencyWeight - 1) >
    1e-9
  )
    fail("coherent-draft.coherence", "weights must sum to 1");
  const corpus = keys(root["corpus-selection"], "corpus-selection", [
    "affiliation-weight",
    "top-ranked-sampling-window",
  ]);
  const knownCardIds =
    cardIds === undefined
      ? undefined
      : new Set([...cardIds].map((id) => String(id).toLowerCase()));
  if (knownCardIds === undefined)
    fail("journey-ai-deck", "cardIds are required for UUID validation");
  const seenCards = new Set();
  const journeyAiDeck = list(root["journey-ai-deck"], "journey-ai-deck").map(
    (raw, index) => {
      const path = `journey-ai-deck[${String(index)}]`;
      const entry = keys(raw, path, ["card-id", "count"]);
      const cardId = string(entry["card-id"], `${path}.card-id`).toLowerCase();
      if (!UUID.test(cardId)) fail(`${path}.card-id`, "expected a UUID");
      if (!knownCardIds.has(cardId))
        fail(`${path}.card-id`, "does not reference cards.toml");
      if (seenCards.has(cardId)) fail(`${path}.card-id`, "duplicate card UUID");
      seenCards.add(cardId);
      return {
        cardId,
        count: number(entry.count, `${path}.count`, { min: 1 }),
      };
    },
  );
  if (journeyAiDeck.length === 0) fail("journey-ai-deck", "must not be empty");
  const ai = keys(root.ai, "ai", [
    "journey-default-preset",
    "tutorial-default-preset",
    "evaluation",
    "opponent-model",
    "presets",
  ]);
  const evaluation = keys(ai.evaluation, "ai.evaluation", [
    "score-difference-weight",
    "front-rank-spark-weight",
    "back-rank-spark-weight",
    "hand-card-weight",
    "value-hint-weight",
    "energy-waste-weight",
    "expected-points-weight",
  ]);
  const model = keys(ai["opponent-model"], "ai.opponent-model", [
    "removal-prior",
    "sample-safety-cap",
    "response-archetype-priors",
  ]);
  const priors = keys(
    model["response-archetype-priors"],
    "ai.opponent-model.response-archetype-priors",
    ["no-blocks", "block-biggest", "trade-evenly"],
  );
  const sampleSafetyCap = number(
    model["sample-safety-cap"],
    "ai.opponent-model.sample-safety-cap",
    { min: 1, max: 64 },
  );
  const presets = {};
  const presetList = list(ai.presets, "ai.presets");
  if (presetList.length === 0) fail("ai.presets", "must not be empty");
  for (const [index, raw] of presetList.entries()) {
    const path = `ai.presets[${String(index)}]`;
    const entry = keys(raw, path, [
      "id",
      "beam-width",
      "opponent-mode",
      "sample-count",
      "search-depth",
      "journey-planning-budget-ms",
      "tutorial-expansion-budget",
    ]);
    const id = string(entry.id, `${path}.id`);
    if (!PRESET_ID.test(id))
      fail(`${path}.id`, "expected a lowercase preset id");
    if (presets[id] !== undefined) fail(`${path}.id`, "duplicate preset id");
    const opponentMode = string(
      entry["opponent-mode"],
      `${path}.opponent-mode`,
    );
    if (opponentMode !== "expectiminimax" && opponentMode !== "worstCase")
      fail(`${path}.opponent-mode`, "expected expectiminimax or worstCase");
    const sampleCount = number(entry["sample-count"], `${path}.sample-count`, {
      min: 1,
    });
    if (sampleCount > sampleSafetyCap)
      fail(
        `${path}.sample-count`,
        "must not exceed ai.opponent-model.sample-safety-cap",
      );
    presets[id] = {
      id,
      beamWidth: number(entry["beam-width"], `${path}.beam-width`, {
        min: 1,
        max: 128,
      }),
      opponentMode,
      sampleCount,
      searchDepth: number(entry["search-depth"], `${path}.search-depth`, {
        min: 1,
        max: 128,
      }),
      journeyPlanningBudgetMs: number(
        entry["journey-planning-budget-ms"],
        `${path}.journey-planning-budget-ms`,
        { min: 1 },
      ),
      tutorialExpansionBudget: number(
        entry["tutorial-expansion-budget"],
        `${path}.tutorial-expansion-budget`,
        { min: 1 },
      ),
    };
  }
  const journeyDefaultPreset = string(
    ai["journey-default-preset"],
    "ai.journey-default-preset",
  );
  const tutorialDefaultPreset = string(
    ai["tutorial-default-preset"],
    "ai.tutorial-default-preset",
  );
  if (presets[journeyDefaultPreset] === undefined)
    fail("ai.journey-default-preset", "unknown preset reference");
  if (presets[tutorialDefaultPreset] === undefined)
    fail("ai.tutorial-default-preset", "unknown preset reference");
  const payload = {
    schemaVersion: 1,
    battle: {
      minimumDeckSize: number(
        battle["minimum-deck-size"],
        "battle.minimum-deck-size",
        { min: 1 },
      ),
      playerOpeningHandSize: number(
        battle["player-opening-hand-size"],
        "battle.player-opening-hand-size",
      ),
      enemyOpeningHandSize: number(
        battle["enemy-opening-hand-size"],
        "battle.enemy-opening-hand-size",
      ),
      scoreTargets: numbers(battle["score-targets"], "battle.score-targets", {
        min: 1,
      }),
      turnLimit: number(battle["turn-limit"], "battle.turn-limit", { min: 1 }),
      energyCap: number(battle["energy-cap"], "battle.energy-cap", { min: 1 }),
      handLimit: number(battle["hand-limit"], "battle.hand-limit", { min: 1 }),
      startingSide,
      skipPlayerOpeningDraw: boolean(
        battle["skip-player-opening-draw"],
        "battle.skip-player-opening-draw",
      ),
      opponentSignatureCardCount: number(
        battle["opponent-signature-card-count"],
        "battle.opponent-signature-card-count",
      ),
    },
    dreamwell: {
      openingOrders,
      recurringOrders,
      cardsPerRecurringOrder: number(
        dreamwell["cards-per-recurring-order"],
        "dreamwell.cards-per-recurring-order",
        { min: 1 },
      ),
      minimumConstructedLength: number(
        dreamwell["minimum-constructed-length"],
        "dreamwell.minimum-constructed-length",
        { min: 1 },
      ),
    },
    progression: {
      abilityActiveFromLayer: number(
        progression["ability-active-from-layer"],
        "progression.ability-active-from-layer",
      ),
      dreamsignsFromLayer: number(
        progression["dreamsigns-from-layer"],
        "progression.dreamsigns-from-layer",
      ),
      legendariesFromLayer: number(
        progression["legendaries-from-layer"],
        "progression.legendaries-from-layer",
      ),
      starterDilution: numbers(
        progression["starter-dilution"],
        "progression.starter-dilution",
      ),
    },
    coherentDraft: {
      distinctCardCurve: curve(
        coherent["distinct-card-curve"],
        "coherent-draft.distinct-card-curve",
        { min: 1 },
        "up",
      ),
      removalCurve: curve(
        coherent["removal-curve"],
        "coherent-draft.removal-curve",
        {},
        "up",
      ),
      temperatureCurve: curve(
        coherent["temperature-curve"],
        "coherent-draft.temperature-curve",
        { min: Number.MIN_VALUE, max: 1, integer: false },
        "down",
      ),
      bestOf: number(coherent["best-of"], "coherent-draft.best-of", { min: 1 }),
      affiliationObjectiveWeight: number(
        coherent["affiliation-objective-weight"],
        "coherent-draft.affiliation-objective-weight",
        { integer: false },
      ),
      packSourceRecords: number(
        coherent["pack-source-records"],
        "coherent-draft.pack-source-records",
        { min: 1 },
      ),
      coherence: {
        nearestNeighbors: number(
          coherence["nearest-neighbors"],
          "coherent-draft.coherence.nearest-neighbors",
          { min: 1 },
        ),
        neighborWeight,
        cooccurrenceWeight,
        selfConsistencyWeight,
        selfDistractors: number(
          coherence["self-distractors"],
          "coherent-draft.coherence.self-distractors",
          { min: 1 },
        ),
        selfRecallK: number(
          coherence["self-recall-k"],
          "coherent-draft.coherence.self-recall-k",
          { min: 1 },
        ),
      },
    },
    corpusSelection: {
      affiliationWeight: number(
        corpus["affiliation-weight"],
        "corpus-selection.affiliation-weight",
        { max: 1, integer: false },
      ),
      topRankedSamplingWindow: number(
        corpus["top-ranked-sampling-window"],
        "corpus-selection.top-ranked-sampling-window",
        { min: 1 },
      ),
    },
    journeyAiDeck,
    ai: {
      journeyDefaultPreset,
      tutorialDefaultPreset,
      evaluation: {
        scoreDifference: number(
          evaluation["score-difference-weight"],
          "ai.evaluation.score-difference-weight",
          { integer: false },
        ),
        frontRankSpark: number(
          evaluation["front-rank-spark-weight"],
          "ai.evaluation.front-rank-spark-weight",
          { integer: false },
        ),
        backRankSpark: number(
          evaluation["back-rank-spark-weight"],
          "ai.evaluation.back-rank-spark-weight",
          { integer: false },
        ),
        handCard: number(
          evaluation["hand-card-weight"],
          "ai.evaluation.hand-card-weight",
          { integer: false },
        ),
        valueHint: number(
          evaluation["value-hint-weight"],
          "ai.evaluation.value-hint-weight",
          { integer: false },
        ),
        energyWaste: number(
          evaluation["energy-waste-weight"],
          "ai.evaluation.energy-waste-weight",
          { integer: false },
        ),
        expectedPoints: number(
          evaluation["expected-points-weight"],
          "ai.evaluation.expected-points-weight",
          { integer: false },
        ),
      },
      opponentModel: {
        removalPrior: number(
          model["removal-prior"],
          "ai.opponent-model.removal-prior",
          { max: 1, integer: false },
        ),
        responseArchetypePriors: {
          noBlocks: number(
            priors["no-blocks"],
            "ai.opponent-model.response-archetype-priors.no-blocks",
            { min: Number.MIN_VALUE, integer: false },
          ),
          blockBiggest: number(
            priors["block-biggest"],
            "ai.opponent-model.response-archetype-priors.block-biggest",
            { min: Number.MIN_VALUE, integer: false },
          ),
          tradeEvenly: number(
            priors["trade-evenly"],
            "ai.opponent-model.response-archetype-priors.trade-evenly",
            { min: Number.MIN_VALUE, integer: false },
          ),
        },
        sampleSafetyCap,
      },
      presets,
    },
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
