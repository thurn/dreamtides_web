import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import {
  readTutorialActions,
  refreshTutorialDataJson,
  serializeTutorialToml,
  validateTutorialActions,
} from "./tutorial-data.mjs";

const FIXTURE_ACTIONS = [
  {
    id: "opening-line",
    action: "display-speech-bubble",
    text: "First line.\nSecond line.",
    wait: 1.5,
  },
];

describe("tutorial data", () => {
  it("round-trips typed actions through TOML and generated JSON", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "tutorial-data-"));
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "tabula", "tutorial.toml"),
      serializeTutorialToml(FIXTURE_ACTIONS),
    );

    expect(readTutorialActions({ rootDir })).toEqual(FIXTURE_ACTIONS);
    const result = refreshTutorialDataJson({ rootDir });
    expect(result.actions).toEqual(FIXTURE_ACTIONS);
    expect(
      JSON.parse(readFileSync(join(rootDir, "public", "tutorial-data.json"), "utf8")),
    ).toEqual({ actions: FIXTURE_ACTIONS });
    expect(parse(serializeTutorialToml(FIXTURE_ACTIONS)).actions).toEqual(
      FIXTURE_ACTIONS,
    );
  });

  it("rejects duplicate ids, blank speech, and negative waits", () => {
    expect(() => validateTutorialActions([...FIXTURE_ACTIONS, ...FIXTURE_ACTIONS])).toThrow(
      /duplicated/u,
    );
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[0], text: "  " }]),
    ).toThrow(/speech text/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[0], wait: -1 }]),
    ).toThrow(/non-negative wait/u);
  });
});
