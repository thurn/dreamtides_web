import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "smol-toml";
import { parseGlossarySource } from "./glossary-source.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SEMANTIC_PLAY_CARD_IDS = new Set(
  JSON.parse(
    readFileSync(
      join(ROOT, "src", "battle", "semantic-play-card-ids.json"),
      "utf8",
    ),
  ),
);
export const DEFAULT_TUTORIAL_TOML_PATH = join(
  "data",
  "tabula",
  "tutorial.toml",
);
export const DEFAULT_TUTORIAL_JSON_PATH = join("public", "tutorial-data.json");
const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CARD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TUTORIAL_HIGHLIGHT_TAG_PATTERN = /\[\/?(?:purple|yellow)\]/gu;
const MARKUP_LIKE_TAG_PATTERN = /\[\/?[A-Za-z][A-Za-z0-9-]*\]/gu;
const SUPPORTED_TUTORIAL_HIGHLIGHT_TAGS = new Set([
  "[purple]",
  "[/purple]",
  "[yellow]",
  "[/yellow]",
]);
const DEFAULT_GUIDE_SPEECH_BUBBLE_WIDTH = 700;
const DEFAULT_DREAM_AVATAR_SPEECH_BUBBLE_WIDTH = 300;
const TUTORIAL_TRIGGER_EVENTS = new Set([
  "card-seen",
  "card-play",
  "dreamwell-resolve",
  "figment-created",
]);
const GLOSSARY_IDS = new Set(
  parseGlossarySource(
    readFileSync(join(ROOT, "data", "tabula", "glossary.toml"), "utf8"),
  ).map((entry) => entry.id),
);

function validateCardDrawList(value, field) {
  if (
    !Array.isArray(value) ||
    !value.every(
      (cardId) =>
        typeof cardId === "string" && CARD_UUID_PATTERN.test(cardId),
    )
  ) {
    throw invalid(
      `Tutorial battle ${field} must be an array of card UUIDs.`,
    );
  }
  return [...value];
}

function validateTutorialBattleAiActionOverrides(value) {
  if (!Array.isArray(value)) {
    throw invalid("Tutorial battle aiActionOverrides must be an array.");
  }
  const overrides = [];
  const ids = new Set();
  for (const candidate of value) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw invalid(
        "Tutorial battle aiActionOverrides entries must be tables.",
      );
    }
    const { id, trigger, action } = candidate;
    if (typeof id !== "string" || !ACTION_ID_PATTERN.test(id)) {
      throw invalid(
        "Tutorial battle AI action override ids must use lowercase kebab-case.",
      );
    }
    if (ids.has(id)) {
      throw invalid(
        `Tutorial battle AI action override id ${JSON.stringify(id)} is duplicated.`,
      );
    }
    if (
      trigger === null ||
      typeof trigger !== "object" ||
      Array.isArray(trigger) ||
      trigger.kind !== "after-dreamwell" ||
      trigger.side !== "enemy" ||
      typeof trigger.cardId !== "string" ||
      !CARD_UUID_PATTERN.test(trigger.cardId)
    ) {
      throw invalid(
        `Tutorial battle AI action override ${JSON.stringify(id)} must have an enemy after-dreamwell trigger with a card UUID.`,
      );
    }
    if (
      action === null ||
      typeof action !== "object" ||
      Array.isArray(action) ||
      action.kind !== "play-card" ||
      typeof action.cardId !== "string" ||
      !CARD_UUID_PATTERN.test(action.cardId)
    ) {
      throw invalid(
        `Tutorial battle AI action override ${JSON.stringify(id)} must have a play-card action with a card UUID.`,
      );
    }
    ids.add(id);
    overrides.push({
      id,
      trigger: {
        kind: "after-dreamwell",
        side: "enemy",
        cardId: trigger.cardId,
      },
      action: { kind: "play-card", cardId: action.cardId },
    });
  }
  return overrides;
}

