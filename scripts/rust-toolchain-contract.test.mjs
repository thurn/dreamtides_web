// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";

const root = process.cwd();
const workflowsDirectory = join(root, ".github", "workflows");
const setupAction = "actions-rust-lang/setup-rust-toolchain@";
const manifestInputs = new Set(["components", "target", "toolchain"]);

function setupActionContractViolations(source) {
  const lines = source.split("\n");
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const setupMatch = lines[index].match(
      /^(\s*)-\s+uses:\s*["']?actions-rust-lang\/setup-rust-toolchain@/,
    );
    if (setupMatch === null) continue;

    const stepIndent = setupMatch[1].length;
    let checkoutPrecedesSetup = false;
    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previousLine = lines[previousIndex];
      const previousTrimmed = previousLine.trim();
      if (previousTrimmed === "" || previousTrimmed.startsWith("#")) continue;

      const previousIndent = previousLine.length - previousLine.trimStart().length;
      if (previousIndent < stepIndent) break;
      if (
        previousIndent === stepIndent &&
        /^-\s+uses:\s*["']?actions\/checkout@/.test(previousTrimmed)
      ) {
        checkoutPrecedesSetup = true;
        break;
      }
    }
    if (!checkoutPrecedesSetup) {
      violations.push({ issue: "checkout must precede Rust setup", line: index + 1 });
    }

    for (let stepIndex = index + 1; stepIndex < lines.length; stepIndex += 1) {
      const line = lines[stepIndex];
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      const indent = line.length - line.trimStart().length;
      if (indent <= stepIndent) break;

      const key = trimmed.match(/^([a-z-]+)\s*:/)?.[1];
      if (key !== undefined && manifestInputs.has(key)) {
        violations.push({ issue: `${key} overrides the manifest`, line: stepIndex + 1 });
      }
    }
  }

  return violations;
}

describe("Rust toolchain contract", () => {
  it("declares every component required by the local review command", () => {
    const reviewSource = readFileSync(join(root, "scripts", "review.mjs"), "utf8");
    expect(reviewSource).toContain('if (step === "rust-format-check")');
    expect(reviewSource).toMatch(/["']cargo["'][\s\S]*?["']fmt["']/);

    const toolchain = parse(
      readFileSync(join(root, "rust-toolchain.toml"), "utf8"),
    );
    expect(toolchain.toolchain?.components).toContain("rustfmt");
  });

  it("keeps GitHub Rust setup steps on the repository toolchain manifest", () => {
    const workflowFiles = readdirSync(workflowsDirectory)
      .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
      .sort();
    const rustWorkflows = workflowFiles
      .map((file) => ({
        file,
        source: readFileSync(join(workflowsDirectory, file), "utf8"),
      }))
      .filter(({ source }) => source.includes(setupAction));

    expect(rustWorkflows.length).toBeGreaterThan(0);
    for (const { file, source } of rustWorkflows) {
      expect(setupActionContractViolations(source), file).toEqual([]);
    }
  });

  it("runs the exhaustive local review command in the primary CI workflow", () => {
    const checksWorkflow = readFileSync(
      join(workflowsDirectory, "checks.yml"),
      "utf8",
    );
    expect(checksWorkflow).toContain("npm run review:full");
  });

  it("detects workflow inputs that bypass or extend the manifest", () => {
    const workflow = `
steps:
  - uses: actions/checkout@v7
  - uses: actions-rust-lang/setup-rust-toolchain@v1
    with:
      toolchain: stable
      components: rustfmt
  - run: npm test
`;

    expect(setupActionContractViolations(workflow)).toEqual([
      { issue: "toolchain overrides the manifest", line: 6 },
      { issue: "components overrides the manifest", line: 7 },
    ]);
  });

  it("detects Rust setup before the repository manifest is checked out", () => {
    const workflow = `
steps:
  - uses: actions-rust-lang/setup-rust-toolchain@v1
  - uses: actions/checkout@v7
`;

    expect(setupActionContractViolations(workflow)).toEqual([
      { issue: "checkout must precede Rust setup", line: 3 },
    ]);
  });
});
