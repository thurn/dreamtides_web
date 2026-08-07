import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { ensureGameData, listGameData } from "./game-data-pipeline.mjs";

const rootDir = process.cwd();
const configuredBase = process.env.GAME_DATA_PARITY_BASE?.trim();
const base = configuredBase === "" || configuredBase === undefined ? null : configuredBase;
await ensureGameData({ rootDir });
const manifest = listGameData({ rootDir });

function oracle(path) {
  if (base === null) return readFileSync(path, "utf8");
  return execFileSync("git", ["show", `${base}:${path}`], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function normalizeCorrections(dataset, document) {
  if (dataset !== "cards") return document;
  for (const card of document.cards ?? []) {
    if (card.id === "29d25251-8b42-4d3d-97e6-6c3abaabd9a2") card["energy-cost"] = 2;
    if (card.id === "229ab3a1-3720-41a2-924c-8fe112188f8e") card.spark = 2;
  }
  return document;
}

function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((entry, index) => equal(entry, right[index]));
  }
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return equal(leftKeys, rightKeys) && leftKeys.every((key) => equal(left[key], right[key]));
  }
  return false;
}

const datasets = manifest.datasets.map((dataset) => {
  const after = parse(readFileSync(dataset.output, "utf8"));
  if (base !== null) {
    const before = normalizeCorrections(dataset.id, parse(oracle(dataset.output)));
    if (!equal(before, after)) throw new Error(`semantic parity failed for ${dataset.id}`);
  }
  return { id: dataset.id, records: Array.isArray(Object.values(after)[0]) ? Object.values(after)[0].length : null };
});

const artifactBase = base ?? "HEAD";
execFileSync("git", ["diff", "--exit-code", artifactBase, "--", "public", "src/generated/config"], {
  cwd: rootDir,
  stdio: "inherit",
});
console.log(JSON.stringify({
  ok: true,
  mode: base === null ? "current" : "historical",
  base: artifactBase,
  datasets,
  corrections: base === null ? [] : [
    { cardId: "29d25251-8b42-4d3d-97e6-6c3abaabd9a2", field: "energy-cost", from: "2", to: 2 },
    { cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e", field: "spark", from: "2", to: 2 },
  ],
  derivedArtifacts: `byte-identical to ${artifactBase}`,
}, null, 2));
