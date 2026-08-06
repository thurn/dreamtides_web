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

export type ExplorationSpecialVariable =
  | "$OFFERED_CARD"
  | "$DECK_CARD"
  | "$STARTER_CARD";

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
  | "replace-selected-with-card"
  | "replace-selected"
  | "gain-nightmare-and-card"
  | "gain-random-cards"
  | "transfigure-fixed-selected"
  | "gain-offered-card"
  | "transfigure-next-draft-or-shop"
  | "gain-essence-per-card"
  | "increase-spark-all"
  | "gain-random-dreamsign"
  | "purge-dreamsign-for-essence"
  | "make-fast-all"
  | "reduce-cost-all-and-gain-nightmares"
  | "copy-selected-card"
  | "copy-selected-cards"
  | "copy-offered-deck-card"
  | "next-battle-opening-hand"
  | "next-battle-starting-energy"
  | "next-battle-smaller-hand-and-cost-discount"
  | "choose-dream-avatar"
  | "purge-duplicates-and-grant-reclaim";

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
  templateId?: number;
  templateVariables?: Readonly<Record<string, unknown>>;
  /** Authored special-variable eligibility keyed by the canonical token. */
  selection?: Readonly<Record<string, { readonly predicate?: string }>>;
  /** Special selections compiled from the authored template syntax. */
  specialVariables?: readonly ExplorationSpecialVariable[];
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
  nightmareCount?: number;
  transfiguration?: TransfigurationType;
}

export function explorationActionUsesSpecialVariable(
  action: ExplorationActionContent,
  variable: ExplorationSpecialVariable,
): boolean {
  return (
    action.specialVariables?.includes(variable) === true ||
    action.selection?.[variable] !== undefined
  );
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
    ...(raw.cardId === undefined ? {} : { cardId: asCardId(raw.cardId) }),
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
  if (encounters.length === 0) {
    throw new Error("Invalid Exploration data: requires at least one encounter");
  }
  const encounterIds = new Set<string>();
  const actionIds = new Set<string>();
  for (const encounter of encounters) {
    const encounterId = encounter.cardId.toLowerCase();
    if (encounterIds.has(encounterId)) {
      throw new Error(
        `Invalid Exploration data: duplicate encounter card id ${encounter.cardId}`,
      );
    }
    encounterIds.add(encounterId);
    for (const action of encounter.actions) {
      if (actionIds.has(action.id)) {
        throw new Error(
          `Invalid Exploration data: duplicate action id ${action.id}`,
        );
      }
      actionIds.add(action.id);
    }
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
