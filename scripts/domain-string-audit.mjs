import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

// These trees intentionally model untyped transport/source text or technical
// presentation identities. Domain code consumes their values through typed
// loaders, adapters, and event decoders.
const BOUNDARY_PREFIXES = [
  "src/__test-helpers__/",
  "src/cumulus/",
  "src/data/",
  "src/editor/",
  "src/eventlog/",
  "src/firebase/",
  "src/generated/",
  "src/logging/",
  "src/testing/",
];

const BOUNDARY_FILES = new Set([
  "src/atlas/atlas-generator.ts", // numericSuffix parses generated ids.
  "src/battle/components/BattleFigmentCreator.tsx", // DOM Select value decoder.
  "src/battle/components/PlayableBattleScreen.tsx", // enemy descriptor parser.
  "src/battle/state/figment-catalog.ts", // raw JSON decoder.
  "src/coop/ConfigGateScreen.tsx", // React comparison key.
  "src/coop/journey-log-sink.ts", // persisted diagnostic records.
  "src/draft/pool/tides4-io.ts", // generated JSON transport model.
  "src/draft/pool/types.ts", // draft generator transport model.
  "src/draft/pool/variant-tides4.ts", // transport ids before pool hydration.
  "src/runtime/qa-scenes.ts", // QA query decoder.
  "src/runtime/runtime-config.ts", // URL query decoder.
  "src/screens/JourneyDebugEditor.tsx", // generated debug action keys.
  "src/screens/cumulus_adapters/package-debug-view-model.ts", // technical row ids.
  "src/types/semantic-identity.ts", // generic identity constructor boundary.
]);

function isTestFile(path) {
  return /\.(test|spec)\.(ts|tsx)$/u.test(path);
}

function isBoundary(path) {
  return (
    BOUNDARY_FILES.has(path) ||
    BOUNDARY_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function identityLikeName(name) {
  return name === "id" || /(?:Id|Ids|Key|Keys|Uuid|Uuids)$/u.test(name);
}

function rawStringType(typeNode) {
  if (typeNode.kind === ts.SyntaxKind.StringKeyword) return true;
  if (ts.isParenthesizedTypeNode(typeNode)) return rawStringType(typeNode.type);
  if (ts.isTypeOperatorNode(typeNode)) return rawStringType(typeNode.type);
  if (ts.isArrayTypeNode(typeNode)) return rawStringType(typeNode.elementType);
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some(rawStringType);
  }
  if (ts.isIntersectionTypeNode(typeNode)) return false;
  if (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    ["Array", "ReadonlyArray", "Iterable", "Set", "ReadonlySet"].includes(
      typeNode.typeName.text,
    )
  ) {
    return typeNode.typeArguments?.some(rawStringType) ?? false;
  }
  return false;
}

function declarationName(node) {
  if (node.name === undefined || !ts.isIdentifier(node.name)) return null;
  return node.name.text;
}

export function findRawStringIdentityDeclarationsInSource(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];

  function visit(node) {
    const name = declarationName(node);
    if (
      name !== null &&
      identityLikeName(name) &&
      node.type !== undefined &&
      rawStringType(node.type)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.name.getStart(),
      );
      findings.push({
        file: fileName,
        line: position.line + 1,
        column: position.character + 1,
        name,
        type: node.type.getText(sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function sourceFiles(root) {
  const src = join(root, "src");
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (SOURCE_EXTENSIONS.has(extname(path))) result.push(path);
    }
  };
  visit(src);
  return result;
}

export function auditDomainStrings(root) {
  const absoluteRoot = resolve(root);
  return sourceFiles(absoluteRoot).flatMap((absolutePath) => {
    const path = relative(absoluteRoot, absolutePath).split(sep).join("/");
    if (isTestFile(path) || isBoundary(path)) return [];
    return findRawStringIdentityDeclarationsInSource(
      readFileSync(absolutePath, "utf8"),
      path,
    );
  });
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const findings = auditDomainStrings(process.cwd());
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.file}:${String(finding.line)}:${String(finding.column)} ` +
          `${finding.name}: ${finding.type}\n`,
      );
    }
    process.stderr.write(
      `Found ${String(findings.length)} raw string domain identity declaration(s).\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Domain identity string audit passed.\n");
  }
}
