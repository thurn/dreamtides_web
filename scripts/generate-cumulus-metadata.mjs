// Generates the docgen metadata that drives the /cumulus doc site.
//
//   node scripts/generate-cumulus-metadata.mjs   # writes
//       src/cumulus/metadata/cumulus-metadata.json  (also: npm run cumulus-metadata)
//
// This metadata is the single source that feeds BOTH the programmatic props
// tables and the auto-generated interactive controls on the Cumulus doc site.
// It is produced from the Cumulus component/primitive `.tsx` sources with
// react-docgen-typescript, then normalized into the flat `PropMeta` shape that
// downstream code consumes:
//
//   interface PropMeta {
//     name: string;
//     tsType: string;          // e.g. "boolean", "number", '"sm" | "md" | "lg"'
//     unionMembers: string[];  // ["sm","md","lg"] for string-literal unions; []
//     required: boolean;
//     defaultValue: string | null;
//     description: string;     // JSDoc text; "" if none
//     nested?: {               // present only when tsType names a project
//       name: string;          //   object type (an interface/model); the props
//       fields?: {             //   table expands one level to show its fields,
//         name: string;
//         tsType: string;
//         optional: boolean;
//         description: string;
//       }[];
//       variants?: {           //   or each object branch of a model union.
//         name: string;
//         fields: NestedField[];
//       }[];
//     };
//   }
//
// react-docgen-typescript represents a string-literal union in `prop.type.value`
// as an array of `{ value: '"sm"' }` entries; we strip the surrounding quotes to
// yield `unionMembers: ["sm","md","lg"]`. Non-union props get [].
//
// react-docgen-typescript reports a prop whose type is a named model object
// (e.g. `view: AtlasNodeView`) as the bare type name, with no window into the
// object's shape. To document these, a second TypeScript-compiler pass
// (`buildNestedResolver`) indexes every interface / object-type alias declared
// in the parsed sources and, for a prop whose tsType is a single such name (or a
// `Name[]` array of one), attaches that type's one-level field list as
// `PropMeta.nested`. Nesting stops after one level so the table stays readable;
// primitives, React types, functions, and node_modules types are never
// expanded.
//
// The pure `extractPropMeta(filePaths)` core is exported so the test can drive
// it directly against a fixture; `main()` globs the real Cumulus sources (skipping
// `__*__` fixtures) and writes disposable JSON before development, review, and
// production builds.

import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { withCustomConfig } from "react-docgen-typescript";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSCONFIG_PATH = resolve(ROOT, "tsconfig.json");
// Only these two directories hold real design-system components/primitives.
// The rest of src/cumulus (docs/ chrome like ComponentPage, ControlPanel,
// DemoStage, PropsTable; metadata/; assets/) is the doc-site harness itself,
// not something the doc site should document about itself.
const COMPONENT_ROOTS = [
  resolve(ROOT, "src/cumulus/components"),
  resolve(ROOT, "src/cumulus/primitives"),
];
const OUT_PATH = resolve(ROOT, "src/cumulus/metadata/cumulus-metadata.json");

// Options shared by every parse. `shouldExtractLiteralValuesFromEnum` makes
// string-literal unions arrive as enum values (needed for unionMembers). The
// propFilter drops any prop whose declaration lives in node_modules — without
// it, a component extending e.g. React.ButtonHTMLAttributes would pull in
// hundreds of inherited DOM props and flood every props table.
const PARSER_OPTIONS = {
  shouldExtractLiteralValuesFromEnum: true,
  shouldExtractValuesFromUnion: true,
  savePropValueAsString: true,
  propFilter: (prop) => {
    if (prop.parent && prop.parent.fileName.includes("node_modules")) {
      return false;
    }
    return true;
  },
};

/**
 * Strip a single layer of surrounding double quotes from a string-literal
 * union member as react-docgen-typescript reports it (e.g. `"sm"` -> `sm`).
 */
