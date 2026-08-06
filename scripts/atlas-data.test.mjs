import { describe, expect, it } from "vitest";
import { SITE_TYPES } from "../src/types/site-type.ts";
import { compileAtlasData } from "./atlas-data.mjs";

const LAYERS = ["one", "two", "three", "four", "five", "six", "seven"];

function fixtureSource() {
  const layers = LAYERS.map((name, index) => ({
    name,
    role: index === 0 ? "starter" : index === 6 ? "boss" : "standard",
    "node-count": { min: index === 0 || index === 6 ? 1 : 2, max: index === 0 || index === 6 ? 1 : 3 },
    ...(index === 0
      ? { "mandatory-sites": {} }
      : {
          "site-count": { min: 3, max: 6 },
          "fill-profile": "fixture",
          "mandatory-sites": index === 1
            ? { Draft: 2, Purge: 1, Augury: 1 }
            : index === 2
              ? { Draft: 1, Purge: 1 }
              : {},
        }),
  }));
  return {
    "schema-version": 1,
    layers,
    graph: {
      "connection-average": 2,
      "reveal-lookahead-layers": 2,
      "bonus-reveal": { min: 0, max: 2, mode: 1, "eligible-layers": ["five", "six"] },
    },
    "dreamscape-selection": {
      "base-weight": 1,
      "repeat-discourage-strength": 2,
      "exclude-connected-repeats": true,
      "exclude-same-layer-repeats": true,
      "exhaustion-fallback": "allow-repeats",
    },
    "site-composition": {
      "unique-non-draft-sites": true,
      "known-dreamsign-site": "Reward",
      "mandatory-capacity-behavior": "omit-fill",
    },
    "fill-profiles": [{
      id: "fixture",
      "signature-site-weight": 3,
      "site-weights": { Essence: 3, Transfiguration: 1, Duplication: 1 },
    }],
    "known-dreamsign": {
      "max-per-atlas": 2,
      "eligible-layers": ["three", "four", "five", "six"],
      "placement-probability": 0.5,
      "early-reveal-bias": 1,
    },
    "random-site": {
      destinations: ["Shop", "Purge", "Augury"],
      "home-choice-count": 3,
      "away-choice-count": 1,
      "guide-line": "Fixture random guide line.",
    },
    "site-types": SITE_TYPES.map((type) => ({
      type,
      icon: `fixture-icon-${type}`,
      "glossary-id": `fixture-glossary-${type}`,
    })),
    "fallback-site-type": {
      icon: "fixture-fallback-icon",
      name: "Fixture unknown site",
      description: "Fixture unknown description.",
    },
    boss: {
      "dreamscape-id": "fixture-limbo",
      place: "Fixture Limbo",
      name: "Fixture Boss",
      "fallback-title": "Fixture Boss Title",
      "fallback-introduction": "Fixture boss introduction.",
      "scene-art-id": "fixture-boss-scene",
      "icon-art-id": "fixture-boss-icon",
      "figure-art-id": "fixture-boss-figure",
    },
    presentation: {
      "unseen-title": "Fixture unseen title",
      "unseen-body": "Fixture unseen body.",
      "starter-body": "Fixture starter body.",
      "affiliation-title-template": "Fixture {name}",
      "affiliation-body-template": "Fixture {card-theme}",
    },
    assets: {
      "unrevealed-frame-source": "fixture-frame.png",
      "unrevealed-frame-key": "fixture-frame-output.png",
      "boss-scene-source": "fixture-scene.png",
      "boss-icon-source": "fixture-icon.png",
      "boss-figure-source": "fixture-figure.png",
    },
  };
}

function fixtureCatalogs() {
  return {
    dreamscapes: [
      { id: "fixture-starter", "is-starter": true, "signature-site": "Battle" },
      {
        id: "fixture-random-home",
        "signature-site": "RandomSite",
        "guide-id": "fixture-random-guide",
        "affiliation-id": "fixture-affiliation",
      },
    ],
    guides: [{ id: "fixture-random-guide" }],
    affiliations: [{
      id: "fixture-affiliation",
      "atlas-card-theme": "Fixture Theme",
    }],
    glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    assetSources: {
      bossScenes: new Set(["fixture-scene.png"]),
      bossIcons: new Set(["fixture-icon.png"]),
      bossFigures: new Set(["fixture-figure.png"]),
      frames: new Set(["fixture-frame.png"]),
    },
  };
}

function compile(source = fixtureSource(), catalogs = fixtureCatalogs()) {
  return compileAtlasData(source, catalogs);
}

function expectFailure(mutator, pattern, catalogMutator) {
  const source = fixtureSource();
  const catalogs = fixtureCatalogs();
  mutator(source);
  catalogMutator?.(catalogs);
  expect(() => compile(source, catalogs)).toThrow(pattern);
}

