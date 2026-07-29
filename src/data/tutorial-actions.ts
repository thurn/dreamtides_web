import { isCardId } from "../types/card-identity";
import type {
  TutorialAction,
  TutorialBattleConfiguration,
  TutorialConfiguration,
  TutorialDreamscapeConfiguration,
  TutorialJourneyStartConfiguration,
  TutorialSiteConfiguration,
  TutorialSpeechBubble,
  TutorialTriggerDefinition,
  TutorialTriggerDelay,
  TutorialTriggerEvent,
} from "../types/tutorial";
import { parseTutorialBattleAiActionOverrides } from "../types/tutorial-ai-action-overrides";
import semanticPlayCardIds from "../battle/semantic-play-card-ids.json";
import { glossaryEntry } from "./glossary";
import { parseTutorialInstructionMarkup } from "./tutorial-instruction-markup";

const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const DEFAULT_GUIDE_SPEECH_BUBBLE_WIDTH = 700;
const DEFAULT_DREAM_AVATAR_SPEECH_BUBBLE_WIDTH = 300;
const SEMANTIC_PLAY_CARD_IDS: ReadonlySet<string> = new Set(
  semanticPlayCardIds,
);

function parseCardDrawList(
  value: unknown,
  field: "playerDraws" | "enemyDraws" | "dreamwellDraws",
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Tutorial battle ${field} must be an array of card UUIDs.`,
    );
  }
  const cardIds: string[] = [];
  for (const cardId of value as unknown[]) {
    if (typeof cardId !== "string" || !isCardId(cardId)) {
      throw new Error(
        `Tutorial battle ${field} must be an array of card UUIDs.`,
      );
    }
    cardIds.push(cardId);
  }
  return cardIds;
}

/** Validate untrusted playable tutorial-battle draw configuration. */
export function parseTutorialBattleConfiguration(
  value: unknown,
): TutorialBattleConfiguration {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tutorial data must contain a battle table.");
  }
  const record = value as Record<string, unknown>;
  const battle = {
    playerDraws: parseCardDrawList(record.playerDraws, "playerDraws"),
    enemyDraws: parseCardDrawList(record.enemyDraws, "enemyDraws"),
    dreamwellDraws: parseCardDrawList(
      record.dreamwellDraws,
      "dreamwellDraws",
    ),
    aiActionOverrides: parseTutorialBattleAiActionOverrides(
      record.aiActionOverrides ?? [],
    ),
  };
  if (new Set(battle.dreamwellDraws).size !== battle.dreamwellDraws.length) {
    throw new Error("Tutorial battle dreamwellDraws must not repeat a card UUID.");
  }
  for (const override of battle.aiActionOverrides) {
    if (!battle.dreamwellDraws.includes(override.trigger.cardId)) {
      throw new Error(
        `Tutorial battle AI action override ${JSON.stringify(override.id)} trigger cardId must appear in dreamwellDraws.`,
      );
    }
    if (!SEMANTIC_PLAY_CARD_IDS.has(override.action.cardId)) {
      throw new Error(
        `Tutorial battle AI action override ${JSON.stringify(override.id)} action cardId must have registered semantic play automation.`,
      );
    }
  }
  return battle;
}

function parseTutorialSpeechBubble(
  value: unknown,
  actionId: string,
  required: boolean,
): TutorialSpeechBubble | undefined {
  if (value === undefined && !required) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have a speechBubble table.`,
    );
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text !== "string" || record.text.trim().length === 0) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have speech bubble text.`,
    );
  }
  parseTutorialInstructionMarkup(record.text);
  const speaker = record.speaker ?? "mira";
  if (speaker !== "mira" && speaker !== "player" && speaker !== "enemy") {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must target Mira, the player, or the enemy.`,
    );
  }
  const duration = record.duration ?? 3;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have a non-negative speech bubble duration.`,
    );
  }
  const delay = record.delay ?? 0;
  if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have a non-negative delay for its speech bubble.`,
    );
  }
  const verticalOffset = record.verticalOffset ?? 0;
  if (typeof verticalOffset !== "number" || !Number.isFinite(verticalOffset)) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have a finite speech bubble vertical offset.`,
    );
  }
  const horizontalOffset = record.horizontalOffset ?? 0;
  if (
    typeof horizontalOffset !== "number" ||
    !Number.isFinite(horizontalOffset)
  ) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have a finite speech bubble horizontal offset.`,
    );
  }
  const bubbleWidth =
    record.bubbleWidth ??
    (speaker === "mira"
      ? DEFAULT_GUIDE_SPEECH_BUBBLE_WIDTH
      : DEFAULT_DREAM_AVATAR_SPEECH_BUBBLE_WIDTH);
  if (
    typeof bubbleWidth !== "number" ||
    !Number.isFinite(bubbleWidth) ||
    bubbleWidth < 300 ||
    bubbleWidth > 700
  ) {
    throw new Error(
      `Tutorial action ${JSON.stringify(actionId)} must have a speech bubble width from 300 to 700 pixels.`,
    );
  }
  return {
    speaker,
    ...(record.delay === undefined ? {} : { delay }),
    duration,
    horizontalOffset,
    verticalOffset,
    bubbleWidth,
    text: record.text,
  };
}

