import { asCardId, asCardName, type CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign, TransfigurationType } from "../types/journey";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
} from "../reward-selection/types";
import { EXPLORATION_EFFECT_KINDS } from "../../scripts/exploration-effect-kinds.mjs";

const EXPLORATION_DATA_PATH = "/exploration-data.json";

export type ExplorationPredicate =
  | "character"
  | "event"
  | "cheap-character"
  | "spirit-animal"
  | "survivor"
  | "warrior";

export type ExplorationEffectKind = typeof EXPLORATION_EFFECT_KINDS[number];

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
  followupTitle?: string;
  followupSubtitle?: string;
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
  deckTarget?: "chosen" | "offered";
}

export function explorationActionUsesOfferedDeckTarget(
  action: ExplorationActionContent,
): boolean {
  return action.deckTarget === "offered";
}

export interface ExplorationEncounterContent {
  cardId: CardId;
  prose: string;
  actions: readonly [ExplorationActionContent, ExplorationActionContent];
}

export interface ExplorationContent {
  /** Present on compiler output; optional only for focused synthetic fixtures. */
  schemaVersion?: 2;
  contentHash?: string;
  foldHash?: string;
  customCards: readonly CardData[];
  customDreamsigns: readonly Dreamsign[];
  encounters: readonly ExplorationEncounterContent[];
}

interface RawExplorationData {
  schemaVersion?: number;
  contentHash?: string;
  foldHash?: string;
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
  if ((raw.followupTitle === undefined) !== (raw.followupSubtitle === undefined)) {
    throw new Error("Invalid Exploration data: action followup fields must be paired");
  }
  const targeted = new Set<ExplorationEffectKind>([
    "change-subtype-selected",
    "transfigure-fixed-selected",
    "copy-selected-card",
  ]);
  if (targeted.has(raw.effectKind)) {
    if (raw.deckTarget !== "chosen" && raw.deckTarget !== "offered") {
      throw new Error("Invalid Exploration data: targeted action requires deckTarget");
    }
  } else if (raw.deckTarget !== undefined) {
    throw new Error("Invalid Exploration data: action has unsupported deckTarget");
  }
  return {
    ...raw,
    id: requiredString(raw.id, "action id"),
    label: requiredString(raw.label, "action label"),
    effectText: requiredString(raw.effectText, "action effect text"),
    ...(raw.cardId === undefined ? {} : { cardId: asCardId(raw.cardId) }),
  };
}

const EXPLORATION_EFFECT_KIND_SET: ReadonlySet<string> = new Set(EXPLORATION_EFFECT_KINDS);

/** Load the authored encounter catalog generated from exploration.ron. */
export async function loadExplorationContent(): Promise<ExplorationContent> {
  const response = await fetch(EXPLORATION_DATA_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Exploration data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const raw = (await response.json()) as RawExplorationData;
  if (
    raw.schemaVersion !== 2 ||
    typeof raw.contentHash !== "string" || !/^[0-9a-f]{64}$/u.test(raw.contentHash) ||
    raw.foldHash !== raw.contentHash
  ) {
    throw new Error("Invalid Exploration data: malformed compiler metadata");
  }
  const customCards = (raw.customCards ?? []).map((card) => ({
    ...card,
    id: asCardId(card.id),
    name: asCardName(card.name),
  }));
  const encounters = (raw.encounters ?? []).map((encounter) => {
    const actions = encounter.action ?? [];
    if (actions.length < 1 || actions.length > 4) {
      throw new Error(
        `Invalid Exploration data: encounter ${String(encounter.cardId)} must have between one and four actions`,
      );
    }
    return {
      cardId: asCardId(requiredString(encounter.cardId, "encounter card id")),
      prose: requiredString(encounter.prose, "encounter prose"),
      actions: actions.map(validateAction),
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
      if (!EXPLORATION_EFFECT_KIND_SET.has(action.effectKind)) {
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
    schemaVersion: 2,
    contentHash: raw.contentHash,
    foldHash: raw.foldHash,
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
