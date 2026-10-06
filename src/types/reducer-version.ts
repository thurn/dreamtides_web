declare const legacyReducerVersionBrand: unique symbol;

export type KnownReducerVersion =
  | `dreamtides-coop-v${number}`
  | "fixture"
  | "test"
  | "v1"
  | "build-abc";
type LegacyReducerVersion = string & {
  readonly [legacyReducerVersionBrand]: "ReducerVersion";
};
export type ReducerVersion = KnownReducerVersion | LegacyReducerVersion;

export function parseReducerVersion(value: unknown): ReducerVersion {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Reducer version must be non-empty.");
  }
  return value as ReducerVersion;
}
