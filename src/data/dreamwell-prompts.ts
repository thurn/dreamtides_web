import type { DreamwellCard } from "./dreamwell-database";
import { tx, txa, type LocalizedString } from "@trox/runtime";
import {
  dreamwellCardIdFromUnknown,
  dreamwellChoiceKeyFromUnknown,
  dreamwellPromptKeyFromUnknown,
  type DreamwellCardId,
  type DreamwellChoiceKey,
  type DreamwellPromptKey,
} from "../types/identifiers";

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
  BuiltInBattlePromptRef | DreamwellPromptRef | LegacyPromptText;

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

/** Normalize the exact built-in descriptor shapes persisted by v24 imports. */
export function builtInBattlePromptRefFromV24Descriptor(
  value: unknown,
): BuiltInBattlePromptRef | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const descriptor = value as Record<string, unknown>;
  const withoutVariables: Readonly<
    Record<string, Exclude<BuiltInBattlePromptRef["prompt"], "switch-side">>
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

export function isLegacyPromptText(value: unknown): value is LegacyPromptText {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Partial<LegacyPromptText>).kind === "legacy-prompt-text" &&
    typeof (value as Partial<LegacyPromptText>).text === "string"
  );
}

type PromptMessage = (
  arguments_: DreamwellPromptRef["arguments"],
) => LocalizedString;

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
        tx("Choose a card to discard", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one card from your hand.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx("Choose a card to discard.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5": [
    {
      key: "confirm-play-void-character",
      title: () =>
        tx("Play a character from your void?", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx(
          "You may play a character without paying its energy cost.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: () =>
        tx(
          "Choose whether to play a character from your void.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
    {
      key: "choose-void-character",
      title: () =>
        tx("Choose a character to play", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx(
          "Choose an eligible character from your void.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: () =>
        tx("Choose a character to play.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "14dec460-3ec6-40c1-978f-67e70cb0b227": [
    {
      key: "grant-reclaim",
      title: () =>
        tx("Choose a void card to gain Reclaim", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx(
          "You may play it from your void this turn, then banish it.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: () =>
        tx("Choose a card in your void.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "fa8704fe-759f-408d-992d-d8f9d5ffd760": [
    {
      key: "discard-and-draw",
      title: (arguments_) =>
        txa(
          "Discard {count} cards, then draw {count}?",
          { count: numericArgument(arguments_, "count") },
          "[battle] Dreamwell confirmation title. count is the number of cards exchanged.",
        ),
      subtitle: () =>
        tx(
          "Choose whether to exchange cards from your hand.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: () =>
        tx(
          "Choose whether to discard and draw the same number of cards.",
          "[battle] Dreamwell prompt instructions.",
        ),
      arguments: [{ name: "count", kind: "Count" }],
    },
    {
      key: "choose-discards",
      title: (arguments_) =>
        txa(
          "Discard {count} cards",
          { count: numericArgument(arguments_, "count") },
          "[battle] Dreamwell selection title. count is the required number of cards.",
        ),
      subtitle: () =>
        tx("Choose cards from your hand.", "[battle] Dreamwell prompt subtitle."),
      instructions: (arguments_) =>
        txa(
          "Choose {count} cards to discard.",
          { count: numericArgument(arguments_, "count") },
          "[battle] Dreamwell instructions. count is the required number of cards.",
        ),
      arguments: [{ name: "count", kind: "Count" }],
    },
  ],
  "2b23a60c-209c-4c75-b63c-b7f73b2e1a56": [
    {
      key: "return-void-card",
      title: () =>
        tx("Return a void card to hand", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one card from your void.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx(
          "Choose a card to return to your hand.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
  ],
  "9954cede-8a16-4053-b6e9-da745f4540f5": [
    {
      key: "banish-enemy-character",
      title: () =>
        tx("Banish an enemy character", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose an opposing character in play.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx(
          "Choose a character to banish until Ending.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
  ],
  "3a4293da-55a1-4094-898a-df402ffa1c92": [
    {
      key: "pick-card-for-hand",
      title: () =>
        tx("Pick a card for your hand", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx(
          "The other revealed card goes to the bottom of your deck.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: () =>
        tx(
          "Choose one revealed card to put into your hand.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
  ],
  "556057bb-b134-497e-86c2-c6f30049e9e3": [
    {
      key: "confirm-void-to-deck",
      title: () =>
        tx("Put a void card on top of your deck?", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose whether to return a card to your deck.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx(
          "Choose whether to put a void card on top of your deck.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
    {
      key: "choose-void-for-deck",
      title: () =>
        tx("Choose a void card to put on top", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one card from your void.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx(
          "Choose the card to put on top of your deck.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
  ],
  "20be0fdd-d691-40a9-b4f8-15689ea7ebaa": [
    {
      key: "confirm-abandon-and-draw",
      title: (arguments_) =>
        txa(
          "Abandon a character to draw {count}?",
          { count: numericArgument(arguments_, "count") },
          "[battle] Dreamwell confirmation title. count is the number of cards drawn.",
        ),
      subtitle: () =>
        tx(
          "Choose whether to abandon a character you control.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: (arguments_) =>
        txa(
          "Choose whether to abandon a character and draw {count} cards.",
          { count: numericArgument(arguments_, "count") },
          "[battle] Dreamwell instructions. count is the number of cards drawn.",
        ),
      arguments: [{ name: "count", kind: "Count" }],
    },
    {
      key: "choose-character-to-abandon",
      title: () =>
        tx("Choose a character to abandon", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one character you control.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx("Choose the character to abandon.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "f61431f3-33bd-42ff-a229-b4013582e86e": [
    {
      key: "discover-card",
      title: (arguments_) =>
        txa(
          "Discover a ≤{maximum_cost}● cost card",
          { maximum_cost: numericArgument(arguments_, "maximum_cost") },
          "[battle] Dreamwell selection title. maximum_cost is the highest allowed energy cost.",
        ),
      subtitle: () =>
        tx("Choose one of the sampled cards.", "[battle] Dreamwell prompt subtitle."),
      instructions: (arguments_) =>
        txa(
          "Choose a card costing at most {maximum_cost}●.",
          { maximum_cost: numericArgument(arguments_, "maximum_cost") },
          "[battle] Dreamwell instructions. maximum_cost is the highest allowed energy cost.",
        ),
      arguments: [{ name: "maximum_cost", kind: "MaximumCost" }],
    },
  ],
  "2ad68489-044a-40d1-9be6-e62497a4e1fd": [
    {
      key: "rematerialize-ally",
      title: () =>
        tx("Rematerialize an ally", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one character you control.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx("Choose a character to rematerialize.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c": [
    {
      key: "choose-benefit",
      title: () => tx("Choose one", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose a Dreamwell benefit.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx(
          "Choose whether to draw a card or gain energy.",
          "[battle] Dreamwell prompt instructions.",
        ),
      choices: [
        {
          key: "draw-card",
          label: () => tx("Draw a card", "[battle] Dreamwell prompt option."),
        },
        {
          key: "gain-energy",
          label: (arguments_) =>
            txa(
              "Gain {amount}●",
              { amount: numericArgument(arguments_, "amount") },
              "[battle] Dreamwell prompt option. amount is the energy gained.",
            ),
        },
      ],
      arguments: [{ name: "amount", kind: "Amount" }],
    },
  ],
  "91deefd2-0400-4c78-ab9f-f6db864ff7e2": [
    {
      key: "discard-card",
      title: () => tx("Discard a card", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one card from your hand.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx("Choose a card to discard.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "8f5f2e26-44b5-447b-90d0-eaf22ab29fed": [
    {
      key: "discover-character",
      title: () =>
        tx(
          "Discover a character",
          "[battle] Reusable prompt title for choosing one Character card to discover during battle.",
        ),
      subtitle: () =>
        tx("Choose one of the sampled characters.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx("Choose a character card.", "[battle] Dreamwell prompt instructions."),
    },
  ],
  "a0fbcbd9-96ee-4392-add7-e1d436f99553": [
    {
      key: "return-event",
      title: () =>
        tx("Return an event from your void to hand", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx("Choose one event from your void.", "[battle] Dreamwell prompt subtitle."),
      instructions: () =>
        tx(
          "Choose an event to return to your hand.",
          "[battle] Dreamwell prompt instructions.",
        ),
    },
  ],
  "446095b1-ec4d-40d7-8eed-a8221d339ea2": [
    {
      key: "redraw-hand",
      title: () =>
        tx("Discard your hand and redraw?", "[battle] Dreamwell prompt title."),
      subtitle: () =>
        tx(
          "Draw the same number of cards you discard.",
          "[battle] Dreamwell prompt subtitle.",
        ),
      instructions: () =>
        tx(
          "Choose whether to discard your hand and draw replacements.",
          "[battle] Dreamwell prompt instructions.",
        ),
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
): LocalizedString {
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
