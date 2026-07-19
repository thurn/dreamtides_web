import type { TutorialAction } from "../types/tutorial";

const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** Validate untrusted generated or event-log tutorial action data. */
export function parseTutorialActions(value: unknown): readonly TutorialAction[] {
  if (!Array.isArray(value)) {
    throw new Error("Tutorial data must contain an actions array.");
  }

  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Tutorial action ${String(index + 1)} must be a table.`);
    }
    const record = candidate as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || !ACTION_ID_PATTERN.test(id)) {
      throw new Error(
        `Tutorial action ${String(index + 1)} has an invalid id. Use lowercase letters, numbers, and hyphens.`,
      );
    }
    if (ids.has(id)) {
      throw new Error(`Tutorial action id ${JSON.stringify(id)} is duplicated.`);
    }
    ids.add(id);

    const wait = record.wait;
    if (typeof wait !== "number" || !Number.isFinite(wait) || wait < 0) {
      throw new Error(`Tutorial action ${JSON.stringify(id)} must have a non-negative wait.`);
    }

    if (record.action === "display-speech-bubble") {
      if (typeof record.text !== "string" || record.text.trim().length === 0) {
        throw new Error(`Tutorial action ${JSON.stringify(id)} must have speech text.`);
      }
      return {
        id,
        action: "display-speech-bubble",
        text: record.text,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "animate-dreamcaller-portrait") {
      const owner = record.owner ?? "player";
      const pause = record.pause ?? 0;
      if (owner !== "player" && owner !== "enemy") {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must target the player or enemy.`,
        );
      }
      if (typeof pause !== "number" || !Number.isFinite(pause) || pause < 0) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative portrait pause.`,
        );
      }
      return {
        id,
        action: "animate-dreamcaller-portrait",
        owner,
        pause,
        wait,
      } satisfies TutorialAction;
    }

    throw new Error(
      `Tutorial action ${JSON.stringify(id)} has unsupported action ${JSON.stringify(record.action)}.`,
    );
  });
}

export type TutorialActionLoadSource = "editor" | "runtime";

function defaultTutorialActionLoadSource(): TutorialActionLoadSource {
  return import.meta.env.DEV ? "editor" : "runtime";
}

/** Load the authored tutorial sequence from the live editor or built runtime data. */
export async function loadTutorialActions(
  fetcher: typeof fetch = fetch,
  source: TutorialActionLoadSource = defaultTutorialActionLoadSource(),
): Promise<readonly TutorialAction[]> {
  const path =
    source === "editor" ? "/api/editor/tutorial" : "/tutorial-data.json";
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Failed to load tutorial actions (${String(response.status)}).`);
  }
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Tutorial data response must be an object.");
  }
  return parseTutorialActions((body as Record<string, unknown>).actions);
}
