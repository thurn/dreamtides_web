import {
  parseCardId,
  parseCardName,
  parseCardSubtype,
  type CardId,
  type CardSubtype,
} from "../types/card-identity";
import type { CardData, CardType } from "../types/cards";
import type { Dreamsign, TransfigurationType } from "../types/journey";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
} from "../reward-selection/types";
import { EXPLORATION_EFFECT_KINDS } from "../../scripts/exploration-effect-kinds.mjs";
import {
  LocalizedString,
  SourceMessage,
  type SourceMessageRef,
} from "@trox/runtime";
import {
  localizedSourceMessage,
  sourceMessage,
} from "../runtime/localization/runtime";
import type { DreamsignId, ExplorationActionId } from "../types/identifiers";
import { parseExplorationActionId } from "../types/identifiers";
import {
  parseContentHash,
  parseFoldHash,
  type ContentHash,
  type FoldHash,
} from "../types/content-hash";

const EXPLORATION_DATA_PATH = "/exploration-data.json";

export type ExplorationPredicate =
  | "character"
  | "event"
  | "cheap-character"
  | "legendary"
  | "spirit-animal"
  | "survivor"
  | "warrior";

export type ExplorationEffectKind = (typeof EXPLORATION_EFFECT_KINDS)[number];

export const EXPLORATION_FIXED_SITE_TYPES = [
  "Duplication",
  "Purge",
  "Shop",
  "DreamsignBazaar",
  "Transfiguration",
] as const;

/** Site destinations supported by the authored fixed-site Exploration effect. */
export type ExplorationFixedSiteType =
  (typeof EXPLORATION_FIXED_SITE_TYPES)[number];

export const EXPLORATION_CHOOSABLE_SITE_TYPES = [
  "Shop",
  "Purge",
  "Transfiguration",
  "Duplication",
] as const;

/** Site destinations eligible for the player-facing Exploration site chooser. */
export type ExplorationChoosableSiteType =
  (typeof EXPLORATION_CHOOSABLE_SITE_TYPES)[number];

const TRANSFIGURATION_EXPLORATION_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set([
    "transfigure-selected",
    "transfigure-random-cards",
    "transfigure-fixed-random-cards",
    "transfigure-fixed-selected",
    "transfigure-all-for-essence",
    "transfigure-random-starter-cards",
    "transfigure-all-starter-cards",
    "transfigure-all-cards",
    "purge-disclosed-and-transfigure-same-type",
    "take-transfigured-cards-and-gain-nightmares",
    "purge-one-transfigure-and-copy-others",
  ]);

export function isTransfigurationExplorationEffect(
  effectKind: ExplorationEffectKind,
): boolean {
  return TRANSFIGURATION_EXPLORATION_EFFECT_KINDS.has(effectKind);
}

export interface ExplorationActionContent {
  id: ExplorationActionId;
  /** Strings are accepted only by synthetic fixtures; loaded content is typed. */
  label: string | LocalizedString;
  effectText: string | LocalizedString | SourceMessage;
  followupTitle?: string | LocalizedString | SourceMessage;
  followupSubtitle?: string | LocalizedString | SourceMessage;
  effectKind: ExplorationEffectKind;
  /** Compiled site-neutral mechanic and its non-player-facing selection policy. */
  canonicalMechanicId?: RewardMechanicId;
  selectionPolicyId?: RewardSelectionPolicyId;
  predicate?: ExplorationPredicate;
  count?: number;
  cardType?: CardType;
  cardId?: CardId;
  dreamsignId?: DreamsignId;
  packCount?: number;
  packSize?: number;
  offerCount?: number;
  essencePerSpark?: number;
  essencePerCard?: number;
  sparkBonus?: number;
  essence?: number;
  minimumEssence?: number;
  maximumEssence?: number;
  energyCostReduction?: number;
  subtype?: CardSubtype;
  subtypeOptions?: readonly CardSubtype[];
  nightmareCount?: number;
  transfiguration?: TransfigurationType;
  deckTarget?: "chosen" | "offered";
  siteType?: ExplorationFixedSiteType;
}

export function explorationActionUsesOfferedDeckTarget(
  action: ExplorationActionContent,
): boolean {
  return (
    action.deckTarget === "offered" ||
    action.effectKind === "purge-disclosed-and-transfigure-same-type"
  );
}

export interface ExplorationEncounterContent {
  cardId: CardId;
  /** Strings are accepted only by synthetic fixtures; loaded content is typed. */
  prose: string | LocalizedString;
  actions: readonly ExplorationActionContent[];
}

export interface ExplorationContent {
  /** Present on compiler output; optional only for focused synthetic fixtures. */
  schemaVersion?: 2;
  contentHash?: ContentHash;
  foldHash?: FoldHash;
  customCards: readonly CardData[];
  customDreamsigns: readonly Dreamsign[];
  encounters: readonly ExplorationEncounterContent[];
}

