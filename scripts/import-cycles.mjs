// Fails when an import cycle can read a binding before it is initialized.
//
// A production bundle hoists every module into shared chunks and evaluates
// them in one dependency order. Inside an import cycle, whichever module is
// entered first runs after the others it imports, so the rest of the cycle
// evaluates before it. A module-level read of a cycle partner's binding can
// therefore throw "Cannot access X before initialization" at page load. The
// dev server evaluates modules one at a time in a friendlier order and hides
// the fault, so this check guards the bundle statically.
//
// A cycle whose modules reference each other only inside function bodies is
// late-bound: every binding exists by the time any function runs. The check
// allows such cycles and fails on every evaluation-time read inside one,
// whichever module the bundle happens to enter first:
//
// - The import graph has an edge for each static value import, side-effect
//   import and re-export. Type-only imports (`import type`, `export type`, or
//   a clause whose every specifier is `type`) are erased at compile time, and
//   a dynamic `import()` loads lazily, so neither is an edge.
// - A module reads an imported binding during evaluation when the reference
//   sits outside every function body; inside the argument list of a call
//   (a callback may run at once) or an immediately invoked function; in a
//   static class member, `extends` clause or decorator; or in the body of a
//   local declaration that an evaluation-time reference names.
// - A namespace import (`import * as ns`) used other than as `ns.member`
//   makes the bundler build the namespace object while its module evaluates,
//   which reads every binding the module re-exports.
// - Reading a binding through a module that re-exports reads the re-exported
//   modules too.
//
// The check fails on each evaluation-time read of a module in the reader's
// own strongly connected component.
//
// Usage: node scripts/import-cycles.mjs [root-dir ...]  (default: src)
// Exits 1 on any evaluation-time read inside a cycle and 0 otherwise.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];

/**
 * What one module imports and reads while it evaluates. Targets are resolved
 * module paths.
 *
 * @typedef {{
 *   valueTargets: string[],
 *   reexportTargets: string[],
 *   eagerReads: Map<string, Set<string>>,
 *   materializedNamespaces: Set<string>,
 * }} ModuleFacts
 *
 * One evaluation-time read inside a cycle: `reader` reads `names` from
 * `target` while it evaluates, and `cycle` leads from `target` back to
 * `reader`.
 *
 * @typedef {{
 *   reader: string,
 *   target: string,
 *   names: string[],
 *   cycle: string[],
 * }} CycleHazard
 */

/** @param {string} path */
function isSourceFile(path) {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)) &&
    !path.endsWith(".d.ts");
}

/** @param {ts.NamedImportBindings | ts.NamedExportBindings | undefined} named */
function everySpecifierIsType(named) {
  if (named === undefined) return false;
  if (ts.isNamedImports(named) || ts.isNamedExports(named)) {
    return named.elements.length > 0 &&
      named.elements.every((element) => element.isTypeOnly);
  }
  return false;
}

/** @param {ts.Node} node */
function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node);
}

/**
 * Whether a function expression runs while the expression around it
 * evaluates: invoked in place, or handed to a call that may invoke it.
 *
 * @param {ts.Node} node
 */
function mayRunImmediately(node) {
  let child = node;
  let parent = node.parent;
  while (ts.isParenthesizedExpression(parent)) {
    child = parent;
    parent = parent.parent;
  }
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    return parent.expression === child ||
      (parent.arguments?.some((argument) => argument === child) ?? false);
  }
  return ts.isTaggedTemplateExpression(parent);
}

/** @param {ts.Node} node */
function isStatic(node) {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
    ) ?? false);
}

/**
 * Whether `node` names a binding it reads, rather than declaring a name, a
 * property, or a label.
 *
 * @param {ts.Identifier} node
 */
function isReference(node) {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) return parent.name === node;
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node;
  if (ts.isQualifiedName(parent)) return false;
  if (
    (ts.isBindingElement(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent)) &&
    parent.propertyName === node
  ) {
    return false;
  }
  if (
    ts.isLabeledStatement(parent) ||
    ts.isBreakStatement(parent) ||
    ts.isContinueStatement(parent)
  ) {
    return false;
  }
  if (
    "name" in parent &&
    parent.name === node &&
    (ts.isDeclarationStatement(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isClassElement(parent) ||
      ts.isTypeElement(parent) ||
      ts.isEnumMember(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassExpression(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportClause(parent) ||
      ts.isJsxAttribute(parent))
  ) {
    return false;
  }
  return true;
}

/** @param {ts.BindingName} name @returns {string[]} */
function boundNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundNames(element.name)
  );
}

