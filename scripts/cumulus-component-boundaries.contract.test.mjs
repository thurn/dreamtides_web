// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENT_ROOT = resolve(ROOT, "src/cumulus/components");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))
      ? [path]
      : [];
  });
}

function importedSpecifiers(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  source.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
  });
  return imports;
}

function normalizedTarget(sourcePath, specifier) {
  if (specifier.startsWith(".")) {
    return relative(ROOT, resolve(dirname(sourcePath), specifier)).replaceAll("\\", "/");
  }
  return specifier.replace(/^@\//, "src/");
}

const FORBIDDEN = [
  /^src\/cumulus\/screens\//,
  /^src\/screens\//,
  /^src\/state\//,
  /^src\/coop\/(?:actions|hooks|providers|reducers?|state)(?:\/|\.|$)/,
  /^src\/(?:battle\/(?:engine|rules)|rules|reducers?|encounters?|exploration\/.*resolver)/,
];

describe("Cumulus component-tier import boundary", () => {
  it("keeps public components independent of screens and business engines", () => {
    const offenders = [];
    for (const path of sourceFiles(COMPONENT_ROOT)) {
      for (const specifier of importedSpecifiers(path)) {
        const target = normalizedTarget(path, specifier);
        if (FORBIDDEN.some((pattern) => pattern.test(target))) {
          offenders.push(`${relative(ROOT, path)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