/** Validate and normalize the playable tutorial-battle draw configuration. */
export function validateTutorialBattleConfiguration(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Tutorial data must contain a battle table.");
  }
  const battle = {
    playerDraws: validateCardDrawList(value.playerDraws, "playerDraws"),
    enemyDraws: validateCardDrawList(value.enemyDraws, "enemyDraws"),
    dreamwellDraws: validateCardDrawList(
      value.dreamwellDraws,
      "dreamwellDraws",
    ),
    aiActionOverrides: validateTutorialBattleAiActionOverrides(
      value.aiActionOverrides ?? [],
    ),
  };
  if (new Set(battle.dreamwellDraws).size !== battle.dreamwellDraws.length) {
    throw invalid(
      "Tutorial battle dreamwellDraws must not repeat a card UUID.",
    );
  }
  for (const override of battle.aiActionOverrides) {
    if (!battle.dreamwellDraws.includes(override.trigger.cardId)) {
      throw invalid(
        `Tutorial battle AI action override ${JSON.stringify(override.id)} trigger cardId must appear in dreamwellDraws.`,
      );
    }
    if (!SEMANTIC_PLAY_CARD_IDS.has(override.action.cardId)) {
      throw invalid(
        `Tutorial battle AI action override ${JSON.stringify(override.id)} action cardId must have registered semantic play automation.`,
      );
    }
  }
  return battle;
}

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_TUTORIAL_ACTIONS";
  return error;
}

function validateTutorialMarkup(text, id) {
  const paragraphs = text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const unsupportedTag = paragraph
      .match(MARKUP_LIKE_TAG_PATTERN)
      ?.find((tag) => !SUPPORTED_TUTORIAL_HIGHLIGHT_TAGS.has(tag));
    if (unsupportedTag !== undefined) {
      throw invalid(
        `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} uses unsupported highlight tag ${JSON.stringify(unsupportedTag)}.`,
      );
    }
    let highlight = null;
    let highlightedTextStart = -1;
    for (const match of paragraph.matchAll(TUTORIAL_HIGHLIGHT_TAG_PATTERN)) {
      const tag = match[0];
      const index = match.index;
      const tagColor = tag.includes("purple") ? "purple" : "yellow";
      const isClosingTag =
        tag.startsWith("[/") ||
        (tagColor === "purple" && highlight === "purple");
      if (!isClosingTag) {
        if (highlight !== null) {
          throw invalid(
            `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} cannot nest ${tagColor} highlights inside ${highlight} highlights.`,
          );
        }
        highlight = tagColor;
        highlightedTextStart = index + tag.length;
        continue;
      }
      if (highlight !== tagColor) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} has a closing ${tagColor} tag without an opening tag.`,
        );
      }
      if (index === highlightedTextStart) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} has an empty ${tagColor} highlight.`,
        );
      }
      highlight = null;
      highlightedTextStart = -1;
    }
    if (highlight !== null) {
      throw invalid(
        `Tutorial action ${JSON.stringify(id)} paragraph ${paragraphIndex + 1} has an unclosed ${highlight} highlight.`,
      );
    }
  }
}