/**
 * The imports, re-exports and evaluation-time reads of one module.
 * `resolveTarget` maps a specifier to a module path, or null for a package
 * or non-module import.
 *
 * @param {string} fileName
 * @param {string} source
 * @param {(specifier: string) => string | null} resolveTarget
 * @returns {ModuleFacts}
 */
export function analyzeModule(fileName, source, resolveTarget) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** @type {Set<string>} */
  const valueTargets = new Set();
  /** @type {Set<string>} */
  const reexportTargets = new Set();
  /** @type {Set<string>} */
  const materializedNamespaces = new Set();
  /** Local name → the module and binding it imports. */
  /** @type {Map<string, { target: string, imported: string, namespace: boolean }>} */
  const bindings = new Map();
  /** Local top-level name → its declaration. */
  /** @type {Map<string, ts.Node>} */
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const clause = statement.importClause;
      if (
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined && everySpecifierIsType(clause.namedBindings)))
      ) {
        continue;
      }
      const target = resolveTarget(statement.moduleSpecifier.text);
      if (target === null) continue;
      valueTargets.add(target);
      if (clause?.name !== undefined) {
        bindings.set(clause.name.text, { target, imported: "default", namespace: false });
      }
      const named = clause?.namedBindings;
      if (named !== undefined && ts.isNamespaceImport(named)) {
        bindings.set(named.name.text, { target, imported: "*", namespace: true });
      } else if (named !== undefined) {
        for (const element of named.elements) {
          if (element.isTypeOnly) continue;
          bindings.set(element.name.text, {
            target,
            imported: (element.propertyName ?? element.name).text,
            namespace: false,
          });
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (statement.isTypeOnly || everySpecifierIsType(statement.exportClause)) {
        continue;
      }
      const target = resolveTarget(statement.moduleSpecifier.text);
      if (target === null) continue;
      valueTargets.add(target);
      reexportTargets.add(target);
      if (statement.exportClause !== undefined && ts.isNamespaceExport(statement.exportClause)) {
        materializedNamespaces.add(target);
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name !== undefined) declarations.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of boundNames(declaration.name)) {
          declarations.set(name, declaration);
        }
      }
    }
  }

  /** References found while walking, as [name, evaluation-time]. */
  /** @type {Array<[string, boolean]>} */
  let found = [];

  /**
   * @param {ts.Node} node
   * @param {boolean} eager
   */
  const visit = (node, eager) => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node))
    ) {
      return;
    }
    if (ts.isHeritageClause(node)) {
      if (node.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(node.parent)) {
        for (const type of node.types) visit(type.expression, eager);
      }
      return;
    }
    if (ts.isIdentifier(node)) {
      if (isReference(node)) {
        const binding = bindings.get(node.text);
        if (
          binding?.namespace === true &&
          !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)
        ) {
          materializedNamespaces.add(binding.target);
        }
        found.push([node.text, eager]);
      }
      return;
    }
    if (ts.isClassElement(node) && !isFunctionLike(node)) {
      // Field initializers run per instance unless static; static blocks and
      // computed names run with the class.
      if (node.name !== undefined && ts.isComputedPropertyName(node.name)) {
        visit(node.name, eager);
      }
      const runsWithClass = ts.isClassStaticBlockDeclaration(node) || isStatic(node);
      ts.forEachChild(node, (child) => {
        if (child !== node.name) visit(child, eager && runsWithClass);
      });
      return;
    }
    if (isFunctionLike(node)) {
      const runs = eager && !ts.isFunctionDeclaration(node) && mayRunImmediately(node);
      ts.forEachChild(node, (child) => visit(child, runs));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, eager));
  };

  /** Every reference inside each top-level declaration, at any depth. */
  /** @type {Map<string, string[]>} */
  const declarationReferences = new Map();
  for (const [name, declaration] of declarations) {
    found = [];
    ts.forEachChild(declaration, (child) => visit(child, false));
    declarationReferences.set(name, found.map(([reference]) => reference));
  }

  found = [];
  for (const statement of sourceFile.statements) visit(statement, true);
  /** @type {string[]} */
  const pending = found.filter(([, eager]) => eager).map(([name]) => name);
  /** @type {Set<string>} */
  const eagerNames = new Set();
  while (pending.length > 0) {
    const name = /** @type {string} */ (pending.pop());
    if (eagerNames.has(name)) continue;
    eagerNames.add(name);
    pending.push(...(declarationReferences.get(name) ?? []));
  }

  /** @type {Map<string, Set<string>>} */
  const eagerReads = new Map();
  for (const name of eagerNames) {
    const binding = bindings.get(name);
    if (binding === undefined) continue;
    const names = eagerReads.get(binding.target) ?? new Set();
    names.add(binding.imported);
    eagerReads.set(binding.target, names);
  }
  return {
    valueTargets: [...valueTargets].sort(),
    reexportTargets: [...reexportTargets].sort(),
    eagerReads,
    materializedNamespaces,
  };
}