interface RawExplorationData {
  schemaVersion?: number;
  contentHash?: unknown;
  foldHash?: unknown;
  customCards?: CardData[];
  customDreamsigns?: Dreamsign[];
  encounters?: Array<{
    cardId?: CardId;
    prose?: string;
    action?: ExplorationActionContent[];
  }>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Invalid Exploration data: ${label} must be a non-empty string`,
    );
  }
  return value;
}

function hydrateStaticMessage(
  value: unknown,
  label: string,
): string | LocalizedString {
  if (typeof value === "string") return requiredString(value, label);
  const message = sourceMessage(value as SourceMessageRef);
  if (Object.keys(message.argumentSchemas).length !== 0) {
    throw new Error(`Invalid Exploration data: ${label} must be static`);
  }
  return message.bind({});
}

function hydrateEffectMessage(
  value: unknown,
): string | LocalizedString | SourceMessage {
  if (typeof value === "string")
    return requiredString(value, "action effect text");
  const message = sourceMessage(value as SourceMessageRef);
  return Object.keys(message.argumentSchemas).length === 0
    ? localizedSourceMessage(value as SourceMessageRef)
    : message;
}

function messageArgumentNames(
  value: ExplorationActionContent["effectText"],
): readonly string[] {
  if (value instanceof SourceMessage) return Object.keys(value.argumentSchemas);
  if (typeof value === "string") {
    return [...value.matchAll(/\{([a-z][a-z0-9_]*)\}/gu)].map(
      (match) => match[1] ?? "",
    );
  }
  return [];
}

const DREAMSIGN_ID_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> = new Set([
  "gain-dreamsign",
  "gain-nightmare-and-dreamsign",
]);
const OFFER_COUNT_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> = new Set([
  "draft-card",
  "take-cards",
  "gain-nightmare-and-offered-dreamsign",
  "gain-offered-dreamsign",
  "replace-selected-dreamsign-with-offered",
  "copy-offered-deck-card",
  "choose-dream-avatar",
  "transfigured-card-draft",
  "choose-site-type",
  "take-transfigured-cards-and-gain-nightmares",
  "purge-one-transfigure-and-copy-others",
]);
const NIGHTMARE_COUNT_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set([
    "gain-nightmare-and-dreamsign",
    "gain-nightmare-and-offered-dreamsign",
    "gain-nightmare-and-card",
    "reduce-cost-all-and-gain-nightmares",
    "make-predicate-fast-and-gain-nightmares",
    "take-transfigured-cards-and-gain-nightmares",
  ]);
const STARTER_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> = new Set([
  "purge-starter-card",
  "purge-random-starter-card",
  "purge-random-starter-and-gain-card",
  "replace-all-starter-cards",
  "transfigure-random-starter-cards",
  "transfigure-all-starter-cards",
]);
const STARTER_REPLACEMENT_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set(["purge-random-starter-and-gain-card", "replace-all-starter-cards"]);
const STARTER_TRANSFIGURE_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set([
    "transfigure-random-starter-cards",
    "transfigure-all-starter-cards",
  ]);
const EXPLORATION_PREDICATE_SET: ReadonlySet<string> = new Set([
  "character",
  "event",
  "cheap-character",
  "legendary",
  "spirit-animal",
  "survivor",
  "warrior",
]);
const TRANSFIGURATION_SET: ReadonlySet<string> = new Set([
  "Empowered",
  "Amplified",
  "Kindled",
  "Inspired",
  "Enduring",
  "Hastened",
  "Resonant",
  "Attuned",
  "Perfected",
]);
const MULTI_CARD_TRANSFIGURATION_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set([
    "transfigure-selected",
    "transfigure-random-cards",
    "transfigure-fixed-random-cards",
  ]);
const AUTOMATIC_MULTI_CARD_TRANSFIGURATION_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set(["transfigure-random-cards", "transfigure-fixed-random-cards"]);

const EXPLORATION_FIXED_SITE_TYPE_SET: ReadonlySet<string> = new Set(
  EXPLORATION_FIXED_SITE_TYPES,
);
const SHOP_PURCHASE_MODIFIER_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set(["free-next-shop", "lose-half-essence-and-free-purchases"]);
const WAVE8_COMPOUND_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> = new Set(
  [
    "transfigure-all-cards",
    "purge-disclosed-and-transfigure-same-type",
    "make-predicate-fast-and-gain-nightmares",
    "take-transfigured-cards-and-gain-nightmares",
    "purge-one-transfigure-and-copy-others",
  ],
);
const EXPLORATION_EFFECT_FIELDS: ReadonlyArray<keyof ExplorationActionContent> =
  [
    "predicate",
    "count",
    "cardType",
    "cardId",
    "dreamsignId",
    "packCount",
    "packSize",
    "offerCount",
    "essencePerSpark",
    "essencePerCard",
    "sparkBonus",
    "essence",
    "minimumEssence",
    "maximumEssence",
    "energyCostReduction",
    "subtype",
    "subtypeOptions",
    "nightmareCount",
    "transfiguration",
    "deckTarget",
    "siteType",
  ];

function validateWave8CompoundFields(raw: ExplorationActionContent): void {
  if (!WAVE8_COMPOUND_EFFECT_KINDS.has(raw.effectKind)) return;
  const contracts: Record<
    string,
    {
      mechanic: RewardMechanicId;
      policy?: RewardSelectionPolicyId;
      fields: ReadonlyArray<keyof ExplorationActionContent>;
    }
  > = {
    "transfigure-all-cards": {
      mechanic: "transfigure-deck-entry",
      policy: "uniform",
      fields: [],
    },
    "purge-disclosed-and-transfigure-same-type": {
      mechanic: "purge-deck-entry",
      policy: "purge-misfit",
      fields: ["transfiguration"],
    },
    "make-predicate-fast-and-gain-nightmares": {
      mechanic: "make-deck-fast",
      fields: ["predicate", "nightmareCount"],
    },
    "take-transfigured-cards-and-gain-nightmares": {
      mechanic: "transfigured-card-chooser",
      policy: "card-fit",
      fields: ["predicate", "offerCount", "transfiguration", "nightmareCount"],
    },
    "purge-one-transfigure-and-copy-others": {
      mechanic: "transfigure-deck-entry",
      policy: "uniform",
      fields: ["offerCount", "transfiguration"],
    },
  };
  const contract = contracts[raw.effectKind];
  if (
    raw.canonicalMechanicId !== contract.mechanic ||
    raw.selectionPolicyId !== contract.policy
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires ${contract.mechanic} with ${contract.policy ?? "no selection policy"}`,
    );
  }
  const allowedFields = new Set(contract.fields);
  const unsupportedField = EXPLORATION_EFFECT_FIELDS.find(
    (field) => raw[field] !== undefined && !allowedFields.has(field),
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to ${raw.effectKind}`,
    );
  }
  if (
    allowedFields.has("predicate") &&
    (raw.predicate === undefined ||
      !EXPLORATION_PREDICATE_SET.has(raw.predicate))
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a supported non-Any predicate`,
    );
  }
  if (
    allowedFields.has("transfiguration") &&
    !TRANSFIGURATION_SET.has(raw.transfiguration ?? "")
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a supported transfiguration`,
    );
  }
  if (
    allowedFields.has("nightmareCount") &&
    (!Number.isInteger(raw.nightmareCount) || (raw.nightmareCount ?? 0) <= 0)
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a positive integer nightmareCount`,
    );
  }
  if (allowedFields.has("offerCount") && raw.offerCount !== 4) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires offerCount 4`,
    );
  }
  const requiresFollowup =
    raw.effectKind === "take-transfigured-cards-and-gain-nightmares" ||
    raw.effectKind === "purge-one-transfigure-and-copy-others";
  if (requiresFollowup) {
    if (raw.followupTitle === undefined || raw.followupSubtitle === undefined) {
      throw new Error(
        `Invalid Exploration data: ${raw.effectKind} requires a paired nonblank followup`,
      );
    }
  } else if (
    raw.followupTitle !== undefined ||
    raw.followupSubtitle !== undefined
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} does not support a followup`,
    );
  }
  const tokens = messageArgumentNames(raw.effectText);
  if (raw.effectKind === "purge-disclosed-and-transfigure-same-type") {
    if (tokens.length !== 1 || tokens[0] !== "deck_card") {
      throw new Error(
        "Invalid Exploration data: purge-disclosed-and-transfigure-same-type requires exactly the deck-card presentation token",
      );
    }
  } else {
    const allowedTokens = new Set<string>(
      raw.effectKind === "make-predicate-fast-and-gain-nightmares" ||
        raw.effectKind === "take-transfigured-cards-and-gain-nightmares"
        ? ["nightmare_card"]
        : [],
    );
    if (tokens.some((token) => !allowedTokens.has(token))) {
      throw new Error(
        `Invalid Exploration data: ${raw.effectKind} has an unsupported presentation token`,
      );
    }
  }
}

