// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";

const root = process.cwd();

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
});
