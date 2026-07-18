/**
 * Exact, temporary outer-UI lint debt. Counts are part of the contract: an
 * addition or a removal fails the baseline audit, so consumers must either
 * migrate the file or deliberately shrink this inventory in their task.
 */
const rows = [
  ["src/editor/EditableCard.tsx", "cumulus/valid-token-references", 1],
  ["src/editor/DreamwellEditorPreview.tsx", "cumulus/valid-token-references", 3], ["src/editor/DreamwellEditorPreview.tsx", "cumulus/no-inline-glass", 1],
  ["src/editor/TidesDetailView.tsx", "cumulus/no-raw-icon-classes", 3], ["src/editor/TidesListView.tsx", "cumulus/no-raw-icon-classes", 1],
];

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
export const OUTER_UI_CSS_BASELINES = Object.freeze([
  { file: "src/index.css", rule: "raw-color", count: 6 },
  { file: "src/editor/card-editor.css", rule: "raw-length", count: 4 },
  { file: "src/editor/editable-figment.css", rule: "raw-color", count: 2 },
  { file: "src/editor/editable-figment.css", rule: "raw-length", count: 2 },
  { file: "src/editor/editable-figment.css", rule: "raw-radius", count: 1 },
]);
