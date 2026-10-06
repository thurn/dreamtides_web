// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildReviewPlan,
  GATE_RELATED_TEST_FILE_CAP,
  gateExecutionPlan,
  importersOf,
  importSearchNeedles,
  relatedTestRunDecision,
  reviewNeedsPreparedWorkspace,
} from "./review-plan.mjs";

describe("fast review plan", () => {
  it("prepares only when selected checks consume disposable artifacts", () => {
    expect(
      reviewNeedsPreparedWorkspace(buildReviewPlan(["docs/notes.md"])),
    ).toBe(false);
    expect(
      reviewNeedsPreparedWorkspace(buildReviewPlan(["src/state/example.ts"])),
    ).toBe(true);
  });

  it("skips executable checks for documentation-only changes", () => {
    expect(buildReviewPlan(["docs/notes.md"])).toEqual({
      changedFiles: ["docs/notes.md"],
      importerFiles: [],
      lintFiles: [],
      shouldTypecheck: false,
      testInputs: [],
    });
  });

  it("selects bounded checks for application changes", () => {
    expect(
      buildReviewPlan([
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ]),
    ).toEqual({
      changedFiles: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
      importerFiles: [],
      lintFiles: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
      shouldTypecheck: true,
      testInputs: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
    });
  });

  it("routes repository scripts to related tests without typed source lint", () => {
    expect(buildReviewPlan(["scripts/review.mjs"])).toMatchObject({
      lintFiles: [],
      shouldTypecheck: false,
      testInputs: ["scripts/review.mjs"],
    });
  });

  it("does not pass deleted files to lint or Vitest", () => {
    expect(
      buildReviewPlan(
        ["src/deleted.ts", "src/live.ts"],
        (file) => file === "src/live.ts",
      ),
    ).toMatchObject({
      changedFiles: ["src/deleted.ts", "src/live.ts"],
      lintFiles: ["src/live.ts"],
      shouldTypecheck: true,
      testInputs: [
        "src/live.ts",
      ],
    });
  });

  it("typechecks deleted production files without selecting tests", () => {
    expect(
      buildReviewPlan(["src/screens/RemovedScreen.tsx"], () => false),
    ).toMatchObject({
      lintFiles: [],
      shouldTypecheck: true,
      testInputs: [],
    });
  });
});

describe("deleted modules", () => {
  it("checks the surviving importers of a deleted module in its place", () => {
    const requested = [];
    const plan = buildReviewPlan(
      ["docs/notes.md", "scripts/lib/removed.mjs"],
      (file) => file !== "scripts/lib/removed.mjs",
      (targets) => {
        requested.push(targets);
        return ["scripts/tool.mjs", "src/state/uses-removed.ts"];
      },
    );

    expect(requested).toEqual([["scripts/lib/removed.mjs"]]);
    expect(plan).toEqual({
      changedFiles: ["docs/notes.md", "scripts/lib/removed.mjs"],
      importerFiles: ["scripts/tool.mjs", "src/state/uses-removed.ts"],
      lintFiles: ["src/state/uses-removed.ts"],
      shouldTypecheck: false,
      testInputs: ["scripts/tool.mjs", "src/state/uses-removed.ts"],
    });
  });

  it("selects an importer once when it also changed", () => {
    expect(
      buildReviewPlan(
        ["src/removed.ts", "src/caller.ts"],
        (file) => file === "src/caller.ts",
        () => ["src/caller.ts"],
      ),
    ).toMatchObject({
      importerFiles: ["src/caller.ts"],
      lintFiles: ["src/caller.ts"],
      testInputs: ["src/caller.ts"],
    });
  });

  it("ignores importers that are themselves deleted", () => {
    expect(
      buildReviewPlan(
        ["src/a.ts", "src/b.ts"],
        () => false,
        () => ["src/a.ts", "src/b.ts"],
      ),
    ).toMatchObject({ importerFiles: [], lintFiles: [], testInputs: [] });
  });

  it("looks up importers only for deleted modules", () => {
    const requested = [];
    const findImporters = (targets) => {
      requested.push(targets);
      return [];
    };
    buildReviewPlan(["src/live.ts"], () => true, findImporters);
    buildReviewPlan(["docs/removed.md"], () => false, findImporters);
    expect(requested).toEqual([]);
  });

  it("runs the capped related tests of the importers at the gate", () => {
    expect(
      gateExecutionPlan(
        buildReviewPlan(
          ["scripts/dev.mjs"],
          (file) => file !== "scripts/dev.mjs",
          () => ["scripts/dev.test.mjs"],
        ),
      ),
    ).toEqual([
      { step: "prepare", args: [] },
      { concurrent: [{ step: "typecheck", args: [] }] },
      {
        step: "test-related-capped",
        args: [
          "--max-files",
          String(GATE_RELATED_TEST_FILE_CAP),
          "scripts/dev.test.mjs",
        ],
      },
    ]);
  });
});

