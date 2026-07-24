import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "smol-toml";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_TUTORIAL_TOML_PATH = join(
  "data",
  "tabula",
  "tutorial.toml",
);
export const DEFAULT_TUTORIAL_JSON_PATH = join("public", "tutorial-data.json");
const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CARD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TUTORIAL_HIGHLIGHT_TAG_PATTERN = /\[\/?yellow\]/gu;
const MARKUP_LIKE_TAG_PATTERN = /\[\/?[A-Za-z][A-Za-z0-9-]*\]/gu;

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_TUTORIAL_ACTIONS";
  return error;
}

function validateInstructionMarkup(text, id) {
  const paragraphs = text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const unsupportedTag = paragraph
      .match(MARKUP_LIKE_TAG_PATTERN)
      ?.find((tag) => tag !== "[yellow]" && tag !== "[/yellow]");
    if (unsupportedTag !== undefined) {
      throw invalid(
        `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} uses unsupported highlight tag ${JSON.stringify(unsupportedTag)}.`,
      );
    }
    let highlighted = false;
    let highlightedTextStart = -1;
    for (const match of paragraph.matchAll(TUTORIAL_HIGHLIGHT_TAG_PATTERN)) {
      const tag = match[0];
      const index = match.index;
      if (tag === "[yellow]") {
        if (highlighted) {
          throw invalid(
            `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} cannot nest yellow highlights.`,
          );
        }
        highlighted = true;
        highlightedTextStart = index + tag.length;
        continue;
      }
      if (!highlighted) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} has a closing yellow tag without an opening tag.`,
        );
      }
      if (index === highlightedTextStart) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} has an empty yellow highlight.`,
        );
      }
      highlighted = false;
      highlightedTextStart = -1;
    }
    if (highlighted) {
      throw invalid(
        `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} has an unclosed yellow highlight.`,
      );
    }
  }
}