function unquote(value) {
  if (
    typeof value === "string" &&
    value.length >= 2 &&
    value.startsWith('"') &&
    value.endsWith('"')
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Normalize a react-docgen-typescript prop `type` into the flat unionMembers
 * array. Only string-literal unions (enum-style) produce members; anything else
 * yields []. Members that are not quoted string literals (e.g. numbers, other
 * types mixed into a union) are ignored so the select control only ever sees
 * real string options.
 */
function normalizeUnionMembers(type) {
  if (!type || !Array.isArray(type.value)) return [];
  const members = [];
  for (const entry of type.value) {
    if (!entry || typeof entry.value !== "string") continue;
    const raw = entry.value;
    // Keep only quoted string literals; drop bare identifiers/types.
    if (raw.startsWith('"') && raw.endsWith('"')) {
      members.push(unquote(raw));
    }
  }
  return members;
}

/**
 * Produce a human-readable TS type string for a prop.
 *
 * With `shouldExtractLiteralValuesFromEnum` on, react-docgen-typescript reports
 * `type.name` as the unhelpful `"enum"` for booleans, numeric props, unions,
 * ReactNode, etc — while `type.raw` carries the real source type (e.g.
 * `boolean`, `number`, `"sm" | "md" | "lg" | undefined`). We prefer `raw` and
 * strip the synthetic `undefined` member that optional props pick up, falling
 * back to `type.name` when no raw type is available (e.g. plain `string`).
 */
function normalizeTsType(type) {
  const raw = typeof type.raw === "string" ? type.raw : "";
  if (raw) {
    const parts = raw
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part !== "undefined");
    if (parts.length > 0) return parts.join(" | ");
  }
  return typeof type.name === "string" ? type.name : "";
}

// Type names that are primitives, React building blocks, or other leaves we
// never want to expand into a nested field list — even if a same-named
// declaration happened to exist in the parsed program.
const NON_MODEL_TYPE_NAMES = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "any",
  "unknown",
  "never",
  "void",
  "null",
  "undefined",
  "object",
  "Date",
  "ReactNode",
  "ReactElement",
  "ReactChild",
  "CSSProperties",
  "RefObject",
  "MutableRefObject",
  "HTMLElement",
  // Cumulus's strict value types (src/cumulus/primitives/*): each is a leaf value
  // whose NAME is the documentation, not a model to drill into. `Glyph` is a
  // branded string (expanding it lists every String method); `ArtRef` is a
  // discriminated union (expanding it shows only the shared discriminant); the
  // color/crop unions are string literals. Render the type name as-is.
  "Glyph",
  "ArtRef",
  "CumulusColor",
  "HexColor",
  "ColorRole",
  "Wash",
  "ImageCrop",
  "TitleBadge",
]);

/**
 * If a tsType string denotes a single named type we might expand into a nested
 * field list, return that bare name; otherwise null. Accepts a plain identifier
 * (`AtlasNodeView`) or an array of one (`QsbDreamsign[]`), and rejects unions,
 * generics with arguments, functions, and the primitive/React leaves above.
 */
function nestedTypeNameFor(tsType) {
  let name = typeof tsType === "string" ? tsType.trim() : "";
  if (name.endsWith("[]")) name = name.slice(0, -2).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  if (NON_MODEL_TYPE_NAMES.has(name)) return null;
  return name;
}

/**
 * Build a resolver that expands a project type name into its one-level field
 * list, using a fresh TypeScript program over the same sources react-docgen
 * parsed. Returns `resolveNested(typeName) -> field[] | null`. The program is
 * built once and closed over, so per-prop resolution is a cheap map lookup plus
 * a checker query.
 */
