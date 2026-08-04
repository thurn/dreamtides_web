import { asCardId, asCardName, type CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign, TransfigurationType } from "../types/journey";

const EXPLORATION_DATA_PATH = "/exploration-data.json";

/** Default reward for effects that trade a card's spark for essence. */
export const EXPLORATION_ESSENCE_PER_SPARK = 40;

export type ExplorationPredicate =
  | "character"
  | "event"
  | "cheap-character"
  | "spirit-animal"
  | "survivor"
  | "warrior";

export type ExplorationEffectKind =
  | "purge-and-copy"
  | "gain-dreamsign"
  | "gain-card"
  | "transfigure-selected"
  | "purge-selected"
  | "choose-pack"
  | "draft-card"
  | "purge-for-essence"
  | "change-subtype-selected"
  | "change-subtype-all"
  | "take-cards"
  | "replace-selected"
  | "gain-bane-and-card"
  | "gain-random-cards"
  | "transfigure-fixed-selected"
  | "gain-offered-card"
  | "gain-essence-per-card"
  | "increase-spark-all"
  | "gain-random-dreamsign"
  | "purge-dreamsign-for-essence"
  | "make-fast-all"
  | "reduce-cost-all-and-gain-banes";

const TRANSFIGURATION_EXPLORATION_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set(["transfigure-selected", "transfigure-fixed-selected"]);

export function isTransfigurationExplorationEffect(
  effectKind: ExplorationEffectKind,
): boolean {
  return TRANSFIGURATION_EXPLORATION_EFFECT_KINDS.has(effectKind);
}

export interface ExplorationActionContent {
  id: string;
  label: string;
  effectText: string;
  responseText: string;
  effectKind: ExplorationEffectKind;
  predicate?: ExplorationPredicate;
  count?: number;
  cardId?: CardId;
  dreamsignId?: string;
  packCount?: number;
  packSize?: number;
  offerCount?: number;
  essencePerSpark?: number;
  essencePerCard?: number;
  sparkBonus?: number;
  essence?: number;
  energyCostReduction?: number;
  subtype?: string;
  subtypeOptions?: readonly string[];
  baneCardId?: CardId;
  baneCount?: number;
  transfiguration?: TransfigurationType;
}

export interface ExplorationEncounterContent {
  cardId: CardId;
  prose: string;
  actions: readonly [ExplorationActionContent, ExplorationActionContent];
}

export interface ExplorationContent {
  customCards: readonly CardData[];
  customDreamsigns: readonly Dreamsign[];
  encounters: readonly ExplorationEncounterContent[];
}

interface RawExplorationData {
  customCards?: CardData[];
  customDreamsigns?: Dreamsign[];
  encounters?: Array<{
    cardId?: string;
    prose?: string;
    action?: ExplorationActionContent[];
  }>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid Exploration data: ${label} must be a non-empty string`);
  }
  return value;
}

function validateAction(raw: ExplorationActionContent): ExplorationActionContent {
  return {
    ...raw,
    id: requiredString(raw.id, "action id"),
    label: requiredString(raw.label, "action label"),
    effectText: requiredString(raw.effectText, "action effect text"),
    responseText: requiredString(raw.responseText, "action response text"),
    ...(raw.cardId === undefined ? {} : { cardId: asCardId(raw.cardId) }),
    ...(raw.baneCardId === undefined
      ? {}
      : { baneCardId: asCardId(raw.baneCardId) }),
  };
}

/** Load the authored encounter catalog generated from exploration.toml. */
export async function loadExplorationContent(): Promise<ExplorationContent> {
  const response = await fetch(EXPLORATION_DATA_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Exploration data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const raw = (await response.json()) as RawExplorationData;
  const customCards = (raw.customCards ?? []).map((card) => ({
    ...card,
    id: asCardId(card.id),
    name: asCardName(card.name),
  }));
  const encounters = (raw.encounters ?? []).map((encounter) => {
    const actions = encounter.action ?? [];
    if (actions.length !== 2) {
      throw new Error(
        `Invalid Exploration data: encounter ${String(encounter.cardId)} must have two actions`,
      );
    }
    return {
      cardId: asCardId(requiredString(encounter.cardId, "encounter card id")),
      prose: requiredString(encounter.prose, "encounter prose"),
      actions: [validateAction(actions[0]), validateAction(actions[1])],
    } satisfies ExplorationEncounterContent;
  });
  if (encounters.length !== 14) {
    throw new Error(
      `Invalid Exploration data: expected 14 encounters, found ${String(encounters.length)}`,
    );
  }
  return {
    customCards,
    customDreamsigns: raw.customDreamsigns ?? [],
    encounters,
  };
}

/** Resolve an encounter by its source-card UUID. */
export function explorationEncounterForCard(
  content: ExplorationContent,
  cardId: string,
): ExplorationEncounterContent | null {
  const normalized = cardId.toLowerCase();
  return (
    content.encounters.find(
      (encounter) => encounter.cardId.toLowerCase() === normalized,
    ) ?? null
  );
}
