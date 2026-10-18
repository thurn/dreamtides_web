// Character linking over a synthetic generator checkout: the generated
// credits hold the CREDITS.csv rows of exactly the sheets the recipes use (a
// pre-colored variant sheet credited by its animation folder's row), authors
// and licenses deduplicated (case-insensitively) and collated, and a used
// sheet without a row reported; the CSV parser tolerates the generator's
// stray whitespace after closing quotes, quoted commas and doubled quotes.
// Without a library no credits are written, and a pass without it keeps the
// last pass's sheets, manifest and credits (a fresh workspace gets the
// capsule manifest).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { characterSprite } from "../../src/content/d97/characters/schema.ts";
import { parseCharacterCredits } from "../../src/d97/overworld/characters/credits.ts";
import { parseCharacterManifest } from "../../src/d97/overworld/characters/manifest.ts";
import { parseD97CharacterId, parseLpcSheetKey } from "../../src/types/identifiers.ts";
import { parseCreditsCsv } from "./character-credits.ts";
import { linkCharacters } from "./link-characters.ts";

const directories: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "d97-link-characters-"));
  directories.push(dir);
  return dir;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const CSV = [
  "filename,notes,authors,licenses,urls",
  `"body/male/walk.png","a ""quoted"" note, with a comma" ,"author-b,Author-A" ,"lic-2,lic-1" ,"https://example.test/body" `,
  `"body/male/idle.png","" ,"author-a,author-c" ,"lic-1" ,"https://example.test/body,https://example.test/idle" `,
  `"hat/walk.png","" ,"author-d" ,"lic-3" ,"" `,
  `"cape/male/walk.png","" ,"unused-author" ,"unused-license" ,"https://example.test/unused" `,
  "",
].join("\n");

function generator(root: string, credits: boolean): string {
  const dir = join(root, "ulpc-generator");
  write(join(dir, "sheet_definitions", "body", "body.json"), JSON.stringify({ layer_1: { zPos: 10, male: "body/male/" } }));
  write(join(dir, "sheet_definitions", "hat", "hat.json"), JSON.stringify({ layer_1: { zPos: 120, male: "hat/" }, variants: ["gold"] }));
  write(join(dir, "sheet_definitions", "cape", "cape.json"), JSON.stringify({ layer_1: { zPos: 5, male: "cape/male/" } }));
  for (const sheet of ["body/male/walk.png", "body/male/idle.png", "hat/walk/gold.png", "hat/idle/gold.png", "cape/male/walk.png"]) {
    write(join(dir, "spritesheets", sheet), "png");
  }
  if (credits) write(join(dir, "CREDITS.csv"), CSV);
  return dir;
}

const RECIPE = characterSprite({
  id: parseD97CharacterId("d9710000-0000-4000-8000-0000000000f1"),
  body: "male",
  skin: "light",
  parts: [{ sheet: parseLpcSheetKey("hat"), colors: ["gold"] }],
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("linkCharacters", () => {
  it("credits exactly the used sheets and reports a used sheet without a row", () => {
    const root = tempDir();
    const out = join(root, "out");
    const result = linkCharacters(generator(root, true), out, [RECIPE]);

    const manifest = parseCharacterManifest(JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")));
    expect(manifest?.characters[RECIPE.id]?.missing).toEqual([]);
    const credits = parseCharacterCredits(JSON.parse(readFileSync(join(out, "credits.json"), "utf8")));
    expect(credits).toEqual({
      format: 1,
      authors: ["Author-A", "author-b", "author-c", "author-d"],
      licenses: ["lic-1", "lic-2", "lic-3"],
      urls: ["https://example.test/body", "https://example.test/idle"],
      sheets: 4,
      unmatched: ["hat/idle/gold.png"],
    });
    expect(result.credits).toEqual({ sheets: 4, unmatched: ["hat/idle/gold.png"], authors: 4 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("hat/idle/gold.png"));
  });

  it("writes no credits without the library or its CREDITS.csv", () => {
    const root = tempDir();
    const out = join(root, "out");
    expect(linkCharacters(generator(root, false), out, [RECIPE]).credits).toBeNull();
    expect(existsSync(join(out, "credits.json"))).toBe(false);
    expect(linkCharacters(join(root, "absent"), out, [RECIPE]).credits).toBeNull();
    expect(existsSync(join(out, "credits.json"))).toBe(false);
    expect(existsSync(join(out, "manifest.json"))).toBe(true);
  });
});

describe("linkCharacters without the library", () => {
  it("keeps the last pass's sheets, manifest and credits, and writes the capsule manifest only when none exists", () => {
    const root = tempDir();
    const out = join(root, "out");
    linkCharacters(generator(root, true), out, [RECIPE]);
    const manifest = readFileSync(join(out, "manifest.json"), "utf8");
    const credits = readFileSync(join(out, "credits.json"), "utf8");
    expect(existsSync(join(out, "sheets", "body", "male", "walk.png"))).toBe(true);

    expect(linkCharacters(join(root, "absent"), out, [RECIPE])).toEqual({ linked: 0, credits: null });
    expect(readFileSync(join(out, "manifest.json"), "utf8")).toBe(manifest);
    expect(readFileSync(join(out, "credits.json"), "utf8")).toBe(credits);
    expect(existsSync(join(out, "sheets", "body", "male", "walk.png"))).toBe(true);

    const fresh = join(root, "fresh");
    linkCharacters(join(root, "absent"), fresh, [RECIPE]);
    const capsules = parseCharacterManifest(JSON.parse(readFileSync(join(fresh, "manifest.json"), "utf8")));
    expect(capsules?.characters[RECIPE.id]?.layers).toEqual([]);
    expect(existsSync(join(fresh, "credits.json"))).toBe(false);
  });
});

describe("parseCreditsCsv", () => {
  it("reads quoted fields with stray trailing whitespace, commas and doubled quotes", () => {
    const rows = parseCreditsCsv(CSV);
    expect([...rows.keys()]).toEqual(["body/male/walk.png", "body/male/idle.png", "hat/walk.png", "cape/male/walk.png"]);
    expect(rows.get("body/male/walk.png")).toEqual({
      authors: ["author-b", "Author-A"],
      licenses: ["lic-2", "lic-1"],
      urls: ["https://example.test/body"],
    });
    expect(rows.get("hat/walk.png")?.urls).toEqual([]);
  });
});
