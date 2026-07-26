// Shared staleness check for the committed tides4 artifact (data/tides4.jsonc).
//
// It re-runs the REAL bake (`buildTides4` via `bakeArtifactText`, imported from
// scripts/bake-tides4.mjs — not a reimplementation) over the current `public/`
// inputs and override layer, carrying the committed file's own annotations
// forward, then compares that to the committed file byte-for-byte.
//
// Because the expected text reuses the committed annotations, the comparison is
// blind to the one kind of hand-edit the bake sanctions — the per-tide annotation
// fields (shortName / displayName / displayDescription / summary / description /
// color). Any OTHER difference means the generated card contents are stale (a bake
// input changed without a re-bake) or were hand-edited (which the bake would
// overwrite). Both are reported with an actionable remedy.
//
// Consumed by `scripts/check-tides4.mjs`.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { bakeArtifactText } from "../bake-tides4.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
export const ARTIFACT_REL = "data/tides4.jsonc";
export const OVERRIDES_REL = "data/tides4-overrides.jsonc";

// Strip the `//` header/comment lines so the JSON body can be parsed.
function stripHeader(text) {
  return text.replace(/^\s*\/\/.*$/gm, "");
}

// The first line where two texts diverge (1-based), with both sides, for a
// pinpointed error message.
function firstDiffLine(a, b) {
  const al = a.split("\n");
  const bl = b.split("\n");
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    if (al[i] !== bl[i]) {
      return { line: i + 1, committed: al[i] ?? "(end of file)", expected: bl[i] ?? "(end of file)" };
    }
  }
  return null;
}

// Map tide id -> a stable signature of its card selection ([id, copies] pairs), so
// the diagnosis can name exactly which tides drifted.
function tideSelections(text) {
  const parsed = JSON.parse(stripHeader(text));
  const map = new Map();
  for (const tide of parsed.tides ?? []) {
    map.set(
      tide.id,
      JSON.stringify((tide.cards ?? []).map((c) => [c.id, c.copies])),
    );
  }
  return map;
}

/**
 * Compare the committed artifact against a fresh bake.
 *
 * Returns `{ ok: true }` when they match. Otherwise returns a diagnosis:
 *   { ok:false, artifactPath, firstDiff, changedTides, addedTides, removedTides,
 *     selectionsMatch }
 * where `selectionsMatch` is true when every tide's card SELECTION is current and
 * only derived fields (names / rendered text / pool ordering) lag — i.e. a pure
 * "forgot to re-bake after editing card text/names" case.
 *
 * Throws (with an actionable message) when the bake cannot run at all, e.g. the
 * `public/` inputs are missing or the override file is malformed.
 */
export function checkTides4({ rootDir = ROOT } = {}) {
  const artifactPath = resolve(rootDir, ARTIFACT_REL);
  if (!existsSync(artifactPath)) {
    throw new Error(
      `${ARTIFACT_REL} does not exist. Generate it with \`npm run bake-tides4\`.`,
    );
  }
  const committed = readFileSync(artifactPath, "utf8");
  const expected = bakeArtifactText({ rootDir, annotationsSource: artifactPath });
  if (committed === expected) return { ok: true };

  const committedSel = tideSelections(committed);
  const expectedSel = tideSelections(expected);
  const changedTides = [];
  const addedTides = [];
  const removedTides = [];
  for (const id of expectedSel.keys()) {
    if (!committedSel.has(id)) addedTides.push(id);
    else if (committedSel.get(id) !== expectedSel.get(id)) changedTides.push(id);
  }
  for (const id of committedSel.keys()) {
    if (!expectedSel.has(id)) removedTides.push(id);
  }
  const selectionsMatch =
    changedTides.length === 0 && addedTides.length === 0 && removedTides.length === 0;

  return {
    ok: false,
    artifactPath,
    firstDiff: firstDiffLine(committed, expected),
    changedTides,
    addedTides,
    removedTides,
    selectionsMatch,
  };
}

/**
 * The shared, deliberately verbose failure message. Used by both the CLI gate and
 * the vitest test so the guidance is identical wherever the check trips.
 */
