import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseArguments,
  summarizePathNeighborhoods,
} from "../.llms/skills/ltodd/scripts/estimate-part-loc.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const estimatorPath = path.join(
  repositoryRoot,
  ".llms/skills/ltodd/scripts/estimate-part-loc.mjs",
);

describe("estimate-part-loc path summaries", () => {
  it("ranks parent neighborhoods by their combined physical lines", () => {
    const records = [
      { path: "src/cards/Card.tsx", lines: 80 },
      { path: "src/cards/CardText.tsx", lines: 45 },
      { path: "src/rules/resolve.ts", lines: 100 },
      { path: "src/state/store.ts", lines: 20 },
    ];

    expect(summarizePathNeighborhoods(records)).toEqual([
      { path: "src/cards/", lines: 125 },
      { path: "src/rules/resolve.ts", lines: 100 },
      { path: "src/state/store.ts", lines: 20 },
    ]);
  });

  it("uses path names as a stable tie-breaker and honors the limit", () => {
    const records = [
      { path: "src/zeta/zeta.ts", lines: 10 },
      { path: "src/alpha/alpha.ts", lines: 10 },
    ];

    expect(summarizePathNeighborhoods(records, 1)).toEqual([
      { path: "src/alpha/alpha.ts", lines: 10 },
    ]);
  });

  it("keeps concise paths and exhaustive details mutually exclusive", () => {
    expect(parseArguments(["--paths"])).toEqual({
      details: false,
      paths: true,
    });
    expect(() => parseArguments(["--paths", "--details"])).toThrow(
      "--details and --paths cannot be used together",
    );
  });

  it("keeps the checked-in part classifiers aligned with the LToDD index", () => {
    const result = spawnSync(process.execPath, [estimatorPath, "--paths"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
