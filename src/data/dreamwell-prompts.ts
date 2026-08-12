import type {
  DreamwellCard,
  DreamwellPromptArgumentKind,
} from "./dreamwell-database";

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

/** Stable semantic identity for application-owned battle prompt copy. */
export const BUILT_IN_BATTLE_PROMPT_KINDS = [
  "discover-character",
  "confirm-yes",
  "confirm-skip",
  "generic",
  "generic-subtitle",
  "generic-option",
  "switch-side",
] as const;

export type BuiltInBattlePromptRef =
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "discover-character";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "confirm-yes";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "confirm-skip";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "generic";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "generic-subtitle";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "generic-option";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "switch-side";
      readonly side: "player" | "enemy";
    };

export type BattlePromptText =
  | BuiltInBattlePromptRef
  | DreamwellPromptRef
  | LegacyPromptText;

export function builtInBattlePromptRef(
  prompt: Exclude<BuiltInBattlePromptRef["prompt"], "switch-side">,
): BuiltInBattlePromptRef;
export function builtInBattlePromptRef(
  prompt: "switch-side",
  side: "player" | "enemy",
): BuiltInBattlePromptRef;
export function builtInBattlePromptRef(
  prompt: BuiltInBattlePromptRef["prompt"],
  side?: "player" | "enemy",
): BuiltInBattlePromptRef {
  if (prompt === "switch-side") {
    if (side !== "player" && side !== "enemy") {
      throw new TypeError("A switch-side battle prompt requires a valid side");
    }
    return { kind: "built-in-battle-prompt", prompt, side };
  }
  if (side !== undefined) {
    throw new TypeError("Only a switch-side battle prompt accepts a side");
  }
  return { kind: "built-in-battle-prompt", prompt };
}

function isExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    Object.keys(value).sort().join("\u0000") ===
    [...expectedKeys].sort().join("\u0000")
  );
}

export function isBuiltInBattlePromptRef(
  value: unknown,
): value is BuiltInBattlePromptRef {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { kind?: unknown }).kind !== "built-in-battle-prompt"
  ) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.prompt === "switch-side") {
    return (
      isExactRecord(value, ["kind", "prompt", "side"]) &&
      (candidate.side === "player" || candidate.side === "enemy")
    );
  }
  return (
    isExactRecord(value, ["kind", "prompt"]) &&
    (candidate.prompt === "discover-character" ||
      candidate.prompt === "confirm-yes" ||
      candidate.prompt === "confirm-skip" ||
      candidate.prompt === "generic" ||
      candidate.prompt === "generic-subtitle" ||
      candidate.prompt === "generic-option")
  );
}

/** Normalize the exact built-in descriptor shapes persisted by v24 imports. */
export function builtInBattlePromptRefFromV24Descriptor(
  value: unknown,
): BuiltInBattlePromptRef | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const descriptor = value as Record<string, unknown>;
  const withoutVariables: Readonly<
    Record<
      string,
      Exclude<BuiltInBattlePromptRef["prompt"], "switch-side">
    >
  > = {
    "battle-prompt-discover-character": "discover-character",
    "battle-prompt-confirm-yes": "confirm-yes",
    "battle-prompt-confirm-skip": "confirm-skip",
    "battle-prompt-generic": "generic",
    "battle-prompt-generic-subtitle": "generic-subtitle",
    "battle-prompt-generic-option": "generic-option",
  };
  if (
    typeof descriptor.id === "string" &&
    Object.prototype.hasOwnProperty.call(withoutVariables, descriptor.id) &&
    isExactRecord(value, ["id"])
  ) {
    return builtInBattlePromptRef(withoutVariables[descriptor.id]);
  }
  if (
    descriptor.id === "battle-prompt-switch-side" &&
    isExactRecord(value, ["id", "variables"]) &&
    isExactRecord(descriptor.variables, ["side"]) &&
    (descriptor.variables.side === "player" ||
      descriptor.variables.side === "enemy")
  ) {
    return builtInBattlePromptRef("switch-side", descriptor.variables.side);
  }
  return null;
}

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