/**
 * The module file a relative `specifier` in `importer` names, or null for a
 * package or non-module import.
 *
 * @param {string} importer
 * @param {string} specifier
 * @param {(path: string) => boolean} isFile
 * @returns {string | null}
 */
export function resolveSpecifier(importer, specifier, isFile) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const target = resolve(dirname(importer), specifier);
  const candidates = [
    target,
    ...SOURCE_EXTENSIONS.map((extension) => `${target}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(target, `index${extension}`)),
  ];
  if (/\.[cm]?jsx?$/.test(target)) {
    const stem = target.replace(/\.[cm]?jsx?$/, "");
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  }
  return candidates.find(
    (candidate) => isSourceFile(candidate) && isFile(candidate),
  ) ?? null;
}

/**
 * The strongly connected components of `graph` with more than one module or
 * a self-import.
 *
 * @param {Map<string, string[]>} graph
 * @returns {string[][]}
 */
export function stronglyConnectedComponents(graph) {
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {Map<string, number>} */
  const lowLink = new Map();
  /** @type {Set<string>} */
  const onStack = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @type {string[][]} */
  const components = [];
  let nextIndex = 0;

  /** @param {string} node */
  const enter = (node) => {
    index.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
  };

  for (const root of [...graph.keys()].sort()) {
    if (index.has(root)) continue;
    // Iterative Tarjan: each frame is a module and its next edge position.
    /** @type {Array<{ node: string, edge: number }>} */
    const frames = [{ node: root, edge: 0 }];
    enter(root);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const edges = graph.get(frame.node) ?? [];
      if (frame.edge < edges.length) {
        const next = edges[frame.edge];
        frame.edge += 1;
        if (!index.has(next)) {
          enter(next);
          frames.push({ node: next, edge: 0 });
        } else if (onStack.has(next)) {
          lowLink.set(
            frame.node,
            Math.min(lowLink.get(frame.node) ?? 0, index.get(next) ?? 0),
          );
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent !== undefined) {
        lowLink.set(
          parent.node,
          Math.min(lowLink.get(parent.node) ?? 0, lowLink.get(frame.node) ?? 0),
        );
      }
      if (lowLink.get(frame.node) !== index.get(frame.node)) continue;
      /** @type {string[]} */
      const component = [];
      for (;;) {
        const member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
        if (member === frame.node) break;
      }
      const selfImport = edges.includes(frame.node);
      if (component.length > 1 || selfImport) components.push(component.sort());
    }
  }
  return components.sort((left, right) => left[0].localeCompare(right[0]));
}

/**
 * The shortest import path from `from` to `to` within `members`.
 *
 * @param {Map<string, string[]>} graph
 * @param {Set<string>} members
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
function shortestPath(graph, members, from, to) {
  /** @type {Map<string, string>} */
  const previous = new Map();
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    if (node === to) break;
    for (const next of graph.get(node) ?? []) {
      if (!members.has(next) || next === from || previous.has(next)) continue;
      previous.set(next, node);
      queue.push(next);
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const step = previous.get(path[0]);
    if (step === undefined) return [from, to];
    path.unshift(step);
  }
  return path;
}

/**
 * The cycles of `modules` and each evaluation-time read inside one.
 *
 * @param {Map<string, ModuleFacts>} modules
 * @returns {{ cycles: string[][], hazards: CycleHazard[] }}
 */
export function findCycleHazards(modules) {
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  for (const [path, facts] of modules) graph.set(path, facts.valueTargets);
  const cycles = stronglyConnectedComponents(graph);
  /** @type {Map<string, Set<string>>} */
  const componentOf = new Map();
  for (const component of cycles) {
    const members = new Set(component);
    for (const member of component) componentOf.set(member, members);
  }

  /**
   * `target` and every module whose bindings it re-exports, transitively.
   *
   * @param {string} target
   */
  const reexportClosure = (target) => {
    const closure = new Set([target]);
    const pending = [target];
    while (pending.length > 0) {
      const next = /** @type {string} */ (pending.pop());
      for (const source of modules.get(next)?.reexportTargets ?? []) {
        if (!closure.has(source)) {
          closure.add(source);
          pending.push(source);
        }
      }
    }
    return closure;
  };

  /** Reader → target → names read while the reader evaluates. */
  /** @type {Map<string, Map<string, Set<string>>>} */
  const reads = new Map();
  /**
   * @param {string} reader
   * @param {string} target
   * @param {Iterable<string>} names
   */
  const addReads = (reader, target, names) => {
    for (const source of reexportClosure(target)) {
      if (source === reader) continue;
      /** @type {Map<string, Set<string>>} */
      const byTarget = reads.get(reader) ?? new Map();
      /** @type {Set<string>} */
      const set = byTarget.get(source) ?? new Set();
      for (const name of names) set.add(name);
      byTarget.set(source, set);
      reads.set(reader, byTarget);
    }
  };
  for (const [path, facts] of modules) {
    for (const [target, names] of facts.eagerReads) addReads(path, target, names);
    // The namespace object is built while its module evaluates.
    for (const target of facts.materializedNamespaces) {
      for (const source of modules.get(target)?.reexportTargets ?? []) {
        addReads(target, source, ["*"]);
      }
    }
  }

  /** @type {CycleHazard[]} */
  const hazards = [];
  for (const [reader, byTarget] of [...reads].sort(([a], [b]) => a.localeCompare(b))) {
    const members = componentOf.get(reader);
    if (members === undefined) continue;
    for (const [target, names] of [...byTarget].sort(([a], [b]) => a.localeCompare(b))) {
      if (!members.has(target)) continue;
      hazards.push({
        reader,
        target,
        names: [...names].sort(),
        cycle: shortestPath(graph, members, target, reader),
      });
    }
  }
  return { cycles, hazards };
}

/** @param {string} directory @returns {string[]} */
function listSourceFiles(directory) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(path));
    else if (entry.isFile() && isSourceFile(path)) files.push(path);
  }
  return files;
}

/** @param {string} path */
function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * The facts of every source module under `roots`.
 *
 * @param {string[]} roots
 * @returns {Map<string, ModuleFacts>}
 */
export function analyzeModules(roots) {
  /** @type {Map<string, ModuleFacts>} */
  const modules = new Map();
  for (const file of roots.flatMap(listSourceFiles).sort()) {
    modules.set(
      file,
      analyzeModule(
        file,
        readFileSync(file, "utf8"),
        (specifier) => resolveSpecifier(file, specifier, isFile),
      ),
    );
  }
  return modules;
}

/** @param {string} path */
function display(path) {
  return relative(ROOT, path).split(sep).join("/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const roots = process.argv.length > 2
    ? process.argv.slice(2).map((root) => resolve(root))
    : [join(ROOT, "src")];
  const modules = analyzeModules(roots);
  const { cycles, hazards } = findCycleHazards(modules);
  const summary = `${modules.size} modules, ${cycles.length} late-bound ` +
    `import cycle(s)`;
  if (hazards.length === 0) {
    console.log(`[import-cycles] ${summary}, no evaluation-time reads inside a cycle`);
  } else {
    console.error(
      `[import-cycles] ${summary}; ${hazards.length} module(s) read a cycle ` +
      `partner while they evaluate, which a production bundle can run ` +
      `before that partner initializes. Move the read into a function, make ` +
      `the import type-only, or break the cycle:`,
    );
    for (const hazard of hazards) {
      console.error(
        `  ${display(hazard.reader)} reads ${hazard.names.join(", ")} from ` +
        `${display(hazard.target)}, which imports it back:\n    ` +
        hazard.cycle.map(display).join("\n    -> "),
      );
    }
    process.exitCode = 1;
  }
}