export function formatStaleMessage(result) {
  const lines = [];
  lines.push("");
  lines.push("════════════════════════════════════════════════════════════════════════");
  lines.push("  data/tides4.jsonc is OUT OF SYNC with the tides4 bake.");
  lines.push("════════════════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push("`data/tides4.jsonc` is a GENERATED file. It differs from what");
  lines.push("`npm run bake-tides4` produces from the current source data, so it must be");
  lines.push("regenerated before committing.");
  lines.push("");

  if (result.firstDiff) {
    lines.push(`First difference at line ${result.firstDiff.line}:`);
    lines.push(`    committed: ${truncate(result.firstDiff.committed)}`);
    lines.push(`    expected : ${truncate(result.firstDiff.expected)}`);
    lines.push("");
  }
  const drift = [
    result.changedTides.length ? `${result.changedTides.length} tide(s) changed: ${preview(result.changedTides)}` : null,
    result.addedTides.length ? `${result.addedTides.length} tide(s) added: ${preview(result.addedTides)}` : null,
    result.removedTides.length ? `${result.removedTides.length} tide(s) removed: ${preview(result.removedTides)}` : null,
  ].filter(Boolean);
  if (drift.length) {
    lines.push("Card-selection drift:");
    for (const d of drift) lines.push(`    • ${d}`);
    lines.push("");
  } else if (result.selectionsMatch) {
    lines.push("Every tide's card selection is current; only derived fields (card");
    lines.push("names / rendered text / pool ordering) lag — typically a card was renamed");
    lines.push("or its text edited in data/tabula/cards_v2.toml without a re-bake.");
    lines.push("");
  }

  lines.push("────────────────────────────────────────────────────────────────────────");
  lines.push("  FIX 1 — you changed a bake INPUT and just need to regenerate:");
  lines.push("────────────────────────────────────────────────────────────────────────");
  lines.push("Inputs are data/tabula/cards_v2.toml, data/tabula/dream_avatars_v2.toml,");
  lines.push("docs/draft_records_adapted/, and data/tides4-overrides.jsonc. After editing");
  lines.push("any of them, regenerate and re-stage:");
  lines.push("");
  lines.push("    npm run setup-assets   # rebuild public/ inputs from source");
  lines.push("    npm run bake-tides4    # rewrite data/tides4.jsonc + the markdown");
  lines.push("    git add data/tides4.jsonc docs/cards2/tides4_decklists.md");
  lines.push("");
  lines.push("────────────────────────────────────────────────────────────────────────");
  lines.push("  FIX 2 — you HAND-EDITED card lists in data/tides4.jsonc:");
  lines.push("────────────────────────────────────────────────────────────────────────");
  lines.push("Hand-edits to a tide's `cards` (adding/removing a card, changing copies)");
  lines.push("DO NOT STICK — the next bake overwrites them from draft-pick affinity. To");
  lines.push("make a curated card change that survives every re-bake, edit the override");
  lines.push("layer instead:  data/tides4-overrides.jsonc");
  lines.push("");
  lines.push("    • comboPairings    — keep a designed combo's two card-sets together in");
  lines.push("                         exactly N tides and strip the orphaned half");
  lines.push("                         elsewhere (set `targetTides`).");
  lines.push("    • tideCardOverrides— add/remove specific cards in one named tide");
  lines.push("                         (keyed by tide id, e.g. \"tide-sig-03\").");
  lines.push("");
  lines.push("Cards are referenced by stable cards_v2 UUID. After editing the override");
  lines.push("file, run FIX 1's commands to regenerate.");
  lines.push("");
  lines.push("NOTE: the per-tide annotation fields — shortName, displayName,");
  lines.push("displayDescription, summary, description, color — ARE safe to hand-edit in");
  lines.push("data/tides4.jsonc; a re-bake preserves them by tide id and this check");
  lines.push("ignores them.");
  lines.push("════════════════════════════════════════════════════════════════════════");
  lines.push("");
  return lines.join("\n");
}

function truncate(s, n = 160) {
  if (s == null) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function preview(ids, n = 8) {
  return ids.length > n ? `${ids.slice(0, n).join(", ")}, … (${ids.length})` : ids.join(", ");
}
