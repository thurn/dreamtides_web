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
  buildDraftRecords,
  imageHash,
  parseEnergyCost,
  parseSpark,
  setupAssets,
  stripJsonComments,
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
    const dreamcallerV2TomlPath = join(tempRoot, "dreamcallers_v2.toml");
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
      dreamcallerV2TomlPath,
      `[[dreamcaller]]
id = "dc-1"
name = "Dreamcaller One"
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
      cardTomlPath,
      dreamcallerV2TomlPath,
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
      readFileSync(join(publicDir, "dreamcallers-v2-data.json"), "utf8"),
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
        energyCost: 1,
        spark: 1,
        isFast: false,
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
        renderedText: "Trigger an ability.",
        imageNumber: "0007",
        startingEssence: 250,
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
    const dreamcallerV2TomlPath = join(tempRoot, "dreamcallers_v2.toml");
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
      dreamcallerV2TomlPath,
      `[[dreamcaller]]
id = "dc-low"
name = "Discount Caller"
title = "Cheap Engine"
rendered-text = "Strong opener."
image-number = "0007"
starting-essence = 220

[[dreamcaller]]
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
      cardTomlPath,
      dreamcallerV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamcallerArtDir,
      dreamsignArtDir,
    });

    const dreamcallers = JSON.parse(
      readFileSync(join(publicDir, "dreamcallers-v2-data.json"), "utf8"),
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
    const dreamcallerV2TomlPath = join(tempRoot, "dreamcallers_v2.toml");
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
      dreamcallerV2TomlPath,
      `[[dreamcaller]]
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
      cardTomlPath,
      dreamcallerV2TomlPath,
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

describe("buildDraftRecords", () => {
  /**
   * Minimal cardMaps stub covering names A..F, a duplicate-test name "Dup", and
   * per-pack markers P1..P3 used to assert which packs survive trimming.
   */
  const nameToId = new Map([
    ["A", "id-a"],
    ["B", "id-b"],
    ["C", "id-c"],
    ["D", "id-d"],
    ["E", "id-e"],
    ["F", "id-f"],
    ["Dup", "id-dup"],
    ["P1", "id-p1"],
    ["P2", "id-p2"],
    ["P3", "id-p3"],
  ]);
  const cardMaps = {
    nameToId,
    idToName: new Map([...nameToId].map(([name, id]) => [id, name])),
  };

  /**
   * Build a synthetic picks array: 3 packs × `picksPerPack` picks.
   * pickInPack runs 1..picksPerPack for each pack.
   * packCards for every pick contains ["A","B","C"] plus an optional extra.
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
          pick: pip === 1 ? ["A"] : [],
          packCards: ["A", "B", "C", ...extraPackCards],
        });
      }
    }
    return picks;
  }

  it("skips a file that has no seats array", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    writeFileSync(
      join(dir, "names.jsonc"),
      JSON.stringify({ notSeats: true }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toEqual([]);
  });

  it("drops a seat with empty mainboard", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "draft1",
        seats: [
          { seat: 0, mainboard: [], picks: makePicks() },
          { seat: 1, mainboard: ["A"], picks: makePicks() },
        ],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("draft1#1");
  });

  it("skips a seat with no picks array without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "nopicks",
        seats: [
          { seat: 0, mainboard: ["A"] },
          { seat: 1, mainboard: ["A"], picks: makePicks() },
        ],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("nopicks#1");
  });

  it("trims a complete seat to exactly 30 packs and picks, in pickNumber order, preserving raw packCards order including duplicates", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    // Pack 2, pick-in-pack 3 gets a duplicate "Dup" to prove no dedup.
    const picks = makePicks({ extraPackCards: [] });
    // Insert a duplicate into pack 2, pickInPack 3 (which trims to <=10, so it stays).
    const targetPick = picks.find((p) => p.pack === 2 && p.pickInPack === 3);
    targetPick.packCards = ["A", "Dup", "Dup", "B"];

    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "abc",
        seats: [{ seat: 2, mainboard: ["A", "B"], picks }],
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
    expect(rec.packIds[12]).toEqual(["id-a", "id-dup", "id-dup", "id-b"]);
    expect(rec.pickIds[0]).toEqual(["id-a"]);
  });

  it("emits id as <draftId>#<seat>", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "xyz-123",
        seats: [{ seat: 5, mainboard: ["A"], picks: makePicks() }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result[0].id).toBe("xyz-123#5");
    expect(result[0].draftId).toBe("xyz-123");
  });

  it("skips a seat with fewer than 30 trimmed picks (incomplete record)", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    // Only 2 packs × 10 = 20 trimmed picks — incomplete.
    const incompletePicks = makePicks({ picksPerPack: 10 }).filter(
      (p) => p.pack <= 2,
    );
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "incomplete",
        seats: [{ seat: 0, mainboard: ["A"], picks: incompletePicks }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(0);
  });

  it("keeps only the first three packs from a draft with more than three packs", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    // A 5-pack draft, 10 picks per pack. Packs 1-3 (pickInPack <= 10) yield the
    // 30 trimmed picks; packs 4-5 are dropped entirely. Each pick is tagged with
    // its pack marker (P1..P5) so we can assert which packs survived.
    const picks = [];
    let pickNumber = 0;
    for (let pack = 1; pack <= 5; pack++) {
      for (let pip = 1; pip <= 10; pip++) {
        pickNumber++;
        picks.push({
          pickNumber,
          pack,
          pickInPack: pip,
          pick: ["A"],
          packCards: [`P${pack}`, "A", "B"],
        });
      }
    }
    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "fivepack",
        seats: [{ seat: 0, mainboard: ["A"], picks }],
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

  it("drops names absent from cardMaps.nameToId and excludes them from output", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    // "Unknown" is not in cardMaps.nameToId.
    const picks = makePicks();
    picks[0].packCards = ["A", "Unknown", "B"];
    picks[0].pick = ["Unknown"];

    writeFileSync(
      join(dir, "draft.jsonc"),
      JSON.stringify({
        draftId: "nametest",
        seats: [{ seat: 0, mainboard: ["A", "Unknown", "C"], picks }],
      }),
    );
    const result = buildDraftRecords(dir, cardMaps);
    expect(result).toHaveLength(1);
    const rec = result[0];

    // "Unknown" dropped from mainboard
    expect(rec.mainboard).not.toContain("Unknown");
    expect(rec.mainboard).toContain("A");

    // "Unknown" dropped from pack
    expect(rec.packs[0]).not.toContain("Unknown");
    expect(rec.packs[0]).toContain("A");

    // "Unknown" dropped from pick (leaving empty array)
    expect(rec.picks[0]).toEqual([]);
  });

  it("resolves UUID tokens through idToName, surviving a rename (JSONC input)", () => {
    const dir = mkdtempSync(join(tmpdir(), "quest-draft-records-"));
    // The corpus stores stable ids. `RENAMED_ID`'s historical display name is
    // gone from nameToId (the card was renamed), but idToName still maps the id
    // to its current name — so the pick must survive and surface the new name.
    const RENAMED_ID = "11111111-1111-1111-1111-111111111111";
    const STAPLE_ID = "22222222-2222-2222-2222-222222222222";
    const renameMaps = {
      nameToId: new Map([["Staple", STAPLE_ID]]),
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
    // The name only exists in idToName, never in nameToId — proving the id, not a
    // name lookup, carried it through.
    expect(renameMaps.nameToId.has("Reborn Hero")).toBe(false);
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