function buildNestedResolver(filePaths) {
  const configFile = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config ?? {},
    ts.sys,
    dirname(TSCONFIG_PATH),
  );
  const program = ts.createProgram(filePaths, {
    ...parsed.options,
    noEmit: true,
  });
  const checker = program.getTypeChecker();

  // Index interface / object-type-alias declarations by name across every
  // non-library source file in the program (createProgram pulls in imported
  // files, so a prop can reference a model declared in another module). First
  // declaration of a given name wins, for a stable, deterministic result.
  const declByName = new Map();
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (source.fileName.includes("node_modules")) continue;
    ts.forEachChild(source, (node) => {
      if (
        (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
        node.name &&
        !declByName.has(node.name.text)
      ) {
        declByName.set(node.name.text, node);
      }
    });
  }

  function fieldsForType(type, node) {
    const properties = checker.getPropertiesOfType(type);
    if (!properties || properties.length === 0) return [];
    const fields = [];
    for (const symbol of properties) {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const symbolType = checker.getTypeOfSymbolAtLocation(
        symbol,
        declaration ?? node,
      );
      const optional = Boolean(symbol.getFlags() & ts.SymbolFlags.Optional);
      const rendered = checker.typeToString(
        symbolType,
        node,
        ts.TypeFormatFlags.NoTruncation |
          ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
      );
      fields.push({
        name: symbol.getName(),
        tsType: stripUndefinedMember(rendered),
        optional,
        description: ts
          .displayPartsToString(symbol.getDocumentationComment(checker))
          .trim(),
      });
    }
    return fields;
  }

  function isPrimitiveBackedLeaf(type) {
    const primitiveFlags =
      ts.TypeFlags.StringLike |
      ts.TypeFlags.NumberLike |
      ts.TypeFlags.BooleanLike |
      ts.TypeFlags.BigIntLike |
      ts.TypeFlags.ESSymbolLike;
    if ((type.flags & primitiveFlags) !== 0) return true;
    return type.isIntersection() && type.types.some(isPrimitiveBackedLeaf);
  }

  function resolveNested(typeName) {
    const node = declByName.get(typeName);
    if (!node) return null;
    const type = checker.getTypeAtLocation(node);
    // Nominal scalar brands are intersections such as `string & Brand`. They
    // remain leaf values for component consumers; expanding them would expose
    // String.prototype and the private brand symbol as a bogus object model.
    if (isPrimitiveBackedLeaf(type)) return null;
    if (type.isUnion()) {
      const variants = type.types.map((variant) => {
        const name = checker.typeToString(
          variant,
          node,
          ts.TypeFormatFlags.NoTruncation |
            ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
        );
        const fields = fieldsForType(variant, node);
        return { name, fields };
      });
      // Named branches make a durable public model vocabulary. Anonymous
      // object/intersection branches can contain local paths and unwieldy
      // implementation shapes, so retain their concise shared-field view.
      if (
        variants.length > 0 &&
        variants.every(
          (variant) =>
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(variant.name) &&
            variant.fields.length > 0,
        )
      ) {
        return { variants };
      }
    }
    const fields = fieldsForType(type, node);
    return fields.length > 0 ? { fields } : null;
  }

  return resolveNested;
}

/** Drop a synthetic trailing `| undefined` that optional members pick up. */
function stripUndefinedMember(rendered) {
  const parts = rendered
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "undefined");
  return parts.length > 0 ? parts.join(" | ") : rendered;
}

/**
 * Normalize a single react-docgen-typescript PropItem into a PropMeta. When
 * `resolveNested` is supplied and the prop's type names a project model object,
 * the resolved one-level field list is attached as `nested`.
 */
function normalizeProp(prop, resolveNested) {
  const type = prop.type ?? {};
  const defaultValue =
    prop.defaultValue &&
    prop.defaultValue.value !== undefined &&
    prop.defaultValue.value !== null
      ? String(prop.defaultValue.value)
      : null;
  const tsType = normalizeTsType(type);
  const unionMembers = normalizeUnionMembers(type);
  const meta = {
    name: prop.name,
    tsType,
    unionMembers,
    required: Boolean(prop.required),
    defaultValue,
    description: typeof prop.description === "string" ? prop.description : "",
  };
  // A string-literal union is documented by its members, not by expansion.
  if (resolveNested && unionMembers.length === 0) {
    const typeName = nestedTypeNameFor(tsType);
    if (typeName) {
      const nested = resolveNested(typeName);
      if (nested) {
        meta.nested = { name: typeName, ...nested };
      }
    }
  }
  return meta;
}