function validateShopPurchaseModifierFields(
  raw: ExplorationActionContent,
): void {
  if (!SHOP_PURCHASE_MODIFIER_EFFECT_KINDS.has(raw.effectKind)) return;
  if (
    raw.canonicalMechanicId !== "shop-purchase-modifier" ||
    raw.selectionPolicyId !== undefined
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires the shop-purchase-modifier mechanic without a selection policy`,
    );
  }
  const allowedFields = new Set<keyof ExplorationActionContent>(
    raw.effectKind === "lose-half-essence-and-free-purchases" ? ["count"] : [],
  );
  const unsupportedField = EXPLORATION_EFFECT_FIELDS.find(
    (field) => raw[field] !== undefined && !allowedFields.has(field),
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to ${raw.effectKind}`,
    );
  }
  if (
    raw.effectKind === "lose-half-essence-and-free-purchases" &&
    (!Number.isInteger(raw.count) || (raw.count ?? 0) <= 0)
  ) {
    throw new Error(
      "Invalid Exploration data: lose-half-essence-and-free-purchases requires a positive integer count",
    );
  }
  if (raw.followupTitle !== undefined || raw.followupSubtitle !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} does not support a followup`,
    );
  }
  if (messageArgumentNames(raw.effectText).length !== 0) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} does not support presentation tokens`,
    );
  }
}

