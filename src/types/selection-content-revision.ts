declare const selectionContentRevisionBrand: unique symbol;

/** Digest of every catalog value that can affect deterministic reward selection. */
export type SelectionContentRevision = string & {
  readonly [selectionContentRevisionBrand]: "SelectionContentRevision";
};

/** Decode a persisted revision or brand one computed at the content boundary. */
export function parseSelectionContentRevision(
  value: unknown,
): SelectionContentRevision {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Selection content revision must be a non-empty string.");
  }
  return value as SelectionContentRevision;
}
