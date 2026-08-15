import {
  buildGitRevisionFromUnknown,
  type BuildGitRevision,
} from "../types/build-identity";

const buildGitSha = import.meta.env.VITE_BUILD_GIT_SHA?.trim();

export const BUILD_GIT_SHA: BuildGitRevision =
  buildGitRevisionFromUnknown(buildGitSha) ?? "unknown";
