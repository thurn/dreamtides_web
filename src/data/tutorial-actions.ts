import { isCardId } from "../types/card-identity";
import type { TutorialAction } from "../types/tutorial";
import { parseTutorialInstructionMarkup } from "./tutorial-instruction-markup";

const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** Validate untrusted generated or event-log tutorial action data. */
export function parseTutorialActions(
  value: unknown,
): readonly TutorialAction[] {
  if (!Array.isArray(value)) {
    throw new Error("Tutorial data must contain an actions array.");
  }

  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
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
      throw new Error(
        `Tutorial action id ${JSON.stringify(id)} is duplicated.`,
      );
    }
    ids.add(id);

    const wait = record.wait;
    if (typeof wait !== "number" || !Number.isFinite(wait) || wait < 0) {
      throw new Error(
        `Tutorial action ${JSON.stringify(id)} must have a non-negative wait.`,
      );
    }

    if (record.action === "display-speech-bubble") {
      if (typeof record.text !== "string" || record.text.trim().length === 0) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have speech text.`,
        );
      }
      const speaker = record.speaker;
      if (
        speaker !== undefined &&
        speaker !== "mira" &&
        speaker !== "player" &&
        speaker !== "enemy"
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must target Mira, the player, or the enemy.`,
        );
      }
      const verticalOffset = record.verticalOffset;
      if (
        verticalOffset !== undefined &&
        (typeof verticalOffset !== "number" ||
          !Number.isFinite(verticalOffset))
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a finite vertical offset.`,
        );
      }
      return {
        id,
        action: "display-speech-bubble",
        ...(speaker === undefined ? {} : { speaker }),
        ...(verticalOffset === undefined ? {} : { verticalOffset }),
        text: record.text,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "display-how-to-play") {
      if (typeof record.text !== "string" || record.text.trim().length === 0) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have How to Play text.`,
        );
      }
      parseTutorialInstructionMarkup(record.text);
      const trigger =
        record.trigger ?? "player-turn-announcement-complete";
      if (
        trigger !== "immediate" &&
        trigger !== "player-turn-announcement-complete" &&
        trigger !== "enemy-turn-announcement-complete"
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a supported How to Play trigger.`,
        );
      }
      const companion = record.companion;
      if (companion !== undefined && companion !== "dreamwell-card") {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a supported How to Play companion.`,
        );
      }
      const cardWidth = record.cardWidth;
      if (
        cardWidth !== undefined &&
        (typeof cardWidth !== "number" ||
          !Number.isFinite(cardWidth) ||
          cardWidth < 300)
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a How to Play card width of at least 300 pixels.`,
        );
      }
      return {
        id,
        action: "display-how-to-play",
        trigger,
        ...(companion === undefined ? {} : { companion }),
        ...(cardWidth === undefined ? {} : { cardWidth }),
        text: record.text,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "animate-dreamcaller-portrait") {
      const owner = record.owner ?? "player";
      const pause = record.pause ?? 0;
      const duration = record.duration ?? 1.2;
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
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration < 0
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative portrait duration.`,
        );
      }
      return {
        id,
        action: "animate-dreamcaller-portrait",
        owner,
        pause,
        duration,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "draw-opponent-card") {
      return {
        id,
        action: "draw-opponent-card",
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "reposition-opponent-character") {
      if (typeof record.cardId !== "string" || !isCardId(record.cardId)) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify an opponent character by UUID.`,
        );
      }
      return {
        id,
        action: "reposition-opponent-character",
        cardId: record.cardId,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "reposition-player-character") {
      if (typeof record.cardId !== "string" || !isCardId(record.cardId)) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify a player character by UUID.`,
        );
      }
      if (
        typeof record.opposingCardId !== "string" ||
        !isCardId(record.opposingCardId)
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the opposing character by UUID.`,
        );
      }
      return {
        id,
        action: "reposition-player-character",
        cardId: record.cardId,
        opposingCardId: record.opposingCardId,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "resolve-challenge") {
      if (
        typeof record.challengerCardId !== "string" ||
        !isCardId(record.challengerCardId)
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the challenger by UUID.`,
        );
      }
      if (
        typeof record.defenderCardId !== "string" ||
        !isCardId(record.defenderCardId)
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the defender by UUID.`,
        );
      }
      if (record.challengerCardId === record.defenderCardId) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify two different challenge characters.`,
        );
      }
      return {
        id,
        action: "resolve-challenge",
        challengerCardId: record.challengerCardId,
        defenderCardId: record.defenderCardId,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "draw-dreamwell-card") {
      const owner = record.owner ?? "enemy";
      if (owner !== "player" && owner !== "enemy") {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must target the player or enemy.`,
        );
      }
      if (typeof record.cardId !== "string" || !isCardId(record.cardId)) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify a Dreamwell card by UUID.`,
        );
      }
      return {
        id,
        action: "draw-dreamwell-card",
        owner,
        cardId: record.cardId,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "end-turn") {
      return {
        id,
        action: "end-turn",
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "reveal-and-play-opponent-card") {
      const revealDuration = record.revealDuration ?? 2;
      if (
        typeof revealDuration !== "number" ||
        !Number.isFinite(revealDuration) ||
        revealDuration < 0
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative card reveal duration.`,
        );
      }
      return {
        id,
        action: "reveal-and-play-opponent-card",
        revealDuration,
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
    throw new Error(
      `Failed to load tutorial actions (${String(response.status)}).`,
    );
  }
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Tutorial data response must be an object.");
  }
  return parseTutorialActions((body as Record<string, unknown>).actions);
}