/** Validate and normalize tutorial actions from TOML or the editor API. */
export function validateTutorialActions(value) {
  if (!Array.isArray(value)) {
    throw invalid("Tutorial data must contain an actions array.");
  }
  const ids = new Set();
  return value.map((candidate, index) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw invalid(`Tutorial action ${index + 1} must be a table.`);
    }
    const { id, action, wait } = candidate;
    if (typeof id !== "string" || !ACTION_ID_PATTERN.test(id)) {
      throw invalid(
        `Tutorial action ${index + 1} has an invalid id. Use lowercase letters, numbers, and hyphens.`,
      );
    }
    if (ids.has(id)) {
      throw invalid(`Tutorial action id ${JSON.stringify(id)} is duplicated.`);
    }
    ids.add(id);
    if (typeof wait !== "number" || !Number.isFinite(wait) || wait < 0) {
      throw invalid(
        `Tutorial action ${JSON.stringify(id)} must have a non-negative wait.`,
      );
    }
    if (action === "display-speech-bubble") {
      if (
        typeof candidate.text !== "string" ||
        candidate.text.trim().length === 0
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have speech text.`,
        );
      }
      const speaker = candidate.speaker;
      if (
        speaker !== undefined &&
        speaker !== "mira" &&
        speaker !== "player" &&
        speaker !== "enemy"
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must target Mira, the player, or the enemy.`,
        );
      }
      const verticalOffset = candidate.verticalOffset;
      if (
        verticalOffset !== undefined &&
        (typeof verticalOffset !== "number" ||
          !Number.isFinite(verticalOffset))
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a finite vertical offset.`,
        );
      }
      const bubbleWidth = candidate.bubbleWidth;
      if (
        bubbleWidth !== undefined &&
        (typeof bubbleWidth !== "number" ||
          !Number.isFinite(bubbleWidth) ||
          bubbleWidth < 300 ||
          bubbleWidth > 700)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a speech bubble width from 300 to 700 pixels.`,
        );
      }
      return {
        id,
        action,
        ...(speaker === undefined ? {} : { speaker }),
        ...(verticalOffset === undefined ? {} : { verticalOffset }),
        ...(bubbleWidth === undefined ? {} : { bubbleWidth }),
        text: candidate.text,
        wait,
      };
    }
    if (action === "display-how-to-play") {
      if (
        typeof candidate.text !== "string" ||
        candidate.text.trim().length === 0
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have How to Play text.`,
        );
      }
      validateInstructionMarkup(candidate.text, id);
      const trigger =
        candidate.trigger ?? "player-turn-announcement-complete";
      if (
        trigger !== "immediate" &&
        trigger !== "player-turn-announcement-complete" &&
        trigger !== "enemy-turn-announcement-complete"
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a supported How to Play trigger.`,
        );
      }
      const companion = candidate.companion;
      if (companion !== undefined && companion !== "dreamwell-card") {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a supported How to Play companion.`,
        );
      }
      const cardWidth = candidate.cardWidth;
      if (
        cardWidth !== undefined &&
        (typeof cardWidth !== "number" ||
          !Number.isFinite(cardWidth) ||
          cardWidth < 300)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a How to Play card width of at least 300 pixels.`,
        );
      }
      return {
        id,
        action,
        trigger,
        ...(companion === undefined ? {} : { companion }),
        ...(cardWidth === undefined ? {} : { cardWidth }),
        text: candidate.text,
        wait,
      };
    }
    if (action === "animate-dreamcaller-portrait") {
      const owner = candidate.owner ?? "player";
      const pause = candidate.pause ?? 0;
      const duration = candidate.duration ?? 1.2;
      if (owner !== "player" && owner !== "enemy") {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must target the player or enemy.`,
        );
      }
      if (typeof pause !== "number" || !Number.isFinite(pause) || pause < 0) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative portrait pause.`,
        );
      }
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration < 0
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative portrait duration.`,
        );
      }
      return { id, action, owner, pause, duration, wait };
    }
    if (action === "draw-opponent-card") {
      return { id, action, wait };
    }
    if (action === "reposition-opponent-character") {
      if (
        typeof candidate.cardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.cardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify an opponent character by UUID.`,
        );
      }
      return { id, action, cardId: candidate.cardId, wait };
    }
    if (action === "reposition-player-character") {
      if (
        typeof candidate.cardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.cardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify a player character by UUID.`,
        );
      }
      if (
        typeof candidate.opposingCardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.opposingCardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify the opposing character by UUID.`,
        );
      }
      return {
        id,
        action,
        cardId: candidate.cardId,
        opposingCardId: candidate.opposingCardId,
        wait,
      };
    }
    if (action === "resolve-challenge") {
      if (
        typeof candidate.challengerCardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.challengerCardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify the challenger by UUID.`,
        );
      }
      if (
        typeof candidate.defenderCardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.defenderCardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify the defender by UUID.`,
        );
      }
      if (candidate.challengerCardId === candidate.defenderCardId) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify two different challenge characters.`,
        );
      }
      return {
        id,
        action,
        challengerCardId: candidate.challengerCardId,
        defenderCardId: candidate.defenderCardId,
        wait,
      };
    }
    if (action === "draw-dreamwell-card") {
      const owner = candidate.owner ?? "enemy";
      if (owner !== "player" && owner !== "enemy") {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must target the player or enemy.`,
        );
      }
      if (
        typeof candidate.cardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.cardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify a Dreamwell card by UUID.`,
        );
      }
      return { id, action, owner, cardId: candidate.cardId, wait };
    }
    if (action === "end-turn") {
      return { id, action, wait };
    }
    if (action === "reveal-and-play-opponent-card") {
      const revealDuration = candidate.revealDuration ?? 2;
      if (
        typeof revealDuration !== "number" ||
        !Number.isFinite(revealDuration) ||
        revealDuration < 0
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative card reveal duration.`,
        );
      }
      return { id, action, revealDuration, wait };
    }
    throw invalid(
      `Tutorial action ${JSON.stringify(id)} has unsupported action ${JSON.stringify(action)}.`,
    );
  });
}

/** Read and validate the authored tutorial sequence. */
export function readTutorialActions({
  rootDir = ROOT,
  tutorialTomlPath = DEFAULT_TUTORIAL_TOML_PATH,
} = {}) {
  const source = readFileSync(join(rootDir, tutorialTomlPath), "utf8");
  const parsed = parse(source);
  return validateTutorialActions(parsed.actions);
}

/** Stable whole-file serialization used by the editor's atomic save. */
export function serializeTutorialToml(actions) {
  const normalized = validateTutorialActions(actions);
  return `# Ordered actions played by the standalone tutorial scene.\n\n${stringify({ actions: normalized })}`;
}

/** Refresh the browser-readable generated artifact from tutorial.toml. */
export function refreshTutorialDataJson({
  rootDir = ROOT,
  tutorialTomlPath = DEFAULT_TUTORIAL_TOML_PATH,
  tutorialJsonPath = DEFAULT_TUTORIAL_JSON_PATH,
} = {}) {
  const actions = readTutorialActions({ rootDir, tutorialTomlPath });
  const absoluteJsonPath = join(rootDir, tutorialJsonPath);
  mkdirSync(dirname(absoluteJsonPath), { recursive: true });
  writeFileSync(absoluteJsonPath, `${JSON.stringify({ actions }, null, 2)}\n`);
  return { actions, path: absoluteJsonPath };
}
