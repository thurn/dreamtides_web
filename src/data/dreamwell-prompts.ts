import type {
  DreamwellCard,
  DreamwellPromptArgumentKind,
} from "./dreamwell-database";
import type { FluentMessageDescriptor } from "./localization-messages";

export type DreamwellPromptArgumentValue = string | number;

/** Semantic, JSON-safe reference persisted by a Dreamwell automation prompt. */
export interface DreamwellPromptRef {
  readonly kind: "dreamwell-prompt";
  readonly cardId: string;
  readonly promptKey: string;
  readonly arguments: Readonly<Record<string, DreamwellPromptArgumentValue>>;
  readonly part: "title" | "subtitle" | "instructions" | "choice";
  readonly choiceKey?: string;
}

/** Read-only compatibility shape accepted for prompts persisted before descriptors. */
export interface LegacyPromptText {
  readonly kind: "legacy-prompt-text";
  readonly text: string;
}

export type BattlePromptText =
  FluentMessageDescriptor | DreamwellPromptRef | LegacyPromptText;

export function dreamwellPromptRef(
  cardId: string,
  promptKey: string,
  part: DreamwellPromptRef["part"] = "title",
  arguments_: DreamwellPromptRef["arguments"] = {},
  choiceKey?: string,
): DreamwellPromptRef {
  return {
    kind: "dreamwell-prompt",
    cardId,
    promptKey,
    arguments: arguments_,
    part,
    ...(choiceKey === undefined ? {} : { choiceKey }),
  };
}

export function isDreamwellPromptRef(
  value: unknown,
): value is DreamwellPromptRef {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const candidate = value as Partial<DreamwellPromptRef>;
  return (
    candidate.kind === "dreamwell-prompt" &&
    typeof candidate.cardId === "string" &&
    typeof candidate.promptKey === "string" &&
    (candidate.part === "title" ||
      candidate.part === "subtitle" ||
      candidate.part === "instructions" ||
      candidate.part === "choice") &&
    candidate.arguments !== null &&
    typeof candidate.arguments === "object" &&
    !Array.isArray(candidate.arguments) &&
    Object.values(candidate.arguments).every(
      (argument) =>
        typeof argument === "string" ||
        (typeof argument === "number" && Number.isFinite(argument)),
    ) &&
    (candidate.part === "choice"
      ? typeof candidate.choiceKey === "string"
      : candidate.choiceKey === undefined)
  );
}

export function isLegacyPromptText(value: unknown): value is LegacyPromptText {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Partial<LegacyPromptText>).kind === "legacy-prompt-text" &&
    typeof (value as Partial<LegacyPromptText>).text === "string"
  );
}

function validArgument(
  kind: DreamwellPromptArgumentKind,
  value: unknown,
): boolean {
  switch (kind) {
    case "Count":
    case "Amount":
    case "MaximumCost":
      return (
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      );
    case "CardUuid":
      return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          value,
        )
      );
    case "Side":
      return value === "player" || value === "enemy";
  }
}

function interpolate(
  text: string,
  arguments_: DreamwellPromptRef["arguments"],
): string {
  return text.replace(/\{([a-z][a-zA-Z0-9]*)\}/gu, (_match, name: string) =>
    String(arguments_[name]),
  );
}

/** Resolve through the battle's pinned Dreamwell catalog at the presentation seam. */
export function resolveDreamwellPromptRef(
  ref: DreamwellPromptRef,
  cards: readonly DreamwellCard[],
): string {
  const card = cards.find((candidate) => candidate.id === ref.cardId);
  if (card === undefined)
    throw new Error(`Unknown Dreamwell prompt card ${ref.cardId}`);
  const prompt = (card.automation ?? []).find(
    (candidate) => candidate.key === ref.promptKey,
  );
  if (prompt === undefined) {
    throw new Error(`Unknown Dreamwell prompt ${ref.cardId}/${ref.promptKey}`);
  }
  const declared = new Map(
    (prompt.arguments ?? []).map((argument) => [argument.name, argument.kind]),
  );
  const actualNames = Object.keys(ref.arguments).sort();
  const expectedNames = [...declared.keys()].sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(
      `Dreamwell prompt arguments do not match ${ref.cardId}/${ref.promptKey}`,
    );
  }
  for (const [name, kind] of declared) {
    if (!validArgument(kind, ref.arguments[name])) {
      throw new Error(`Invalid Dreamwell prompt argument ${name}`);
    }
  }
  let text: string;
  switch (ref.part) {
    case "title":
      text = prompt.title;
      break;
    case "subtitle":
      text = prompt.subtitle;
      break;
    case "instructions":
      text = prompt.instructions;
      break;
    case "choice": {
      const choice = (prompt.choices ?? []).find(
        (candidate) => candidate.key === ref.choiceKey,
      );
      if (choice === undefined)
        throw new Error(
          `Unknown Dreamwell prompt choice ${String(ref.choiceKey)}`,
        );
      text = choice.label;
      break;
    }
  }
  return interpolate(text, ref.arguments);
}
