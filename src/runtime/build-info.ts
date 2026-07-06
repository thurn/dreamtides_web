const buildGitSha = import.meta.env.VITE_BUILD_GIT_SHA?.trim();

export const BUILD_GIT_SHA =
  buildGitSha !== undefined && buildGitSha !== "" ? buildGitSha : "unknown";