describe("compileAtlasData", () => {
  it("normalizes deterministically and emits stable SHA-256 hashes", () => {
    const first = compile();
    const source = fixtureSource();
    const reordered = Object.fromEntries(Object.entries(source).reverse());
    const second = compile(reordered);
    expect(second).toEqual(first);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.foldHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("keeps presentation and artwork outside the fold hash", () => {
    const baseline = compile();
    const source = fixtureSource();
    source.presentation["unseen-body"] = "Changed fixture presentation.";
    source["site-types"][0].icon = "changed-fixture-icon";
    source.assets["unrevealed-frame-key"] = "changed-frame-output.png";
    const changed = compile(source);
    expect(changed.contentHash).not.toBe(baseline.contentHash);
    expect(changed.foldHash).toBe(baseline.foldHash);
  });

  it("changes both hashes when fold-relevant rules change", () => {
    const baseline = compile();
    const source = fixtureSource();
    source["fill-profiles"][0]["site-weights"].Essence = 7;
    const changed = compile(source);
    expect(changed.contentHash).not.toBe(baseline.contentHash);
    expect(changed.foldHash).not.toBe(baseline.foldHash);

    const bossSource = fixtureSource();
    bossSource.boss.place = "Changed persisted boss place";
    const changedBoss = compile(bossSource);
    expect(changedBoss.contentHash).not.toBe(baseline.contentHash);
    expect(changedBoss.foldHash).not.toBe(baseline.foldHash);
  });

  it("derives Random Site ownership into the normalized fold contract", () => {
    const baseline = compile();
    const catalogs = fixtureCatalogs();
    const owner = catalogs.dreamscapes.find(
      (dreamscape) => dreamscape["signature-site"] === "RandomSite",
    );
    owner["guide-id"] = "alternate-fixture-guide";
    catalogs.guides[0].id = "alternate-fixture-guide";
    const changed = compile(fixtureSource(), catalogs);
    expect(changed.randomSite.guideId).toBe("alternate-fixture-guide");
    expect(changed.foldHash).not.toBe(baseline.foldHash);
  });

  it("rejects unsupported schema versions and malformed layer sets", () => {
    expectFailure((source) => { source["schema-version"] = 2; }, /schema-version/);
    expectFailure((source) => { source.layers.pop(); }, /exactly seven layers/);
    expectFailure((source) => { source.layers[1].name = "one"; }, /values must be unique/);
    expectFailure((source) => { source.layers[2]["node-count"] = { min: 4, max: 2 }; }, /min must not exceed max/);
  });

  it("rejects invalid probabilities, weights, and mandatory capacity", () => {
    expectFailure((source) => { source["known-dreamsign"]["placement-probability"] = 2; }, /placement-probability/);
    expectFailure((source) => { source["fill-profiles"][0]["site-weights"].Essence = -1; }, /site-weights.Essence/);
    expectFailure((source) => { source.layers[1]["site-count"].max = 5; }, /exceed max/);
    expectFailure((source) => { source.layers[2]["mandatory-sites"].Battle = 1; }, /Battle is appended structurally/);
  });

  it("rejects unknown layer, site, and fill-profile references", () => {
    expectFailure((source) => { source.graph["bonus-reveal"]["eligible-layers"] = ["eight"]; }, /unknown layer/);
    expectFailure((source) => { source.layers[2]["mandatory-sites"].Unknown = 1; }, /unknown site type/);
    expectFailure((source) => { source.layers[2]["fill-profile"] = "missing"; }, /unknown profile/);
  });

  it("rejects incomplete site metadata and invalid Random Site choices", () => {
    expectFailure((source) => { source["site-types"].pop(); }, /missing metadata/);
    expectFailure((source) => { source["random-site"].destinations[0] = "Battle"; }, /cannot be materialized by Random Site/);
    expectFailure((source) => { source["random-site"]["home-choice-count"] = 4; }, /cannot exceed destination count/);
  });

  it("rejects unsupported or incomplete presentation templates", () => {
    expectFailure((source) => { source.presentation["affiliation-title-template"] = "Fixture {unknown}"; }, /unsupported placeholder/);
    expectFailure((source) => { source.presentation["affiliation-body-template"] = "Fixture body"; }, /missing placeholder/);
  });

  it("rejects duplicate Random Site ownership and unresolved catalog references", () => {
    expectFailure(
      () => {},
      /exactly one dreamscape must own RandomSite/,
      (catalogs) => catalogs.dreamscapes.push({
        id: "duplicate-random-home",
        "signature-site": "RandomSite",
        "guide-id": "duplicate-guide",
        "affiliation-id": "fixture-affiliation",
      }),
    );
    expectFailure(
      () => {},
      /unresolved guide id/,
      (catalogs) => { catalogs.guides[0].id = "different-guide"; },
    );
    expectFailure(
      () => {},
      /unresolved glossary id/,
      (catalogs) => catalogs.glossaryIds.pop(),
    );
    expectFailure(
      () => {},
      /unresolved affiliation id/,
      (catalogs) => { catalogs.dreamscapes[1]["affiliation-id"] = "missing"; },
    );
    expectFailure(
      () => {},
      /unresolved asset source/,
      (catalogs) => catalogs.assetSources.frames.clear(),
    );
  });
});
