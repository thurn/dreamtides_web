// @vitest-environment node

import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDevelopmentTroxBundles,
  checkTroxSource,
} from "./trox-source-workspace.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "trox-source-workspace-test-"));
  mkdirSync(resolve(root, "src"), { recursive: true });
  mkdirSync(resolve(root, "data"), { recursive: true });
  mkdirSync(resolve(root, "localization"), { recursive: true });
  writeFileSync(resolve(root, "src/message.ts"), 'tx("Current English", "Fixture.");\n');
  writeFileSync(resolve(root, "data/catalog.ron"), '[Tx("Card copy")]\n');
  writeFileSync(resolve(root, "localization/report.csv"), "committed,stale\n");
  writeFileSync(resolve(root, "trox.ron"), "()\n");
  return root;
}

describe("isolated Trox source workspace", () => {
  it("extracts and checks without changing committed localization artifacts", () => {
    const root = fixture();
    const commands = [];
    try {
      checkTroxSource({
        root,
        run: (arguments_, { cwd }) => {
          commands.push(arguments_);
          if (arguments_[0] === "extract") {
            writeFileSync(resolve(cwd, "localization/report.csv"), "fresh\n");
          }
        },
      });
      expect(commands).toEqual([
        ["extract"],
        ["check", "--deny", "warnings"],
      ]);
      expect(readFileSync(resolve(root, "localization/report.csv"), "utf8"))
        .toBe("committed,stale\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns current development bundles from the isolated catalog", () => {
    const root = fixture();
    try {
      const bundles = buildDevelopmentTroxBundles({
        root,
        run: (arguments_, { cwd }) => {
          if (arguments_[0] !== "bundle") return;
          mkdirSync(resolve(cwd, ".generated/localization/bundles"), { recursive: true });
          for (const locale of ["en-US", "ar", "es", "ja", "ru"]) {
            writeFileSync(
              resolve(cwd, `.generated/localization/bundles/${locale}.trox.json`),
              `${locale}:Current English`,
            );
          }
        },
      });
      expect(bundles["en-US"]).toBe("en-US:Current English");
      expect(bundles.ar).toBe("ar:Current English");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
