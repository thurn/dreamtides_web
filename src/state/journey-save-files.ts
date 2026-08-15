import { BUILD_GIT_SHA } from "../runtime/build-info";
import type { JourneyState } from "../types/journey";

export const JOURNEY_SAVE_FILE_FORMAT = "dreamtides-journey";
export const JOURNEY_SAVE_FILE_VERSION = 1;

/** Versioned, portable journey snapshot written by the browser download flow. */
export interface JourneySaveFile {
  format: typeof JOURNEY_SAVE_FILE_FORMAT;
  version: typeof JOURNEY_SAVE_FILE_VERSION;
  name: string;
  savedAt: string;
  buildGitSha: string;
  journeyState: JourneyState;
}

/** A parsed journey save paired with the local filename it came from. */
export interface ImportedJourneySave {
  fileName: string;
  name: string;
  savedAt: string;
  buildGitSha: string | null;
  journeyState: Readonly<Record<string, unknown>>;
}

/** Diagnostic screen label from an untrusted serialized journey snapshot. */
export function serializedJourneyScreenType(
  journeyState: Readonly<Record<string, unknown>>,
): string {
  const screen = journeyState.screen;
  return isRecord(screen) && typeof screen.type === "string"
    ? screen.type
    : "unknown";
}

interface JourneySaveOptions {
  savedAt?: string;
  buildGitSha?: string;
}

/** Builds the stable JSON envelope used for portable journey save files. */
export function createJourneySaveFile(
  name: string,
  journeyState: JourneyState,
  options: JourneySaveOptions = {},
): JourneySaveFile {
  const normalized = name.trim();
  if (normalized === "") {
    throw new Error("A journey save needs a name.");
  }
  return {
    format: JOURNEY_SAVE_FILE_FORMAT,
    version: JOURNEY_SAVE_FILE_VERSION,
    name: normalized,
    savedAt: options.savedAt ?? new Date().toISOString(),
    buildGitSha: options.buildGitSha ?? BUILD_GIT_SHA,
    journeyState,
  };
}

/** Serializes a journey save with stable, human-readable formatting. */
export function serializeJourneySaveFile(save: JourneySaveFile): string {
  return `${JSON.stringify(save, null, 2)}\n`;
}

/**
 * Parses a downloaded journey save. Developer filesystem records pre-dating
 * the portable envelope are accepted so existing saves can be imported.
 */
export function parseJourneySaveFile(
  text: string,
): Omit<ImportedJourneySave, "fileName"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This journey save is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("This file is not a Dreamtides journey save.");
  }

  if ("format" in parsed || "version" in parsed) {
    if (parsed.format !== JOURNEY_SAVE_FILE_FORMAT) {
      throw new Error("This file is not a Dreamtides journey save.");
    }
    if (parsed.version !== JOURNEY_SAVE_FILE_VERSION) {
      throw new Error(
        `Journey save version ${String(parsed.version)} is not supported.`,
      );
    }
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
  const journeyState = parsed.journeyState;
  if (
    name === "" ||
    savedAt === "" ||
    !isRecord(journeyState)
  ) {
    throw new Error("This file is not a complete Dreamtides journey save.");
  }

  return {
    name,
    savedAt,
    buildGitSha:
      typeof parsed.buildGitSha === "string" ? parsed.buildGitSha : null,
    journeyState,
  };
}

/** Downloads the current journey and returns the resulting filename. */
export function downloadJourneySaveFile(
  name: string,
  journeyState: JourneyState,
): { fileName: string; save: JourneySaveFile } {
  const save = createJourneySaveFile(name, journeyState);
  const fileName = `dreamtides-journey-${fileSlug(save.name)}.json`;
  const blob = new Blob([serializeJourneySaveFile(save)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { fileName, save };
}

/** Reads and parses one JSON file chosen outside the browser. */
export async function readJourneySaveFile(
  file: Pick<File, "name" | "text">,
): Promise<ImportedJourneySave> {
  const parsed = parseJourneySaveFile(await file.text());
  return { ...parsed, fileName: file.name };
}

/**
 * Opens the browser file chooser for a journey JSON file. Cancellation is a
 * normal null result; malformed or unsupported files reject with useful copy.
 */
export function chooseJourneySaveFile(): Promise<ImportedJourneySave | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    let settled = false;

    const finish = (
      result: ImportedJourneySave | null,
      error?: unknown,
    ): void => {
      if (settled) return;
      settled = true;
      input.remove();
      if (error === undefined) resolve(result);
      else {
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to read the selected journey save."),
        );
      }
    };

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (file === undefined) {
          finish(null);
          return;
        }
        void readJourneySaveFile(file)
          .then((save) => finish(save))
          .catch((error: unknown) => finish(null, error));
      },
      { once: true },
    );
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 60) || "save"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
