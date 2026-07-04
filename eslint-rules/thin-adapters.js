import path from "node:path";

/**
 * Keeps Tango screen adapters (`src/screens/tango_adapters/*Adapter.tsx`) wiring-only.
 *
 * A migrated screen splits three ways: the pure Tango screen
 * (`src/tango/screens/`) renders a view-model; the pure view-model builder
 * (`src/screens/tango_adapters/*-view-model.ts`) maps domain data into the screen's
 * view types; and the adapter acquires live state, mints any per-mount
 * randomness, wires callbacks to mutations, and renders the screen. The
 * adapter is the one layer that is hard to unit test (hooks, refs, mount
 * lifecycle), so the convention is that NO testable logic lives there — the
 * moment an adapter grows a helper worth testing, that helper belongs in the
 * view-model module instead. This rule makes that convention structural:
 *
 *   1. IMPORTS. Relative imports are fail-closed against {@link ALLOWED_IMPORT_PREFIXES}:
 *      the wiring inputs (state, data, types, runtime, logging), the sibling
 *      view-model module, and — within `src/tango/` — only `src/tango/screens/`.
 *      An adapter mounts a screen; it never composes Tango components or
 *      primitives itself (composition is the screen's job; the builder module
 *      owns any component *types* the view-model references), and it never
 *      wraps the screen in legacy UI from `src/components/` or `src/screens/`.
 *   2. SHAPE. The only things allowed at module top level are imports, the
 *      single exported `*Adapter` function component, primitive-literal
 *      `const`s, and local (non-exported) type declarations. Helper functions,
 *      mapping tables, and any other exported binding (including exported
 *      types — view types belong to the screen, builder types to the builder)
 *      are errors pointing at the view-model module.
 *   3. RENDERING. An adapter renders the screen component (or null while
 *      state is unavailable) — never intrinsic elements. A `<div>` in an
 *      adapter is layout or chrome, and both belong in the Tango screen.
 *
 * SCOPE. Fires only on `src/screens/tango_adapters/` files whose basename ends in
 * `Adapter.tsx`. Everything else (the registry, view-model modules, tests,
 * legacy screens) is a no-op.
 */

/**
 * The only places an adapter's relative imports may resolve to: the wiring
 * inputs, its own layer (the sibling view-model module), and the Tango screen
 * it mounts. Fail-closed — anything else (legacy UI in `src/components/` or
 * `src/screens/`, Tango components/primitives, feature modules) is an error.
 */
const ALLOWED_IMPORT_PREFIXES = [
  "src/state/",
  "src/data/",
  "src/types/",
  "src/runtime/",
  "src/logging",
  "src/screens/tango_adapters/",
  "src/tango/screens/",
];

/** Convert an OS path to a repo-relative POSIX path against ESLint's cwd. */
export function toRepoRelativePosix(absolutePath, cwd) {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** True when this rule governs the given repo-relative POSIX path. */
export function isAdapterFile(fileRelative) {
  return (
    fileRelative.startsWith("src/screens/tango_adapters/") &&
    /Adapter\.tsx$/.test(fileRelative)
  );
}

/**
 * True for initializers with no logic in them: string/number/boolean/null
 * literals, expression-free template literals, and negated number literals.
 */
export function isPrimitiveLiteral(node) {
  if (node === null || node === undefined) {
    return false;
  }
  if (node.type === "Literal") {
    return !(node.value instanceof RegExp);
  }
  if (node.type === "TemplateLiteral") {
    return node.expressions.length === 0;
  }
  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return true;
  }
  return false;
}

/** Local (non-exported) type-only declarations carry no logic; allow them. */
function isTypeDeclaration(node) {
  return (
    node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSInterfaceDeclaration"
  );
}

/**
 * If this export statement is the adapter component (an exported function
 * declaration or function-valued const whose name ends in `Adapter`), return
 * its name; otherwise null.
 */
