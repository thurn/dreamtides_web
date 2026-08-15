declare const buildGitShaBrand: unique symbol;

export type BuildGitSha = string & {
  readonly [buildGitShaBrand]: "BuildGitSha";
};

export type BuildGitRevision = BuildGitSha | "unknown";

const BUILD_GIT_SHA_PATTERN = /^[0-9a-f]{6,64}$/u;

export function isBuildGitSha(value: unknown): value is BuildGitSha {
  return typeof value === "string" && BUILD_GIT_SHA_PATTERN.test(value);
}

export function parseBuildGitSha(value: unknown): BuildGitSha {
  if (!isBuildGitSha(value)) {
    throw new Error("Build Git SHA must be 6-64 lowercase hexadecimal digits.");
  }
  return value;
}

export function buildGitRevisionFromUnknown(
  value: unknown,
): BuildGitRevision | null {
  if (value === "unknown") return value;
  return isBuildGitSha(value) ? value : null;
}
