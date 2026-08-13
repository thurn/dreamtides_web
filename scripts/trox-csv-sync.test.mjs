import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTroxRoot } from "./trox.mjs";

function runExtract(root, troxRoot = resolveTroxRoot()) {
  const executable = resolve(troxRoot, "target/debug/trox");
  if (!existsSync(executable)) {
    execFileSync("cargo", [
      "build",
      "--locked",
      "--manifest-path",
      resolve(troxRoot, "Cargo.toml"),
      "-p",
      "trox-cli",
      "--bin",
      "trox",
    ], { cwd: troxRoot, stdio: "pipe" });
  }
  execFileSync(executable, [
    "--config",
    resolve(root, "trox.ron"),
    "extract",
  ], { cwd: root, stdio: "pipe" });
}

function parseCSV(source) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") cell += character;
  }
  return rows;
}

function encodeCSV(rows) {
  const encode = (cell) => /[",\n\r]/u.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell;
  return rows.map((row) => row.map(encode).join(",")).join("\n") + "\n";
}

describe("Trox CSV synchronization", () => {
  it("preserves translator cells, records stale work, retains obsolete rows, and is deterministic", () => {
    const troxRoot = resolveTroxRoot();
    const root = mkdtempSync(resolve(tmpdir(), "quest-trox-csv-"));
    try {
      mkdirSync(resolve(root, "src"), { recursive: true });
      mkdirSync(resolve(root, "locales"), { recursive: true });
      writeFileSync(resolve(root, "terms.ron"), "{}\n");
      writeFileSync(resolve(root, "locales/es.ron"), '(locale: "es", direction: Ltr, isolation: Isolate, fallbacks: ["en-US"], facets: {}, term_facets: {})\n');
      writeFileSync(resolve(root, "trox.ron"), `(
  source_locale: "en-US",
  terms: "terms.ron",
  source_bundle: "generated/en-US.trox.json",
  source_report: "generated/en-US.csv",
  sources: [(language: TypeScript, include: ["src/**/*.ts"])],
  locales: {"es": (profile: "locales/es.ron", csv: "generated/es.csv", bundle: "generated/es.trox.json")},
)\n`);
      writeFileSync(resolve(root, "src/slice.ts"), 'tx("Alpha", "Synthetic translator-workflow fixture label.");\n');
      runExtract(root, troxRoot);

      const csvPath = resolve(root, "generated/es.csv");
      const rows = parseCSV(readFileSync(csvPath, "utf8"));
      const header = rows[0];
      const translation = header.indexOf("translation");
      const translatorNote = header.indexOf("translator_note");
      rows[1][translation] = "Traducción humana";
      rows[1][translatorNote] = "Keep this note exactly.";
      writeFileSync(csvPath, encodeCSV(rows));
      runExtract(root, troxRoot);

      let current = parseCSV(readFileSync(csvPath, "utf8"));
      expect(current[1][translation]).toBe("Traducción humana");
      expect(current[1][translatorNote]).toBe("Keep this note exactly.");

      writeFileSync(resolve(root, "src/slice.ts"), 'tx("Alpha", "Revised synthetic translator-workflow fixture label.");\n');
      runExtract(root, troxRoot);
      current = parseCSV(readFileSync(csvPath, "utf8"));
      const status = header.indexOf("status");
      const previousTranslation = header.indexOf("previous_translation");
      expect(current.some((row) => row[status] === "stale" && row[previousTranslation] === "Traducción humana")).toBe(true);

      writeFileSync(resolve(root, "src/slice.ts"), "export {};\n");
      runExtract(root, troxRoot);
      current = parseCSV(readFileSync(csvPath, "utf8"));
      expect(current.some((row) => row[status] === "obsolete")).toBe(true);
      const firstStable = readFileSync(csvPath);
      runExtract(root, troxRoot);
      expect(readFileSync(csvPath).equals(firstStable)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
