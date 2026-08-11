import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGeneratedTroxBundles } from "./trox-generated-check.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "trox-generated-check-test-"));
  mkdirSync(resolve(root, "src/generated/localization"), { recursive: true });
  mkdirSync(resolve(root, "localization"), { recursive: true });
  writeFileSync(resolve(root, "src/slice.ts"), "export {};\n");
  writeFileSync(resolve(root, "src/generated/localization/en-US.trox.json"), "expected\n");
  writeFileSync(resolve(root, "localization/terms.ron"), "{}\n");
  writeFileSync(resolve(root, "trox.ron"), "()\n");
  return root;
}

describe("clean Trox bundle generation", () => {
  it("accepts matching generation without mutating committed output", () => {
    const root = fixture();
    try {
      checkGeneratedTroxBundles({
        root,
        generate: (stagingRoot) => {
          writeFileSync(
            resolve(stagingRoot, "src/generated/localization/en-US.trox.json"),
            "expected\n",
          );
        },
      });
      expect(readFileSync(resolve(root, "src/generated/localization/en-US.trox.json"), "utf8"))
        .toBe("expected\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects stale bytes and a stale file set", () => {
    const root = fixture();
    try {
      expect(() => checkGeneratedTroxBundles({
        root,
        generate: (stagingRoot) => {
          writeFileSync(
            resolve(stagingRoot, "src/generated/localization/en-US.trox.json"),
            "stale\n",
          );
        },
      })).toThrow(/bundle is stale/);
      expect(() => checkGeneratedTroxBundles({ root, generate: () => {} }))
        .toThrow(/file set is stale/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
