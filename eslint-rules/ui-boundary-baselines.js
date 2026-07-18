/** Temporary outer-UI lint debt. The converged boundary carries none. */
const rows = [];

export const OUTER_UI_BASELINES = Object.freeze(rows.map(([file, rule, count]) => Object.freeze({
  file,
  rule,
  count,
  reason: "Existing outer UI debt; the named convergence task owns this migration.",
})));

export function baselineConfigEntries() {
  if (process.env.CUMULUS_REPORT_BASELINES === "1") return [];
  return OUTER_UI_BASELINES.map(({ file, rule }) => ({
    files: [file],
    rules: { [rule]: "off" },
  }));
}

/** CSS debt uses the same exact-count, shrink-only contract as TSX lint debt. */
export const OUTER_UI_CSS_BASELINES = Object.freeze([]);