function parseTutorialTriggerDelay(
  value: unknown,
  events: readonly TutorialTriggerEvent[],
  triggerId: string,
): TutorialTriggerDelay {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Tutorial trigger ${JSON.stringify(triggerId)} must have a delay table keyed by trigger event.`,
    );
  }
  const delay: Partial<Record<TutorialTriggerEvent, number>> = {};
  for (const [event, seconds] of Object.entries(value)) {
    if (
      !TUTORIAL_TRIGGER_EVENTS.has(event as TutorialTriggerEvent) ||
      !events.includes(event as TutorialTriggerEvent)
    ) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(triggerId)} delay must reference one of its trigger events.`,
      );
    }
    if (
      typeof seconds !== "number" ||
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(triggerId)} must have non-negative finite event delays.`,
      );
    }
    delay[event as TutorialTriggerEvent] = seconds;
  }
  return delay;
}

function parsePersistentTutorialConfiguration(
  value: unknown,
  configurationId: "journeyStart" | "dreamscape" | "draft" | "dreamsign-revelation",
): TutorialJourneyStartConfiguration {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tutorial data must contain a ${configurationId} table.`);
  }
  const record = value as Record<string, unknown>;
  const parsed = parseTutorialSpeechBubble(
    record.speechBubble,
    configurationId,
    true,
  );
  if (parsed === undefined || parsed.speaker !== "mira") {
    throw new Error(`Tutorial ${configurationId} speech bubble must target Mira.`);
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
export function parseTutorialJourneyStartConfiguration(
  value: unknown,
): TutorialJourneyStartConfiguration {
  return parsePersistentTutorialConfiguration(value, "journeyStart");
}

/** Validate the delayed persistent Mira guidance for the first dreamscape. */
export function parseTutorialDreamscapeConfiguration(
  value: unknown,
): TutorialDreamscapeConfiguration {
  return parsePersistentTutorialConfiguration(value, "dreamscape");
}

/** Validate persistent Mira guidance for a first-visit site tutorial. */
export function parseTutorialSiteConfiguration(
  value: unknown,
  siteId: "draft" | "dreamsign-revelation",
): TutorialSiteConfiguration {
  return parsePersistentTutorialConfiguration(value, siteId);
}

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
      const speechBubble = parseTutorialSpeechBubble(
        record.speechBubble,
        id,
        true,
      );
      if (speechBubble === undefined) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a speechBubble table.`,
        );
      }
      return {
        id,
        action: "display-speech-bubble",
        speechBubble,
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
      const trigger = record.trigger ?? "player-turn-announcement-complete";
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
    if (record.action === "animate-dream-avatar-portrait") {
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
        action: "animate-dream-avatar-portrait",
        owner,
        pause,
        duration,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "draw-opponent-card") {
      if (typeof record.cardId !== "string" || !isCardId(record.cardId)) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the drawn opponent card by UUID.`,
        );
      }
      return {
        id,
        action: "draw-opponent-card",
        cardId: record.cardId,
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "draw-card") {
      const owner = record.owner;
      if (owner !== "player" && owner !== "enemy") {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must target the player or enemy.`,
        );
      }
      if (typeof record.cardId !== "string" || !isCardId(record.cardId)) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the drawn card by UUID.`,
        );
      }
      const reason = record.reason;
      if (reason !== "dreamwell-effect" && reason !== "turn-draw") {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify a supported draw reason.`,
        );
      }
      return {
        id,
        action: "draw-card",
        owner,
        cardId: record.cardId,
        reason,
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
        typeof record.blockerCardId !== "string" ||
        !isCardId(record.blockerCardId)
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the blocker by UUID.`,
        );
      }
      if (record.challengerCardId === record.blockerCardId) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify two different challenge characters.`,
        );
      }
      return {
        id,
        action: "resolve-challenge",
        challengerCardId: record.challengerCardId,
        blockerCardId: record.blockerCardId,
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
      const revealDuration = record.revealDuration;
      if (
        revealDuration !== undefined &&
        (typeof revealDuration !== "number" ||
          !Number.isFinite(revealDuration) ||
          revealDuration < 0)
      ) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must have a non-negative Dreamwell reveal duration.`,
        );
      }
      return {
        id,
        action: "draw-dreamwell-card",
        owner,
        cardId: record.cardId,
        ...(revealDuration === undefined ? {} : { revealDuration }),
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "end-turn") {
      const speechBubble = parseTutorialSpeechBubble(
        record.speechBubble,
        id,
        false,
      );
      return {
        id,
        action: "end-turn",
        ...(speechBubble === undefined ? {} : { speechBubble }),
        wait,
      } satisfies TutorialAction;
    }
    if (record.action === "reveal-and-play-opponent-card") {
      if (typeof record.cardId !== "string" || !isCardId(record.cardId)) {
        throw new Error(
          `Tutorial action ${JSON.stringify(id)} must identify the revealed opponent card by UUID.`,
        );
      }
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
      const speechBubble = parseTutorialSpeechBubble(
        record.speechBubble,
        id,
        false,
      );
      return {
        id,
        action: "reveal-and-play-opponent-card",
        cardId: record.cardId,
        revealDuration,
        ...(speechBubble === undefined ? {} : { speechBubble }),
        wait,
      } satisfies TutorialAction;
    }

    throw new Error(
      `Tutorial action ${JSON.stringify(id)} has unsupported action ${JSON.stringify(record.action)}.`,
    );
  });
}

