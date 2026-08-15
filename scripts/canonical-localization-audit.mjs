import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  collectRuntimeTemplateSources,
  runtimeTemplateContract,
} from "./localized-runtime-template-contract.mjs";

function textEntries(bundle) {
  return Object.values(bundle.entries).filter(
    (entry) =>
      entry.identity?.meaning === null &&
      entry.identity?.pattern?.kind === "text",
  );
}

function staticPattern(sourceText) {
  return sourceText.replaceAll("{", "{{").replaceAll("}", "}}");
}

function matchingEntries(entries, pattern, arguments_) {
  return entries.filter(
    (entry) =>
      entry.identity.pattern.text === pattern &&
      Object.keys(entry.arguments ?? {}).length === arguments_.length &&
      arguments_.every(
        ({ name, kind }) => entry.arguments?.[name]?.kind === kind,
      ),
  );
}

function collectCompositeValues(value, path, result) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectCompositeValues(entry, `${path}[${String(index)}]`, result),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const compactAmplifiedReplacement =
        key === "amplified-replacement" &&
        /^data\/cards\.toml\.cards\[\d+\]$/u.test(path);
      if (!compactAmplifiedReplacement) {
        collectCompositeValues(entry, `${path}.${key}`, result);
      }
    });
    return;
  }
  if (typeof value === "string" && value.includes("\n\n")) {
    result.push({ path, sourceText: value });
  }
}

function collectSourceReferences(value, path, result) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectSourceReferences(entry, `${path}[${String(index)}]`, result),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    if (value.format === "trox-source-message-ref") {
      result.push({ path, reference: value });
      return;
    }
    Object.entries(value).forEach(([key, entry]) =>
      collectSourceReferences(entry, `${path}.${key}`, result),
    );
  }
}

export function canonicalRonFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? canonicalRonFiles(path)
        : entry.isFile() && entry.name.endsWith(".ron")
          ? [path]
          : [];
    })
    .sort();
}

