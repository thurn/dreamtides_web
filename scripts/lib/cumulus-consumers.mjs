// Consumer-count helper for the Cumulus component catalog.
//
// For every entry registered in src/cumulus/docs/registry.ts, this computes how
// many real code sites actually consume that component's SOURCE module — where
// "real" means a value (non-`import type`) import from a file under src/ that is
// NOT part of the doc site (src/cumulus/docs/) and NOT a test/spec. A component
// with zero such consumers is a "ghost": documented but unadopted (or dead).
//
// Two callers share this single source of truth so their adoption numbers can
// never disagree:
//   - scripts/cumulus-ghost-components.test.mjs, which fails the build when a NEW
//     ghost appears (one not on its reviewed BASELINE).
//   - the docs generator (a later task), which surfaces the count in the UI.
//
// Resolution model, per registry entry:
//   1. registry.ts imports each demo object by name from `./demos/<id>`; that
//      names the demo file.
//   2. The demo's object literal (`export const <name>: CumulusComponent = {…}`)
//      carries `id`/`title`/`docName`/`status` string props and a `Component`
//      identifier. The component's SOURCE module is whichever module the demo
//      imports `Component` from — or, when `Component` is a local wrapper
//      (e.g. HoverPopoverDemo), whichever module the `docName` identifier
//      (`HoverPopover`) is imported from. If neither resolves, we throw: the
//      registry is malformed and the count would be a silent lie.
//   3. Every TS/TSX file under src/ (excluding the doc site and tests) is
//      scanned for a value import whose specifier resolves to that source file.
//      A type-only import (`import type { TideSpec } from ".../tide-spec"`, or an
//      import declaration whose every named binding is an inline `type`) is not
//      a consumer.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_ROOT = resolve(ROOT, "src");
const REGISTRY_PATH = resolve(ROOT, "src/cumulus/docs/registry.ts");
const DOCS_PREFIX = "src/cumulus/docs/";

/** Parse a TS/TSX file into an AST source file with parent pointers. */
function parseSource(fullPath, sourceText) {
  return ts.createSourceFile(
    fullPath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fullPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Resolve a relative import `specifier` (as written in `fromFile`) to the
 * absolute path of the source file it names, trying the TS/TSX extension and
 * index-file conventions. Returns null for bare (non-relative) specifiers and
 * for anything that resolves to no real file.
 */
function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (
      candidate === base &&
      (!existsSync(candidate) || statSync(candidate).isDirectory())
    ) {
      continue;
    }
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Whether an import declaration is type-only — either a declaration-level
 * `import type {…}`, or an `import {…}` whose every named binding is an inline
 * `type` specifier (and which has no default/namespace binding). Such a
 * declaration imports no runtime value and is not a consumer.
 */
function isTypeOnlyImport(node) {
  const clause = node.importClause;
  if (!clause) return false; // side-effect import: `import "…"`
  if (clause.isTypeOnly) return true;
  const { name, namedBindings } = clause;
  if (name) return false; // default value binding
  if (!namedBindings) return false;
  if (ts.isNamespaceImport(namedBindings)) return false; // `import * as x`
  // Named import: type-only iff every element is an inline `type` specifier.
  return namedBindings.elements.every((el) => el.isTypeOnly);
}

/**
 * Build a map of imported binding name → module specifier for `source`.
 * Covers default, namespace, and named imports (including inline `type`
 * specifiers, so a `docName`/`Component` imported as a type still resolves).
 */
function buildImportMap(source) {
  const map = new Map();
  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const specifier = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) map.set(clause.name.text, specifier);
    const bindings = clause.namedBindings;
    if (bindings) {
      if (ts.isNamespaceImport(bindings)) {
        map.set(bindings.name.text, specifier);
      } else {
        for (const el of bindings.elements) {
          map.set(el.name.text, specifier);
        }
      }
    }
  }
  return map;
}

/** The identifier names in a `[a, b, c]` array-literal initializer. */
function arrayIdentifierNames(arrayLiteral) {
  const names = [];
  for (const el of arrayLiteral.elements) {
    if (ts.isIdentifier(el)) names.push(el.text);
  }
  return names;
}

/** Find `export const <name>: T = […/{…}]` and return its initializer. */
function findExportedInitializer(source, name) {
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === name &&
        decl.initializer
      ) {
        return decl.initializer;
      }
    }
  }
  return null;
}

/** Read a string-literal property `key` from an object literal, or undefined. */
function readStringProp(objectLiteral, key) {
  for (const prop of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === key &&
      (ts.isStringLiteral(prop.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(prop.initializer))
    ) {
      return prop.initializer.text;
    }
  }
  return undefined;
}

/** Read the identifier name assigned to property `key`, or undefined. */
function readIdentifierProp(objectLiteral, key) {
  for (const prop of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === key &&
      ts.isIdentifier(prop.initializer)
    ) {
      return prop.initializer.text;
    }
  }
  return undefined;
}

