import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function gitOutput(rootDir, args) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function runtimeJsonPaths(rootDir) {
  const publicDir = path.join(rootDir, "public");
  if (!existsSync(publicDir)) return [];

  const paths = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        paths.push(absolutePath);
      }
    }
  };
  visit(publicDir);
  return paths.sort();
}

/**
 * Resolve the coop reducer identity from the checked-in commit, every local
 * source change, and the generated JSON catalogs that the browser fold reads.
 */
export function resolveBuildHash(rootDir) {
  let revision = "dev";
  let workingTreeDiff = "";
  let untrackedPaths = [];

  try {
    revision = gitOutput(rootDir, ["rev-parse", "--short=12", "HEAD"]).trim();
    workingTreeDiff = gitOutput(rootDir, [
      "diff",
      "--binary",
      "HEAD",
      "--",
      ".",
      ":(exclude)public",
    ]);
    untrackedPaths = gitOutput(rootDir, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ])
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch {
    // A source archive has no Git metadata; the runtime catalogs still give it
    // a deterministic identity instead of collapsing every archive to "dev".
  }

  const digest = createHash("sha256");
  digest.update("revision\0");
  digest.update(revision);
  digest.update("\0working-tree\0");
  digest.update(workingTreeDiff);

  for (const relativePath of untrackedPaths) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    digest.update("\0untracked\0");
    digest.update(relativePath);
    digest.update("\0");
    digest.update(readFileSync(absolutePath));
  }

  for (const absolutePath of runtimeJsonPaths(rootDir)) {
    digest.update("\0runtime-json\0");
    digest.update(path.relative(rootDir, absolutePath));
    digest.update("\0");
    digest.update(readFileSync(absolutePath));
  }

  return `${revision}-${digest.digest("hex").slice(0, 12)}`;
}
