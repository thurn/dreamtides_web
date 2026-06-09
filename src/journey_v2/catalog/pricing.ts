import { sha256 } from "js-sha256";
import {
  CARD_VALUE_CONSTANTS,
  DREAMSIGN_OPERATION_VALUE_CONSTANTS,
  DREAMSIGN_VALUE_CONSTANTS,
  STARTER_SURGERY_VALUE_CONSTANTS,
} from "../../journeys/journey/value";
import type { Rarity } from "../../types/cards";
import type { MerchantNeed } from "../types";

export type MerchantRewardFamily =
  | "cardGrant"
  | "dreamsign"
  | "transfiguration"
  | "duplicate"
  | "purge"
  | "essence"
  | "other";

export interface MerchantRewardScarcityInput {
  rewardFamily?: MerchantRewardFamily;
  chooserCount?: number;
  rarity?: Rarity | null;
  broadCatalogReach?: number;
  outsidePool?: boolean;
}

export interface PriceMerchantRewardInput extends MerchantRewardScarcityInput {
  questSeed: string;
  siteId: string;
  offerId: string;
  rewardBuilderId: string;
  valueEssence: number;
  currentEssence: number;
  essenceCap: number;
  needSeverity?: number;
  need?: Pick<MerchantNeed, "severity">;
}

export interface MerchantRewardPrice {
  price: number;
  locked: boolean;
  lockedReason?: "insufficient_essence";
  valueEssence: number;
  needSeverity: number;
  needSeverityMultiplier: number;
  scarcityMultiplier: number;
  marketJitter: number;
}

export const MERCHANT_PRICE_MINIMUM = 25;
export const MERCHANT_MARKET_JITTER_MIN = 0.95;
export const MERCHANT_MARKET_JITTER_MAX = 1.08;
export const MERCHANT_NEED_SEVERITY_MULTIPLIER_MIN = 0.9;
export const MERCHANT_NEED_SEVERITY_MULTIPLIER_MAX = 1.12;

const MERCHANT_VALUE_REFERENCES = {
  ordinaryCardGrant: CARD_VALUE_CONSTANTS.namedVisibleByRarity.common,
  legendaryCardGrant: CARD_VALUE_CONSTANTS.namedVisibleByRarity.legendary,
  draftChoiceValues: CARD_VALUE_CONSTANTS.draftChoiceValues,
  dreamsignGain: DREAMSIGN_VALUE_CONSTANTS.namedGain,
  dreamsignPurchase: DREAMSIGN_OPERATION_VALUE_CONSTANTS.purchase,
  starterReplacement: STARTER_SURGERY_VALUE_CONSTANTS.replacementBase,
} as const;

const FAMILY_MULTIPLIERS: Readonly<Record<MerchantRewardFamily, number>> = {
  cardGrant: 1,
  dreamsign: 1.12,
  transfiguration: 1.04,
  duplicate: 1.04,
  purge: 0.96,
  essence: 0.92,
  other: 1,
};

const RARITY_MULTIPLIERS: Readonly<Record<Rarity, number>> = {
  Legendary: 1.12,
  Starter: 1,
  Special: 1.08,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function unitHash(parts: readonly string[]): number {
  const digest = sha256(parts.join("\0"));
  const value = Number.parseInt(digest.slice(0, 13), 16);
  return value / 0x10000000000000;
}

function roundMultiplier(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function needSeverityMultiplierFor(severity: number): number {
  const normalized = clamp(finiteOr(severity, 0.5), 0, 1);
  return roundMultiplier(
    MERCHANT_NEED_SEVERITY_MULTIPLIER_MAX -
      normalized *
        (MERCHANT_NEED_SEVERITY_MULTIPLIER_MAX -
          MERCHANT_NEED_SEVERITY_MULTIPLIER_MIN),
  );
}

export function marketJitterFor(input: {
  questSeed: string;
  siteId: string;
  offerId: string;
  rewardBuilderId: string;
}): number {
  const unit = unitHash([
    `seed:${input.questSeed}`,
    `site:${input.siteId}`,
    `offer:${input.offerId}`,
    `builder:${input.rewardBuilderId}`,
  ]);
  return roundMultiplier(
    MERCHANT_MARKET_JITTER_MIN +
      unit * (MERCHANT_MARKET_JITTER_MAX - MERCHANT_MARKET_JITTER_MIN),
  );
}

export function scarcityMultiplierFor(input: MerchantRewardScarcityInput): number {
  const familyMultiplier = FAMILY_MULTIPLIERS[input.rewardFamily ?? "other"];
  const rarityMultiplier =
    input.rarity === undefined || input.rarity === null
      ? 1
      : RARITY_MULTIPLIERS[input.rarity];
  const chooserCount = Math.max(1, Math.floor(finiteOr(input.chooserCount, 1)));
  const chooserMultiplier = 1 + Math.min(0.12, (chooserCount - 1) * 0.025);
  const broadCatalogReach = clamp(finiteOr(input.broadCatalogReach, 0), 0, 1);
  const reachMultiplier = 1 + broadCatalogReach * 0.08;
  const poolMultiplier = input.outsidePool === true ? 1.08 : 1;

  return roundMultiplier(
    familyMultiplier *
      rarityMultiplier *
      chooserMultiplier *
      reachMultiplier *
      poolMultiplier,
  );
}

export function valueEssenceForCardGrant(rarity?: Rarity | null): number {
  return rarity === "Legendary"
    ? MERCHANT_VALUE_REFERENCES.legendaryCardGrant
    : MERCHANT_VALUE_REFERENCES.ordinaryCardGrant;
}

export function priceMerchantReward(
  input: PriceMerchantRewardInput,
): MerchantRewardPrice {
  const valueEssence = Math.max(0, Math.round(finiteOr(input.valueEssence, 0)));
  const needSeverity = clamp(
    finiteOr(input.needSeverity ?? input.need?.severity, 0.5),
    0,
    1,
  );
  const needSeverityMultiplier = needSeverityMultiplierFor(needSeverity);
  const scarcityMultiplier = scarcityMultiplierFor(input);
  const marketJitter = marketJitterFor(input);
  const rawPrice = Math.round(
    valueEssence * needSeverityMultiplier * scarcityMultiplier * marketJitter,
  );
  const cap = Math.max(0, Math.round(finiteOr(input.essenceCap, 0)));
  const positiveValue = valueEssence > 0;
  const price =
    positiveValue && cap < MERCHANT_PRICE_MINIMUM
      ? MERCHANT_PRICE_MINIMUM
      : clamp(
          rawPrice,
          positiveValue ? MERCHANT_PRICE_MINIMUM : 0,
          Math.max(MERCHANT_PRICE_MINIMUM, cap),
        );
  const currentEssence = Math.max(0, Math.round(finiteOr(input.currentEssence, 0)));
  const locked =
    price > currentEssence || (positiveValue && cap < MERCHANT_PRICE_MINIMUM);

  return {
    price,
    locked,
    ...(locked ? { lockedReason: "insufficient_essence" as const } : {}),
    valueEssence,
    needSeverity,
    needSeverityMultiplier,
    scarcityMultiplier,
    marketJitter,
  };
}