function exportedAdapterComponentName(node) {
  const declaration = node.declaration;
  if (declaration === null || declaration === undefined) {
    return null;
  }
  if (
    declaration.type === "FunctionDeclaration" &&
    declaration.id !== null &&
    /Adapter$/.test(declaration.id.name)
  ) {
    return declaration.id.name;
  }
  if (
    declaration.type === "VariableDeclaration" &&
    declaration.declarations.length === 1
  ) {
    const declarator = declaration.declarations[0];
    if (
      declarator.id.type === "Identifier" &&
      /Adapter$/.test(declarator.id.name) &&
      declarator.init !== null &&
      (declarator.init.type === "ArrowFunctionExpression" ||
        declarator.init.type === "FunctionExpression")
    ) {
      return declarator.id.name;
    }
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep Tango screen adapters wiring-only: one exported *Adapter component, no helper logic (it belongs in the *-view-model module), and Tango imports limited to src/tango/screens/.",
    },
    schema: [],
    messages: {
      tangoImport:
        "An adapter may import from src/tango/ only under src/tango/screens/ ('{{source}}' resolves to '{{resolved}}'). Adapters mount a screen; composing Tango components is the screen's job, and view-model modules own any component types the view-model references.",
      moduleLogic:
        "Adapters are wiring only — no module-level logic. Move helper functions, mapping tables, and computed constants into the screen's *-view-model module, where they are pure and unit-testable.",
      extraExport:
        "Adapters export exactly one thing: the *Adapter component. Move shared functions and constants to the screen's *-view-model module, and exported types to the Tango screen (view types) or the view-model module (builder types).",
      defaultExport:
        "Adapters use a single named export (the *Adapter component) so the registry imports them by name; no default export.",
      missingComponent:
        "An *Adapter.tsx file must export exactly one function component whose name ends in 'Adapter'.",
      disallowedImport:
        "Adapters import only their wiring inputs (src/state, src/data, src/types, src/runtime, src/logging), the sibling view-model module, and the Tango screen they mount ('{{source}}' resolves to '{{resolved}}'). Legacy UI and feature modules stay out — an adapter wires, it doesn't compose.",
      intrinsicElement:
        "Adapters render exactly the Tango screen component (or null while state is unavailable); a `<{{tag}}>` here is layout or chrome, and both belong in the Tango screen (src/tango/screens/).",
    },
  },

  create(context) {
    const rawFilename =
      typeof context.filename === "string"
        ? context.filename
        : context.getFilename();
    const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
    const fileRelative = toRepoRelativePosix(rawFilename, cwd);

    if (!isAdapterFile(fileRelative)) {
      return {};
    }

    const fileDir = path.posix.dirname(fileRelative);
    let adapterComponentCount = 0;

    function checkImportSource(node) {
      if (node === null || node === undefined || typeof node.value !== "string") {
        return;
      }
      const source = node.value;
      // Bare modules (react, node_modules packages) are always allowed.
      if (!source.startsWith(".")) {
        return;
      }
      const resolved = path.posix.normalize(path.posix.join(fileDir, source));
      const allowed = ALLOWED_IMPORT_PREFIXES.some((prefix) =>
        resolved.startsWith(prefix),
      );
      if (!allowed) {
        context.report({
          node,
          messageId: resolved.startsWith("src/tango/")
            ? "tangoImport"
            : "disallowedImport",
          data: { source, resolved },
        });
      }
    }

    function checkTopLevelStatement(node) {
      switch (node.type) {
        case "ImportDeclaration":
          checkImportSource(node.source);
          return;
        case "ExportNamedDeclaration": {
          const componentName = exportedAdapterComponentName(node);
          if (componentName !== null) {
            adapterComponentCount += 1;
            return;
          }
          context.report({ node, messageId: "extraExport" });
          return;
        }
        case "ExportDefaultDeclaration":
          context.report({ node, messageId: "defaultExport" });
          return;
        case "ExportAllDeclaration":
          context.report({ node, messageId: "extraExport" });
          return;
        case "VariableDeclaration": {
          const allLiteral = node.declarations.every((declarator) =>
            isPrimitiveLiteral(declarator.init),
          );
          if (!allLiteral) {
            context.report({ node, messageId: "moduleLogic" });
          }
          return;
        }
        default:
          if (isTypeDeclaration(node)) {
            return;
          }
          context.report({ node, messageId: "moduleLogic" });
      }
    }

    return {
      Program(node) {
        for (const statement of node.body) {
          checkTopLevelStatement(statement);
        }
        if (adapterComponentCount !== 1) {
          context.report({ node, messageId: "missingComponent" });
        }
      },
      // Dynamic imports can appear anywhere in the file, not just at top level.
      ImportExpression(node) {
        checkImportSource(node.source);
      },
      JSXOpeningElement(node) {
        const name = node.name;
        if (name?.type === "JSXIdentifier" && /^[a-z]/.test(name.name)) {
          context.report({
            node: name,
            messageId: "intrinsicElement",
            data: { tag: name.name },
          });
        }
      },
    };
  },
};

export default rule;
