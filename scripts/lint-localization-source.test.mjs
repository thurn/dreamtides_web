// @vitest-environment node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_STRING_WORKAROUND_WARNING } from "./validate-localization-source.mjs";

const SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "lint-localization-source.mjs",
);

describe("localization grammar lint", () => {
  it("rejects article and plural workarounds with actionable diagnostics", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "-"], {
      encoding: "utf8",
      input: `
unsafe-article = Choose a { $categoryName } card.
unsafe-plural = { $count } { -card }
`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(UI_STRING_WORKAROUND_WARNING);
    expect(result.stderr).toContain("Pass a semantic discriminator");
    expect(result.stderr).toContain("Use a Fluent plural selector");
    expect(result.stderr).toContain("<stdin>:unsafe-article");
    expect(result.stderr).toContain("<stdin>:unsafe-plural");
  });

  it("accepts grammar expressed through Fluent selectors", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "-"], {
      encoding: "utf8",
      input: `
safe-article =
    { $kind ->
        [event] Choose an Event Card.
       *[character] Choose a Character Card.
    }
safe-plural =
    { $count ->
        [one] { $count } { -card(number: "one") }
       *[other] { $count } { -card(number: "other") }
    }
`,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