export function auditCanonicalLocalizationContract({
  bundle,
  compositeValues,
  projectionTemplates,
  runtimeTemplates,
  sourceReferences = [],
  escapedRonPlaceholders = [],
}) {
  const entries = textEntries(bundle);
  const issues = [];
  const compositionPattern = "{first_paragraph}\n\n{second_paragraph}";
  const compositionArguments = [
    { name: "first_paragraph", kind: "opaque" },
    { name: "second_paragraph", kind: "opaque" },
  ];
  const compositionMatches = matchingEntries(
    entries,
    compositionPattern,
    compositionArguments,
  );

  for (const finding of escapedRonPlaceholders) {
    issues.push({ code: "escaped-ron-placeholder", ...finding });
  }
  for (const { path, reference } of sourceReferences) {
    const entry = bundle.entries[reference.entry_id];
    if (
      entry === undefined ||
      entry.source_signature !== reference.source_signature ||
      entry.contract_signature !== reference.contract_signature
    ) {
      issues.push({ code: "unauthorized-source-reference", path });
    }
  }

  for (const { path, sourceText } of compositeValues) {
    const directMatches = matchingEntries(
      entries,
      staticPattern(sourceText),
      [],
    );
    if (directMatches.length === 1) continue;
    if (directMatches.length > 1) {
      issues.push({ code: "ambiguous-composite", path, sourceText });
      continue;
    }
    const paragraphs = sourceText.split("\n\n");
    if (paragraphs.length !== 2 || paragraphs.some((part) => part === "")) {
      issues.push({ code: "unsupported-composite", path, sourceText });
      continue;
    }
    const paragraphMatches = paragraphs.map(
      (part) => matchingEntries(entries, staticPattern(part), []).length,
    );
    if (paragraphMatches.some((count) => count !== 1)) {
      issues.push({
        code: "unmatched-composite-paragraph",
        path,
        sourceText,
        paragraphMatches,
      });
      continue;
    }
    if (compositionMatches.length !== 1) {
      issues.push({
        code: "missing-composition-message",
        path,
        sourceText,
        compositionMatches: compositionMatches.length,
      });
    }
  }

  for (const { path, template } of runtimeTemplates) {
    let contract;
    try {
      contract = runtimeTemplateContract(template);
    } catch (error) {
      issues.push({
        code: "invalid-runtime-template",
        path,
        template,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const arguments_ = contract.argumentNames.map((name, index) => ({
      name,
      kind: contract.argumentKinds[index] === "localized" ? "opaque" : "scalar",
    }));
    const matches = matchingEntries(entries, contract.pattern, arguments_);
    if (matches.length !== 1) {
      issues.push({
        code: "unmatched-runtime-template",
        path,
        template,
        matches: matches.length,
      });
    }
  }

  for (const { path, template } of projectionTemplates) {
    const sourceNames = [
      ...new Set(
        [...template.matchAll(/\{([^{}]+)\}/gu)].map((match) => match[1]),
      ),
    ];
    const unsupportedNames = sourceNames.filter(
      (name) => name !== "term" && !/^[0-9]+$/u.test(name),
    );
    if (unsupportedNames.length > 0) {
      issues.push({
        code: "unsupported-projection-placeholder",
        path,
        template,
        unsupportedNames,
      });
      continue;
    }
  }
  return issues;
}

export function canonicalLocalizationInputs(root) {
  const dataDirectory = resolve(root, "data");
  const compositeValues = [];
  const escapedRonPlaceholders = [];
  for (const file of canonicalRonFiles(dataDirectory)) {
    const source = readFileSync(file, "utf8");
    const dataPath = file.slice(dataDirectory.length + 1);
    for (const match of source.matchAll(/\{\{[^{}]+\}\}/gu)) {
      escapedRonPlaceholders.push({
        path: `data/${dataPath}:${String(source.slice(0, match.index).split("\n").length)}`,
      });
    }
  }
  for (const file of readdirSync(dataDirectory)
    .filter((name) => name.endsWith(".toml"))
    .sort()) {
    const document = parse(readFileSync(join(dataDirectory, file), "utf8"));
    collectCompositeValues(document, `data/${file}`, compositeValues);
  }

  const glossary = parse(
    readFileSync(join(dataDirectory, "glossary.toml"), "utf8"),
  );
  const runtimeTemplateSources = new Map();
  const publicDirectory = resolve(root, "public");
  const sourceReferences = [];
  for (const file of readdirSync(publicDirectory)
    .filter((name) => name.endsWith("-data.json"))
    .sort()) {
    const document = JSON.parse(readFileSync(join(publicDirectory, file), "utf8"));
    collectRuntimeTemplateSources(
      document,
      `public/${file}`,
      runtimeTemplateSources,
    );
    collectSourceReferences(document, `public/${file}`, sourceReferences);
  }
  collectRuntimeTemplateSources(
    glossary.entries ?? [],
    "data/glossary.toml.entries",
    runtimeTemplateSources,
  );
  const runtimeTemplates = [...runtimeTemplateSources].map(
    ([template, path]) => ({ path, template }),
  );
  const projectionTemplates = [];
  for (const [entryIndex, entry] of (glossary.entries ?? []).entries()) {
    for (const [projectionIndex, projection] of (
      entry.projections ?? []
    ).entries()) {
      for (const field of ["term", "definition"]) {
        const template = projection[field];
        if (
          typeof template !== "string" ||
          !/\{(?:term|\d+)\}/u.test(template)
        ) {
          continue;
        }
        projectionTemplates.push({
          path: `data/glossary.toml.entries[${String(entryIndex)}].projections[${String(projectionIndex)}].${field}`,
          template,
        });
      }
    }
  }
  return {
    compositeValues,
    escapedRonPlaceholders,
    projectionTemplates,
    runtimeTemplates,
    sourceReferences,
  };
}

export const canonicalLocalizationInternals = { collectCompositeValues };

export function assertCanonicalLocalizationContract(root) {
  const bundle = JSON.parse(
    readFileSync(
      resolve(root, ".generated/localization/bundles/en-US.trox.json"),
      "utf8",
    ),
  );
  const inputs = canonicalLocalizationInputs(root);
  const issues = auditCanonicalLocalizationContract({ bundle, ...inputs });
  if (issues.length > 0) {
    throw new Error(
      `Canonical localization audit found ${String(issues.length)} issue(s):\n${issues
        .map((issue) => `${issue.code}\t${issue.path}`)
        .join("\n")}`,
    );
  }
  return {
    compositeValueCount: inputs.compositeValues.length,
    projectionTemplateCount: inputs.projectionTemplates.length,
    runtimeTemplateCount: inputs.runtimeTemplates.length,
    sourceReferenceCount: inputs.sourceReferences.length,
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = assertCanonicalLocalizationContract(process.cwd());
    console.log(
      `Canonical localization audit checked ${String(result.sourceReferenceCount)} typed source references, ${String(result.compositeValueCount)} composed values, ${String(result.runtimeTemplateCount)} runtime templates, and ${String(result.projectionTemplateCount)} glossary projections.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
