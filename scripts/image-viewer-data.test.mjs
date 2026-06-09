import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildImageManifest,
  imageNumberFromFilename,
  readImageMetadata,
  readNameHistory,
  readUsedImageNumbers,
} from "./image-viewer-data.mjs";

describe("imageNumberFromFilename", () => {
  it("extracts the trailing numeric id", () => {
    expect(imageNumberFromFilename("stock-photo-a-warrior-2521694539.jpg")).toBe(
      "2521694539",
    );
  });

  it("returns null without a trailing number", () => {
    expect(imageNumberFromFilename("untagged-categorized.json")).toBeNull();
  });
});

describe("data helpers over a temp working set", () => {
  let root;
  let cardsTomlPath;
  let legacyTomlPath;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "image-viewer-"));
    cardsTomlPath = join(root, "cards.toml");
    legacyTomlPath = join(root, "rendered-cards.toml");

    mkdirSync(join(root, "warrior"));
    mkdirSync(join(root, "child"));
    writeFileSync(join(root, "warrior", "a-knight-1111.jpg"), "");
    writeFileSync(join(root, "warrior", "b-archer-2222.jpg"), "");
    writeFileSync(join(root, "child", "c-kid-3333.jpg"), "");
    // Stray file without a trailing number is ignored.
    writeFileSync(join(root, "warrior", "notes.txt"), "");

    // The legacy set published image 1111 under an older name, and shares the
    // current name for 2222 (recorded once). 3333 has no card history.
    writeFileSync(
      legacyTomlPath,
      [
        "[[cards]]",
        'name = "Old Gate Knight"',
        "image-number = 1111",
        "",
        "[[cards]]",
        'name = "Archer"',
        "image-number = 2222",
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(root, "untagged-categorized.json"),
      JSON.stringify([
        {
          image: "/x/untagged/a-knight-1111.jpg",
          category: "Character",
          subtype: "Warrior",
          card_name: "Gate Knight",
          narrative: "A knight at the gate.",
        },
      ]),
    );

    // 1111 is used by a finished card; 2222 is used but flagged Art Rework, so
    // it remains a candidate.
    writeFileSync(
      cardsTomlPath,
      [
        "[[cards]]",
        'id = "00000000-0000-0000-0000-000000000001"',
        'name = "Gate Knight"',
        'image-number = 1111',
        "tags = []",
        "",
        "[[cards]]",
        'id = "00000000-0000-0000-0000-000000000002"',
        'name = "Archer"',
        'image-number = 2222',
        'tags = ["Art Rework"]',
        "",
      ].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("treats Art Rework cards as not using their image", () => {
    const used = readUsedImageNumbers(cardsTomlPath);
    expect(used.has("1111")).toBe(true);
    expect(used.has("2222")).toBe(false);
  });

  it("collects distinct names per image across both card sets", () => {
    const history = readNameHistory([cardsTomlPath, legacyTomlPath]);
    expect(history.get("1111")).toEqual(["Gate Knight", "Old Gate Knight"]);
    // "Archer" appears in both files but is recorded once.
    expect(history.get("2222")).toEqual(["Archer"]);
    expect(history.has("3333")).toBe(false);
  });

  it("skips missing name-history files", () => {
    const history = readNameHistory([
      cardsTomlPath,
      join(root, "does-not-exist.toml"),
    ]);
    expect(history.get("1111")).toEqual(["Gate Knight"]);
  });

  it("reads metadata keyed by image number", () => {
    const metadata = readImageMetadata(join(root, "untagged-categorized.json"));
    expect(metadata.get("1111")?.cardName).toBe("Gate Knight");
  });

  it("builds a manifest with categories, used flags, and metadata", () => {
    const manifest = buildImageManifest({
      root,
      cardsTomlPath,
      nameHistoryTomlPaths: [cardsTomlPath, legacyTomlPath],
    });
    expect(manifest.categories).toEqual(["child", "warrior"]);

    const byNumber = new Map(manifest.images.map((i) => [i.imageNumber, i]));
    expect(byNumber.size).toBe(3);
    expect(byNumber.get("1111")).toMatchObject({
      category: "warrior",
      used: true,
      cardName: "Gate Knight",
      subtype: "Warrior",
      cardNames: ["Gate Knight", "Old Gate Knight"],
    });
    expect(byNumber.get("2222")?.used).toBe(false);
    expect(byNumber.get("2222")?.cardNames).toEqual(["Archer"]);
    expect(byNumber.get("3333")).toMatchObject({
      category: "child",
      used: false,
      cardName: null,
      cardNames: [],
    });
  });
});