function validateTutorialSpeechBubble(value, actionId, required) {
  if (value === undefined && !required) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have a speechBubble table.`,
    );
  }
  if (typeof value.text !== "string" || value.text.trim().length === 0) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have speech bubble text.`,
    );
  }
  validateTutorialMarkup(value.text, actionId);
  const speaker = value.speaker ?? "mira";
  if (speaker !== "mira" && speaker !== "player" && speaker !== "enemy") {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must target Mira, the player, or the enemy.`,
    );
  }
  const duration = value.duration ?? 3;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have a non-negative speech bubble duration.`,
    );
  }
  const delay = value.delay ?? 0;
  if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have a non-negative delay for its speech bubble.`,
    );
  }
  const verticalOffset = value.verticalOffset ?? 0;
  if (typeof verticalOffset !== "number" || !Number.isFinite(verticalOffset)) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have a finite speech bubble vertical offset.`,
    );
  }
  const horizontalOffset = value.horizontalOffset ?? 0;
  if (
    typeof horizontalOffset !== "number" ||
    !Number.isFinite(horizontalOffset)
  ) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have a finite speech bubble horizontal offset.`,
    );
  }
  const bubbleWidth =
    value.bubbleWidth ??
    (speaker === "mira"
      ? DEFAULT_GUIDE_SPEECH_BUBBLE_WIDTH
      : DEFAULT_DREAM_AVATAR_SPEECH_BUBBLE_WIDTH);
  if (
    typeof bubbleWidth !== "number" ||
    !Number.isFinite(bubbleWidth) ||
    bubbleWidth < 300 ||
    bubbleWidth > 700
  ) {
    throw invalid(
      `Tutorial action ${JSON.stringify(actionId)} must have a speech bubble width from 300 to 700 pixels.`,
    );
  }
  return {
    speaker,
    ...(value.delay === undefined ? {} : { delay }),
    duration,
    horizontalOffset,
    verticalOffset,
    bubbleWidth,
    text: value.text,
  };
}

function validateTutorialTriggerDelay(value, events, triggerId) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(
      `Tutorial trigger ${JSON.stringify(triggerId)} must have a delay table keyed by trigger event.`,
    );
  }
  const delay = {};
  for (const [event, seconds] of Object.entries(value)) {
    if (!TUTORIAL_TRIGGER_EVENTS.has(event) || !events.includes(event)) {
      throw invalid(
        `Tutorial trigger ${JSON.stringify(triggerId)} delay must reference one of its trigger events.`,
      );
    }
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
      throw invalid(
        `Tutorial trigger ${JSON.stringify(triggerId)} must have non-negative finite event delays.`,
      );
    }
    delay[event] = seconds;
  }
  return delay;
}

function validatePersistentTutorialConfiguration(value, configurationId) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`Tutorial data must contain a ${configurationId} table.`);
  }
  const parsed = validateTutorialSpeechBubble(
    value.speechBubble,
    configurationId,
    true,
  );
  if (parsed.speaker !== "mira") {
    throw invalid(`Tutorial ${configurationId} speech bubble must target Mira.`);
  }
  return {
    speechBubble: {
      speaker: parsed.speaker,
      ...(typeof parsed.delay === "number" ? { delay: parsed.delay } : {}),
      horizontalOffset: parsed.horizontalOffset,
      verticalOffset: parsed.verticalOffset,
      bubbleWidth: parsed.bubbleWidth,
      text: parsed.text,
    },
  };
}

/** Validate the persistent Mira guidance authored for journey start. */
export function validateTutorialJourneyStartConfiguration(value) {
  return validatePersistentTutorialConfiguration(value, "journeyStart");
}

/** Validate the delayed persistent Mira guidance for the first dreamscape. */
export function validateTutorialDreamscapeConfiguration(value) {
  return validatePersistentTutorialConfiguration(value, "dreamscape");
}

/** Validate persistent Mira guidance for a first-visit site tutorial. */
export function validateTutorialSiteConfiguration(value, siteId) {
  return validatePersistentTutorialConfiguration(value, siteId);
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
      const speechBubble = validateTutorialSpeechBubble(
        candidate.speechBubble,
        id,
        true,
      );
      return {
        id,
        action,
        speechBubble,
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
      validateTutorialMarkup(candidate.text, id);
      const trigger = candidate.trigger ?? "player-turn-announcement-complete";
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
    if (action === "animate-dream-avatar-portrait") {
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
      if (
        typeof candidate.cardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.cardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify the drawn opponent card by UUID.`,
        );
      }
      return { id, action, cardId: candidate.cardId, wait };
    }
    if (action === "draw-card") {
      const { owner, reason } = candidate;
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
          `Tutorial action ${JSON.stringify(id)} must identify the drawn card by UUID.`,
        );
      }
      if (reason !== "dreamwell-effect" && reason !== "turn-draw") {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify a supported draw reason.`,
        );
      }
      return {
        id,
        action,
        owner,
        cardId: candidate.cardId,
        reason,
        wait,
      };
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
        typeof candidate.blockerCardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.blockerCardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify the blocker by UUID.`,
        );
      }
      if (candidate.challengerCardId === candidate.blockerCardId) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify two different challenge characters.`,
        );
      }
      return {
        id,
        action,
        challengerCardId: candidate.challengerCardId,
        blockerCardId: candidate.blockerCardId,
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
      const revealDuration = candidate.revealDuration;
      if (
        revealDuration !== undefined &&
        (typeof revealDuration !== "number" ||
          !Number.isFinite(revealDuration) ||
          revealDuration < 0)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative Dreamwell reveal duration.`,
        );
      }
      return {
        id,
        action,
        owner,
        cardId: candidate.cardId,
        ...(revealDuration === undefined ? {} : { revealDuration }),
        wait,
      };
    }
    if (action === "end-turn") {
      const speechBubble = validateTutorialSpeechBubble(
        candidate.speechBubble,
        id,
        false,
      );
      return {
        id,
        action,
        ...(speechBubble === undefined ? {} : { speechBubble }),
        wait,
      };
    }
    if (action === "reveal-and-play-opponent-card") {
      if (
        typeof candidate.cardId !== "string" ||
        !CARD_UUID_PATTERN.test(candidate.cardId)
      ) {
        throw invalid(
          `Tutorial action ${JSON.stringify(id)} must identify the revealed opponent card by UUID.`,
        );
      }
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
      const speechBubble = validateTutorialSpeechBubble(
        candidate.speechBubble,
        id,
        false,
      );
      return {
        id,
        action,
        cardId: candidate.cardId,
        revealDuration,
        ...(speechBubble === undefined ? {} : { speechBubble }),
        wait,
      };
    }
    throw invalid(
      `Tutorial action ${JSON.stringify(id)} has unsupported action ${JSON.stringify(action)}.`,
    );
  });
}

