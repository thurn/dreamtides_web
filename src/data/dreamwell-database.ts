import type { ArtCrop } from "../types/cards";
import type { SourceTransport } from "../runtime/localization/runtime";
import { hydrateSourceTransport } from "../runtime/localization/runtime";
import { SourceMessage } from "@trox/runtime";
import { asDreamwellCardId, type DreamwellCardId } from "../types/identifiers";

/**
 * The shared Dreamwell cards drawn one per turn during the Dreamwell phase
 * (docs/battle_rules/battle_rules.md). The catalog is generated from
 * canonical `data/dreamwell.ron` through the generated compatibility catalog
 * `data/dreamwell.toml`, then served at `/dreamwell-data.json`.
 */
export interface DreamwellCard {
  /** Stable UUID identity. Cards are referenced by id, never by name. */
  id: DreamwellCardId;
  name: string;
  /** Rules text with the same symbol/glossary markup as regular cards. */
  renderedText: string;
  /**
   * Position in the Dreamwell deck (0-4). Order-0 cards are the per-player
   * starting cards and appear only in the first cycle; #1 cards shuffle above
   * #2, and so on (rules §The Dreamwell and Energy).
   */
  order: number;
  /** Energy permanently added to the drawing player's maximum ● (may be 0). */
  energyAdded: number;
  /** Catalog ordinal. */
  cardNumber: number;
  /** Art key for `/cards/<imageNumber>.webp`; 0/absent renders an identicon. */
  imageNumber?: number;
  /** Curated pan/zoom crop framing the art; absent until the card is framed. */
  art?: ArtCrop;
  cardType?: string;
  artOwned?: boolean;
  automation?: readonly DreamwellAutomationPrompt[];
}

export type DreamwellPromptArgumentKind =
  "Count" | "Amount" | "MaximumCost" | "CardUuid" | "Side";

export interface DreamwellAutomationPrompt {
  readonly key: string;
  readonly title: SourceTransport;
  readonly subtitle: SourceTransport;
  readonly instructions: SourceTransport;
  readonly choices?: readonly {
    readonly key: string;
    readonly label: SourceTransport;
  }[];
  readonly arguments?: readonly {
    readonly name: string;
    readonly kind: DreamwellPromptArgumentKind;
  }[];
}

const DREAMWELL_JSON_PATH = "/dreamwell-data.json";

/**
 * Fetches the Dreamwell catalog generated from `dreamwell.toml`. Returns the
 * cards in their authored TOML order; the battle deck builder
 * (`buildDreamwellDeck`) groups and shuffles them by `order` at battle init.
 */
