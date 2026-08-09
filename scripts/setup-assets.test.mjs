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
import { parse } from "smol-toml";
import {
  buildDraftRecords,
  generateOpponentsData,
  imageHash,
  linkExplorationArt,
  parseEnergyCost,
  parseSpark,
  setupAssets,
  stripJsonComments,
  transformCard,
  transformExplorationData,
  validateDreamAvatarMapping,
} from "./setup-assets.mjs";

describe("generateOpponentsData", () => {
  it("writes the compiled browser artifact during asset setup", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "opponents-assets-"));
    const opponentsJsonPath = join(tempRoot, "opponents-data.json");
    const opponentsTomlPath = join(
      import.meta.dirname,
      "../data/opponents.toml",
    );
    const cardIds = parse(
      readFileSync(
        join(import.meta.dirname, "../data/cards.toml"),
        "utf8",
      ),
    ).cards.map((card) => card.id);

    const compiled = generateOpponentsData({
      opponentsTomlPath,
      opponentsJsonPath,
      cardIds,
    });

    expect(existsSync(opponentsJsonPath)).toBe(true);
    expect(JSON.parse(readFileSync(opponentsJsonPath, "utf8"))).toEqual(
      compiled,
    );
    expect(compiled.foldHash).toBe(compiled.contentHash);
  });
});

