import { describe, expect, it } from "vitest";
import { compileOpponentsData } from "./opponents-data.mjs";

const CARD_ID = "00000000-0000-4000-8000-000000000001";

function fixture() {
  return {
    "schema-version": 1,
    battle: {
      "minimum-deck-size": 9,
      "player-opening-hand-size": 3,
      "enemy-opening-hand-size": 4,
      "score-targets": [7, 13],
      "turn-limit": 31,
      "energy-cap": 8,
      "hand-limit": 6,
      "starting-side": "enemy",
      "skip-player-opening-draw": false,
      "opponent-signature-card-count": 2,
    },
    dreamwell: {
      "opening-orders": [0],
      "recurring-orders": [2, 4],
      "cards-per-recurring-order": 2,
      "minimum-constructed-length": 17,
    },
    progression: {
      "ability-active-from-layer": 2,
      "dreamsigns-from-layer": 4,
      "legendaries-from-layer": 6,
      "starter-dilution": [7, 3, 1],
    },
    "coherent-draft": {
      "distinct-card-curve": { first: 8, last: 20 },
      "removal-curve": { first: 1, last: 5 },
      "temperature-curve": { first: 0.6, last: 0.2 },
      "best-of": 3,
      "affiliation-objective-weight": 0.75,
      "pack-source-records": 12,
      coherence: {
        "nearest-neighbors": 4,
        "neighbor-weight": 0.5,
        "cooccurrence-weight": 0.25,
        "self-consistency-weight": 0.25,
        "self-distractors": 6,
        "self-recall-k": 2,
      },
    },
    "corpus-selection": {
      "affiliation-weight": 0.4,
      "top-ranked-sampling-window": 5,
    },
    "journey-ai-deck": [{ "card-id": CARD_ID, count: 2 }],
    ai: {
      "journey-default-preset": "test",
      "tutorial-default-preset": "test",
      evaluation: {
        "score-difference-weight": 9,
        "front-rank-spark-weight": 2,
        "back-rank-spark-weight": 1,
        "hand-card-weight": 1.25,
        "value-hint-weight": 0.75,
        "energy-waste-weight": 0.5,
        "expected-points-weight": 1.5,
      },
      "opponent-model": {
        "removal-prior": 0.2,
        "sample-safety-cap": 10,
        "response-archetype-priors": {
          "no-blocks": 1,
          "block-biggest": 3,
          "trade-evenly": 4,
        },
      },
      presets: [
        {
          id: "test",
          "beam-width": 5,
          "opponent-mode": "worstCase",
          "sample-count": 6,
          "search-depth": 9,
          "journey-planning-budget-ms": 42,
          "tutorial-expansion-budget": 77,
        },
      ],
    },
  };
}

const compile = (source) =>
  compileOpponentsData(source, { cardIds: [CARD_ID] });

describe("compileOpponentsData", () => {
  it("normalizes every section, resolves presets, and hashes all fields", () => {
    const source = fixture();
    const first = compile(source);
    expect(first.battle.minimumDeckSize).toBe(9);
    expect(first.ai.presets.test.searchDepth).toBe(9);
    expect(first.foldHash).toBe(first.contentHash);
    source.ai.evaluation["score-difference-weight"] = 10;
    expect(compile(source).contentHash).not.toBe(first.contentHash);
  });

  it("includes every normalized section in the content hash", () => {
    const baseline = compile(fixture()).contentHash;
    const mutations = [
      (x) => {
        x.battle["turn-limit"] += 1;
      },
      (x) => {
        x.dreamwell["minimum-constructed-length"] += 1;
      },
      (x) => {
        x.progression["ability-active-from-layer"] += 1;
      },
      (x) => {
        x["coherent-draft"]["pack-source-records"] += 1;
      },
      (x) => {
        x["corpus-selection"]["affiliation-weight"] = 0.5;
      },
      (x) => {
        x["journey-ai-deck"][0].count += 1;
      },
      (x) => {
        x.ai.evaluation["hand-card-weight"] = 2;
      },
      (x) => {
        x.ai["opponent-model"]["removal-prior"] = 0.3;
      },
      (x) => {
        x.ai.presets[0]["beam-width"] += 1;
      },
    ];

    for (const mutate of mutations) {
      const source = fixture();
      mutate(source);
      expect(compile(source).contentHash).not.toBe(baseline);
    }
  });

  it.each([
    [
      "unknown key",
      (x) => {
        x.battle.extra = 1;
      },
      /battle\.extra: unknown key/u,
    ],
    [
      "missing key",
      (x) => {
        delete x.dreamwell["opening-orders"];
      },
      /dreamwell: missing key opening-orders/u,
    ],
    [
      "overlapping orders",
      (x) => {
        x.dreamwell["recurring-orders"] = [0, 2];
      },
      /appears in opening and recurring/u,
    ],
    [
      "non-monotonic curve",
      (x) => {
        x["coherent-draft"]["removal-curve"] = { first: 5, last: 1 };
      },
      /monotonically non-decreasing/u,
    ],
    [
      "bad coherence weights",
      (x) => {
        x["coherent-draft"].coherence["neighbor-weight"] = 0.1;
      },
      /weights must sum to 1/u,
    ],
    [
      "unknown card",
      (x) => {
        x["journey-ai-deck"][0]["card-id"] =
          "00000000-0000-4000-8000-000000000002";
      },
      /does not reference cards\.toml/u,
    ],
    [
      "unknown preset",
      (x) => {
        x.ai["journey-default-preset"] = "missing";
      },
      /unknown preset reference/u,
    ],
    [
      "sample overflow",
      (x) => {
        x.ai.presets[0]["sample-count"] = 11;
      },
      /must not exceed/u,
    ],
  ])("rejects %s with a path-specific error", (_label, mutate, pattern) => {
    const source = fixture();
    mutate(source);
    expect(() => compile(source)).toThrow(pattern);
  });
});
