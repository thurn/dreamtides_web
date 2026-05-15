// Validation result contract.
//
// Ported verbatim from the CLI's `src/journey/validate/result.ts`. The
// discriminated-union shape mirrors the CLI byte-for-byte so call sites can
// pattern-match on `result.ok` identically.
//
// `shapes/types.ts` re-exports `ValidationResult` from this module; downstream
// callers (shape plugins, validators) import the shared alias rather than
// re-declaring it.
//
// Pure module: no I/O, no Node imports. Browser-safe.

export type ValidationResult =
  | { ok: true }
  | { ok: false; rule: string; message: string; debug?: Record<string, unknown> };

export function fail(
  rule: string,
  message: string,
  debug?: Record<string, unknown>,
): ValidationResult {
  return { ok: false, rule, message, ...(debug ? { debug } : {}) };
}
