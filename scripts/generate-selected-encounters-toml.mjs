import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEncounterCandidates,
  parseEncounterTemplates,
  renderEncounterTemplate,
} from "./exploration-candidates-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_CANDIDATES_PATH = resolve(ROOT, "data", "exploration_candidates.json");
const DEFAULT_TEMPLATES_PATH = resolve(ROOT, "data", "templates.json");

function selectedCandidate(encounters, selectionKind, cardId) {
  const selected = encounters.filter(
    (candidate) => candidate.selected?.[selectionKind] === true,
  );
  if (selected.length !== 1) {
    throw new Error(
      `${cardId} must have exactly one selected ${selectionKind} candidate.`,
    );
  }
  return selected[0];
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/u.test(key) ? key : JSON.stringify(key);
}

function tomlValue(value, label = "value") {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => tomlValue(entry, `${label}[${String(index)}]`)).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(
      ([key, entry]) => `${tomlKey(key)} = ${tomlValue(entry, `${label}.${key}`)}`,
    );
    return fields.length === 0 ? "{}" : `{ ${fields.join(", ")} }`;
  }
  throw new Error(`${label} cannot be represented in TOML.`);
}

/**
 * Build a reviewable TOML projection of the selected encounter candidates.
 * Runtime mechanics such as effect-kind remain pending, while template
 * provenance stays in the output for the eventual semantic conversion.
 */
export function generateSelectedEncountersToml(candidatesSource, templatesSource) {
  const candidates = parseEncounterCandidates(candidatesSource);
  const templates = parseEncounterTemplates(templatesSource).byId;
  const lines = [
    "# Generated from data/exploration_candidates.json and data/templates.json.",
    "# This is a partial Exploration authoring export. Runtime effect fields",
    "# such as effect-kind are intentionally pending.",
    "# $SPECIAL placeholders are preserved for runtime resolution.",
  ];

  for (const [cardId, encounters] of Object.entries(candidates)) {
    const proseCandidate = selectedCandidate(encounters, "prose", cardId);
    const actionsCandidate = selectedCandidate(encounters, "actions", cardId);
    lines.push(
      "",
      `# selected prose: ${proseCandidate.template_pair_id} (rank ${String(proseCandidate.rank)})`,
      `# selected actions: ${actionsCandidate.template_pair_id} (rank ${String(actionsCandidate.rank)})`,
      "[[encounter]]",
      `card-id = ${tomlValue(cardId)}`,
      `prose = ${tomlValue(proseCandidate.prose)}`,
    );

    for (const action of actionsCandidate.actions) {
      const template = templates.get(action.template_id);
      if (template === undefined) {
        throw new Error(
          `${cardId}/${actionsCandidate.template_pair_id} references unknown template ${String(action.template_id)}.`,
        );
      }
      const actionId = `${cardId}:${actionsCandidate.template_pair_id}:template-${String(action.template_id)}`;
      lines.push(
        "",
        "[[encounter.action]]",
        `id = ${tomlValue(actionId)}`,
        `label = ${tomlValue(action.label)}`,
        `effect-text = ${tomlValue(renderEncounterTemplate(template, action.variables))}`,
        `template-id = ${String(action.template_id)}`,
        `template-variables = ${tomlValue(action.variables, "template-variables")}`,
      );
      if (action.selection !== undefined) {
        lines.push(`selection = ${tomlValue(action.selection, "selection")}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a path.`);
  }
  return value;
}

export function parseGenerateSelectedEncountersArgs(argv) {
  const options = {
    candidatesPath: DEFAULT_CANDIDATES_PATH,
    templatesPath: DEFAULT_TEMPLATES_PATH,
    outputPath: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--candidates") {
      options.candidatesPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument.startsWith("--candidates=")) {
      options.candidatesPath = resolve(argument.slice("--candidates=".length));
    } else if (argument === "--templates") {
      options.templatesPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument.startsWith("--templates=")) {
      options.templatesPath = resolve(argument.slice("--templates=".length));
    } else if (argument === "--output" || argument === "--out") {
      options.outputPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument.startsWith("--output=")) {
      options.outputPath = resolve(argument.slice("--output=".length));
    } else if (argument.startsWith("--out=")) {
      options.outputPath = resolve(argument.slice("--out=".length));
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/generate-selected-encounters-toml.mjs [options]",
    "",
    "Options:",
    "  --candidates <path>  Candidate JSON (default: data/exploration_candidates.json)",
    "  --templates <path>   Template JSON (default: data/templates.json)",
    "  --output <path>      Write TOML to a file instead of stdout",
    "  --help               Show this help",
    "",
  ].join("\n");
}

function main() {
  const options = parseGenerateSelectedEncountersArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const generated = generateSelectedEncountersToml(
    readFileSync(options.candidatesPath, "utf8"),
    readFileSync(options.templatesPath, "utf8"),
  );
  if (options.outputPath === null) {
    process.stdout.write(generated);
  } else {
    writeFileSync(options.outputPath, generated);
    process.stderr.write(`Wrote ${options.outputPath}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
