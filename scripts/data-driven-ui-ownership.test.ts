// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import inventory from "./data-driven-ui-ownership.json";
import { BUILT_IN_BATTLE_PROMPT_KINDS } from "../src/data/dreamwell-prompts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = resolve(ROOT, "src");

type FamilyName = keyof typeof inventory.families;

function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

function collectFiles(root: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path, pattern));
    else if (entry.isFile() && pattern.test(entry.name)) files.push(path);
  }
  return files;
}

function productionTypeScriptFiles(): string[] {
  return collectFiles(SRC_ROOT, /\.(ts|tsx)$/)
    .filter((path) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(path))
    .filter((path) => !path.includes("/src/cumulus/docs/"))
    .filter((path) => !path.includes("/src/debug/"))
    .filter((path) => !path.includes("/src/testing/"))
    .filter((path) => !path.includes("/src/__test-helpers__/"))
    .filter((path) => !path.endsWith("/src/data/localization-messages.ts"));
}

function identityValues(
  node: ts.Node,
  identities: ReadonlySet<string>,
): Set<string> {
  const found = new Set<string>();
  function visit(current: ts.Node): void {
    if (
      (ts.isStringLiteral(current) ||
        ts.isNoSubstitutionTemplateLiteral(current)) &&
      identities.has(current.text)
    ) {
      found.add(current.text);
    } else if (
      (ts.isPropertyAssignment(current) || ts.isMethodDeclaration(current)) &&
      ts.isIdentifier(current.name) &&
      identities.has(current.name.text)
    ) {
      found.add(current.name.text);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

export function identityTablesInSource(
  sourceText: string,
  fileName: string,
): string[] {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const tables: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.initializer === undefined
      )
        continue;
      for (const [family, definition] of Object.entries(inventory.families)) {
        const matches = identityValues(
          declaration.initializer,
          new Set(definition.identities),
        );
        if (matches.size >= 2)
          tables.push(`${fileName}#${declaration.name.text}#${family}`);
      }
    }
  }
  return tables.sort();
}

function productionIdentityTables(): string[] {
  return productionTypeScriptFiles()
    .flatMap((path) =>
      identityTablesInSource(readFileSync(path, "utf8"), repoPath(path)),
    )
    .sort();
}

describe("data-driven UI ownership", () => {
  it("detects an unlisted identity-keyed authored table", () => {
    expect(
      identityTablesInSource(
        'const labels = { Empowered: "first", Amplified: "second" };',
        "src/example.ts",
      ),
    ).toEqual(["src/example.ts#labels#transfiguration"]);
  });

  it("keeps every current source field, consumer, persisted shape, and logging site executable", () => {
    for (const definition of Object.values(inventory.families)) {
      expect(definition.targetOwner).toMatch(/^data\/[a-z_]+\.ron$/);
      for (const source of definition.currentSources) {
        const text = readFileSync(resolve(ROOT, source.path), "utf8");
        for (const field of source.fields)
          expect(text, `${source.path} must contain ${field}`).toContain(field);
      }
      for (const path of [
        ...definition.consumers,
        ...definition.persisted,
        ...definition.logging,
      ]) {
        expect(
          readFileSync(resolve(ROOT, path), "utf8"),
          `${path} must remain inventoried`,
        ).toBeTruthy();
      }
    }
  });

  it("allows only inventoried production identity tables", () => {
    expect(productionIdentityTables()).toEqual(
      inventory.typescriptTableAllowlist.map((entry) => entry.id).sort(),
    );
    for (const entry of inventory.typescriptTableAllowlist) {
      expect(entry.rationale.length).toBeGreaterThan(10);
      expect(entry.classification).toMatch(
        /^(?:closed-behavior-registry|closed-syntax|closed-identity|persisted-compatibility|unrelated-closed-renderer|unrelated-design-system)$/,
      );
    }
  });

  it("keeps the built-in battle prompt identity set closed and inventoried", () => {
    expect([...BUILT_IN_BATTLE_PROMPT_KINDS].sort()).toEqual(
      [...inventory.builtInBattlePromptRefs].sort(),
    );
  });
});