function validateFixedSiteFields(raw: ExplorationActionContent): void {
  if (raw.effectKind !== "add-fixed-site") {
    if (raw.siteType !== undefined) {
      throw new Error(
        `Invalid Exploration data: siteType does not apply to ${raw.effectKind}`,
      );
    }
    return;
  }
  if (
    raw.canonicalMechanicId !== "add-site" ||
    raw.selectionPolicyId !== "fixed" ||
    !EXPLORATION_FIXED_SITE_TYPE_SET.has(raw.siteType ?? "")
  ) {
    throw new Error(
      "Invalid Exploration data: add-fixed-site requires the add-site mechanic, fixed policy, and a supported siteType",
    );
  }
  if (raw.followupTitle !== undefined || raw.followupSubtitle !== undefined) {
    throw new Error(
      "Invalid Exploration data: add-fixed-site does not support a followup",
    );
  }
  if (messageArgumentNames(raw.effectText).length !== 0) {
    throw new Error(
      "Invalid Exploration data: add-fixed-site does not support presentation tokens",
    );
  }
  const effectFields: ReadonlyArray<keyof ExplorationActionContent> = [
    "predicate",
    "count",
    "cardType",
    "cardId",
    "dreamsignId",
    "packCount",
    "packSize",
    "offerCount",
    "essencePerSpark",
    "essencePerCard",
    "sparkBonus",
    "essence",
    "minimumEssence",
    "maximumEssence",
    "energyCostReduction",
    "subtype",
    "subtypeOptions",
    "nightmareCount",
    "transfiguration",
    "deckTarget",
  ];
  const unsupportedField = effectFields.find(
    (field) => raw[field] !== undefined,
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to add-fixed-site`,
    );
  }
}

function validateSiteTypeChoiceFields(raw: ExplorationActionContent): void {
  if (raw.effectKind !== "choose-site-type") return;
  if (
    raw.canonicalMechanicId !== "add-site" ||
    raw.selectionPolicyId !== "site-uniform"
  ) {
    throw new Error(
      "Invalid Exploration data: choose-site-type requires the add-site mechanic and site-uniform policy",
    );
  }
  if (raw.offerCount !== 3) {
    throw new Error(
      "Invalid Exploration data: choose-site-type requires offerCount 3",
    );
  }
  if (raw.followupTitle === undefined || raw.followupSubtitle === undefined) {
    throw new Error(
      "Invalid Exploration data: choose-site-type requires a paired followup",
    );
  }
  if (messageArgumentNames(raw.effectText).length !== 0) {
    throw new Error(
      "Invalid Exploration data: choose-site-type does not support presentation tokens",
    );
  }
  const allowedFields = new Set<keyof ExplorationActionContent>(["offerCount"]);
  const effectFields: ReadonlyArray<keyof ExplorationActionContent> = [
    "predicate",
    "count",
    "cardType",
    "cardId",
    "dreamsignId",
    "packCount",
    "packSize",
    "offerCount",
    "essencePerSpark",
    "essencePerCard",
    "sparkBonus",
    "essence",
    "minimumEssence",
    "maximumEssence",
    "energyCostReduction",
    "subtype",
    "subtypeOptions",
    "nightmareCount",
    "transfiguration",
    "deckTarget",
    "siteType",
  ];
  const unsupportedField = effectFields.find(
    (field) => raw[field] !== undefined && !allowedFields.has(field),
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to choose-site-type`,
    );
  }
}

function validateNightmareDreamsignFieldApplicability(
  raw: ExplorationActionContent,
): void {
  if (
    raw.dreamsignId !== undefined &&
    !DREAMSIGN_ID_EFFECT_KINDS.has(raw.effectKind)
  ) {
    throw new Error(
      `Invalid Exploration data: dreamsignId does not apply to ${raw.effectKind}`,
    );
  }
  if (
    raw.offerCount !== undefined &&
    !OFFER_COUNT_EFFECT_KINDS.has(raw.effectKind)
  ) {
    throw new Error(
      `Invalid Exploration data: offerCount does not apply to ${raw.effectKind}`,
    );
  }
  if (
    raw.nightmareCount !== undefined &&
    !NIGHTMARE_COUNT_EFFECT_KINDS.has(raw.effectKind)
  ) {
    throw new Error(
      `Invalid Exploration data: nightmareCount does not apply to ${raw.effectKind}`,
    );
  }
}

