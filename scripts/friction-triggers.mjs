// Reports the introspection triggers that the friction evidence has fired
// (docs/plan/workflow.md § Triggers and § Retrospectives).
//
// A trigger fires when one friction tag, after alias normalization, appears in
// `triggerBeads` or more beads of one phase. Each fired trigger needs a
// disposition line in the ledger: an improvement bead or a reason. The report
// also counts each phase's friction files that no recorded retrospective
// covers, so the every-10th-bead cadence is visible.
//
// Inputs, all under the evidence directory (docs/plan/evidence by default):
// - friction/<bead-id>.json and friction.jsonl: friction records;
// - friction-tags.json: { triggerBeads, retrospectiveCadence, aliases };
// - introspection.jsonl: dispositions {tag, phase, bead | reason} and
//   retrospectives {retrospective: <date>, phase, bead?, covers: [bead ids]}.
//
// Exits 1 when a fired trigger has no disposition, 2 on malformed input, and 0
// otherwise.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EVIDENCE_DIR = join(ROOT, "docs/plan/evidence");

/**
 * @typedef {{ bead: string, phase: string, tags: string[] }} FrictionRecord
 * @typedef {{
 *   triggerBeads: number,
 *   retrospectiveCadence: number,
 *   aliases: Record<string, string>,
 * }} TagConfig
 * @typedef {{ tag: string, phase: string, bead?: string, reason?: string }} Disposition
 * @typedef {{ date: string, phase: string, bead?: string, covers: string[] }} Retrospective
 * @typedef {{
 *   phase: string,
 *   tag: string,
 *   beads: string[],
 *   disposition: Disposition | null,
 * }} Trigger
 * @typedef {{
 *   phase: string,
 *   frictionFiles: number,
 *   uncovered: string[],
 *   lastRetrospective: Retrospective | null,
 *   due: boolean,
 * }} Cadence
 * @typedef {{ triggers: Trigger[], cadence: Cadence[], exitCode: number }} TriggerReport
 */

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {Record<string, unknown>}
 */
function asObject(value, where) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a JSON object`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} where
 */
function asString(value, where) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where}: expected a non-empty string`);
  }
  return value;
}

/**
 * Phases are numbers (1, 2, …) or track letters ("T"); both compare as text.
 *
 * @param {unknown} value
 * @param {string} where
 */
function asPhase(value, where) {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  throw new Error(`${where}: expected a phase number or track letter`);
}

/**
 * @param {string} path
 * @returns {unknown[]}
 */
function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return /** @type {unknown} */ (JSON.parse(line));
      } catch {
        throw new Error(`${path}:${index + 1}: invalid JSON`);
      }
    });
}

/**
 * A friction entry is `{tag, …}`; the early `friction.jsonl` lines list bare
 * tag strings.
 *
 * @param {unknown} raw
 * @param {string} where
 * @returns {FrictionRecord}
 */
function parseFrictionRecord(raw, where) {
  const record = asObject(raw, where);
  const friction = record.friction ?? [];
  if (!Array.isArray(friction)) {
    throw new Error(`${where}: friction must be an array`);
  }
  return {
    bead: asString(record.bead, `${where} bead`),
    phase: asPhase(record.phase, `${where} phase`),
    tags: friction.map((entry) =>
      typeof entry === "string"
        ? entry
        : asString(asObject(entry, `${where} friction`).tag, `${where} tag`),
    ),
  };
}

/**
 * @param {string} evidenceDir
 * @returns {FrictionRecord[]}
 */