/** Validate and normalize supplemental first-occurrence battle tutorials. */
export function validateTutorialTriggers(value) {
  if (!Array.isArray(value)) {
    throw invalid("Tutorial data must contain a triggers array.");
  }
  const ids = new Set();
  return value.map((candidate, index) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw invalid(`Tutorial trigger ${index + 1} must be a table.`);
    }
    const { id } = candidate;
    if (typeof id !== "string" || !ACTION_ID_PATTERN.test(id)) {
      throw invalid(
        `Tutorial trigger ${index + 1} has an invalid id. Use lowercase letters, numbers, and hyphens.`,
      );
    }
    if (ids.has(id)) {
      throw invalid(`Tutorial trigger id ${JSON.stringify(id)} is duplicated.`);
    }
    ids.add(id);
    if (
      !Array.isArray(candidate.on) ||
      candidate.on.length === 0 ||
      candidate.on.some((event) => !TUTORIAL_TRIGGER_EVENTS.has(event)) ||
      new Set(candidate.on).size !== candidate.on.length
    ) {
      throw invalid(
        `Tutorial trigger ${JSON.stringify(id)} must list unique supported events.`,
      );
    }
    const priority = candidate.priority ?? 100;
    if (typeof priority !== "number" || !Number.isFinite(priority)) {
      throw invalid(`Tutorial trigger ${JSON.stringify(id)} must have a finite priority.`);
    }
    const triggerDelay = validateTutorialTriggerDelay(
      candidate.delay,
      candidate.on,
      id,
    );
    const speechBubble = validateTutorialSpeechBubble(
      { ...candidate, delay: 0 },
      id,
      true,
    );
    if (speechBubble.duration <= 0) {
      throw invalid(`Tutorial trigger ${JSON.stringify(id)} must have a positive duration.`);
    }
    const { delay: _normalizedScalarDelay, ...triggerSpeechBubble } =
      speechBubble;
    const match = candidate.match;
    if (match === null || typeof match !== "object" || Array.isArray(match)) {
      throw invalid(`Tutorial trigger ${JSON.stringify(id)} must have a match table.`);
    }
    let normalizedMatch;
    if (match.kind === "glossary") {
      if (typeof match.id !== "string" || !GLOSSARY_IDS.has(match.id)) {
        throw invalid(
          `Tutorial trigger ${JSON.stringify(id)} must reference an existing glossary id.`,
        );
      }
      normalizedMatch = { kind: "glossary", id: match.id };
    } else if (match.kind === "card-type" && match.cardType === "event") {
      normalizedMatch = { kind: "card-type", cardType: "event" };
    } else if (match.kind === "any") {
      normalizedMatch = { kind: "any" };
    } else {
      throw invalid(`Tutorial trigger ${JSON.stringify(id)} has an unsupported matcher.`);
    }
    if (
      normalizedMatch.kind === "any" &&
      (candidate.on.length !== 1 || candidate.on[0] !== "figment-created")
    ) {
      throw invalid(
        `Tutorial trigger ${JSON.stringify(id)} may use the any matcher only for figment creation.`,
      );
    }
    return {
      id,
      on: [...candidate.on],
      priority,
      match: normalizedMatch,
      ...triggerSpeechBubble,
      ...(Object.keys(triggerDelay).length === 0
        ? {}
        : { delay: triggerDelay }),
    };
  });
}

