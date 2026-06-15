import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildImageManifest,
  imageNumberFromFilename,
  moveImageCategory,
  readApprovedImageNumbers,
  readFigmentImageNumbers,
  readImageMetadata,
  readManualUsedImageNumbers,
  readNameHistory,
  readUsedImageNumbers,
  setManualUsed,
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
  let extraTomlPath;
  let figmentsTomlPath;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "image-viewer-"));
    cardsTomlPath = join(root, "cards.toml");
    extraTomlPath = join(root, "cards_extra.toml");
    figmentsTomlPath = join(root, "figments.toml");

    mkdirSync(join(root, "warrior"));
    mkdirSync(join(root, "child"));
    writeFileSync(join(root, "warrior", "a-knight-1111.jpg"), "");
    writeFileSync(join(root, "warrior", "b-archer-2222.jpg"), "");
    writeFileSync(join(root, "child", "c-kid-3333.jpg"), "");
    // 4444 is approved final art (Art OK); 5555 carries both Art OK and Art
    // Rework. Both are dropped from the manifest entirely.
    writeFileSync(join(root, "warrior", "d-sage-4444.jpg"), "");
    writeFileSync(join(root, "warrior", "e-scout-5555.jpg"), "");
    // Stray file without a trailing number is ignored.
    writeFileSync(join(root, "warrior", "notes.txt"), "");

    // A second card file published image 1111 under an older name, and shares the
    // current name for 2222 (recorded once). 3333 has no card history.
    writeFileSync(
      extraTomlPath,
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
        "[[cards]]",
        'id = "00000000-0000-0000-0000-000000000004"',
        'name = "Sage"',
        'image-number = 4444',
        'tags = ["Art OK"]',
        "",
        "[[cards]]",
        'id = "00000000-0000-0000-0000-000000000005"',
        'name = "Scout"',
        'image-number = 5555',
        'tags = ["Art Rework", "Art OK"]',
        "",
      ].join("\n"),
    );

    // Figment 3333 claims an image; a figment with image-number 0 has no art.
    writeFileSync(
      figmentsTomlPath,
      [
        "[[figments]]",
        'name = "Spirit Animal"',
        'subtype = "Spirit Animal"',
        "image-number = 3333",
        "",
        "[[figments]]",
        'name = "Shadow"',
        'subtype = "Shadow"',
        "image-number = 0",
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

  it("collects Art OK image numbers, including ones also flagged Art Rework", () => {
    const approved = readApprovedImageNumbers(cardsTomlPath);
    expect(approved.has("4444")).toBe(true);
    expect(approved.has("5555")).toBe(true);
    expect(approved.has("1111")).toBe(false);
    expect(approved.has("2222")).toBe(false);
  });

  it("collects image numbers claimed by a figment, skipping the 0 placeholder", () => {
    const figmentUsed = readFigmentImageNumbers(figmentsTomlPath);
    expect(figmentUsed.has("3333")).toBe(true);
    expect(figmentUsed.has("0")).toBe(false);
  });

  it("marks a figment-claimed image as used in the manifest", () => {
    const manifest = buildImageManifest({
      root,
      cardsTomlPath,
      figmentsTomlPath,
      nameHistoryTomlPaths: [cardsTomlPath],
    });
    const byNumber = new Map(manifest.images.map((i) => [i.imageNumber, i]));
    // 3333 has no card, but a figment claims it.
    expect(byNumber.get("3333")?.used).toBe(true);
  });

  it("collects distinct names per image across both card sets", () => {
    const history = readNameHistory([cardsTomlPath, extraTomlPath]);
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
      nameHistoryTomlPaths: [cardsTomlPath, extraTomlPath],
    });
    expect(manifest.categories).toEqual(["child", "warrior"]);

    const byNumber = new Map(manifest.images.map((i) => [i.imageNumber, i]));
    // 4444 (Art OK) and 5555 (Art OK + Art Rework) are excluded entirely.
    expect(byNumber.size).toBe(3);
    expect(byNumber.has("4444")).toBe(false);
    expect(byNumber.has("5555")).toBe(false);
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
      manuallyUsed: false,
      cardName: null,
      cardNames: [],
    });
  });

  it("round-trips manual-used marks and reflects them in the manifest", () => {
    expect(readManualUsedImageNumbers(root).size).toBe(0);

    setManualUsed(root, "3333", true);
    expect(readManualUsedImageNumbers(root).has("3333")).toBe(true);

    const manifest = buildImageManifest({
      root,
      cardsTomlPath,
      nameHistoryTomlPaths: [cardsTomlPath],
    });
    const byNumber = new Map(manifest.images.map((i) => [i.imageNumber, i]));
    expect(byNumber.get("3333")?.manuallyUsed).toBe(true);
    // Card-derived used is unaffected by the manual mark.
    expect(byNumber.get("1111")?.manuallyUsed).toBe(false);
    expect(byNumber.get("1111")?.used).toBe(true);

    setManualUsed(root, "3333", false);
    expect(readManualUsedImageNumbers(root).has("3333")).toBe(false);
  });

  it("moves an image to a different category, preserving the filename", () => {
    const result = moveImageCategory(root, "child", "c-kid-3333.jpg", "warrior");
    expect(result).toEqual({ category: "warrior", filename: "c-kid-3333.jpg" });
    expect(existsSync(join(root, "child", "c-kid-3333.jpg"))).toBe(false);
    expect(existsSync(join(root, "warrior", "c-kid-3333.jpg"))).toBe(true);
  });

  it("refuses to move onto an existing destination file", () => {
    writeFileSync(join(root, "child", "a-knight-1111.jpg"), "");
    expect(() =>
      moveImageCategory(root, "child", "a-knight-1111.jpg", "warrior"),
    ).toThrow(/already exists/u);
    // Both files are left in place.
    expect(existsSync(join(root, "child", "a-knight-1111.jpg"))).toBe(true);
    expect(existsSync(join(root, "warrior", "a-knight-1111.jpg"))).toBe(true);
  });

  it("rejects category and filename path traversal", () => {
    expect(() =>
      moveImageCategory(root, "warrior", "../child/c-kid-3333.jpg", "child"),
    ).toThrow(/Invalid filename/u);
    expect(() =>
      moveImageCategory(root, "warrior", "a-knight-1111.jpg", ".."),
    ).toThrow(/Invalid category|not found/u);
  });
});
