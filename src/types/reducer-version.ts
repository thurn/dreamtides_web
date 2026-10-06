declare const reducerVersionBrand: unique symbol;

export type KnownReducerVersion =
  | `dreamtides-coop-v${number}`
  | "fixture"
  | "test";
type ParsedReducerVersion = string & {
  readonly [reducerVersionBrand]: "ReducerVersion";
};
export type ReducerVersion = KnownReducerVersion | ParsedReducerVersion;

export function parseReducerVersion(value: unknown): ReducerVersion {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Reducer version must be non-empty.");
  }
  return value as ReducerVersion;
}
