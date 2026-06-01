// @vitest-environment node

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  imageHash,
  parseEnergyCost,
  parseSpark,
  setupAssets,
  transformCard,
} from "./setup-assets.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setupAssets", () => {
  it("normalizes TOML cards and dreamcallers into runtime JSON artifacts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "quest-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const dreamcallerArtDir = join(tempRoot, "dreamcaller-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "rendered-cards.toml");
    const dreamcallerTomlPath = join(tempRoot, "dreamcallers.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");
    const cachedImagePath = join(imageCacheDir, imageHash(101));

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(dreamcallerArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    mkdirSync(dirname(cachedImagePath), { recursive: true });
    writeFileSync(cachedImagePath, "fake-webp");
    writeFileSync(join(dreamcallerArtDir, "0007.png"), "fake-png");
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");
    writeFileSync(
      join(dreamsignArtDir, "alt_text.txt"),
      "test-sign.png\tSmall idol with a violet glow.\n",
    );
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Null Spark"
id = "null-spark"
card-number = 1
card-type = "Character"
energy-cost = "*"
is-fast = false
tides = ["core", "ally_formation"]
rendered-text = "Rules text."
image-number = 101
art-owned = true

[[cards]]
name = "Missing Subtype"
id = "missing-subtype"
card-number = 2
card-type = "Event"
energy-cost = 2
spark = ""
is-fast = true
tides = ["support"]
rendered-text = ""
image-number = 102
art-owned = false

[[cards]]
name = "Starter Card"
id = "starter-card"
card-number = 3
card-type = "Character"
subtype = "Beast"
rarity = "Starter"
energy-cost = 1
spark = 1
is-fast = false
tides = ["ignored"]
rendered-text = ""
image-number = 103
art-owned = true
`,
    );
    writeFileSync(
      dreamcallerTomlPath,
      `[[dreamcaller]]
id = "dc-1"
name = "Dreamcaller One"
title = "Keeper of Test Cases"
rendered-text = "Choose tides."
image-number = "0007"
mandatory-tides = ["core", "bridge"]
optional-tides = ["support", "tempo", "finish", "value"]
`,
    );
    writeFileSync(
      dreamsignTomlPath,
      `[[dreamsign]]
id = "sign-1"
name = "Test Sign"
image_name = "test-sign.png"
tides = ["core", "support"]
rendered-text = "Use the canonical Dreamsign text."
`,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    setupAssets({
      cardTomlPath,
      dreamcallerTomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamcallerArtDir,
      dreamsignArtDir,
    });

    const cards = JSON.parse(
      readFileSync(join(publicDir, "card-data.json"), "utf8"),
    );
    const dreamcallers = JSON.parse(
      readFileSync(join(publicDir, "dreamcaller-data.json"), "utf8"),
    );
    const dreamsigns = JSON.parse(
      readFileSync(join(publicDir, "dreamsign-data.json"), "utf8"),
    );

    expect(cards).toEqual([
      {
        name: "Null Spark",
        id: "null-spark",
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: null,
        spark: null,
        isFast: false,
        tides: ["core", "ally_formation"],
        renderedText: "Rules text.",
        imageNumber: 101,
        artOwned: true,
      },
      {
        name: "Missing Subtype",
        id: "missing-subtype",
        cardNumber: 2,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: null,
        isFast: true,
        tides: ["support"],
        renderedText: "",
        imageNumber: 102,
        artOwned: false,
      },
      {
        name: "Starter Card",
        id: "starter-card",
        cardNumber: 3,
        cardType: "Character",
        rarity: "Starter",
        subtype: "Beast",
        isStarter: true,
        energyCost: 1,
        spark: 1,
        isFast: false,
        tides: ["ignored"],
        renderedText: "",
        imageNumber: 103,
        artOwned: true,
      },
    ]);
    expect(dreamcallers).toEqual([
      {
        id: "dc-1",
        name: "Dreamcaller One",
        title: "Keeper of Test Cases",
        renderedText: "Choose tides.",
        imageNumber: "0007",
        startingEssence: 250,
        mandatoryTides: ["core", "bridge"],
        optionalTides: ["support", "tempo", "finish", "value"],
      },
    ]);
    expect(dreamsigns).toEqual([
      {
        id: "sign-1",
        name: "Test Sign",
        imageName: "test-sign.png",
        imageAlt: "Small idol with a violet glow.",
        effectDescription: "Use the canonical Dreamsign text.",
        packageTides: ["core", "support"],
      },
    ]);
    expect(existsSync(join(publicDir, "cards", "101.webp"))).toBe(true);
    expect(existsSync(join(publicDir, "dreamcallers", "0007.png"))).toBe(true);
    expect(existsSync(join(publicDir, "dreamsigns", "test-sign.png"))).toBe(true);
  });

  it("passes through tuned starting-essence values from the TOML", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "quest-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const dreamcallerArtDir = join(tempRoot, "dreamcaller-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "rendered-cards.toml");
    const dreamcallerTomlPath = join(tempRoot, "dreamcallers.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(dreamcallerArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    writeFileSync(join(dreamcallerArtDir, "0007.png"), "fake-png");
    writeFileSync(join(dreamcallerArtDir, "0008.png"), "fake-png");
    writeFileSync(cardTomlPath, "");
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Solo"
id = "solo"
card-number = 1
card-type = "Event"
rarity = "Starter"
energy-cost = 1
spark = 1
is-fast = false
tides = ["core"]
rendered-text = ""
image-number = 901
art-owned = true
`,
    );
    writeFileSync(
      dreamcallerTomlPath,
      `[[dreamcaller]]
id = "dc-low"
name = "Discount Caller"
title = "Cheap Engine"
rendered-text = "Strong opener."
image-number = "0007"
starting-essence = 220
mandatory-tides = ["core"]
optional-tides = ["a", "b", "c", "d"]

[[dreamcaller]]
id = "dc-default"
name = "Steady Caller"
title = "Average Engine"
rendered-text = "Even keel."
image-number = "0008"
mandatory-tides = ["core"]
optional-tides = ["a", "b", "c", "d"]
`,
    );
    writeFileSync(
      dreamsignTomlPath,
      `[[dreamsign]]
id = "sign-1"
name = "Test Sign"
image_name = "test-sign.png"
tides = ["core"]
rendered-text = ""
`,
    );
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");

    vi.spyOn(console, "warn").mockImplementation(() => {});

    setupAssets({
      cardTomlPath,
      dreamcallerTomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamcallerArtDir,
      dreamsignArtDir,
    });

    const dreamcallers = JSON.parse(
      readFileSync(join(publicDir, "dreamcaller-data.json"), "utf8"),
    );
    expect(dreamcallers[0].startingEssence).toBe(220);
    expect(dreamcallers[1].startingEssence).toBe(250);
  });

  it("retains the rarity field on Legendary cards and omits it otherwise", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "quest-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const dreamcallerArtDir = join(tempRoot, "dreamcaller-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "rendered-cards.toml");
    const dreamcallerTomlPath = join(tempRoot, "dreamcallers.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(dreamcallerArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    writeFileSync(join(dreamcallerArtDir, "0007.png"), "fake-png");
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Hero Card"
id = "hero-card"
card-number = 401
card-type = "Character"
subtype = "Warrior"
rarity = "Legendary"
energy-cost = 5
spark = 5
is-fast = false
tides = ["core"]
rendered-text = ""
image-number = 401
art-owned = true

[[cards]]
name = "Filler"
id = "filler"
card-number = 402
card-type = "Event"
energy-cost = 1
spark = ""
is-fast = false
tides = ["core"]
rendered-text = ""
image-number = 402
art-owned = true
`,
    );
    writeFileSync(
      dreamcallerTomlPath,
      `[[dreamcaller]]
id = "dc-1"
name = "Caller"
title = "Title"
rendered-text = ""
image-number = "0007"
mandatory-tides = ["core"]
optional-tides = ["a", "b", "c", "d"]
`,
    );
    writeFileSync(
      dreamsignTomlPath,
      `[[dreamsign]]
id = "sign-1"
name = "Test Sign"
image_name = "test-sign.png"
tides = ["core"]
rendered-text = ""
`,
    );
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");

    vi.spyOn(console, "warn").mockImplementation(() => {});

    setupAssets({
      cardTomlPath,
      dreamcallerTomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamcallerArtDir,
      dreamsignArtDir,
    });

    const cards = JSON.parse(
      readFileSync(join(publicDir, "card-data.json"), "utf8"),
    );
    const byNumber = new Map(cards.map((c) => [c.cardNumber, c]));
    expect(byNumber.get(401)?.rarity).toBe("Legendary");
    expect(byNumber.get(402)?.rarity).toBe(undefined);
  });
});

describe("parseEnergyCost", () => {
  it("preserves a numeric single cost without orb labels", () => {
    expect(parseEnergyCost(3)).toEqual({ energyCost: 3, energyCosts: null });
  });

  it("treats blank and variable single values as a null cost", () => {
    expect(parseEnergyCost("")).toEqual({ energyCost: null, energyCosts: null });
    expect(parseEnergyCost("*")).toEqual({ energyCost: null, energyCosts: null });
    expect(parseEnergyCost("X")).toEqual({ energyCost: null, energyCosts: null });
  });

  it("splits a comma-separated multi-cost into orb labels and a base cost", () => {
    expect(parseEnergyCost("2,X")).toEqual({
      energyCost: 2,
      energyCosts: ["2", "X"],
    });
  });

  it("accepts the legacy newline-separated multi-cost form", () => {
    expect(parseEnergyCost("3\nX")).toEqual({
      energyCost: 3,
      energyCosts: ["3", "X"],
    });
  });

  it("uses the first numeric segment as the base cost", () => {
    expect(parseEnergyCost("X,2")).toEqual({
      energyCost: 2,
      energyCosts: ["X", "2"],
    });
  });
});

describe("transformCard energy cost", () => {
  const base = {
    name: "Multi Cost",
    id: "multi-cost",
    "card-number": 1,
    "card-type": "Event",
    "is-fast": false,
    tides: [],
    "rendered-text": "",
    "image-number": 1,
    "art-owned": false,
  };

  it("emits an energyCosts array for a multi-cost card", () => {
    const result = transformCard({ ...base, "energy-cost": "2,X" });
    expect(result.energyCost).toBe(2);
    expect(result.energyCosts).toEqual(["2", "X"]);
  });

  it("omits energyCosts for a single-cost card", () => {
    const result = transformCard({ ...base, "energy-cost": 4 });
    expect(result.energyCost).toBe(4);
    expect("energyCosts" in result).toBe(false);
  });
});

describe("parseSpark", () => {
  it("preserves a numeric spark", () => {
    expect(parseSpark(3)).toEqual({ spark: 3, variable: false });
    expect(parseSpark("5")).toEqual({ spark: 5, variable: false });
  });

  it("flags the variable markers as a variable spark", () => {
    expect(parseSpark("X")).toEqual({ spark: null, variable: true });
    expect(parseSpark("x")).toEqual({ spark: null, variable: true });
    expect(parseSpark("*")).toEqual({ spark: null, variable: true });
  });

  it("treats blank or missing spark as no spark", () => {
    expect(parseSpark("")).toEqual({ spark: null, variable: false });
    expect(parseSpark(undefined)).toEqual({ spark: null, variable: false });
  });
});

describe("transformCard spark", () => {
  const base = {
    name: "Spark Card",
    id: "spark-card",
    "card-number": 1,
    "card-type": "Character",
    "energy-cost": 1,
    "is-fast": false,
    tides: [],
    "rendered-text": "",
    "image-number": 1,
    "art-owned": false,
  };

  it("emits sparkVariable for a variable spark", () => {
    const result = transformCard({ ...base, spark: "X" });
    expect(result.spark).toBe(null);
    expect(result.sparkVariable).toBe(true);
  });

  it("omits sparkVariable for a numeric spark", () => {
    const result = transformCard({ ...base, spark: 4 });
    expect(result.spark).toBe(4);
    expect("sparkVariable" in result).toBe(false);
  });

  it("omits sparkVariable for a blank spark", () => {
    const result = transformCard({ ...base, spark: "" });
    expect(result.spark).toBe(null);
    expect("sparkVariable" in result).toBe(false);
  });
});