export async function loadDreamwellCards(): Promise<DreamwellCard[]> {
  const response = await fetch(DREAMWELL_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Dreamwell data: ${String(response.status)} ${response.statusText}`,
    );
  }
  return parseDreamwellCards(await response.json());
}

const PROMPT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ARGUMENT_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const ARGUMENT_KINDS: readonly DreamwellPromptArgumentKind[] = [
  "Count",
  "Amount",
  "MaximumCost",
  "CardUuid",
  "Side",
];

function isPromptArgumentKind(
  value: unknown,
): value is DreamwellPromptArgumentKind {
  return (
    typeof value === "string" && ARGUMENT_KINDS.some((kind) => kind === value)
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function localizedTransport(value: unknown): boolean {
  return (
    (typeof value === "string" && value.trim() !== "") ||
    (record(value) && value.format === "trox-source-message-ref")
  );
}

/** Validate the generated Dreamwell payload before it enters journey content. */
export function parseDreamwellCards(value: unknown): DreamwellCard[] {
  if (!Array.isArray(value)) throw new Error("Dreamwell data must be an array");
  return value.map((candidate, cardIndex) => {
    if (
      !record(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.renderedText !== "string" ||
      typeof candidate.order !== "number" ||
      typeof candidate.energyAdded !== "number" ||
      typeof candidate.cardNumber !== "number"
    ) {
      throw new Error(`Dreamwell card ${String(cardIndex + 1)} is malformed`);
    }
    const cardId = asDreamwellCardId(candidate.id);
    const automation = candidate.automation ?? [];
    if (!Array.isArray(automation))
      throw new Error(`Dreamwell card ${cardId} automation must be an array`);
    const promptKeys = new Set<string>();
    const normalizedAutomation = automation.map(
      (prompt, promptIndex): DreamwellAutomationPrompt => {
        if (
          !record(prompt) ||
          typeof prompt.key !== "string" ||
          !PROMPT_KEY.test(prompt.key) ||
          !localizedTransport(prompt.title) ||
          !localizedTransport(prompt.subtitle) ||
          !localizedTransport(prompt.instructions)
        ) {
          throw new Error(
            `Dreamwell card ${cardId} prompt ${String(promptIndex + 1)} is malformed`,
          );
        }
        const promptKey = prompt.key;
        if (promptKeys.has(promptKey))
          throw new Error(
            `Dreamwell card ${cardId} duplicates prompt ${promptKey}`,
          );
        promptKeys.add(promptKey);
        const choices = prompt.choices ?? [];
        const arguments_ = prompt.arguments ?? [];
        if (!Array.isArray(choices) || !Array.isArray(arguments_)) {
          throw new Error(
            `Dreamwell card ${cardId} prompt ${promptKey} collections are malformed`,
          );
        }
        const choiceKeys = new Set<string>();
        const normalizedChoices = choices.map((choice) => {
          if (
            !record(choice) ||
            typeof choice.key !== "string" ||
            !PROMPT_KEY.test(choice.key) ||
            !localizedTransport(choice.label) ||
            choiceKeys.has(choice.key)
          ) {
            throw new Error(
              `Dreamwell card ${cardId} prompt ${promptKey} has an invalid choice`,
            );
          }
          choiceKeys.add(choice.key);
          return {
            key: choice.key,
            label: hydrateSourceTransport(
              choice.label,
              `Dreamwell ${cardId} ${promptKey} choice ${choice.key}`,
            ),
          };
        });
        const argumentNames = new Set<string>();
        const normalizedArguments = arguments_.map((argument) => {
          if (
            !record(argument) ||
            typeof argument.name !== "string" ||
            !ARGUMENT_NAME.test(argument.name) ||
            !isPromptArgumentKind(argument.kind) ||
            argumentNames.has(argument.name)
          ) {
            throw new Error(
              `Dreamwell card ${cardId} prompt ${promptKey} has an invalid argument`,
            );
          }
          argumentNames.add(argument.name);
          return {
            name: argument.name,
            kind: argument.kind,
          };
        });
        const hydratedTexts = [
          hydrateSourceTransport(
            prompt.title,
            `Dreamwell ${cardId} ${promptKey} title`,
          ),
          hydrateSourceTransport(
            prompt.subtitle,
            `Dreamwell ${cardId} ${promptKey} subtitle`,
          ),
          hydrateSourceTransport(
            prompt.instructions,
            `Dreamwell ${cardId} ${promptKey} instructions`,
          ),
          ...normalizedChoices.map((choice) => choice.label),
        ];
        const placeholders = new Set(
          hydratedTexts.flatMap((text) =>
            text instanceof SourceMessage
              ? Object.keys(text.argumentSchemas)
              : typeof text === "string"
                ? [
                    ...text.matchAll(/\{([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\}/gu),
                  ].map((match) => match[1] ?? "")
                : [],
          ),
        );
        if (
          [...placeholders].some((name) => !argumentNames.has(name)) ||
          [...argumentNames].some((name) => !placeholders.has(name))
        ) {
          throw new Error(
            `Dreamwell card ${cardId} prompt ${promptKey} placeholder coverage is invalid`,
          );
        }
        return {
          key: promptKey,
          title: hydratedTexts[0],
          subtitle: hydratedTexts[1],
          instructions: hydratedTexts[2],
          choices: normalizedChoices,
          arguments: normalizedArguments,
        };
      },
    );
    return {
      ...(candidate as unknown as DreamwellCard),
      id: cardId,
      automation: normalizedAutomation,
    };
  });
}
