// Shared structural guards for validators.
//
// Ported verbatim from the CLI's `src/journey/validate/guards.ts`. These two
// helpers are the only structural narrowing the random-contract validators
// need; centralising them keeps the per-validator files free of repeated
// `typeof ... === "object"` boilerplate.
//
// Pure module: no I/O, no Node imports. Browser-safe.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringEntries(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