describe("transformExplorationData", () => {
  it("compiles a non-empty UUID-keyed catalog with two actions per encounter", () => {
    const source = parse(
      readFileSync(
        join(import.meta.dirname, "../data/exploration.toml"),
        "utf8",
      ),
    );
    const compiled = transformExplorationData(source);
    expect(compiled.schemaVersion).toBe(1);
    expect(compiled.effectKinds).toHaveLength(34);
    expect(compiled.foldHash).toBe(compiled.contentHash);
    const actions = compiled.encounters.flatMap(
      (encounter) => encounter.action,
    );

    expect(compiled.encounters.length).toBeGreaterThan(0);
    expect(actions).toHaveLength(compiled.encounters.length * 2);
    expect(
      new Set(compiled.encounters.map((encounter) => encounter.cardId)).size,
    ).toBe(compiled.encounters.length);
    expect(new Set(actions.map((action) => action.id)).size).toBe(
      actions.length,
    );
    expect(
      actions
        .filter((action) => action.effectText.includes("$DECK_CARD"))
        .every((action) => action.specialVariables.includes("$DECK_CARD")),
    ).toBe(true);
    expect(actions.map((action) => action.effectKind)).toEqual(
      expect.arrayContaining([
        "make-fast-all",
        "reduce-cost-all-and-gain-nightmares",
        "gain-random-dreamsign",
        "purge-dreamsign-for-essence",
        "copy-selected-card",
        "copy-offered-deck-card",
        "next-battle-opening-hand",
        "next-battle-starting-energy",
        "choose-dream-avatar",
        "purge-duplicates-and-grant-reclaim",
      ]),
    );
  });

  function syntheticExplorationSource(essencePerCard = 15) {
    const encounters = Array.from({ length: 2 }, (_, encounterIndex) => ({
      "card-id": `source-${String(encounterIndex)}`,
      prose: `Synthetic prose ${String(encounterIndex)}`,
      action: Array.from({ length: 2 }, (_, actionIndex) => ({
        id: `action-${String(encounterIndex)}-${String(actionIndex)}`,
        label: "Synthetic action",
        "effect-text": "Synthetic effect",
        "effect-kind": "gain-card",
      })),
    }));
    encounters[0].action[0] = {
      ...encounters[0].action[0],
      "effect-kind": "gain-offered-card",
      predicate: "character",
    };
    encounters[0].action[1] = {
      ...encounters[0].action[1],
      "effect-kind": "gain-essence-per-card",
      "essence-per-card": essencePerCard,
    };
    encounters[1].action[0] = {
      ...encounters[1].action[0],
      "effect-kind": "increase-spark-all",
      "spark-bonus": 1,
    };
    return { encounter: encounters };
  }

  it("compiles the redesigned encounter effect kinds", () => {
    const compiled = transformExplorationData(syntheticExplorationSource());
    const effectKinds = compiled.encounters.flatMap((encounter) =>
      encounter.action.map((action) => action.effectKind),
    );

    expect(effectKinds).toContain("gain-offered-card");
    expect(effectKinds).toContain("gain-essence-per-card");
    expect(effectKinds).toContain("increase-spark-all");
  });

  it("compiles Exploration encounters with one through four actions", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action.push({
      ...source.encounter[0].action[0],
      id: "synthetic-third-action",
    });
    expect(transformExplorationData(source).encounters[0].action).toHaveLength(3);

    source.encounter[0].action = [];
    expect(() => transformExplorationData(source)).toThrow(/between one and four actions/u);
  });

  it("compiles custom Dreamsigns as canonical collectible data", () => {
    const source = syntheticExplorationSource();
    source["custom-dreamsign"] = [
      {
        id: "custom-sign",
        name: "Custom Sign",
        "rendered-text": "A synthetic effect.",
      },
    ];

    const [dreamsign] = transformExplorationData(source).customDreamsigns;

    expect(dreamsign).toMatchObject({ id: "custom-sign" });
    expect(dreamsign).not.toHaveProperty("isNegative");
  });

  it("rejects a non-positive per-card essence reward", () => {
    expect(() =>
      transformExplorationData(syntheticExplorationSource(0)),
    ).toThrow(/requires positive essence-per-card/);
  });

  it("rejects invalid cardinalities for new Exploration mechanics", () => {
    const countSource = syntheticExplorationSource();
    countSource.encounter[0].action[0] = {
      ...countSource.encounter[0].action[0],
      "effect-kind": "copy-selected-card",
      count: 0,
    };
    expect(() => transformExplorationData(countSource)).toThrow(
      /requires a positive whole-number count/,
    );

    const offerSource = syntheticExplorationSource();
    offerSource.encounter[0].action[0] = {
      ...offerSource.encounter[0].action[0],
      "effect-kind": "choose-dream-avatar",
      "offer-count": 0,
    };
    expect(() => transformExplorationData(offerSource)).toThrow(
      /requires a positive whole-number offer-count/,
    );
  });

  it("rejects a non-positive spark-priced purge reward", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-kind": "purge-for-essence",
      "essence-per-spark": 0,
    };

    expect(() => transformExplorationData(source)).toThrow(
      /requires positive essence-per-spark/,
    );
  });

  it("compiles multi-copy, spark-priced purge, and compound battle effects", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-kind": "copy-selected-cards",
      count: 2,
    };
    source.encounter[0].action[1] = {
      ...source.encounter[0].action[1],
      "effect-kind": "purge-for-essence",
      "essence-per-spark": 20,
    };
    source.encounter[1].action[0] = {
      ...source.encounter[1].action[0],
      "effect-kind": "next-battle-smaller-hand-and-cost-discount",
    };

    expect(() => transformExplorationData(source)).not.toThrow();
  });

  it("requires a concrete subtype for selected subtype changes", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-kind": "change-subtype-selected",
      predicate: "cheap-character",
      subtype: "",
    };

    expect(() => transformExplorationData(source)).toThrow(
      /requires a non-empty subtype/,
    );
  });

  it("validates the fields required by offered copies, fixed replacement, and fixed transfiguration", () => {
    const offered = syntheticExplorationSource();
    offered.encounter[0].action[0] = {
      ...offered.encounter[0].action[0],
      "effect-kind": "gain-offered-card",
      "template-id": 12,
      predicate: "spirit-animal",
      count: 3,
    };
    offered.encounter[0].action[1] = {
      ...offered.encounter[0].action[1],
      "effect-kind": "replace-selected-with-card",
      "card-id": "fixed-card-id",
    };
    offered.encounter[1].action[0] = {
      ...offered.encounter[1].action[0],
      "effect-kind": "transfigure-fixed-selected",
      transfiguration: "Empowered",
    };
    expect(() => transformExplorationData(offered)).not.toThrow();

    const missingCount = structuredClone(offered);
    delete missingCount.encounter[0].action[0].count;
    expect(transformExplorationData(missingCount).encounters[0].action[0].count)
      .toBe(1);
    const missingCard = structuredClone(offered);
    delete missingCard.encounter[0].action[1]["card-id"];
    expect(() => transformExplorationData(missingCard)).toThrow(
      /requires card-id/,
    );
    const missingForm = structuredClone(offered);
    delete missingForm.encounter[1].action[0].transfiguration;
    expect(
      transformExplorationData(missingForm).encounters[1].action[0].transfiguration,
    ).toBe("Empowered");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateDreamAvatarMapping", () => {
  // Synthetic fixtures only — this exercises the invariant logic, never the
  // production TOML, so editing the real mapping cannot break these tests.
  const scape = (id, dreamAvatarIds, isStarter = false) => ({
    id,
    isStarter,
    dreamAvatarIds,
  });

  it("accepts a starter plus 3-4 caller regions and returns per-region counts", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const counts = validateDreamAvatarMapping(
      [
        scape("starter", [], true),
        scape("a", ["dc-1", "dc-2", "dc-3"]),
        scape("b", ["dc-4", "dc-5", "dc-6", "dc-7"]),
      ],
      ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5", "dc-6", "dc-7"],
    );
    expect(counts).toEqual({ starter: 0, a: 3, b: 4 });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("matches ids case-insensitively", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    validateDreamAvatarMapping(
      [scape("a", ["DC-1", "dc-2", "Dc-3"])],
      ["dc-1", "DC-2", "dc-3"],
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("throws when one DreamAvatar is assigned to two dreamscapes", () => {
    expect(() =>
      validateDreamAvatarMapping(
        [
          scape("a", ["dc-1", "dc-2", "dc-3"]),
          scape("b", ["dc-3", "dc-4", "dc-5"]),
        ],
        ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5"],
      ),
    ).toThrow(/assigned to both/);
  });

  it("throws when a non-starter region has fewer than 3 or more than 4", () => {
    expect(() =>
      validateDreamAvatarMapping(
        [scape("a", ["dc-1", "dc-2"])],
        ["dc-1", "dc-2"],
      ),
    ).toThrow(/must have 3-4/);
    expect(() =>
      validateDreamAvatarMapping(
        [scape("a", ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5"])],
        ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5"],
      ),
    ).toThrow(/must have 3-4/);
  });

  it("throws when the starter dreamscape lists residents", () => {
    expect(() =>
      validateDreamAvatarMapping([scape("starter", ["dc-1"], true)], ["dc-1"]),
    ).toThrow(/starter dreamscape/);
  });

  it("warns (does not throw) on unknown and unassigned ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateDreamAvatarMapping(
      [scape("a", ["dc-1", "dc-2", "ghost"])],
      ["dc-1", "dc-2", "dc-orphan"],
    );
    const messages = warn.mock.calls.map((call) => call[0]).join("\n");
    expect(messages).toMatch(/resolve to no DreamAvatar/);
    expect(messages).toMatch(/not assigned to any dreamscape/);
  });
});

describe("setupAssets", () => {
  it("normalizes TOML cards and dreamAvatars into runtime JSON artifacts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "journey-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const dreamAvatarArtDir = join(tempRoot, "dream-avatar-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const mainMenuBackgroundArtPath = join(
      tempRoot,
      "licensed-art",
      "main-menu-background.jpg",
    );
    const tutorialDialogueFrameArtPath = join(
      tempRoot,
      "licensed-art",
      "tutorial-round-frame.png",
    );
    const cardTomlPath = join(tempRoot, "cards.toml");
    const dreamAvatarV2TomlPath = join(tempRoot, "dream_avatars.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");
    const cachedImagePath = join(imageCacheDir, imageHash(101));

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(dreamAvatarArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    mkdirSync(dirname(mainMenuBackgroundArtPath), { recursive: true });
    mkdirSync(dirname(cachedImagePath), { recursive: true });
    writeFileSync(cachedImagePath, "fake-webp");
    writeFileSync(join(dreamAvatarArtDir, "0007.png"), "fake-png");
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");
    writeFileSync(mainMenuBackgroundArtPath, "fake-jpg");
    writeFileSync(tutorialDialogueFrameArtPath, "fake-png");
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
roles = ["starter-deck"]
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
      dreamAvatarV2TomlPath,
      `[[dreamAvatar]]
id = "dc-1"
name = "DreamAvatar One"
title = "Keeper of Test Cases"
rendered-text = "Trigger an ability."
image-number = "0007"
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
      catalogFixtureOnly: true,
      cardTomlPath,
      dreamAvatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamAvatarArtDir,
      dreamsignArtDir,
      mainMenuBackgroundArtPath,
      tutorialDialogueFrameArtPath,
    });

    const cards = JSON.parse(
      readFileSync(join(publicDir, "card-data.json"), "utf8"),
    );
    const dreamAvatars = JSON.parse(
      readFileSync(join(publicDir, "dream-avatars-v2-data.json"), "utf8"),
    );
    const dreamsigns = JSON.parse(
      readFileSync(join(publicDir, "dreamsign-data.json"), "utf8"),
    );
    expect(
      readFileSync(join(publicDir, "main-menu", "background.jpg"), "utf8"),
    ).toBe("fake-jpg");
    expect(
      readFileSync(join(publicDir, "atlas", "Round_frame.png"), "utf8"),
    ).toBe("fake-png");

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
        roles: ["starter-deck"],
        energyCost: 1,
        spark: 1,
        isFast: false,
        renderedText: "",
        imageNumber: 103,
        artOwned: true,
      },
    ]);
    expect(dreamAvatars).toEqual([
      {
        id: "dc-1",
        name: "DreamAvatar One",
        title: "Keeper of Test Cases",
        renderedText: "Trigger an ability.",
        imageNumber: "0007",
      },
    ]);
    expect(dreamsigns).toEqual([
      {
        id: "sign-1",
        name: "Test Sign",
        imageName: "test-sign.png",
        imageAlt: "Small idol with a violet glow.",
        effectDescription: "Use the canonical Dreamsign text.",
      },
    ]);
    expect(existsSync(join(publicDir, "cards", "101.webp"))).toBe(true);
    expect(existsSync(join(publicDir, "dream-avatars", "0007.png"))).toBe(true);
    expect(existsSync(join(publicDir, "dreamsigns", "test-sign.png"))).toBe(
      true,
    );
  });

  it("passes through tuned starting-essence values from the TOML", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "journey-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const dreamAvatarArtDir = join(tempRoot, "dream-avatar-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "cards.toml");
    const dreamAvatarV2TomlPath = join(tempRoot, "dream_avatars.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(dreamAvatarArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    writeFileSync(join(dreamAvatarArtDir, "0007.png"), "fake-png");
    writeFileSync(join(dreamAvatarArtDir, "0008.png"), "fake-png");
    writeFileSync(cardTomlPath, "");
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Solo"
id = "solo"
card-number = 1
card-type = "Event"
rarity = "Starter"
roles = ["starter-deck"]
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
      dreamAvatarV2TomlPath,
      `[[dreamAvatar]]
id = "dc-low"
name = "Discount Caller"
title = "Cheap Engine"
rendered-text = "Strong opener."
image-number = "0007"
starting-essence = 220

[[dreamAvatar]]
id = "dc-default"
name = "Steady Caller"
title = "Average Engine"
rendered-text = "Even keel."
image-number = "0008"
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
      catalogFixtureOnly: true,
      cardTomlPath,
      dreamAvatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamAvatarArtDir,
      dreamsignArtDir,
    });

    const dreamAvatars = JSON.parse(
      readFileSync(join(publicDir, "dream-avatars-v2-data.json"), "utf8"),
    );
    expect(dreamAvatars[0].startingEssence).toBe(220);
    expect(dreamAvatars[1]).not.toHaveProperty("startingEssence");
  });

  it("retains the rarity field on Legendary cards and omits it otherwise", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "journey-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const dreamAvatarArtDir = join(tempRoot, "dream-avatar-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "cards.toml");
    const dreamAvatarV2TomlPath = join(tempRoot, "dream_avatars.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(dreamAvatarArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    writeFileSync(join(dreamAvatarArtDir, "0007.png"), "fake-png");
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
      dreamAvatarV2TomlPath,
      `[[dreamAvatar]]
id = "dc-1"
name = "Caller"
title = "Title"
rendered-text = ""
image-number = "0007"
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
      catalogFixtureOnly: true,
      cardTomlPath,
      dreamAvatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamAvatarArtDir,
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

describe("linkExplorationArt", () => {
  it("prefers curated Exploration art and falls back to source art", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "exploration-art-"));
    const destinationDir = join(tempRoot, "public", "exploration");
    const highResArtDir = join(tempRoot, "curated");
    const sourceArtDir = join(tempRoot, "source");
    mkdirSync(highResArtDir, { recursive: true });
    mkdirSync(sourceArtDir, { recursive: true });
    writeFileSync(join(highResArtDir, "101.jpg"), "curated-101");
    writeFileSync(
      join(sourceArtDir, "stock-photo-first-101.jpg"),
      "source-101",
    );
    writeFileSync(
      join(sourceArtDir, "stock-photo-second-202.jpg"),
      "source-202",
    );

    const result = linkExplorationArt({
      destinationDir,
      highResArtDir,
      sourceArtDir,
      imageNumbers: [101, 202, 303],
    });

    expect(result).toEqual({
      highResolutionCount: 1,
      sourceCount: 1,
      missingCount: 1,
    });
    expect(readFileSync(join(destinationDir, "101.jpg"), "utf8")).toBe(
      "curated-101",
    );
    expect(readFileSync(join(destinationDir, "202.jpg"), "utf8")).toBe(
      "source-202",
    );
    expect(existsSync(join(destinationDir, "303.jpg"))).toBe(false);
  });
});

describe("parseEnergyCost", () => {
  it("preserves a numeric single cost without orb labels", () => {
    expect(parseEnergyCost(3)).toEqual({ energyCost: 3, energyCosts: null });
  });

  it("treats blank and variable single values as a null cost", () => {
    expect(parseEnergyCost("")).toEqual({
      energyCost: null,
      energyCosts: null,
    });
    expect(parseEnergyCost("*")).toEqual({
      energyCost: null,
      energyCosts: null,
    });
    expect(parseEnergyCost("X")).toEqual({
      energyCost: null,
      energyCosts: null,
    });
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

describe("transformCard Amplified text", () => {
  it("carries an authored Amplified form into the runtime shape", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Gain 2●.",
      "amplified-text": "Gain 3●.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toBe("Gain 3●.");
  });

  it("allows an authored Amplified form to increase draw", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Draw a card.",
      "amplified-text": "Draw 2 cards.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toBe("Draw 2 cards.");
  });

  it("allows an authored Character Amplified form to add draw", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Character",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Gain 2●.",
      "amplified-text": "Gain 2●. Draw a card.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toContain("Draw a card");
  });

  it("rejects an authored Event Amplified form that adds draw", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Event",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "Gain 2●.",
        "amplified-text": "Gain 2●. Draw a card.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/adds draw to an Event without base draw/u);
  });

  it("allows an Amplified form to improve a discovered card after selection", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text":
        "Discover a ≤2● cost character, then materialize it.",
      "amplified-text":
        "Discover a ≤2● cost character, then materialize it with awakened.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toContain("with awakened");
  });

  it("rejects an authored Amplified form that changes Discover criteria", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Event",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text":
          "Discover a ≤2● cost character, then materialize it.",
        "amplified-text":
          "Discover a ≤3● cost character, then materialize it.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/changes Discover criteria/u);
  });

  it("rejects authored text that changes activated costs", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Character",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "3●: Store 1⧗.",
        "amplified-text": "2●: Store 1⧗.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/changes an activated ability cost/u);
  });

  it("rejects authored text that breaks later Perfected transforms", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Character",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "▸Dawn: Gain 1●.\n\n2●, ☾: Gain 1✦.",
        "amplified-text": "Gain 2●.\n\nGain 2✦.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/changes (?:a named trigger|an activated ability cost)/u);
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

describe("buildDraftRecords", () => {
  /**
   * buildDraftRecords keys on stable cards_v2 UUIDs, so the synthetic records
   * below store UUID-shaped tokens. `ID` maps short readable labels (A..F, a
   * duplicate-test "Dup", and per-pack markers P1..P3) to those UUIDs, and the
   * `idToName` stub resolves each UUID back to its label so the assertions can
   * read in label space.
   */
  const ID = {
    A: "00000000-0000-0000-0000-00000000000a",
    B: "00000000-0000-0000-0000-00000000000b",
    C: "00000000-0000-0000-0000-00000000000c",
    D: "00000000-0000-0000-0000-00000000000d",
    E: "00000000-0000-0000-0000-00000000000e",
    F: "00000000-0000-0000-0000-00000000000f",
    Dup: "00000000-0000-0000-0000-0000000000d0",
    P1: "00000000-0000-0000-0000-000000000001",
    P2: "00000000-0000-0000-0000-000000000002",
    P3: "00000000-0000-0000-0000-000000000003",
  };
  const cardMaps = {
    idToName: new Map(Object.entries(ID).map(([label, id]) => [id, label])),
  };

  /**
   * Build a synthetic picks array: 3 packs × `picksPerPack` picks.
   * pickInPack runs 1..picksPerPack for each pack.
   * packCards for every pick contains [A, B, C] (as UUIDs) plus an optional extra.
   */
  function makePicks({ picksPerPack = 15, extraPackCards = [] } = {}) {
    const picks = [];
    let pickNumber = 0;
    for (let pack = 1; pack <= 3; pack++) {
      for (let pip = 1; pip <= picksPerPack; pip++) {
        pickNumber++;
        picks.push({
          pickNumber,
          pack,
          pickInPack: pip,
          pick: pip === 1 ? [ID.A] : [],
          packCards: [ID.A, ID.B, ID.C, ...extraPackCards],
        });
      }
    }
    return picks;
  }

  it("skips a file that has no seats array", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    writeFileSync(join(dir, "names.jsonc"), JSON.stringify({ notSeats: true }));
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toEqual([]);
  });

  it("drops a seat with empty mainboard", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "draft1",
        seats: [
          { seat: 0, mainboard: [], picks: makePicks() },
          { seat: 1, mainboard: [ID.A], picks: makePicks() },
        ],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("draft1#1");
  });

  it("skips a seat with no picks array without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "nopicks",
        seats: [
          { seat: 0, mainboard: [ID.A] },
          { seat: 1, mainboard: [ID.A], picks: makePicks() },
        ],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("nopicks#1");
  });

  it("trims a complete seat to exactly 30 packs and picks, in pickNumber order, preserving raw packCards order including duplicates", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    // Pack 2, pick-in-pack 3 gets a duplicate "Dup" to prove no dedup.
    const picks = makePicks({ extraPackCards: [] });
    // Insert a duplicate into pack 2, pickInPack 3 (which trims to <=10, so it stays).
    const targetPick = picks.find((p) => p.pack === 2 && p.pickInPack === 3);
    targetPick.packCards = [ID.A, ID.Dup, ID.Dup, ID.B];

    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "abc",
        seats: [{ seat: 2, mainboard: [ID.A, ID.B], picks }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    const rec = result[0];

    // 30 trimmed picks (10 per pack × 3)
    expect(rec.packs).toHaveLength(30);
    expect(rec.picks).toHaveLength(30);

    // Packs and picks are aligned
    expect(rec.packs.length).toBe(rec.picks.length);

    // Ordered by pickNumber: first pick in pack 1 is pick 1
    expect(rec.packs[0]).toContain("A");

    // The duplicate "Dup" is preserved in its raw order (not deduped)
    // Pack 2, pip 3 is the 13th trimmed pick (10 from pack1 + 3rd from pack2 = index 12).
    expect(rec.packs[12]).toEqual(["A", "Dup", "Dup", "B"]);

    // pick arrays are passed through as-is
    expect(rec.picks[0]).toEqual(["A"]);
    expect(rec.picks[1]).toEqual([]);

    // packIds/pickIds carry the stable ids, aligned index-for-index with names.
    expect(rec.packIds).toHaveLength(30);
    expect(rec.pickIds).toHaveLength(30);
    expect(rec.packIds[12]).toEqual([ID.A, ID.Dup, ID.Dup, ID.B]);
    expect(rec.pickIds[0]).toEqual([ID.A]);
  });

  it("emits id as <draftId>#<seat>", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "xyz-123",
        seats: [{ seat: 5, mainboard: [ID.A], picks: makePicks() }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result[0].id).toBe("xyz-123#5");
    expect(result[0].draftId).toBe("xyz-123");
  });

  it("skips a seat with fewer than 30 trimmed picks (incomplete record)", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    // Only 2 packs × 10 = 20 trimmed picks — incomplete.
    const incompletePicks = makePicks({ picksPerPack: 10 }).filter(
      (p) => p.pack <= 2,
    );
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "incomplete",
        seats: [{ seat: 0, mainboard: [ID.A], picks: incompletePicks }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(0);
  });

  it("keeps only the first three packs from a draft with more than three packs", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    // A 5-pack draft, 10 picks per pack. Packs 1-3 (pickInPack <= 10) yield the
    // 30 trimmed picks; packs 4-5 are dropped entirely. Each pick is tagged with
    // its pack marker (P1..P5) so we can assert which packs survived.
    // Packs 1-3 carry resolvable per-pack markers (P1..P3); packs 4-5 carry
    // markers absent from the catalog, so even if they were not trimmed they
    // would resolve to nothing.
    const PACK_MARKER = {
      1: ID.P1,
      2: ID.P2,
      3: ID.P3,
      4: "pack-4",
      5: "pack-5",
    };
    const picks = [];
    let pickNumber = 0;
    for (let pack = 1; pack <= 5; pack++) {
      for (let pip = 1; pip <= 10; pip++) {
        pickNumber++;
        picks.push({
          pickNumber,
          pack,
          pickInPack: pip,
          pick: [ID.A],
          packCards: [PACK_MARKER[pack], ID.A, ID.B],
        });
      }
    }
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "fivepack",
        seats: [{ seat: 0, mainboard: [ID.A], picks }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    expect(result[0].packs).toHaveLength(30);
    // First trimmed pick is from pack 1, last is from pack 3.
    expect(result[0].packs[0]).toContain("P1");
    expect(result[0].packs[29]).toContain("P3");
    // No surviving pack came from packs 4 or 5 (P4/P5 markers never appear).
    const allNames = result[0].packs.flat();
    expect(allNames).not.toContain("P4");
    expect(allNames).not.toContain("P5");
  });

  it("drops tokens that are not a known card UUID and excludes them from output", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    // A UUID that is not in cardMaps.idToName (an unknown/removed card).
    const UNKNOWN = "99999999-9999-9999-9999-999999999999";
    const picks = makePicks();
    picks[0].packCards = [ID.A, UNKNOWN, ID.B];
    picks[0].pick = [UNKNOWN];

    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "nametest",
        seats: [{ seat: 0, mainboard: [ID.A, UNKNOWN, ID.C], picks }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    const rec = result[0];

    // The unknown card dropped from mainboard, leaving the resolved labels.
    expect(rec.mainboard).toEqual(["A", "C"]);

    // The unknown card dropped from pack.
    expect(rec.packs[0]).toEqual(["A", "B"]);

    // The unknown card dropped from pick (leaving empty array).
    expect(rec.picks[0]).toEqual([]);
  });

  it("resolves UUID tokens through idToName, surviving a rename (JSONC input)", () => {
    const dir = mkdtempSync(join(tmpdir(), "journey-draft-records-"));
    // The corpus stores stable ids. `RENAMED_ID`'s historical display name does
    // not appear anywhere; idToName maps the id to its current name — so the pick
    // must survive and surface the new name purely from its UUID.
    const RENAMED_ID = "11111111-1111-1111-1111-111111111111";
    const STAPLE_ID = "22222222-2222-2222-2222-222222222222";
    const renameMaps = {
      idToName: new Map([
        [STAPLE_ID, "Staple"],
        [RENAMED_ID, "Reborn Hero"],
      ]),
    };
    // 30 trimmed picks; packs hold ids. Written as JSONC with a trailing comment
    // to exercise comment stripping in buildDraftRecords.
    const picks = [];
    let pickNumber = 0;
    for (let pack = 1; pack <= 3; pack++) {
      for (let pip = 1; pip <= 10; pip++) {
        pickNumber++;
        picks.push({
          pickNumber,
          pack,
          pickInPack: pip,
          pick: pip === 1 ? [RENAMED_ID] : [],
          packCards: [RENAMED_ID, STAPLE_ID],
        });
      }
    }
    const jsonc = `{
  "draftId": "renamed",
  "seats": [
    {
      "seat": 0,
      "mainboard": [
        "${RENAMED_ID}", // Reborn Hero (renamed since the draft)
        "${STAPLE_ID}" // Staple
      ],
      "picks": ${JSON.stringify(picks)}
    }
  ]
}`;
    writeFileSync(join(dir, "draft.jsonc"), jsonc);
    const result = buildDraftRecords(dir, renameMaps);
    expect(result).toHaveLength(1);
    const rec = result[0];

    // The renamed card surfaces under its CURRENT name, keyed by its stable id.
    expect(rec.packs[0]).toEqual(["Reborn Hero", "Staple"]);
    expect(rec.packIds[0]).toEqual([RENAMED_ID, STAPLE_ID]);
    expect(rec.picks[0]).toEqual(["Reborn Hero"]);
    expect(rec.pickIds[0]).toEqual([RENAMED_ID]);
    // The current name is reachable only by resolving the stable id through
    // idToName — proving the id, not a name lookup, carried the card through.
    expect(renameMaps.idToName.get(RENAMED_ID)).toBe("Reborn Hero");
  });
});

describe("stripJsonComments", () => {
  it("removes trailing line comments outside strings", () => {
    const input = '{\n  "a": "x", // a comment\n  "b": 1\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: "x", b: 1 });
  });

  it("preserves // sequences inside string values", () => {
    const input = '{ "url": "https://example.com" }';
    expect(JSON.parse(stripJsonComments(input))).toEqual({
      url: "https://example.com",
    });
  });
});
