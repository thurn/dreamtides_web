// Map compilation over a temporary output directory with a stubbed compiler:
// a pass that finds no library keeps every catalog map's last compiled file,
// a map compiled again replaces its file, and only files that are not a
// catalog map's (a map removed from the catalog, stray temporaries) go.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DreamMapDefinition } from "../../src/d97/map/definition.ts";
import { parseDreamMapId } from "../../src/types/identifiers.ts";
import { compileMaps } from "./compile-maps.ts";
import type { LibraryCompileResult } from "./map-library.ts";

const directories: string[] = [];

function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "d97-compile-maps-"));
  directories.push(dir);
  return join(dir, "maps");
}

/** A catalog entry: the stubbed compiler reads only its id. */
function definition(n: number): DreamMapDefinition {
  return { id: parseDreamMapId(`d97e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`) } as DreamMapDefinition;
}

const compiledAs = (marker: string) => (): LibraryCompileResult => ({ ok: true, map: { marker } }) as unknown as LibraryCompileResult;
const noLibrary = (): LibraryCompileResult => ({ ok: false, missingSource: "/absent/library/map.tmx" });

const fileOf = (dir: string, map: DreamMapDefinition) => join(dir, `${map.id}.json`);
const markerOf = (dir: string, map: DreamMapDefinition) => (JSON.parse(readFileSync(fileOf(dir, map), "utf8")) as { marker: string }).marker;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("compileMaps", () => {
  it("keeps every catalog map's last compiled file when a pass finds no library", () => {
    const dir = outDir();
    const maps = [definition(1), definition(2)];
    expect(compileMaps(dir, maps, compiledAs("first"), false)).toEqual({ compiled: 2, failures: 0 });
    expect(compileMaps(dir, maps, noLibrary, false)).toEqual({ compiled: 0, failures: 0 });
    expect(maps.map((map) => markerOf(dir, map))).toEqual(["first", "first"]);
    expect(compileMaps(dir, maps, noLibrary, true).failures).toBe(2);
    expect(compileMaps(dir, maps, compiledAs("second"), false).compiled).toBe(2);
    expect(maps.map((map) => markerOf(dir, map))).toEqual(["second", "second"]);
  });

  it("removes a map that left the catalog and stray files, whatever the pass compiled", () => {
    const dir = outDir();
    const [kept, removed] = [definition(1), definition(2)];
    compileMaps(dir, [kept, removed], compiledAs("first"), false);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".stale.json.tmp"), "{}");
    compileMaps(dir, [kept], noLibrary, false);
    expect(existsSync(fileOf(dir, kept))).toBe(true);
    expect(existsSync(fileOf(dir, removed))).toBe(false);
    expect(existsSync(join(dir, ".stale.json.tmp"))).toBe(false);
  });
});