/** Recursively collect every .ts/.tsx file under `dir`. */
function collectTsFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Whether `fullPath` may count as a consumer: a TS/TSX file under src/ that is
 * not part of the doc site and not a test/spec.
 */
function isConsumerCandidate(fullPath) {
  const base = fullPath.slice(fullPath.lastIndexOf(sep) + 1);
  if (/\.(test|spec)\./.test(base)) return false;
  const relPath = relative(ROOT, fullPath).split(sep).join("/");
  if (relPath.startsWith(DOCS_PREFIX)) return false;
  return true;
}

/**
 * The set of source module files (absolute paths) that each candidate consumer
 * file imports by VALUE. Built once and reused across all registry entries so
 * the whole src/ tree is parsed a single time.
 */
function buildValueImportIndex() {
  // moduleFile -> Set(consumerFile)
  const index = new Map();
  for (const fullPath of collectTsFiles(SRC_ROOT)) {
    if (!isConsumerCandidate(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    const source = parseSource(fullPath, text);
    for (const stmt of source.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      if (isTypeOnlyImport(stmt)) continue;
      const resolved = resolveModule(fullPath, stmt.moduleSpecifier.text);
      if (!resolved) continue;
      let consumers = index.get(resolved);
      if (!consumers) {
        consumers = new Set();
        index.set(resolved, consumers);
      }
      consumers.add(fullPath);
    }
  }
  return index;
}

/**
 * Compute, per registered component (in registry order), the number of real
 * (value, non-doc, non-test) consumers of its source module.
 *
 * @returns {{ id: import("../../src/cumulus/docs/registry").CumulusComponentId, title: string, docName: string, status: string | undefined, module: string, count: number }[]}
 */
export function computeConsumerCounts() {
  const registryText = readFileSync(REGISTRY_PATH, "utf8");
  const registrySource = parseSource(REGISTRY_PATH, registryText);
  const registryImports = buildImportMap(registrySource);

  const arrayInit = findExportedInitializer(registrySource, "CUMULUS_COMPONENTS");
  if (!arrayInit || !ts.isArrayLiteralExpression(arrayInit)) {
    throw new Error(
      "cumulus-consumers: could not find the CUMULUS_COMPONENTS array literal in registry.ts",
    );
  }
  const demoNames = arrayIdentifierNames(arrayInit);

  const valueImportIndex = buildValueImportIndex();

  return demoNames.map((demoName) => {
    const demoSpecifier = registryImports.get(demoName);
    if (!demoSpecifier) {
      throw new Error(
        `cumulus-consumers: registry entry "${demoName}" has no matching import in registry.ts`,
      );
    }
    const demoFile = resolveModule(REGISTRY_PATH, demoSpecifier);
    if (!demoFile) {
      throw new Error(
        `cumulus-consumers: could not resolve demo module "${demoSpecifier}" (from ${demoName}) to a file`,
      );
    }

    const demoText = readFileSync(demoFile, "utf8");
    const demoSource = parseSource(demoFile, demoText);
    const demoImports = buildImportMap(demoSource);

    const objectLiteral = findExportedInitializer(demoSource, demoName);
    if (!objectLiteral || !ts.isObjectLiteralExpression(objectLiteral)) {
      throw new Error(
        `cumulus-consumers: demo "${demoName}" (${relative(ROOT, demoFile)}) does not export an object literal`,
      );
    }

    const id = readStringProp(objectLiteral, "id");
    const title = readStringProp(objectLiteral, "title");
    const docName = readStringProp(objectLiteral, "docName");
    const status = readStringProp(objectLiteral, "status");
    const componentName = readIdentifierProp(objectLiteral, "Component");

    if (!docName) {
      throw new Error(
        `cumulus-consumers: demo "${demoName}" (${relative(ROOT, demoFile)}) has no string docName`,
      );
    }

    // Resolve the SOURCE module: prefer the module `Component` is imported from;
    // when `Component` is a local wrapper (not imported), fall back to the
    // module `docName` is imported from.
    const sourceSpecifier =
      (componentName && demoImports.get(componentName)) ||
      demoImports.get(docName);
    if (!sourceSpecifier) {
      throw new Error(
        `cumulus-consumers: could not resolve the source module for "${demoName}" ` +
          `(Component="${componentName ?? "<none>"}", docName="${docName}") — ` +
          `neither is imported in ${relative(ROOT, demoFile)}`,
      );
    }
    const moduleFile = resolveModule(demoFile, sourceSpecifier);
    if (!moduleFile) {
      throw new Error(
        `cumulus-consumers: could not resolve source module "${sourceSpecifier}" ` +
          `(for ${demoName}) to a file`,
      );
    }

    const consumers = valueImportIndex.get(moduleFile);
    const count = consumers ? consumers.size : 0;
    const moduleRel = relative(ROOT, moduleFile).split(sep).join("/");

    return { id, title, docName, status, module: moduleRel, count };
  });
}