/**
 * True for names that look like a component (PascalCase, e.g. `Pressable`,
 * `ComponentPage`) and false for anything else react-docgen-typescript may
 * emit from the same file: camelCase hooks/helpers (`usePress`) and
 * SCREAMING_CASE constants (`PRESS_SCALE`). A component file frequently
 * co-locates a hook or an exported constant with the component it backs
 * (see Pressable.tsx, which exports `PRESS_SCALE` and `usePress` alongside
 * `Pressable`); only the component itself belongs in the docgen metadata.
 *
 * Heuristic: the name must start with an uppercase letter AND contain at
 * least one lowercase letter (which rules out ALL-CAPS constants).
 *
 * Known limitation: a component named as a pure all-caps acronym (e.g. `FAQ`)
 * has no lowercase letter and would be dropped by this rule. Our components
 * are all normal PascalCase, so this is acceptable in practice.
 */
function isComponentName(name) {
  if (typeof name !== "string" || name.length === 0) return false;
  const firstChar = name[0];
  if (firstChar < "A" || firstChar > "Z") return false;
  return /[a-z]/.test(name);
}

/**
 * PURE core: run react-docgen-typescript over the given `.tsx` files and
 * normalize the result into `Record<displayName, PropMeta[]>`. Independent of
 * which real components exist, so the test can call it on a fixture directly.
 * Entries whose display name doesn't look like a component (see
 * `isComponentName`) are dropped — e.g. a co-located hook or constant.
 */
export function extractPropMeta(filePaths) {
  if (!filePaths || filePaths.length === 0) return {};
  const parser = withCustomConfig(TSCONFIG_PATH, PARSER_OPTIONS);
  const docs = parser.parse(filePaths);
  const resolveNested = buildNestedResolver(filePaths);
  const out = {};
  for (const doc of docs) {
    if (!isComponentName(doc.displayName)) continue;
    const props = Object.values(doc.props ?? {}).map((prop) =>
      normalizeProp(prop, resolveNested),
    );
    out[doc.displayName] = props;
  }
  return out;
}

/**
 * Recursively collect real Cumulus component/primitive `.tsx` sources, skipping
 * any file or directory whose name matches `__*__` (docgen fixtures, etc).
 */
function collectComponentFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const name = entry.name;
    // Skip fixtures / internal helpers named like __whatever__.
    if (/^__.*__/.test(name)) continue;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      files.push(...collectComponentFiles(full));
    } else if (entry.isFile() && name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * The exact file content `npm run cumulus-metadata` writes to
 * {@link METADATA_OUT_PATH}, computed from the live component sources without
 * touching disk. The contract test compares this against the materialized
 * file so component prop metadata stays aligned with its sources.
 */
export function computeMetadataJson() {
  const files = COMPONENT_ROOTS.flatMap((dir) =>
    collectComponentFiles(dir),
  ).sort();
  const metadata = extractPropMeta(files);

  // Emit component names in a stable (alphabetical) order for a clean diff.
  const sorted = {};
  for (const name of Object.keys(metadata).sort()) {
    sorted[name] = metadata[name];
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** Where the generated metadata lives, for the drift contract test. */
export const METADATA_OUT_PATH = OUT_PATH;

function main() {
  const json = computeMetadataJson();
  const sorted = JSON.parse(json);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, json);

  const componentCount = Object.keys(sorted).length;
  const propCount = Object.values(sorted).reduce(
    (sum, props) => sum + props.length,
    0,
  );
  console.log(`Wrote ${relative(ROOT, OUT_PATH)}`);
  console.log(
    `Components: ${componentCount} (${propCount} prop${propCount === 1 ? "" : "s"} total)`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
