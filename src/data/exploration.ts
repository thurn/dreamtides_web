import { asCardId, asCardName, type CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign, TransfigurationType } from "../types/journey";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
} from "../reward-selection/types";

const EXPLORATION_DATA_PATH = "/exploration-data.json";

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
  | "purge-duplicates-and-grant-reclaim"
  | "transfigured-card-draft"
  | "add-site";

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
  /** Compiled site-neutral mechanic and its non-player-facing selection policy. */
  canonicalMechanicId?: RewardMechanicId;
  selectionPolicyId?: RewardSelectionPolicyId;
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

export interface ExplorationEffectFieldContent {
  key: string;
  label: string;
  control: string;
  optional?: boolean;
  defaultValue?: unknown;
  min?: number;
  step?: number;
  resource?: string;
  templateIds?: readonly number[];
}

export interface ExplorationEffectDefinitionContent {
  kind: ExplorationEffectKind;
  label: string;
  canonicalMechanicId: RewardMechanicId;
  defaultSelectionPolicyId?: RewardSelectionPolicyId;
  allowedSelectionPolicyIds?: readonly RewardSelectionPolicyId[];
  copy: Readonly<{
    followupTitle: string;
    followupSubtitle: string;
  }>;
  fields: readonly ExplorationEffectFieldContent[];
}

export interface ExplorationContent {
  /** Present on compiler output; optional only for focused synthetic fixtures. */
  schemaVersion?: 1;
  actionsPerEncounter?: number;
  contentHash?: string;
  foldHash?: string;
  effectKinds?: readonly ExplorationEffectDefinitionContent[];
  customCards: readonly CardData[];
  customDreamsigns: readonly Dreamsign[];
  encounters: readonly ExplorationEncounterContent[];
}

interface RawExplorationData {
  schemaVersion?: number;
  actionsPerEncounter?: number;
  contentHash?: string;
  foldHash?: string;
  effectKinds?: ExplorationEffectDefinitionContent[];
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
  if (
    raw.schemaVersion !== 1 || raw.actionsPerEncounter !== 2 ||
    typeof raw.contentHash !== "string" || !/^[0-9a-f]{64}$/u.test(raw.contentHash) ||
    raw.foldHash !== raw.contentHash || !Array.isArray(raw.effectKinds) || raw.effectKinds.length === 0
  ) {
    throw new Error("Invalid Exploration data: malformed compiler metadata");
  }
  const effectKindIds = new Set<string>();
  for (const definition of raw.effectKinds) {
    if (
      typeof definition.kind !== "string" ||
      effectKindIds.has(definition.kind) || typeof definition.label !== "string" ||
      typeof definition.canonicalMechanicId !== "string" ||
      typeof definition.copy?.followupTitle !== "string" ||
      typeof definition.copy?.followupSubtitle !== "string" ||
      !Array.isArray(definition.fields)
    ) {
      throw new Error("Invalid Exploration data: malformed effect-kind definition");
    }
    effectKindIds.add(definition.kind);
  }
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
      if (!effectKindIds.has(action.effectKind)) {
        throw new Error(`Invalid Exploration data: unknown effect kind ${action.effectKind}`);
      }
      if (actionIds.has(action.id)) {
        throw new Error(
          `Invalid Exploration data: duplicate action id ${action.id}`,
        );
      }
      actionIds.add(action.id);
    }
  }
  return {
    schemaVersion: 1,
    actionsPerEncounter: raw.actionsPerEncounter,
    contentHash: raw.contentHash,
    foldHash: raw.foldHash,
    effectKinds: raw.effectKinds,
    customCards,
    customDreamsigns: raw.customDreamsigns ?? [],
    encounters,
  };
}

/** Resolve TOML-authored effect metadata by its persisted effect kind. */
export function explorationEffectDefinition(
  content: ExplorationContent,
  kind: ExplorationEffectKind,
): ExplorationEffectDefinitionContent | null {
  return content.effectKinds?.find((entry) => entry.kind === kind) ?? null;
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
