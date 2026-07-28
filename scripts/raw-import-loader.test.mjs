import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { load } from "./raw-import-loader.mjs";

let scratchDir;

afterEach(async () => {
  if (scratchDir !== undefined) {
    await rm(scratchDir, { recursive: true, force: true });
    scratchDir = undefined;
  }
});

describe("raw import loader", () => {
  it("exports the exact contents of a synthetic raw file import", async () => {
    scratchDir = await mkdtemp(join(tmpdir(), "raw-import-loader-"));
    const fixturePath = join(scratchDir, "fixture.toml");
    const fixtureSource = 'term = "Support"\ndefinition = "Adjacent bonus."\n';
    await writeFile(fixturePath, fixtureSource);

    const loaded = await load(
      `${pathToFileURL(fixturePath).href}?raw`,
      {},
      () => {
        throw new Error("raw imports must not reach the next loader");
      },
    );

    expect(loaded).toEqual({
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(fixtureSource)};`,
    });
  });

  it("delegates imports without the raw query", async () => {
    const delegated = { format: "module", source: "export default 1;" };
    const loaded = await load(
      "file:///tmp/example.mjs",
      { conditions: ["node"] },
      (url, context) => {
        expect(url).toBe("file:///tmp/example.mjs");
        expect(context).toEqual({ conditions: ["node"] });
        return delegated;
      },
    );

    expect(loaded).toBe(delegated);
  });
});
