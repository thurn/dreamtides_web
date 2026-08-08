// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

function read(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function entries(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match.slice(1));
}

function pythonSubstitutions() {
  const source = read("scripts/build-iosevka-ron-font.py");
  const substitutions = entries(
    source,
    /Substitution\("([^"]+)", "([^"]+)", "[^"]+"\)/g,
  );
  expect(substitutions.length).toBeGreaterThan(0);
  return new Map(substitutions);
}

function glyphBoxicons() {
  const source = read("src/cumulus/primitives/glyph.ts");
  const glyphs = entries(
    source,
    /^\s*(\w+):\s*g\("bxf bx-([a-z0-9-]+)"\)/gm,
  );
  expect(glyphs.length).toBeGreaterThan(0);
  return new Map(glyphs);
}

function symbolCharacters() {
  const source = read("src/cumulus/components/card/card-text.ts");
  const mapBlock = /const SYMBOL_MAP[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
  expect(mapBlock).not.toBeNull();
  const symbols = entries(
    mapBlock?.[1] ?? "",
    /^\s*"([^"]+)":\s*"([^"]+)",/gm,
  );
  expect(symbols.length).toBeGreaterThan(0);

  const activated = /const ACTIVATED_CHAR = "([^"]+)";/.exec(source);
  expect(activated).not.toBeNull();
  return { symbols, activated: activated?.[1] ?? "" };
}

function rulesSymbolGlyphs() {
  const rulesText = read("src/cumulus/components/card/RulesText.tsx");
  const standaloneGlyph = read(
    "src/cumulus/components/controls/StandaloneGlyph.tsx",
  );

  const symbolIconBlock =
    /const SYMBOL_ICON_CLASSES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(rulesText);
  expect(symbolIconBlock).not.toBeNull();
  const symbolGlyphs = new Map(
    entries(
      symbolIconBlock?.[1] ?? "",
      /^\s*(\w+):\s*\{[^}]*?className:\s*GLYPHS\.(\w+)/gm,
    ),
  );

  const exportedConstants = new Map(
    entries(
      standaloneGlyph,
      /export const (\w+): Glyph = GLYPHS\.(\w+);/g,
    ),
  );
  expect(exportedConstants.size).toBeGreaterThan(0);
  symbolGlyphs.set("energy", exportedConstants.get("ENERGY_ICON_CLASS"));
  symbolGlyphs.set("spark", exportedConstants.get("SPARK_INLINE_ICON_CLASS"));
  symbolGlyphs.set("bolt", exportedConstants.get("BOLT_ICON_CLASS"));
  return symbolGlyphs;
}

function canonicalSubstitutions() {
  const glyphs = glyphBoxicons();
  const symbolGlyphs = rulesSymbolGlyphs();
  const { symbols, activated } = symbolCharacters();
  const substitutions = new Map();

  for (const [character, symbol] of symbols) {
    if (symbol === "trigger") continue;
    const glyphKey = symbolGlyphs.get(symbol);
    expect(glyphKey, `renderer glyph for ${symbol}`).toBeDefined();
    const boxicon = glyphs.get(glyphKey);
    expect(boxicon, `Boxicon for GLYPHS.${glyphKey}`).toBeDefined();
    substitutions.set(character, boxicon);
  }

  const boltGlyph = symbolGlyphs.get("bolt");
  const boltBoxicon = glyphs.get(boltGlyph);
  expect(boltBoxicon).toBeDefined();
  substitutions.set(activated, boltBoxicon);
  return substitutions;
}

describe("Iosevka RON substitutions", () => {
  it("match every Unicode-to-Boxicon substitution in the rules renderer", () => {
    expect([...pythonSubstitutions()].sort()).toEqual(
      [...canonicalSubstitutions()].sort(),
    );
  });
});