function validateStarterEffectFields(raw: ExplorationActionContent): void {
  if (!STARTER_EFFECT_KINDS.has(raw.effectKind)) return;
  const permitsPredicate = STARTER_REPLACEMENT_EFFECT_KINDS.has(raw.effectKind);
  const isStarterTransfigure = STARTER_TRANSFIGURE_EFFECT_KINDS.has(
    raw.effectKind,
  );
  const expectedMechanic = permitsPredicate
    ? "replace-deck-entry"
    : isStarterTransfigure
      ? "transfigure-deck-entry"
      : "purge-deck-entry";
  if (raw.canonicalMechanicId !== expectedMechanic) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires canonical mechanic ${expectedMechanic}`,
    );
  }
  if (permitsPredicate && raw.selectionPolicyId !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} does not support a top-level selection policy`,
    );
  }
  if (!permitsPredicate && raw.selectionPolicyId !== "uniform") {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires uniform selection policy`,
    );
  }
  if (
    permitsPredicate &&
    (typeof raw.predicate !== "string" ||
      !EXPLORATION_PREDICATE_SET.has(raw.predicate))
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a supported non-Any predicate`,
    );
  }
  if (!permitsPredicate && raw.predicate !== undefined) {
    throw new Error(
      `Invalid Exploration data: predicate does not apply to ${raw.effectKind}`,
    );
  }
  if (raw.effectKind === "transfigure-random-starter-cards") {
    if (!Number.isInteger(raw.count) || (raw.count ?? 0) <= 0) {
      throw new Error(
        "Invalid Exploration data: transfigure-random-starter-cards requires a positive integer count",
      );
    }
  } else if (raw.count !== undefined) {
    throw new Error(
      `Invalid Exploration data: count does not apply to ${raw.effectKind}`,
    );
  }
  const unsupportedFields: ReadonlyArray<keyof ExplorationActionContent> = [
    "cardId",
    "dreamsignId",
    "packCount",
    "packSize",
    "offerCount",
    "essencePerSpark",
    "essencePerCard",
    "sparkBonus",
    "essence",
    "minimumEssence",
    "maximumEssence",
    "energyCostReduction",
    "subtype",
    "subtypeOptions",
    "nightmareCount",
    "transfiguration",
    "deckTarget",
    "cardType",
  ];
  const unsupportedField = unsupportedFields.find(
    (field) => raw[field] !== undefined,
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to ${raw.effectKind}`,
    );
  }
  if (raw.followupTitle !== undefined || raw.followupSubtitle !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} does not support a followup`,
    );
  }
  if (
    isStarterTransfigure &&
    messageArgumentNames(raw.effectText).length !== 0
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} does not support presentation tokens`,
    );
  }
}

function validateMultiCardTransfigurationFields(
  raw: ExplorationActionContent,
): void {
  if (!MULTI_CARD_TRANSFIGURATION_EFFECT_KINDS.has(raw.effectKind)) return;
  if (raw.canonicalMechanicId !== "transfigure-deck-entry") {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires canonical mechanic transfigure-deck-entry`,
    );
  }
  if (
    raw.selectionPolicyId === undefined ||
    (raw.effectKind === "transfigure-selected"
      ? raw.selectionPolicyId !== "uniform" &&
        raw.selectionPolicyId !== "transfiguration-value"
      : raw.selectionPolicyId !== "uniform")
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} has an unsupported selection policy`,
    );
  }
  if (!Number.isInteger(raw.count) || (raw.count ?? 0) <= 0) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a positive integer count`,
    );
  }
  const requiresPredicate =
    raw.effectKind !== "transfigure-selected" || (raw.count ?? 0) > 1;
  if (
    requiresPredicate &&
    (typeof raw.predicate !== "string" ||
      !EXPLORATION_PREDICATE_SET.has(raw.predicate))
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a supported non-Any predicate`,
    );
  }
  if (
    raw.predicate !== undefined &&
    !EXPLORATION_PREDICATE_SET.has(raw.predicate)
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} has an unsupported predicate`,
    );
  }
  if (
    raw.effectKind === "transfigure-fixed-random-cards" &&
    !TRANSFIGURATION_SET.has(raw.transfiguration ?? "")
  ) {
    throw new Error(
      "Invalid Exploration data: transfigure-fixed-random-cards requires a supported transfiguration",
    );
  }
  if (
    raw.effectKind !== "transfigure-fixed-random-cards" &&
    raw.transfiguration !== undefined
  ) {
    throw new Error(
      `Invalid Exploration data: transfiguration does not apply to ${raw.effectKind}`,
    );
  }
  if (
    raw.effectKind === "transfigure-selected" &&
    (raw.count ?? 0) > 1 &&
    (raw.followupTitle === undefined || raw.followupSubtitle === undefined)
  ) {
    throw new Error(
      "Invalid Exploration data: multi-card transfigure-selected requires a paired followup",
    );
  }
  if (AUTOMATIC_MULTI_CARD_TRANSFIGURATION_EFFECT_KINDS.has(raw.effectKind)) {
    if (raw.followupTitle !== undefined || raw.followupSubtitle !== undefined) {
      throw new Error(
        `Invalid Exploration data: ${raw.effectKind} does not support a followup`,
      );
    }
    if (messageArgumentNames(raw.effectText).length !== 0) {
      throw new Error(
        `Invalid Exploration data: ${raw.effectKind} does not support presentation tokens`,
      );
    }
  }
  const allowedFields = new Set<keyof ExplorationActionContent>([
    "predicate",
    "count",
    ...(raw.effectKind === "transfigure-fixed-random-cards"
      ? ["transfiguration" as const]
      : []),
  ]);
  const effectFields: ReadonlyArray<keyof ExplorationActionContent> = [
    "predicate",
    "count",
    "cardId",
    "dreamsignId",
    "packCount",
    "packSize",
    "offerCount",
    "essencePerSpark",
    "essencePerCard",
    "sparkBonus",
    "essence",
    "minimumEssence",
    "maximumEssence",
    "energyCostReduction",
    "subtype",
    "subtypeOptions",
    "nightmareCount",
    "transfiguration",
    "deckTarget",
    "cardType",
  ];
  const unsupportedField = effectFields.find(
    (field) => raw[field] !== undefined && !allowedFields.has(field),
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to ${raw.effectKind}`,
    );
  }
}

const WAVE4B_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> = new Set([
  "replace-selected",
  "transfigure-fixed-selected",
  "copy-random-cards",
  "change-random-card-type",
]);
const AUTOMATIC_WAVE4B_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set(["copy-random-cards", "change-random-card-type"]);

function validateWave4bFields(raw: ExplorationActionContent): void {
  if (
    raw.cardType !== undefined &&
    raw.effectKind !== "change-random-card-type" &&
    raw.effectKind !== "change-card-type-selected"
  ) {
    throw new Error(
      `Invalid Exploration data: cardType does not apply to ${raw.effectKind}`,
    );
  }
  if (!WAVE4B_EFFECT_KINDS.has(raw.effectKind)) return;
  const count = raw.count ?? 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a positive integer count`,
    );
  }
  const expectedMechanic =
    raw.effectKind === "replace-selected"
      ? "replace-deck-entry"
      : raw.effectKind === "copy-random-cards"
        ? "duplicate-deck-entry"
        : raw.effectKind === "change-random-card-type"
          ? "change-entry-card-type"
          : "transfigure-deck-entry";
  if (raw.canonicalMechanicId !== expectedMechanic) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires canonical mechanic ${expectedMechanic}`,
    );
  }
  const allowedPolicies = AUTOMATIC_WAVE4B_EFFECT_KINDS.has(raw.effectKind)
    ? new Set(["uniform"])
    : raw.effectKind === "replace-selected"
      ? new Set(["uniform", "card-fit-quality"])
      : new Set(["uniform", "transfiguration-value"]);
  if (
    raw.selectionPolicyId === undefined ||
    !allowedPolicies.has(raw.selectionPolicyId)
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} has an unsupported selection policy`,
    );
  }
  if (
    (raw.effectKind === "replace-selected" ||
      raw.effectKind === "copy-random-cards") &&
    (typeof raw.predicate !== "string" ||
      !EXPLORATION_PREDICATE_SET.has(raw.predicate))
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires a supported non-Any predicate`,
    );
  }
  if (raw.effectKind === "transfigure-fixed-selected") {
    if (!TRANSFIGURATION_SET.has(raw.transfiguration ?? "")) {
      throw new Error(
        "Invalid Exploration data: transfigure-fixed-selected requires a supported transfiguration",
      );
    }
    if (
      count > 1 &&
      (raw.deckTarget !== "chosen" ||
        typeof raw.predicate !== "string" ||
        !EXPLORATION_PREDICATE_SET.has(raw.predicate))
    ) {
      throw new Error(
        "Invalid Exploration data: multi-card transfigure-fixed-selected requires a chosen target and supported predicate",
      );
    }
  }
  if (
    (raw.effectKind === "replace-selected" ||
      raw.effectKind === "transfigure-fixed-selected") &&
    count > 1 &&
    (raw.followupTitle === undefined || raw.followupSubtitle === undefined)
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} with count greater than one requires a paired followup`,
    );
  }
  if (
    raw.effectKind === "change-random-card-type" &&
    raw.cardType !== "Character" &&
    raw.cardType !== "Event"
  ) {
    throw new Error(
      "Invalid Exploration data: change-random-card-type requires Character or Event cardType",
    );
  }
  if (AUTOMATIC_WAVE4B_EFFECT_KINDS.has(raw.effectKind)) {
    if (raw.followupTitle !== undefined || raw.followupSubtitle !== undefined) {
      throw new Error(
        `Invalid Exploration data: ${raw.effectKind} does not support a followup`,
      );
    }
    const allowedTokens =
      raw.effectKind === "change-random-card-type"
        ? new Set(["card_type"])
        : new Set<string>();
    const tokens = messageArgumentNames(raw.effectText);
    if (tokens.some((token) => !allowedTokens.has(token))) {
      throw new Error(
        `Invalid Exploration data: ${raw.effectKind} does not support target-disclosing presentation tokens`,
      );
    }
  }
  const allowedFields = new Set<keyof ExplorationActionContent>(
    raw.effectKind === "replace-selected"
      ? ["predicate", "count"]
      : raw.effectKind === "transfigure-fixed-selected"
        ? ["predicate", "count", "transfiguration", "deckTarget"]
        : raw.effectKind === "copy-random-cards"
          ? ["predicate", "count"]
          : ["count", "cardType"],
  );
  const effectFields: ReadonlyArray<keyof ExplorationActionContent> = [
    "predicate",
    "count",
    "cardType",
    "cardId",
    "dreamsignId",
    "packCount",
    "packSize",
    "offerCount",
    "essencePerSpark",
    "essencePerCard",
    "sparkBonus",
    "essence",
    "minimumEssence",
    "maximumEssence",
    "energyCostReduction",
    "subtype",
    "subtypeOptions",
    "nightmareCount",
    "transfiguration",
    "deckTarget",
  ];
  const unsupportedField = effectFields.find(
    (field) => raw[field] !== undefined && !allowedFields.has(field),
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to ${raw.effectKind}`,
    );
  }
}

const WAVE7_DECK_MUTATION_EFFECT_KINDS: ReadonlySet<ExplorationEffectKind> =
  new Set(["replace-random-with-card", "change-card-type-selected"]);

function validateWave7DeckMutationFields(raw: ExplorationActionContent): void {
  if (!WAVE7_DECK_MUTATION_EFFECT_KINDS.has(raw.effectKind)) return;
  const isReplacement = raw.effectKind === "replace-random-with-card";
  const expectedMechanic = isReplacement
    ? "replace-deck-entry"
    : "change-entry-card-type";
  const expectedPolicy = isReplacement ? "uniform" : "deck-entry-centrality";
  if (
    raw.canonicalMechanicId !== expectedMechanic ||
    raw.selectionPolicyId !== expectedPolicy
  ) {
    throw new Error(
      `Invalid Exploration data: ${raw.effectKind} requires ${expectedMechanic} with ${expectedPolicy}`,
    );
  }
  if (raw.count !== undefined) {
    throw new Error(
      `Invalid Exploration data: count does not apply to ${raw.effectKind}`,
    );
  }
  if (isReplacement) {
    if (
      raw.predicate === undefined ||
      !EXPLORATION_PREDICATE_SET.has(raw.predicate) ||
      raw.cardId === undefined
    ) {
      throw new Error(
        "Invalid Exploration data: replace-random-with-card requires a supported predicate and fixed cardId",
      );
    }
    if (raw.deckTarget !== undefined || raw.cardType !== undefined) {
      throw new Error(
        "Invalid Exploration data: replace-random-with-card does not support a deckTarget or cardType",
      );
    }
    if (raw.followupTitle !== undefined || raw.followupSubtitle !== undefined) {
      throw new Error(
        "Invalid Exploration data: replace-random-with-card does not support a followup",
      );
    }
    const tokens = messageArgumentNames(raw.effectText);
    if (
      !tokens.includes("fixed_card") ||
      tokens.some((token) => token !== "fixed_card")
    ) {
      throw new Error(
        "Invalid Exploration data: replace-random-with-card requires only the fixed-card presentation token",
      );
    }
  } else {
    if (raw.cardType !== "Character" && raw.cardType !== "Event") {
      throw new Error(
        "Invalid Exploration data: change-card-type-selected requires Character or Event cardType",
      );
    }
    if (raw.predicate !== undefined || raw.cardId !== undefined) {
      throw new Error(
        "Invalid Exploration data: change-card-type-selected does not support predicate or cardId",
      );
    }
    const tokens = messageArgumentNames(raw.effectText);
    const allowedTokens = new Set<string>(["deck_card", "card_type"]);
    if (tokens.some((token) => !allowedTokens.has(token))) {
      throw new Error(
        "Invalid Exploration data: change-card-type-selected has unsupported presentation tokens",
      );
    }
    if (raw.deckTarget === "offered") {
      if (
        !tokens.includes("deck_card") ||
        raw.followupTitle !== undefined ||
        raw.followupSubtitle !== undefined
      ) {
        throw new Error(
          "Invalid Exploration data: offered change-card-type-selected requires a deck-card token and no followup",
        );
      }
    } else if (
      raw.deckTarget !== "chosen" ||
      raw.followupTitle === undefined ||
      raw.followupSubtitle === undefined
    ) {
      throw new Error(
        "Invalid Exploration data: chosen change-card-type-selected requires a paired followup",
      );
    }
  }

  const allowedFields = new Set<keyof ExplorationActionContent>(
    isReplacement ? ["predicate", "cardId"] : ["cardType", "deckTarget"],
  );
  const unsupportedField = EXPLORATION_EFFECT_FIELDS.find(
    (field) => raw[field] !== undefined && !allowedFields.has(field),
  );
  if (unsupportedField !== undefined) {
    throw new Error(
      `Invalid Exploration data: ${String(unsupportedField)} does not apply to ${raw.effectKind}`,
    );
  }
}

function validateAction(
  raw: ExplorationActionContent,
): ExplorationActionContent {
  if (
    typeof raw.effectText === "string" &&
    /\$[A-Z][A-Z0-9_]*/u.test(raw.effectText)
  ) {
    throw new Error(
      "Invalid Exploration data: action effect text uses an untyped presentation token",
    );
  }
  raw = {
    ...raw,
    label: hydrateStaticMessage(raw.label, "action label"),
    effectText: hydrateEffectMessage(raw.effectText),
    ...(raw.followupTitle === undefined
      ? {}
      : { followupTitle: hydrateEffectMessage(raw.followupTitle) }),
    ...(raw.followupSubtitle === undefined
      ? {}
      : { followupSubtitle: hydrateEffectMessage(raw.followupSubtitle) }),
    ...(raw.subtype === undefined
      ? {}
      : { subtype: parseCardSubtype(raw.subtype) }),
    ...(raw.subtypeOptions === undefined
      ? {}
      : {
          subtypeOptions: raw.subtypeOptions.map((subtype) =>
            parseCardSubtype(subtype),
          ),
        }),
  };
  validateWave8CompoundFields(raw);
  validateShopPurchaseModifierFields(raw);
  validateFixedSiteFields(raw);
  validateSiteTypeChoiceFields(raw);
  validateNightmareDreamsignFieldApplicability(raw);
  validateStarterEffectFields(raw);
  validateMultiCardTransfigurationFields(raw);
  validateWave4bFields(raw);
  validateWave7DeckMutationFields(raw);
  if (
    (raw.followupTitle === undefined) !==
    (raw.followupSubtitle === undefined)
  ) {
    throw new Error(
      "Invalid Exploration data: action followup fields must be paired",
    );
  }
  const targeted = new Set<ExplorationEffectKind>([
    "change-subtype-selected",
    "change-card-type-selected",
    "transfigure-fixed-selected",
    "copy-selected-card",
  ]);
  if (targeted.has(raw.effectKind)) {
    if (raw.deckTarget !== "chosen" && raw.deckTarget !== "offered") {
      throw new Error(
        "Invalid Exploration data: targeted action requires deckTarget",
      );
    }
  } else if (raw.deckTarget !== undefined) {
    throw new Error(
      "Invalid Exploration data: action has unsupported deckTarget",
    );
  }
  if (
    raw.effectKind === "transfigure-all-for-essence" &&
    (!Number.isInteger(raw.essence) ||
      (raw.essence ?? 0) <= 0 ||
      raw.predicate === undefined ||
      raw.transfiguration === undefined)
  ) {
    throw new Error(
      "Invalid Exploration data: bulk transfiguration requires essence, predicate, and transfiguration",
    );
  }
  if (
    raw.effectKind === "gain-essence" &&
    (!Number.isInteger(raw.essence) || (raw.essence ?? 0) <= 0)
  ) {
    throw new Error(
      "Invalid Exploration data: fixed Essence gain requires a positive integer essence",
    );
  }
  if (
    raw.effectKind === "gain-random-essence" &&
    (!Number.isInteger(raw.minimumEssence) ||
      !Number.isInteger(raw.maximumEssence) ||
      (raw.minimumEssence ?? 0) <= 0 ||
      (raw.maximumEssence ?? -1) < (raw.minimumEssence ?? 0))
  ) {
    throw new Error(
      "Invalid Exploration data: random Essence gain requires ordered positive integer bounds",
    );
  }
  if (
    (raw.effectKind === "gain-offered-dreamsign" ||
      raw.effectKind === "replace-selected-dreamsign-with-offered") &&
    (!Number.isInteger(raw.offerCount) || (raw.offerCount ?? 0) <= 0)
  ) {
    throw new Error(
      "Invalid Exploration data: offered Dreamsign effects require a positive integer offerCount",
    );
  }
  if (
    raw.effectKind === "purge-selected-dreamsign-and-gain-random" &&
    (!Number.isInteger(raw.count) || (raw.count ?? 0) <= 0)
  ) {
    throw new Error(
      "Invalid Exploration data: Dreamsign purge replacement requires a positive integer count",
    );
  }
  if (
    raw.effectKind === "gain-nightmare-and-dreamsign" &&
    (typeof raw.dreamsignId !== "string" ||
      raw.dreamsignId.trim() === "" ||
      !Number.isInteger(raw.nightmareCount) ||
      (raw.nightmareCount ?? 0) <= 0)
  ) {
    throw new Error(
      "Invalid Exploration data: fixed Nightmare Dreamsign gain requires dreamsignId and a positive integer nightmareCount",
    );
  }
  if (
    raw.effectKind === "gain-nightmare-and-offered-dreamsign" &&
    (!Number.isInteger(raw.offerCount) ||
      (raw.offerCount ?? 0) <= 0 ||
      !Number.isInteger(raw.nightmareCount) ||
      (raw.nightmareCount ?? 0) <= 0)
  ) {
    throw new Error(
      "Invalid Exploration data: offered Nightmare Dreamsign gain requires positive integer offerCount and nightmareCount",
    );
  }
  return {
    ...raw,
    id: parseExplorationActionId(requiredString(raw.id, "action id")),
    ...(raw.cardId === undefined ? {} : { cardId: raw.cardId }),
  };
}

const EXPLORATION_EFFECT_KIND_SET: ReadonlySet<string> = new Set(
  EXPLORATION_EFFECT_KINDS,
);

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
    typeof raw.contentHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(raw.contentHash) ||
    raw.foldHash !== raw.contentHash
  ) {
    throw new Error("Invalid Exploration data: malformed compiler metadata");
  }
  const customCards = (raw.customCards ?? []).map((card) => ({
    ...card,
    id: card.id,
    name: parseCardName(card.name),
  }));
  const encounters = (raw.encounters ?? []).map((encounter) => {
    const actions = encounter.action ?? [];
    if (actions.length < 1 || actions.length > 4) {
      throw new Error(
        `Invalid Exploration data: encounter ${String(encounter.cardId)} must have between one and four actions`,
      );
    }
    return {
      cardId: parseCardId(requiredString(encounter.cardId, "encounter card id")),
      prose: hydrateStaticMessage(encounter.prose, "encounter prose"),
      actions: actions.map(validateAction),
    } satisfies ExplorationEncounterContent;
  });
  if (encounters.length === 0) {
    throw new Error(
      "Invalid Exploration data: requires at least one encounter",
    );
  }
  const encounterIds = new Set<CardId>();
  const actionIds = new Set<ExplorationActionId>();
  for (const encounter of encounters) {
    const encounterId = encounter.cardId;
    if (encounterIds.has(encounterId)) {
      throw new Error(
        `Invalid Exploration data: duplicate encounter card id ${encounter.cardId}`,
      );
    }
    encounterIds.add(encounterId);
    for (const action of encounter.actions) {
      if (!EXPLORATION_EFFECT_KIND_SET.has(action.effectKind)) {
        throw new Error(
          `Invalid Exploration data: unknown effect kind ${action.effectKind}`,
        );
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
    contentHash: parseContentHash(raw.contentHash),
    foldHash: parseFoldHash(raw.foldHash),
    customCards,
    customDreamsigns: raw.customDreamsigns ?? [],
    encounters,
  };
}

/** Resolve an encounter by its source-card UUID. */
export function explorationEncounterForCard(
  content: ExplorationContent,
  cardId: CardId,
): ExplorationEncounterContent | null {
  const normalized = cardId.toLowerCase();
  return (
    content.encounters.find(
      (encounter) => encounter.cardId.toLowerCase() === normalized,
    ) ?? null
  );
}
