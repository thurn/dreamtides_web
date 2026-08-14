import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = fileURLToPath(new URL("../", import.meta.url));

function listSourceTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceTsxFiles(path);
    }
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) {
      return [];
    }
    if (entry.name.endsWith(".test.tsx")) {
      return [];
    }
    return [path];
  });
}

function displayPathFor(path: string) {
  return `src/${relative(SRC_ROOT, path).split("\\").join("/")}`;
}

function getJsxTagName(
  node: ts.JsxOpeningLikeElement,
  sourceFile: ts.SourceFile,
) {
  return node.tagName.getText(sourceFile);
}

function containsRulesText(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (
    (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
    getJsxTagName(
      ts.isJsxElement(node) ? node.openingElement : node,
      sourceFile,
    ) === "RulesText"
  ) {
    return true;
  }

  return node
    .getChildren(sourceFile)
    .some((child) => containsRulesText(child, sourceFile));
}

function findParagraphWrappedRulesText(
  sourceFile: ts.SourceFile,
): Array<{ line: number; column: number }> {
  const matches: Array<{ line: number; column: number }> = [];

  function visit(node: ts.Node) {
    if (
      ts.isJsxElement(node) &&
      getJsxTagName(node.openingElement, sourceFile) === "p" &&
      containsRulesText(node, sourceFile)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.openingElement.getStart(sourceFile),
      );
      matches.push({
        line: position.line + 1,
        column: position.character + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

describe("RulesText nesting", () => {
  it("keeps block-rendered RulesText out of paragraph wrappers", () => {
    const offenders = listSourceTsxFiles(SRC_ROOT).flatMap((path) => {
      const displayPath = displayPathFor(path);
      const source = readFileSync(path, "utf8");
      const sourceFile = ts.createSourceFile(
        displayPath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      return findParagraphWrappedRulesText(sourceFile).map(
        ({ line, column }) => `${displayPath}:${line}:${column}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});
