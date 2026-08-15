// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBuildGitSha } from "../types/build-identity";
import type { JourneyState } from "../types/journey";
import {
  JOURNEY_SAVE_FILE_FORMAT,
  JOURNEY_SAVE_FILE_VERSION,
  chooseJourneySaveFile,
  createJourneySaveFile,
  downloadJourneySaveFile,
  parseJourneySaveFile,
  readJourneySaveFile,
  serializeJourneySaveFile,
} from "./journey-save-files";

const JOURNEY_STATE = {
  screen: { type: "atlas" },
  seed: 42,
  essence: 17,
} as unknown as JourneyState;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("journey save files", () => {
  it("serializes and parses the versioned portable envelope", () => {
    const save = createJourneySaveFile("  Before Atlas  ", JOURNEY_STATE, {
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: parseBuildGitSha("abc123"),
    });

    expect(save).toEqual({
      format: JOURNEY_SAVE_FILE_FORMAT,
      version: JOURNEY_SAVE_FILE_VERSION,
      name: "Before Atlas",
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: parseBuildGitSha("abc123"),
      journeyState: JOURNEY_STATE,
    });
    expect(parseJourneySaveFile(serializeJourneySaveFile(save))).toEqual({
      name: "Before Atlas",
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: parseBuildGitSha("abc123"),
      journeyState: JOURNEY_STATE,
    });
  });

  it("accepts existing developer filesystem save records", () => {
    expect(
      parseJourneySaveFile(
        JSON.stringify({
          name: "legacy save",
          savedAt: "2026-06-01T00:00:00.000Z",
          journeyState: JOURNEY_STATE,
        }),
      ),
    ).toEqual({
      name: "legacy save",
      savedAt: "2026-06-01T00:00:00.000Z",
      buildGitSha: null,
      journeyState: JOURNEY_STATE,
    });
  });

  it("reports malformed, unrelated, incomplete, and future-version files", () => {
    expect(() => parseJourneySaveFile("<!doctype html>")).toThrow(
      "This journey save is not valid JSON.",
    );
    expect(() => parseJourneySaveFile(JSON.stringify({ hello: "world" }))).toThrow(
      "This file is not a complete Dreamtides journey save.",
    );
    expect(() =>
      parseJourneySaveFile(
        JSON.stringify({
          format: "other-game",
          version: 1,
          name: "save",
          savedAt: "now",
          journeyState: {},
        }),
      ),
    ).toThrow("This file is not a Dreamtides journey save.");
    expect(() =>
      parseJourneySaveFile(
        JSON.stringify({
          format: JOURNEY_SAVE_FILE_FORMAT,
          version: 2,
          name: "save",
          savedAt: "now",
          journeyState: {},
        }),
      ),
    ).toThrow("Journey save version 2 is not supported.");
  });

  it("downloads a sanitized JSON filename without retaining a DOM node", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:journey-save");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const result = downloadJourneySaveFile("Wild / Run!", JOURNEY_STATE);

    expect(result.fileName).toBe("dreamtides-journey-wild-run.json");
    expect(result.save.journeyState).toBe(JOURNEY_STATE);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:journey-save");
    expect(document.querySelector("a")).toBeNull();
  });

  it("reads the selected file and preserves its local filename", async () => {
    const save = createJourneySaveFile("Portable", JOURNEY_STATE, {
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: parseBuildGitSha("abc123"),
    });
    const imported = await readJourneySaveFile({
      name: "portable.json",
      text: () => Promise.resolve(serializeJourneySaveFile(save)),
    });

    expect(imported).toMatchObject({
      fileName: "portable.json",
      name: "Portable",
      buildGitSha: parseBuildGitSha("abc123"),
      journeyState: JOURNEY_STATE,
    });
  });

  it("resolves a browser file choice and treats cancellation as no action", async () => {
    const save = createJourneySaveFile("Chosen", JOURNEY_STATE, {
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: parseBuildGitSha("abc123"),
    });
    const selectedFile = {
      name: "chosen.json",
      text: () => Promise.resolve(serializeJourneySaveFile(save)),
    };
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      Object.defineProperty(this, "files", {
        configurable: true,
        value: [selectedFile],
      });
      this.dispatchEvent(new Event("change"));
    });

    await expect(chooseJourneySaveFile()).resolves.toMatchObject({
      fileName: "chosen.json",
      name: "Chosen",
      journeyState: JOURNEY_STATE,
    });
    expect(document.querySelector('input[type="file"]')).toBeNull();

    vi.restoreAllMocks();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      this.dispatchEvent(new Event("cancel"));
    });
    await expect(chooseJourneySaveFile()).resolves.toBeNull();
  });
});
