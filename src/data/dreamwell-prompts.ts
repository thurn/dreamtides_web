import type { DreamwellCard } from "./dreamwell-database";
import {
  dreamwellCardIdFromUnknown,
  dreamwellChoiceKeyFromUnknown,
  dreamwellPromptKeyFromUnknown,
  type DreamwellCardId,
  type DreamwellChoiceKey,
  type DreamwellPromptKey,
} from "../types/identifiers";
import { formatNumber } from "../runtime/format-number";

export type DreamwellPromptArgumentValue = string | number;
export type DreamwellPromptArgumentKind =
  | "Count"
  | "Amount"
  | "MaximumCost"
  | "CardUuid"
  | "Side";

/** Semantic, JSON-safe reference persisted by a Dreamwell automation prompt. */
export interface DreamwellPromptRef {
  readonly kind: "dreamwell-prompt";
  readonly cardId: DreamwellCardId;
  readonly promptKey: DreamwellPromptKey;
  readonly arguments: Readonly<Record<string, DreamwellPromptArgumentValue>>;
  readonly part: "title" | "subtitle" | "instructions" | "choice";
  readonly choiceKey?: DreamwellChoiceKey;
}

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

export type BattlePromptText = BuiltInBattlePromptRef | DreamwellPromptRef;

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
  expectedProperties: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    Object.keys(value).sort().join("\u0000") ===
    [...expectedProperties].sort().join("\u0000")
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

export function dreamwellPromptRef(
  cardId: DreamwellCardId,
  promptKey: DreamwellPromptKey,
  part: DreamwellPromptRef["part"] = "title",
  arguments_: DreamwellPromptRef["arguments"] = {},
  choiceKey?: DreamwellChoiceKey,
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
    dreamwellCardIdFromUnknown(candidate.cardId) !== null &&
    dreamwellPromptKeyFromUnknown(candidate.promptKey) !== null &&
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
      ? dreamwellChoiceKeyFromUnknown(candidate.choiceKey) !== null
      : candidate.choiceKey === undefined)
  );
}

type PromptMessage = (
  arguments_: DreamwellPromptRef["arguments"],
) => string;

export interface DreamwellAutomationPromptDefinition {
  readonly key: string;
  readonly title: PromptMessage;
  readonly subtitle: PromptMessage;
  readonly instructions: PromptMessage;
  readonly choices?: readonly {
    readonly key: string;
    readonly label: PromptMessage;
  }[];
  readonly arguments?: readonly {
    readonly name: string;
    readonly kind: DreamwellPromptArgumentKind;
  }[];
}

export type DreamwellPromptDefinitions = Readonly<
  Record<string, readonly DreamwellAutomationPromptDefinition[]>
>;

function numericArgument(
  arguments_: DreamwellPromptRef["arguments"],
  name: string,
): number {
  const value = arguments_[name];
  if (typeof value !== "number") {
    throw new Error(`Invalid Dreamwell prompt argument ${name}`);
  }
  return value;
}