const TUTORIAL_TRIGGER_EVENTS: ReadonlySet<TutorialTriggerEvent> = new Set([
  "card-seen",
  "card-play",
  "dreamwell-resolve",
  "figment-created",
]);

/** Validate untrusted generated supplemental tutorial trigger data. */
export function parseTutorialTriggers(
  value: unknown,
): readonly TutorialTriggerDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Tutorial data must contain a triggers array.");
  }
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new Error(`Tutorial trigger ${String(index + 1)} must be a table.`);
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== "string" || !ACTION_ID_PATTERN.test(record.id)) {
      throw new Error(
        `Tutorial trigger ${String(index + 1)} has an invalid id. Use lowercase letters, numbers, and hyphens.`,
      );
    }
    if (ids.has(record.id)) {
      throw new Error(`Tutorial trigger id ${JSON.stringify(record.id)} is duplicated.`);
    }
    ids.add(record.id);
    if (
      !Array.isArray(record.on) ||
      record.on.length === 0 ||
      !record.on.every(
        (event): event is TutorialTriggerEvent =>
          typeof event === "string" &&
          TUTORIAL_TRIGGER_EVENTS.has(event as TutorialTriggerEvent),
      ) ||
      new Set(record.on).size !== record.on.length
    ) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} must list unique supported events.`,
      );
    }
    const priority = record.priority ?? 100;
    if (typeof priority !== "number" || !Number.isFinite(priority)) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} must have a finite priority.`,
      );
    }
    const triggerDelay = parseTutorialTriggerDelay(
      record.delay,
      record.on,
      record.id,
    );
    const speechBubble = parseTutorialSpeechBubble(
      { ...record, delay: 0 },
      record.id,
      true,
    );
    if (speechBubble === undefined) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} must define a speech bubble.`,
      );
    }
    if (speechBubble.duration <= 0) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} must have a positive duration.`,
      );
    }
    const { delay: _normalizedScalarDelay, ...triggerSpeechBubble } =
      speechBubble;
    if (
      record.match === null ||
      typeof record.match !== "object" ||
      Array.isArray(record.match)
    ) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} must have a match table.`,
      );
    }
    const match = record.match as Record<string, unknown>;
    let parsedMatch: TutorialTriggerDefinition["match"];
    if (match.kind === "glossary") {
      if (typeof match.id !== "string" || glossaryEntry(match.id) === undefined) {
        throw new Error(
          `Tutorial trigger ${JSON.stringify(record.id)} must reference an existing glossary id.`,
        );
      }
      parsedMatch = { kind: "glossary", id: match.id };
    } else if (match.kind === "card-type") {
      if (match.cardType !== "event") {
        throw new Error(
          `Tutorial trigger ${JSON.stringify(record.id)} must use the supported event card type.`,
        );
      }
      parsedMatch = { kind: "card-type", cardType: "event" };
    } else if (match.kind === "any") {
      parsedMatch = { kind: "any" };
    } else {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} has an unsupported matcher.`,
      );
    }
    if (
      parsedMatch.kind === "any" &&
      (record.on.length !== 1 || record.on[0] !== "figment-created")
    ) {
      throw new Error(
        `Tutorial trigger ${JSON.stringify(record.id)} may use the any matcher only for figment creation.`,
      );
    }
    return {
      id: record.id,
      on: [...record.on],
      priority,
      match: parsedMatch,
      ...triggerSpeechBubble,
      ...(Object.keys(triggerDelay).length === 0
        ? {}
        : { delay: triggerDelay }),
    };
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
  return (await loadTutorialConfiguration(fetcher, source)).actions;
}

/** Load both the scripted sequence and supplemental battle triggers. */
export async function loadTutorialConfiguration(
  fetcher: typeof fetch = fetch,
  source: TutorialActionLoadSource = defaultTutorialActionLoadSource(),
): Promise<TutorialConfiguration> {
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
  const record = body as Record<string, unknown>;
  return {
    journeyStart: parseTutorialJourneyStartConfiguration(record.journeyStart),
    dreamscape: parseTutorialDreamscapeConfiguration(record.dreamscape),
    draft: parseTutorialSiteConfiguration(record.draft, "draft"),
    dreamsignRevelation: parseTutorialSiteConfiguration(
      record.dreamsignRevelation,
      "dreamsign-revelation",
    ),
    actions: parseTutorialActions(record.actions),
    triggers: parseTutorialTriggers(record.triggers ?? []),
    battle: parseTutorialBattleConfiguration(record.battle),
  };
}
