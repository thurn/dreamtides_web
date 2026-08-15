declare const toolIdentityBrand: unique symbol;

type ToolIdentity<Name extends string> = string & {
  readonly [toolIdentityBrand]: Name;
};

export type GameDataDatasetId = ToolIdentity<"GameDataDatasetId">;
export type ParityScenarioId = ToolIdentity<"ParityScenarioId">;
export type SceneComparisonId = ToolIdentity<"SceneComparisonId">;

const MANIFEST_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

function parseManifestIdentity<Name extends string>(
  value: unknown,
  label: Name,
): ToolIdentity<Name> {
  if (typeof value !== "string" || !MANIFEST_ID.test(value)) {
    throw new Error(`${label} must be a lowercase manifest identity.`);
  }
  return value as ToolIdentity<Name>;
}

export function parseGameDataDatasetId(value: unknown): GameDataDatasetId {
  return parseManifestIdentity(value, "GameDataDatasetId");
}

export function parseParityScenarioId(value: unknown): ParityScenarioId {
  return parseManifestIdentity(value, "ParityScenarioId");
}

export function parseSceneComparisonId(value: unknown): SceneComparisonId {
  return parseManifestIdentity(value, "SceneComparisonId");
}