describe("importer resolution", () => {
  const importer = (path, source) => ({ path, source });

  it("finds static, dynamic, require and mock imports of a deleted module", () => {
    expect(
      importersOf(
        ["scripts/lib/removed.mjs"],
        [
          importer("scripts/static.mjs", 'import { a } from "./lib/removed.mjs";'),
          importer("scripts/side.mjs", "import './lib/removed.mjs';"),
          importer("scripts/dynamic.mjs", 'await import("./lib/removed.mjs");'),
          importer("scripts/required.cjs", 'require("./lib/removed.mjs");'),
          importer("scripts/lib/mocked.test.mjs", 'vi.mock("./removed.mjs");'),
          importer("scripts/reexport.mjs", 'export * from "../scripts/lib/removed.mjs";'),
        ],
      ),
    ).toEqual([
      "scripts/dynamic.mjs",
      "scripts/lib/mocked.test.mjs",
      "scripts/reexport.mjs",
      "scripts/required.cjs",
      "scripts/side.mjs",
      "scripts/static.mjs",
    ]);
  });

  it("resolves extensionless, typed-ESM and directory-index specifiers", () => {
    expect(
      importersOf(
        ["src/rules/removed.ts", "src/ui/panel/index.tsx"],
        [
          importer("src/rules/bare.ts", 'import { x } from "./removed";'),
          importer("src/rules/esm.ts", 'import { x } from "./removed.js";'),
          importer("src/ui/screen.tsx", 'import { Panel } from "./panel";'),
        ],
      ),
    ).toEqual(["src/rules/bare.ts", "src/rules/esm.ts", "src/ui/screen.tsx"]);
  });

  it("finds a stylesheet imported by a module or another stylesheet", () => {
    expect(
      importersOf(
        ["src/styles/removed.css"],
        [
          importer("src/main.tsx", 'import "./styles/removed.css";'),
          importer("src/styles/app.css", '@import "./removed.css";'),
        ],
      ),
    ).toEqual(["src/main.tsx", "src/styles/app.css"]);
  });

  it("ignores packages and same-named modules elsewhere", () => {
    expect(
      importersOf(
        ["scripts/lib/removed.mjs"],
        [
          importer("scripts/package.mjs", 'import removed from "removed";'),
          importer("scripts/sibling.mjs", 'import { a } from "./removed.mjs";'),
          importer("src/removed-user.ts", 'const name = "removed";'),
        ],
      ),
    ).toEqual([]);
  });

  it("searches for the stem, or the directory of an index module", () => {
    expect(
      importSearchNeedles([
        "scripts/lib/removed.mjs",
        "src/ui/panel/index.tsx",
        "src/rules/removed.ts",
      ]),
    ).toEqual(["panel", "removed"]);
  });
});

describe("gate review plan", () => {
  it("always prepares and typechecks, even for documentation-only commits", () => {
    expect(gateExecutionPlan(buildReviewPlan(["docs/notes.md"]))).toEqual([
      { step: "prepare", args: [] },
      { concurrent: [{ step: "typecheck", args: [] }] },
    ]);
  });

  it("lints the changed sources beside the typecheck and caps related tests", () => {
    expect(
      gateExecutionPlan(
        buildReviewPlan(["src/state/example.ts", "scripts/tool.mjs"]),
      ),
    ).toEqual([
      { step: "prepare", args: [] },
      {
        concurrent: [
          { step: "typecheck", args: [] },
          { step: "lint", args: ["src/state/example.ts"] },
        ],
      },
      {
        step: "test-related-capped",
        args: [
          "--max-files",
          String(GATE_RELATED_TEST_FILE_CAP),
          "scripts/tool.mjs",
          "src/state/example.ts",
        ],
      },
    ]);
  });
});

describe("related test cap", () => {
  it("runs a selection at or under the cap", () => {
    expect(relatedTestRunDecision(["a.test.ts", "b.test.ts"], 2)).toEqual({
      run: true,
      testFileCount: 2,
    });
    expect(relatedTestRunDecision([], 0)).toEqual({
      run: true,
      testFileCount: 0,
    });
  });

  it("skips a selection over the cap and reports its size", () => {
    expect(
      relatedTestRunDecision(["a.test.ts", "b.test.ts", "c.test.ts"], 2),
    ).toEqual({ run: false, testFileCount: 3 });
  });

  it("counts a file selected by several projects once", () => {
    expect(
      relatedTestRunDecision(["a.test.ts", "a.test.ts", "b.test.ts"], 2),
    ).toEqual({ run: true, testFileCount: 2 });
  });
});
