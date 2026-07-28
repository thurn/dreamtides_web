import { describe, expect, it } from "vitest";
import { QA_SCENES } from "../src/runtime/qa-scenes.ts";
import {
  CORE_SCENE_IDS,
  SMOKE_SCENE_IDS,
  UsageError,
  VIEWPORT_PRESETS,
  parseDesktopScreenshotArgs,
  resolveSceneSelection,
  resolveViewportSelection,
  validateScenePresets,
} from "./desktop-screenshot-config.mjs";

const REGISTERED_SCENES = [
  ...new Set([...CORE_SCENE_IDS, ...SMOKE_SCENE_IDS, "extra-scene"]),
].map((id) => ({ id, label: `Label for ${id}` }));

describe("parseDesktopScreenshotArgs", () => {
  it("defaults to the core presets, seed 42, and non-default port", () => {
    expect(parseDesktopScreenshotArgs([])).toMatchObject({
      scenes: [],
      viewports: [],
      scenePreset: "core",
      viewportPreset: "core",
      baseUrl: "http://localhost:5178",
      port: 5178,
      seed: "42",
    });
  });

  it("accepts repeatable targeted scenes and viewports", () => {
    expect(
      parseDesktopScreenshotArgs([
        "--scene",
        "atlas",
        "--scene",
        "draft,battle-playable",
        "--viewport",
        "1366x768",
        "--viewport",
        "desktop-1920x1080",
        "--seed",
        "7",
      ]),
    ).toMatchObject({
      scenes: ["atlas", "draft", "battle-playable"],
      viewports: ["1366x768", "desktop-1920x1080"],
      seed: "7",
    });
  });

  it.each([
    [["--scene", "atlas", "--smoke"], "--scene cannot be combined"],
    [
      ["--viewport", "1366x768", "--extended"],
      "--viewport cannot be combined",
    ],
    [["--start", "--url", "http://localhost:5178"], "mutually exclusive"],
    [["--url", "http://localhost:5173"], "port 5173 is reserved"],
    [["--port", "5173"], "port 5173 is reserved"],
    [["--seed=-1"], "non-negative integer"],
    [["--scene-preset", "tiny"], "unknown scene preset"],
  ])("rejects invalid or mutually exclusive options", (argv, message) => {
    expect(() => parseDesktopScreenshotArgs(argv)).toThrow(message);
  });
});

describe("scene preset expansion", () => {
  it("expands the smoke preset in declarative order", () => {
    const options = parseDesktopScreenshotArgs(["--smoke"]);
    expect(
      resolveSceneSelection(options, REGISTERED_SCENES).map(
        (scene) => scene.id,
      ),
    ).toEqual(SMOKE_SCENE_IDS);
  });

  it("deduplicates targeted scenes without reordering them", () => {
    const options = parseDesktopScreenshotArgs([
      "--scene",
      "draft",
      "--scene",
      "atlas",
      "--scene",
      "DRAFT",
    ]);
    expect(
      resolveSceneSelection(options, REGISTERED_SCENES).map(
        (scene) => scene.id,
      ),
    ).toEqual(["draft", "atlas"]);
  });

  it("expands full to every registered QA scene in registry order", () => {
    const options = parseDesktopScreenshotArgs([
      "--scene-preset",
      "full",
    ]);
    expect(
      resolveSceneSelection(options, QA_SCENES).map((scene) => scene.id),
    ).toEqual(QA_SCENES.map((scene) => scene.id));
  });

  it("fails clearly when a declarative preset drifts from the registry", () => {
    expect(() => validateScenePresets(["atlas"])).toThrow(
      /unregistered QA scenes/,
    );
  });

  it("fails clearly for an unknown targeted scene", () => {
    const options = parseDesktopScreenshotArgs([
      "--scene",
      "not-registered",
    ]);
    expect(() =>
      resolveSceneSelection(options, REGISTERED_SCENES),
    ).toThrow(UsageError);
  });
});

describe("viewport preset expansion", () => {
  it("expands the extended preset in stable declarative order at 1×", () => {
    const options = parseDesktopScreenshotArgs(["--extended"]);
    const viewports = resolveViewportSelection(options);
    expect(viewports.map((viewport) => viewport.id)).toEqual(
      VIEWPORT_PRESETS.extended,
    );
    expect(viewports.every((viewport) => viewport.dpr === 1)).toBe(true);
  });

  it("accepts dimension aliases and deduplicates canonical viewport ids", () => {
    const options = parseDesktopScreenshotArgs([
      "--viewport",
      "1366x768",
      "--viewport",
      "desktop-1920x1080",
      "--viewport",
      "desktop-1366x768",
    ]);
    expect(
      resolveViewportSelection(options).map((viewport) => viewport.id),
    ).toEqual(["desktop-1366x768", "desktop-1920x1080"]);
  });
});