export function readFrictionRecords(evidenceDir) {
  const frictionDir = join(evidenceDir, "friction");
  const files = existsSync(frictionDir)
    ? readdirSync(frictionDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
    : [];
  const records = files.map((name) => {
    const path = join(frictionDir, name);
    return parseFrictionRecord(JSON.parse(readFileSync(path, "utf8")), path);
  });
  const legacyPath = join(evidenceDir, "friction.jsonl");
  readJsonLines(legacyPath).forEach((line, index) =>
    records.push(parseFrictionRecord(line, `${legacyPath}:${index + 1}`)),
  );
  return records;
}

/**
 * @param {string} evidenceDir
 * @returns {TagConfig}
 */
export function readTagConfig(evidenceDir) {
  const path = join(evidenceDir, "friction-tags.json");
  const config = asObject(JSON.parse(readFileSync(path, "utf8")), path);
  const { triggerBeads, retrospectiveCadence } = config;
  if (
    !Number.isInteger(triggerBeads) ||
    !Number.isInteger(retrospectiveCadence)
  ) {
    throw new Error(
      `${path}: triggerBeads and retrospectiveCadence must be integers`,
    );
  }
  const aliases = asObject(config.aliases ?? {}, `${path} aliases`);
  return {
    triggerBeads: /** @type {number} */ (triggerBeads),
    retrospectiveCadence: /** @type {number} */ (retrospectiveCadence),
    aliases: Object.fromEntries(
      Object.entries(aliases).map(([alias, tag]) => [
        alias,
        asString(tag, `${path} aliases.${alias}`),
      ]),
    ),
  };
}

/**
 * @param {string} evidenceDir
 * @returns {{ dispositions: Disposition[], retrospectives: Retrospective[] }}
 */
export function readLedger(evidenceDir) {
  const path = join(evidenceDir, "introspection.jsonl");
  /** @type {Disposition[]} */
  const dispositions = [];
  /** @type {Retrospective[]} */
  const retrospectives = [];
  readJsonLines(path).forEach((raw, index) => {
    const where = `${path}:${index + 1}`;
    const line = asObject(raw, where);
    const phase = asPhase(line.phase, `${where} phase`);
    const bead =
      line.bead === undefined
        ? undefined
        : asString(line.bead, `${where} bead`);
    if (line.retrospective !== undefined) {
      if (!Array.isArray(line.covers)) {
        throw new Error(
          `${where}: a retrospective lists the bead ids it covers`,
        );
      }
      retrospectives.push({
        date: asString(line.retrospective, `${where} retrospective`),
        phase,
        bead,
        covers: line.covers.map((id) => asString(id, `${where} covers`)),
      });
      return;
    }
    const reason =
      line.reason === undefined
        ? undefined
        : asString(line.reason, `${where} reason`);
    if (bead === undefined && reason === undefined) {
      throw new Error(`${where}: a disposition names a bead or a reason`);
    }
    dispositions.push({
      tag: asString(line.tag, `${where} tag`),
      phase,
      bead,
      reason,
    });
  });
  return { dispositions, retrospectives };
}

/**
 * Fired triggers with their dispositions, and each phase's retrospective
 * cadence. Pure: the caller supplies the parsed evidence.
 *
 * @param {{
 *   records: FrictionRecord[],
 *   config: TagConfig,
 *   dispositions: Disposition[],
 *   retrospectives: Retrospective[],
 * }} evidence
 * @returns {TriggerReport}
 */
export function evaluateTriggers({
  records,
  config,
  dispositions,
  retrospectives,
}) {
  /** @param {string} tag */
  const canonical = (tag) => config.aliases[tag] ?? tag;

  /** @returns {Map<string, Set<string>>} */
  const beadsByKey = () => new Map();
  // phase → friction bead ids
  const phaseBeads = beadsByKey();
  /** @type {Map<string, Map<string, Set<string>>>} phase → tag → bead ids */
  const tagBeads = new Map();
  for (const { bead, phase, tags } of records) {
    phaseBeads.set(phase, (phaseBeads.get(phase) ?? new Set()).add(bead));
    const byTag = tagBeads.get(phase) ?? beadsByKey();
    tagBeads.set(phase, byTag);
    for (const tag of tags.map(canonical)) {
      byTag.set(tag, (byTag.get(tag) ?? new Set()).add(bead));
    }
  }

  const phases = [...phaseBeads.keys()].sort();
  /** @type {Trigger[]} */
  const triggers = [];
  for (const phase of phases) {
    const byTag = tagBeads.get(phase) ?? beadsByKey();
    for (const tag of [...byTag.keys()].sort()) {
      const beads = [...(byTag.get(tag) ?? [])].sort();
      if (beads.length < config.triggerBeads) continue;
      const disposition =
        dispositions.find(
          (entry) => entry.phase === phase && canonical(entry.tag) === tag,
        ) ?? null;
      triggers.push({ phase, tag, beads, disposition });
    }
  }

  const cadence = phases.map((phase) => {
    const ofPhase = retrospectives.filter((entry) => entry.phase === phase);
    const covered = new Set(ofPhase.flatMap((entry) => entry.covers));
    const beads = phaseBeads.get(phase) ?? new Set();
    const uncovered = [...beads].filter((bead) => !covered.has(bead)).sort();
    return {
      phase,
      frictionFiles: beads.size,
      uncovered,
      lastRetrospective: ofPhase.at(-1) ?? null,
      due: uncovered.length >= config.retrospectiveCadence,
    };
  });

  const exitCode = triggers.some((trigger) => trigger.disposition === null)
    ? 1
    : 0;
  return { triggers, cadence, exitCode };
}

/**
 * @param {TriggerReport} report
 * @param {TagConfig} config
 */
export function formatReport(report, config) {
  const lines = [
    `Friction triggers (a tag in ${config.triggerBeads}+ beads of one phase):`,
  ];
  if (report.triggers.length === 0) lines.push("  none");
  for (const { phase, tag, beads, disposition } of report.triggers) {
    const outcome =
      disposition === null
        ? `UNDISPOSITIONED: ${beads.join(", ")}`
        : disposition.bead !== undefined
          ? `filed ${disposition.bead}`
          : disposition.reason;
    lines.push(
      `  phase ${phase}  ${tag} (${beads.length} beads) -> ${outcome}`,
    );
  }
  lines.push(
    `Retrospective cadence (every ${config.retrospectiveCadence} beads of a phase):`,
  );
  for (const {
    phase,
    frictionFiles,
    uncovered,
    lastRetrospective,
    due,
  } of report.cadence) {
    const since =
      lastRetrospective === null
        ? "with no retrospective recorded"
        : `since the ${lastRetrospective.date} retrospective` +
          (lastRetrospective.bead === undefined
            ? ""
            : ` (${lastRetrospective.bead})`);
    lines.push(
      `  phase ${phase}  ${uncovered.length} of ${frictionFiles} friction files ${since}` +
        (due ? "  RETROSPECTIVE DUE" : ""),
    );
  }
  if (report.exitCode !== 0) {
    lines.push(
      "File an improvement bead for each undispositioned trigger, or record a reason, in docs/plan/evidence/introspection.jsonl.",
    );
  }
  return lines.join("\n");
}

/**
 * @param {string} evidenceDir
 * @returns {{ report: TriggerReport, text: string }}
 */
export function runFrictionTriggers(evidenceDir) {
  const config = readTagConfig(evidenceDir);
  const report = evaluateTriggers({
    records: readFrictionRecords(evidenceDir),
    config,
    ...readLedger(evidenceDir),
  });
  return { report, text: formatReport(report, config) };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { report, text } = runFrictionTriggers(
      process.argv[2] ? resolve(process.argv[2]) : DEFAULT_EVIDENCE_DIR,
    );
    console.log(text);
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