/** Read and validate the complete authored tutorial configuration. */
export function readTutorialConfiguration({
  rootDir = ROOT,
  tutorialTomlPath = DEFAULT_TUTORIAL_TOML_PATH,
} = {}) {
  const source = readFileSync(join(rootDir, tutorialTomlPath), "utf8");
  const parsed = parse(source);
  return {
    journeyStart: validateTutorialJourneyStartConfiguration(
      parsed.journeyStart,
    ),
    dreamscape: validateTutorialDreamscapeConfiguration(parsed.dreamscape),
    draft: validateTutorialSiteConfiguration(parsed.draft, "draft"),
    dreamsignRevelation: validateTutorialSiteConfiguration(
      parsed.dreamsignRevelation,
      "dreamsign-revelation",
    ),
    actions: validateTutorialActions(parsed.actions),
    triggers: validateTutorialTriggers(parsed.triggers ?? []),
    battle: validateTutorialBattleConfiguration(parsed.battle),
  };
}

/** Read only the ordered action sequence for existing editor consumers. */
export function readTutorialActions(options = {}) {
  return readTutorialConfiguration(options).actions;
}

/** Stable whole-file serialization used by the editor's atomic save. */
export function serializeTutorialToml(
  actions,
  triggers,
  battle,
  journeyStart,
  dreamscape,
  draft,
  dreamsignRevelation,
) {
  const normalized = validateTutorialActions(actions);
  const normalizedTriggers = validateTutorialTriggers(triggers);
  const normalizedBattle = validateTutorialBattleConfiguration(battle);
  const normalizedJourneyStart =
    validateTutorialJourneyStartConfiguration(journeyStart);
  const normalizedDreamscape =
    validateTutorialDreamscapeConfiguration(dreamscape);
  const normalizedDraft =
    validateTutorialSiteConfiguration(draft, "draft");
  const normalizedDreamsignRevelation =
    validateTutorialSiteConfiguration(
      dreamsignRevelation,
      "dreamsign-revelation",
    );
  return `# Ordered actions and first-occurrence battle tutorials.\n\n${stringify({
    journeyStart: normalizedJourneyStart,
    dreamscape: normalizedDreamscape,
    draft: normalizedDraft,
    dreamsignRevelation: normalizedDreamsignRevelation,
    battle: normalizedBattle,
    actions: normalized,
    triggers: normalizedTriggers,
  })}`;
}

/** Refresh the browser-readable generated artifact from tutorial.toml. */
export function refreshTutorialDataJson({
  rootDir = ROOT,
  tutorialTomlPath = DEFAULT_TUTORIAL_TOML_PATH,
  tutorialJsonPath = DEFAULT_TUTORIAL_JSON_PATH,
} = {}) {
  const {
    journeyStart,
    dreamscape,
    draft,
    dreamsignRevelation,
    actions,
    triggers,
    battle,
  } =
    readTutorialConfiguration({
      rootDir,
      tutorialTomlPath,
    });
  const absoluteJsonPath = join(rootDir, tutorialJsonPath);
  mkdirSync(dirname(absoluteJsonPath), { recursive: true });
  writeFileSync(
    absoluteJsonPath,
    `${JSON.stringify({
      journeyStart,
      dreamscape,
      draft,
      dreamsignRevelation,
      actions,
      triggers,
      battle,
    }, null, 2)}\n`,
  );
  return {
    journeyStart,
    dreamscape,
    draft,
    dreamsignRevelation,
    actions,
    triggers,
    battle,
    path: absoluteJsonPath,
  };
}