/** Application-owned prompt copy keyed by stable Dreamwell card UUID. */
const DREAMWELL_AUTOMATION_PROMPTS: DreamwellPromptDefinitions = {
  "ee1ef770-29ea-4a63-a1f9-7e97b5b8870d": [
    {
      key: "discard-drawn-card",
      title: () =>
        "Choose a card to discard",
      subtitle: () =>
        "Choose one card from your hand.",
      instructions: () =>
        "Choose a card to discard.",
    },
  ],
  "fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5": [
    {
      key: "confirm-play-void-character",
      title: () =>
        "Play a character from your void?",
      subtitle: () =>
        "You may play a character without paying its energy cost.",
      instructions: () =>
        "Choose whether to play a character from your void.",
    },
    {
      key: "choose-void-character",
      title: () =>
        "Choose a character to play",
      subtitle: () =>
        "Choose an eligible character from your void.",
      instructions: () =>
        "Choose a character to play.",
    },
  ],
  "14dec460-3ec6-40c1-978f-67e70cb0b227": [
    {
      key: "grant-reclaim",
      title: () =>
        "Choose a void card to gain Reclaim",
      subtitle: () =>
        "You may play it from your void this turn, then banish it.",
      instructions: () =>
        "Choose a card in your void.",
    },
  ],
  "fa8704fe-759f-408d-992d-d8f9d5ffd760": [
    {
      key: "discard-and-draw",
      title: (arguments_) =>
        `Discard ${formatNumber(numericArgument(arguments_, "count"))} cards, then draw ${formatNumber(numericArgument(arguments_, "count"))}?`,
      subtitle: () =>
        "Choose whether to exchange cards from your hand.",
      instructions: () =>
        "Choose whether to discard and draw the same number of cards.",
      arguments: [{ name: "count", kind: "Count" }],
    },
    {
      key: "choose-discards",
      title: (arguments_) =>
        `Discard ${formatNumber(numericArgument(arguments_, "count"))} cards`,
      subtitle: () =>
        "Choose cards from your hand.",
      instructions: (arguments_) =>
        `Choose ${formatNumber(numericArgument(arguments_, "count"))} cards to discard.`,
      arguments: [{ name: "count", kind: "Count" }],
    },
  ],
  "2b23a60c-209c-4c75-b63c-b7f73b2e1a56": [
    {
      key: "return-void-card",
      title: () =>
        "Return a void card to hand",
      subtitle: () =>
        "Choose one card from your void.",
      instructions: () =>
        "Choose a card to return to your hand.",
    },
  ],
  "9954cede-8a16-4053-b6e9-da745f4540f5": [
    {
      key: "banish-enemy-character",
      title: () =>
        "Banish an enemy character",
      subtitle: () =>
        "Choose an opposing character in play.",
      instructions: () =>
        "Choose a character to banish until Ending.",
    },
  ],
  "3a4293da-55a1-4094-898a-df402ffa1c92": [
    {
      key: "pick-card-for-hand",
      title: () =>
        "Pick a card for your hand",
      subtitle: () =>
        "The other revealed card goes to the bottom of your deck.",
      instructions: () =>
        "Choose one revealed card to put into your hand.",
    },
  ],
  "556057bb-b134-497e-86c2-c6f30049e9e3": [
    {
      key: "confirm-void-to-deck",
      title: () =>
        "Put a void card on top of your deck?",
      subtitle: () =>
        "Choose whether to return a card to your deck.",
      instructions: () =>
        "Choose whether to put a void card on top of your deck.",
    },
    {
      key: "choose-void-for-deck",
      title: () =>
        "Choose a void card to put on top",
      subtitle: () =>
        "Choose one card from your void.",
      instructions: () =>
        "Choose the card to put on top of your deck.",
    },
  ],
  "20be0fdd-d691-40a9-b4f8-15689ea7ebaa": [
    {
      key: "confirm-abandon-and-draw",
      title: (arguments_) =>
        `Abandon a character to draw ${formatNumber(numericArgument(arguments_, "count"))}?`,
      subtitle: () =>
        "Choose whether to abandon a character you control.",
      instructions: (arguments_) =>
        `Choose whether to abandon a character and draw ${formatNumber(numericArgument(arguments_, "count"))} cards.`,
      arguments: [{ name: "count", kind: "Count" }],
    },
    {
      key: "choose-character-to-abandon",
      title: () =>
        "Choose a character to abandon",
      subtitle: () =>
        "Choose one character you control.",
      instructions: () =>
        "Choose the character to abandon.",
    },
  ],
  "f61431f3-33bd-42ff-a229-b4013582e86e": [
    {
      key: "discover-card",
      title: (arguments_) =>
        `Discover a ≤${formatNumber(numericArgument(arguments_, "maximum_cost"))}● cost card`,
      subtitle: () =>
        "Choose one of the sampled cards.",
      instructions: (arguments_) =>
        `Choose a card costing at most ${formatNumber(numericArgument(arguments_, "maximum_cost"))}●.`,
      arguments: [{ name: "maximum_cost", kind: "MaximumCost" }],
    },
  ],
  "2ad68489-044a-40d1-9be6-e62497a4e1fd": [
    {
      key: "rematerialize-ally",
      title: () =>
        "Rematerialize an ally",
      subtitle: () =>
        "Choose one character you control.",
      instructions: () =>
        "Choose a character to rematerialize.",
    },
  ],
  "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c": [
    {
      key: "choose-benefit",
      title: () => "Choose one",
      subtitle: () =>
        "Choose a Dreamwell benefit.",
      instructions: () =>
        "Choose whether to draw a card or gain energy.",
      choices: [
        {
          key: "draw-card",
          label: () => "Draw a card",
        },
        {
          key: "gain-energy",
          label: (arguments_) =>
            `Gain ${formatNumber(numericArgument(arguments_, "amount"))}●`,
        },
      ],
      arguments: [{ name: "amount", kind: "Amount" }],
    },
  ],
  "91deefd2-0400-4c78-ab9f-f6db864ff7e2": [
    {
      key: "discard-card",
      title: () => "Discard a card",
      subtitle: () =>
        "Choose one card from your hand.",
      instructions: () =>
        "Choose a card to discard.",
    },
  ],
  "8f5f2e26-44b5-447b-90d0-eaf22ab29fed": [
    {
      key: "discover-character",
      title: () =>
        "Discover a character",
      subtitle: () =>
        "Choose one of the sampled characters.",
      instructions: () =>
        "Choose a character card.",
    },
  ],
  "a0fbcbd9-96ee-4392-add7-e1d436f99553": [
    {
      key: "return-event",
      title: () =>
        "Return an event from your void to hand",
      subtitle: () =>
        "Choose one event from your void.",
      instructions: () =>
        "Choose an event to return to your hand.",
    },
  ],
  "446095b1-ec4d-40d7-8eed-a8221d339ea2": [
    {
      key: "redraw-hand",
      title: () =>
        "Discard your hand and redraw?",
      subtitle: () =>
        "Draw the same number of cards you discard.",
      instructions: () =>
        "Choose whether to discard your hand and draw replacements.",
    },
  ],
};

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

/** Resolve application-owned prompt copy at the presentation seam. */
export function resolveDreamwellPromptRef(
  ref: DreamwellPromptRef,
  cards: readonly DreamwellCard[],
  definitions: DreamwellPromptDefinitions = DREAMWELL_AUTOMATION_PROMPTS,
): string {
  const card = cards.find((candidate) => candidate.id === ref.cardId);
  if (card === undefined)
    throw new Error(`Unknown Dreamwell prompt card ${ref.cardId}`);
  const prompt = definitions[ref.cardId]?.find(
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
  switch (ref.part) {
    case "title":
      return prompt.title(ref.arguments);
    case "subtitle":
      return prompt.subtitle(ref.arguments);
    case "instructions":
      return prompt.instructions(ref.arguments);
    case "choice": {
      const choice = (prompt.choices ?? []).find(
        (candidate) => candidate.key === ref.choiceKey,
      );
      if (choice === undefined)
        throw new Error(
          `Unknown Dreamwell prompt choice ${String(ref.choiceKey)}`,
        );
      return choice.label(ref.arguments);
    }
  }
}
