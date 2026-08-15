import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SOURCE_DIRECTORIES = ["src", "scripts", "tabula", "cumulus", "eslint-rules"];
const ROOT_SOURCE_FILES = ["vite.config.ts"];
const CHECKED_IDENTITY_MINT_BOUNDARIES = new Set([
  "src/types/card-identity.ts:brandCardId:CardId",
  "src/editor/card-name-substring-groups.ts:cardNameSubstringKey:CardNameSubstringKey",
  "src/editor/card-name-substring-groups.ts:participantKey:CardParticipantSetKey",
]);
const RAW_SEMANTIC_STRING_BOUNDARIES = new Set([
  "src/data/tutorial-journey-pool.ts:parseTutorialJourneyPool:source",
  "src/data/tutorial-instruction-markup.ts:parseTutorialInstructionMarkup:source",
  "src/data/tutorial-instruction-markup.ts:tutorialInstructionPlainText:source",
  "src/battle/state/figment-catalog.ts:normalizeFigmentCatalogKey:subtype",
  "src/battle/state/figment-catalog.ts:lookupFigmentCatalogEntry:subtype",
]);
const SEMANTIC_DECLARATION_NAMES = new Set([
  "actor",
  "kind",
  "journeySeed",
  "reducerVersion",
  "seed",
  "source",
  "subtype",
  "zone",
]);
const IGNORED_DIRECTORIES = new Set([
  "dist",
  "node_modules",
  "target",
]);

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
  if (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    ["Map", "ReadonlyMap", "Record"].includes(typeNode.typeName.text)
  ) {
    const keyType = typeNode.typeArguments?.[0];
    return keyType === undefined ? false : rawStringType(keyType);
  }
  return false;
}

function directRawStringType(typeNode) {
  if (typeNode.kind === ts.SyntaxKind.StringKeyword) return true;
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return directRawStringType(typeNode.type);
  }
  if (ts.isTypeOperatorNode(typeNode)) return directRawStringType(typeNode.type);
  if (ts.isArrayTypeNode(typeNode)) return directRawStringType(typeNode.elementType);
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some(directRawStringType);
  }
  if (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    ["Array", "ReadonlyArray", "Iterable", "Set", "ReadonlySet"].includes(
      typeNode.typeName.text,
    )
  ) {
    return typeNode.typeArguments?.some(directRawStringType) ?? false;
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

export function findRawSemanticStringDeclarationsInSource(source, fileName) {
  if (
    !fileName.startsWith("src/") ||
    fileName === "src/types/test-identities.ts" ||
    /(?:^|\.)test\.[^.]+$/u.test(fileName)
  ) {
    return [];
  }
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];
  const enclosingFunctionName = (node) => {
    for (let current = node.parent; current !== undefined; current = current.parent) {
      if (
        (ts.isFunctionDeclaration(current) ||
          ts.isFunctionExpression(current) ||
          ts.isArrowFunction(current) ||
          ts.isMethodDeclaration(current)) &&
        current.name !== undefined &&
        ts.isIdentifier(current.name)
      ) {
        return current.name.text;
      }
    }
    return null;
  };
  const visit = (node) => {
    const name = declarationName(node);
    if (
      name !== null &&
      SEMANTIC_DECLARATION_NAMES.has(name) &&
      node.type !== undefined &&
      directRawStringType(node.type)
    ) {
      const functionName = enclosingFunctionName(node);
      const boundaryKey = `${fileName}:${functionName ?? ""}:${name}`;
      if (!RAW_SEMANTIC_STRING_BOUNDARIES.has(boundaryKey)) {
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
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function identityTypeName(typeNode) {
  if (ts.isParenthesizedTypeNode(typeNode)) return identityTypeName(typeNode.type);
  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      const name = identityTypeName(member);
      if (name !== null) return name;
    }
    return null;
  }
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    return /(?:Id|Key|Uuid)$/u.test(typeNode.typeName.text)
      ? typeNode.typeName.text
      : null;
  }
  return null;
}

export function findUncheckedIdentityAssertionsInSource(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];
  const enclosingFunctionName = (node) => {
    for (let current = node.parent; current !== undefined; current = current.parent) {
      if (
        (ts.isFunctionDeclaration(current) ||
          ts.isFunctionExpression(current) ||
          ts.isArrowFunction(current)) &&
        current.name !== undefined &&
        ts.isIdentifier(current.name)
      ) {
        return current.name.text;
      }
    }
    return null;
  };
  const record = (node, name, type) => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    findings.push({
      file: fileName,
      line: position.line + 1,
      column: position.character + 1,
      name,
      type,
      functionName: enclosingFunctionName(node),
    });
  };
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^as[A-Z][A-Za-z0-9]*(?:Id|Key|Uuid)$/u.test(node.expression.text)
    ) {
      record(node.expression, node.expression.text, "unchecked identity constructor");
    } else if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const name = identityTypeName(node.type);
      if (name !== null) record(node, name, "unchecked identity assertion");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function sourceFiles(root) {
  const result = [];
  const visit = (directory) => {
    if (!ts.sys.directoryExists(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (SOURCE_EXTENSIONS.has(extname(path))) result.push(path);
    }
  };
  for (const directory of SOURCE_DIRECTORIES) visit(join(root, directory));
  for (const file of ROOT_SOURCE_FILES) {
    const path = join(root, file);
    if (ts.sys.fileExists(path)) result.push(path);
  }
  return result;
}

export function auditDomainStrings(root) {
  const absoluteRoot = resolve(root);
  return sourceFiles(absoluteRoot).flatMap((absolutePath) => {
    const path = relative(absoluteRoot, absolutePath).split(sep).join("/");
    const source = readFileSync(absolutePath, "utf8");
    return [
      ...findRawStringIdentityDeclarationsInSource(source, path),
      ...findRawSemanticStringDeclarationsInSource(source, path),
      ...findUncheckedIdentityAssertionsInSource(source, path),
    ].filter(
      (finding) =>
        !CHECKED_IDENTITY_MINT_BOUNDARIES.has(
          `${path}:${finding.functionName ?? ""}:${finding.name}`,
        ),
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
