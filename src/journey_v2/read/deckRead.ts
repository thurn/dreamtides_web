import { applyDeckEntryCardModification } from "../../card-type-change";
import {
  applyTransfigurationToCard,
  describeTransfiguration,
  eligibleTransfigurations,
} from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/quest";
import type {
  MerchantContext,
  MerchantDeckCard,
  MerchantNeed,
  MerchantNeedObservation,
  MerchantRoleNeed,
} from "../types";

type MerchantNeedInput = MerchantNeed extends infer Need
  ? Need extends MerchantNeed
    ? Omit<Need, "score">
    : never
  : never;
type MerchantUpgradeNeed = Extract<MerchantNeed, { needKind: "upgrade_target" }>;

interface RoleProfile {
  counts: Record<MerchantRoleNeed, number>;
  presentPayoffThemes: Set<string>;
  supportCounts: Map<string, number>;
  soleSupportEntryIds: Set<string>;
}

const TIER_TARGET: Readonly<Record<number, number>> = {
  1: 0.1,
  2: 0.18,
  3: 0.25,
};

const ROLE_LABELS: Readonly<Record<MerchantRoleNeed, string>> = {
  draw: "draw",
  recursion: "recursion",
  interaction: "interaction",
  cheap_early_play: "cheap early play",
  events: "events",
  characters: "characters",
  abandon_outlet: "abandon outlet",
  finisher: "finisher",
};

const ROLE_BUILDER_IDS: Readonly<Record<MerchantRoleNeed, readonly string[]>> = {
  draw: ["grant_support_card", "grant_exact_card", "transfigure_card"],
  recursion: ["grant_support_card", "add_reclaim_to_event"],
  interaction: ["grant_support_card", "grant_exact_card", "add_fast_to_event"],
  cheap_early_play: ["grant_support_card", "grant_exact_card", "transfigure_card"],
  events: ["grant_support_card", "grant_exact_card"],
  characters: ["grant_support_card", "grant_exact_card"],
  abandon_outlet: ["grant_support_card", "duplicate_keystone"],
  finisher: ["grant_support_card", "duplicate_keystone", "transfigure_card"],
};

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.round(value * 1000) / 1000;
}

function score(severity: number, confidence: number): number {
  return clamp01(severity) * clamp01(confidence);
}

function stablePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ref(deckCard: MerchantDeckCard) {
  return {
    cardUuid: deckCard.cardUuid,
    cardNumber: deckCard.cardNumber,
    entryId: deckCard.entryId,
    displayName: deckCard.displayName,
  };
}

function makeNeed<T extends MerchantNeedInput>(
  input: T,
): T & Pick<MerchantNeed, "score"> {
  return ({
    ...input,
    severity: clamp01(input.severity),
    confidence: clamp01(input.confidence),
    score: score(input.severity, input.confidence),
  } as unknown) as T & Pick<MerchantNeed, "score">;
}

function getEffectiveCard(deckCard: MerchantDeckCard): CardData {
  const transfigured =
    deckCard.deckEntry.transfiguration === null
      ? deckCard.card
      : applyTransfigurationToCard(deckCard.card, deckCard.deckEntry.transfiguration);
  return applyDeckEntryCardModification(transfigured, {
    typeChange: deckCard.deckEntry.typeChange,
    keywords: deckCard.deckEntry.keywordModification,
  });
}

function text(card: CardData): string {
  return card.renderedText.toLowerCase();
}

function hasRole(
  deckCard: MerchantDeckCard,
  context: MerchantContext,
  role: MerchantRoleNeed,
): boolean {
  const card = getEffectiveCard(deckCard);
  const cardText = text(card);
  const supports = context.supportMetaByUuid.get(deckCard.cardUuid)?.supports ?? [];

  switch (role) {
    case "draw":
      return /\bdraw(s|ing)?\b/i.test(card.renderedText);
    case "recursion":
      return (
        supports.includes("reclaim") ||
        /\breclaim\b|from your void|return [^.]*from your void/i.test(cardText)
      );
    case "interaction":
      return /(banish|dissolve an enemy|return [^.]*to (their|its)|prevent)/i.test(
        card.renderedText,
      );
    case "cheap_early_play":
      return (
        card.cardType === "Character" &&
        card.energyCost !== null &&
        card.energyCost <= 1
      );
    case "events":
      return card.cardType === "Event";
    case "characters":
      return card.cardType === "Character";
    case "abandon_outlet":
      return supports.includes("abandon") || /\babandon\b/i.test(card.renderedText);
    case "finisher":
      return (card.spark ?? 0) >= 4 || /gains \+\d+/.test(cardText);
  }
}

function buildRoleProfile(context: MerchantContext): RoleProfile {
  const counts: Record<MerchantRoleNeed, number> = {
    draw: 0,
    recursion: 0,
    interaction: 0,
    cheap_early_play: 0,
    events: 0,
    characters: 0,
    abandon_outlet: 0,
    finisher: 0,
  };
  const presentPayoffThemes = new Set<string>();
  const supportCounts = new Map<string, number>();

  for (const deckCard of context.deckCards) {
    for (const role of Object.keys(counts) as MerchantRoleNeed[]) {
      if (hasRole(deckCard, context, role)) {
        counts[role] += 1;
      }
    }

    const meta = context.supportMetaByUuid.get(deckCard.cardUuid);
    for (const need of meta?.needs ?? []) {
      presentPayoffThemes.add(need.theme);
    }
    for (const theme of meta?.supports ?? []) {
      supportCounts.set(theme, (supportCounts.get(theme) ?? 0) + 1);
    }
  }

  const soleSupportEntryIds = new Set<string>();
  for (const deckCard of context.deckCards) {
    const supports = context.supportMetaByUuid.get(deckCard.cardUuid)?.supports ?? [];
    if (
      supports.some(
        (theme) => presentPayoffThemes.has(theme) && (supportCounts.get(theme) ?? 0) <= 1,
      )
    ) {
      soleSupportEntryIds.add(deckCard.entryId);
    }
  }

  return { counts, presentPayoffThemes, supportCounts, soleSupportEntryIds };
}

function observe(
  summary: string,
  metric?: MerchantNeedObservation["metric"],
  extra: Omit<MerchantNeedObservation, "summary" | "metric"> = {},
): MerchantNeedObservation {
  return { summary, metric, ...extra };
}

function detectUnderSupportedPayoffs(
  context: MerchantContext,
  profile: RoleProfile,
): MerchantNeed[] {
  const deckSize = Math.max(1, context.deckCards.length);
  const needs: MerchantNeed[] = [];

  for (const deckCard of context.deckCards) {
    const meta = context.supportMetaByUuid.get(deckCard.cardUuid);
    for (const supportNeed of meta?.needs ?? []) {
      const tierTarget = TIER_TARGET[supportNeed.tier] ?? TIER_TARGET[2];
      const supportCount = profile.supportCounts.get(supportNeed.theme) ?? 0;
      const supportShare = supportCount / deckSize;
      const adequacy = clamp01(supportShare / tierTarget);

      if (adequacy >= 0.6) continue;

      const severity = 1 - adequacy;
      needs.push(
        makeNeed({
          needId: `need:under-supported-payoff:${deckCard.entryId}:${deckCard.cardUuid}:${stablePart(supportNeed.theme)}`,
          needType: "card",
          needKind: "under_supported_payoff",
          label: `${deckCard.displayName} needs ${supportNeed.theme} support`,
          severity,
          confidence: 1,
          observation: observe(
            `${deckCard.displayName} is asking for more ${supportNeed.theme} support.`,
            { label: "support cards", value: supportCount },
            {
              subject: deckCard.displayName,
              theme: supportNeed.theme,
              roleLabel: supportNeed.theme,
            },
          ),
          compatibleRewardBuilderIds: [
            "grant_support_card",
            "grant_dreamsign",
            "duplicate_keystone",
          ],
          cardUuid: deckCard.cardUuid,
          cardNumber: deckCard.cardNumber,
          entryId: deckCard.entryId,
          themeId: supportNeed.theme,
          references: [ref(deckCard)],
          support: {
            theme: supportNeed.theme,
            tier: supportNeed.tier,
            supportCount,
            adequacy,
          },
        }),
      );
    }
  }

  return needs;
}

function roleRequirement(
  role: MerchantRoleNeed,
  context: MerchantContext,
  profile: RoleProfile,
): number {
  const deckSize = context.deckCards.length;
  if (deckSize === 0) return 0;

  switch (role) {
    case "draw":
    case "recursion":
    case "interaction":
      return Math.max(1, Math.ceil(deckSize * 0.12));
    case "cheap_early_play":
      return Math.max(2, Math.ceil(deckSize * 0.2));
    case "events":
    case "characters":
      return Math.max(2, Math.ceil(deckSize * 0.25));
    case "abandon_outlet":
      return profile.presentPayoffThemes.has("abandon") ? 1 : 0;
    case "finisher":
      return deckSize >= 8 ? 1 : 0;
  }
}

function detectMissingRoles(
  context: MerchantContext,
  profile: RoleProfile,
): MerchantNeed[] {
  const needs: MerchantNeed[] = [];
  const roleOrder: readonly MerchantRoleNeed[] = [
    "draw",
    "recursion",
    "interaction",
    "cheap_early_play",
    "events",
    "characters",
    "abandon_outlet",
    "finisher",
  ];

  for (const role of roleOrder) {
    const required = roleRequirement(role, context, profile);
    const coverage = profile.counts[role];
    if (required === 0 || coverage >= required) continue;

    const severity = (required - coverage) / required;
    const roleLabel = ROLE_LABELS[role];
    needs.push(
      makeNeed({
        needId: `need:missing-role:${role}`,
        needType: "theme",
        needKind: "missing_role",
        label: `Needs ${roleLabel}`,
        severity,
        confidence: role === "abandon_outlet" ? 0.9 : 0.72,
        observation: observe(
          `The deck is light on ${roleLabel}.`,
          { label: "count", value: coverage },
          { subject: roleLabel, roleLabel },
        ),
        compatibleRewardBuilderIds: ROLE_BUILDER_IDS[role],
        role,
        themeId: role,
        support: {
          theme: role,
          supportCount: coverage,
          requiredCount: required,
        },
      }),
    );
  }

  return needs;
}

function projectionMetric(
  transfiguration: TransfigurationType,
  card: CardData,
  previewCard: CardData,
): MerchantNeedObservation["metric"] | undefined {
  switch (transfiguration) {
    case "Viridian":
      return {
        label: "cost",
        from: card.energyCost,
        to: previewCard.energyCost,
      };
    case "Scarlet":
      return { label: "spark", from: card.spark ?? 0, to: previewCard.spark ?? 0 };
    case "Azure":
      return { label: "text", value: "adds draw" };
    case "Bronze":
      return { label: "text", value: "adds reclaim" };
    case "Golden":
      return { label: "text", value: "improves a number" };
    case "Magenta":
      return { label: "text", value: "improves a trigger" };
    case "Rose":
      return { label: "text", value: "discounts activated ability" };
    case "Prismatic":
      return { label: "text", value: "applies every eligible transfiguration" };
  }
}

function transfigurationBenefit(
  transfiguration: TransfigurationType,
  card: CardData,
  previewCard: CardData,
  profile: RoleProfile,
): number {
  switch (transfiguration) {
    case "Viridian": {
      const saved = (card.energyCost ?? 0) - (previewCard.energyCost ?? 0);
      return clamp01(saved / 2);
    }
    case "Scarlet":
      return clamp01(((previewCard.spark ?? 0) - (card.spark ?? 0)) / 4);
    case "Azure":
      return profile.counts.draw === 0 ? 0.8 : 0.45;
    case "Bronze":
      return profile.counts.recursion === 0 ? 0.75 : 0.45;
    case "Rose":
    case "Magenta":
      return 0.5;
    case "Golden":
      return 0.4;
    case "Prismatic":
      return 0.65;
  }
}

interface FitSignals {
  prior: number;
  cooccurrence: number;
}

function fitSignalsForDeckCard(
  deckCard: MerchantDeckCard,
  context: MerchantContext,
): FitSignals | null {
  const fitName = context.fitModel?.numberToName.get(deckCard.cardNumber);
  if (fitName === undefined) return null;
  const otherDeckNames = context.deckCards
    .filter((candidate) => candidate.entryId !== deckCard.entryId)
    .map((candidate) => context.fitModel?.numberToName.get(candidate.cardNumber))
    .filter((name): name is string => name !== undefined);
  const cooccurrence =
    otherDeckNames.length === 0
      ? 0
      : otherDeckNames.reduce(
          (total, deckName) =>
            total + (context.fitModel?.coocNorm.get(deckName)?.get(fitName) ?? 0),
          0,
        ) / otherDeckNames.length;
  return {
    prior: context.fitModel?.prior.get(fitName) ?? 0,
    cooccurrence,
  };
}

function centrality(
  deckCard: MerchantDeckCard,
  effectiveCard: CardData,
  context: MerchantContext,
): number {
  const fitSignals = fitSignalsForDeckCard(deckCard, context);
  if (fitSignals !== null) {
    return clamp01(fitSignals.prior * 0.65 + fitSignals.cooccurrence * 0.35);
  }

  let value = 0.25;
  if (!effectiveCard.isStarter && effectiveCard.rarity !== "Starter") value += 0.2;
  if (context.supportMetaByUuid.get(deckCard.cardUuid)?.needs?.length) value += 0.25;
  if (context.supportMetaByUuid.get(deckCard.cardUuid)?.supports?.length) value += 0.15;
  if ((effectiveCard.spark ?? 0) >= 3) value += 0.15;
  return clamp01(value);
}

function detectUpgradeTargets(
  context: MerchantContext,
  profile: RoleProfile,
): MerchantNeed[] {
  const candidates: MerchantUpgradeNeed[] = [];

  for (const deckCard of context.deckCards) {
    if (deckCard.deckEntry.transfiguration !== null) continue;
    const effectiveCard = getEffectiveCard(deckCard);

    for (const transfiguration of eligibleTransfigurations(effectiveCard)) {
      const previewCard = applyTransfigurationToCard(effectiveCard, transfiguration);
      const benefit = transfigurationBenefit(
        transfiguration,
        effectiveCard,
        previewCard,
        profile,
      );
      if (benefit <= 0) continue;

      const severity = clamp01(
        0.35 + 0.45 * benefit + 0.2 * centrality(deckCard, effectiveCard, context),
      );
      const metric = projectionMetric(transfiguration, effectiveCard, previewCard);
      candidates.push(
        makeNeed({
          needId: `need:upgrade-target:${deckCard.entryId}:${deckCard.cardUuid}:${transfiguration}`,
          needType: "card",
          needKind: "upgrade_target",
          label: `${transfiguration} upgrade for ${deckCard.displayName}`,
          severity,
          confidence: 0.85,
          observation: observe(
            `${transfiguration} improves ${deckCard.displayName}.`,
            metric,
            { subject: deckCard.displayName },
          ),
          compatibleRewardBuilderIds:
            transfiguration === "Viridian"
              ? ["transfigure_card", "grant_support_card"]
              : ["transfigure_card"],
          cardUuid: deckCard.cardUuid,
          cardNumber: deckCard.cardNumber,
          entryId: deckCard.entryId,
          references: [ref(deckCard)],
          projection: {
            transfiguration,
            description: describeTransfiguration(effectiveCard, transfiguration),
            metric,
            previewCard,
          },
        }),
      );
    }
  }

  const bestByEntry = new Map<string, MerchantUpgradeNeed>();
  for (const candidate of candidates) {
    const existing = bestByEntry.get(candidate.entryId);
    if (existing === undefined || compareNeeds(candidate, existing) < 0) {
      bestByEntry.set(candidate.entryId, candidate);
    }
  }

  return [...bestByEntry.values()].sort(compareNeeds).slice(0, 2);
}

function detectCurveProblems(
  context: MerchantContext,
  profile: RoleProfile,
): MerchantNeed[] {
  const effectiveCards = context.deckCards.map(getEffectiveCard);
  const cardsWithCost = effectiveCards.filter((card) => card.energyCost !== null);
  const averageCost =
    cardsWithCost.length === 0
      ? 0
      : Math.round(
          (cardsWithCost.reduce((sum, card) => sum + (card.energyCost ?? 0), 0) /
            cardsWithCost.length) *
            10,
        ) / 10;
  const earlyCount = profile.counts.cheap_early_play;
  const highCostCount = effectiveCards.filter((card) => (card.energyCost ?? 0) >= 4).length;
  const topHeavy = averageCost >= 2.8 || highCostCount >= Math.max(3, context.deckCards.length * 0.35);
  const earlyShort = earlyCount < Math.max(2, Math.ceil(context.deckCards.length * 0.18));
  const requiredEarly = Math.max(2, Math.ceil(context.deckCards.length * 0.18));
  const needs: MerchantNeed[] = [];

  if (topHeavy) {
    const severity = clamp01(
      Math.max(
        averageCost >= 2.8 ? (averageCost - 2.3) / 2 : 0,
        highCostCount / Math.max(1, context.deckCards.length),
      ),
    );
    needs.push(
      makeNeed({
        needId: "need:curve-problem:top-heavy",
        needType: "theme",
        needKind: "curve_problem",
        label: "Curve is top-heavy",
        severity,
        confidence: 0.78,
        observation: observe("The deck wants cheaper key cards or more early plays.", {
          label: "average cost",
          value: averageCost,
        }),
        compatibleRewardBuilderIds: ["transfigure_card", "grant_support_card"],
        role: "cheap_early_play",
        themeId: "curve",
        curveDirection: "top_heavy",
        support: {
          theme: "curve",
          supportCount: earlyCount,
          requiredCount: requiredEarly,
        },
      }),
    );
  }

  if (earlyShort) {
    needs.push(
      makeNeed({
        needId: "need:curve-problem:early-plays",
        needType: "theme",
        needKind: "curve_problem",
        label: "Needs more early plays",
        severity: clamp01((requiredEarly - earlyCount) / requiredEarly),
        confidence: 0.76,
        observation: observe("The deck is short on cheap early characters.", {
          label: "early plays",
          value: earlyCount,
        }),
        compatibleRewardBuilderIds: ["grant_support_card", "grant_exact_card"],
        role: "cheap_early_play",
        themeId: "curve",
        curveDirection: "early_plays",
        support: {
          theme: "curve",
          supportCount: earlyCount,
          requiredCount: requiredEarly,
        },
      }),
    );
  }

  return needs;
}

function weakContribution(deckCard: MerchantDeckCard, context: MerchantContext): number {
  const effectiveCard = getEffectiveCard(deckCard);
  let contribution = 0.45;
  if (effectiveCard.isStarter || effectiveCard.rarity === "Starter") contribution -= 0.35;
  if (deckCard.deckEntry.isBane) contribution -= 0.25;
  if ((effectiveCard.energyCost ?? 0) <= 1) contribution += 0.05;
  if ((effectiveCard.spark ?? 0) >= 3) contribution += 0.12;
  if (/\bdraw|reclaim|banish|abandon\b/i.test(effectiveCard.renderedText)) contribution += 0.14;

  const meta = context.supportMetaByUuid.get(deckCard.cardUuid);
  if (meta?.supports?.length) contribution += 0.2;
  if (meta?.needs?.length) contribution += 0.16;

  const fitSignals = fitSignalsForDeckCard(deckCard, context);
  if (fitSignals !== null) {
    contribution += fitSignals.prior * 0.18 + fitSignals.cooccurrence * 0.16;
  }

  return contribution;
}

function detectWeakCards(
  context: MerchantContext,
  profile: RoleProfile,
): MerchantNeed[] {
  if (context.deckCards.length < 4) return [];

  const candidates = context.deckCards
    .filter((deckCard) => !deckCard.deckEntry.isBane)
    .filter((deckCard) => !profile.soleSupportEntryIds.has(deckCard.entryId))
    .map((deckCard) => ({
      deckCard,
      contribution: weakContribution(deckCard, context),
    }))
    .sort((a, b) => a.contribution - b.contribution || a.deckCard.entryId.localeCompare(b.deckCard.entryId));

  const weakest = candidates[0];
  if (weakest === undefined || weakest.contribution > 0.3) return [];

  return [
    makeNeed({
      needId: `need:weak-card:${weakest.deckCard.entryId}:${weakest.deckCard.cardUuid}`,
      needType: "card",
      needKind: "weak_card",
      label: `${weakest.deckCard.displayName} is a safe purge target`,
      severity: clamp01(0.75 - weakest.contribution),
      confidence: weakest.deckCard.card.isStarter ? 0.82 : 0.68,
      observation: observe(
        `${weakest.deckCard.displayName} contributes less than the rest of the deck.`,
        { label: "contribution", value: Math.round(weakest.contribution * 100) / 100 },
        { subject: weakest.deckCard.displayName },
      ),
      compatibleRewardBuilderIds: ["purge_weak_card", "replace_weak_with_fit"],
      cardUuid: weakest.deckCard.cardUuid,
      cardNumber: weakest.deckCard.cardNumber,
      entryId: weakest.deckCard.entryId,
      references: [ref(weakest.deckCard)],
    }),
  ];
}

function detectDreamsignGap(context: MerchantContext): MerchantNeed[] {
  if (context.candidateDreamsigns.length === 0 || context.deckCards.length === 0) return [];
  const dreamsign = context.candidateDreamsigns[0];

  return [
    makeNeed({
      needId: "need:dreamsign-gap:available-sign",
      needType: "theme",
      needKind: "dreamsign_gap",
      label: "Could use a Dreamsign",
      severity: context.heldDreamsignIds.size === 0 ? 0.48 : 0.32,
      confidence: 0.58,
      observation: observe("A Dreamsign could add a broad passive angle.", {
        label: "available signs",
        value: context.candidateDreamsigns.length,
      }),
      compatibleRewardBuilderIds: ["grant_dreamsign"],
      dreamsignId: dreamsign.id,
      themeId: "dreamsign",
    }),
  ];
}

function detectBroadGrantFallbacks(context: MerchantContext): MerchantNeed[] {
  if (context.deckCards.length === 0 || context.candidateGrantCards.length === 0) {
    return [];
  }

  return [
    makeNeed({
      needId: "need:missing-role:broad-support",
      needType: "theme",
      needKind: "missing_role",
      label: "Could use broader support",
      severity: 0.34,
      confidence: 0.55,
      observation: observe("A support card could give the deck another angle.", {
        label: "grant candidates",
        value: context.candidateGrantCards.length,
      }),
      compatibleRewardBuilderIds: ["grant_support_card", "grant_exact_card"],
      themeId: "broad_support",
      support: {
        theme: "broad_support",
      },
    }),
    makeNeed({
      needId: "need:missing-role:deck-fit",
      needType: "theme",
      needKind: "missing_role",
      label: "Could improve deck fit",
      severity: 0.3,
      confidence: 0.52,
      observation: observe("A fitted replacement could lift the deck's floor.", {
        label: "grant candidates",
        value: context.candidateGrantCards.length,
      }),
      compatibleRewardBuilderIds: ["replace_weak_with_fit", "grant_exact_card"],
      themeId: "deck_fit",
      support: {
        theme: "deck_fit",
      },
    }),
  ];
}

function compareNeeds(a: MerchantNeed, b: MerchantNeed): number {
  return (
    b.score - a.score ||
    b.severity - a.severity ||
    b.confidence - a.confidence ||
    a.needId.localeCompare(b.needId)
  );
}

function dedupeConflicts(needs: readonly MerchantNeed[]): MerchantNeed[] {
  const survivingUnderSupportedThemes = new Set(
    needs
      .filter((need) => need.needKind === "under_supported_payoff")
      .map((need) => need.themeId)
      .filter((themeId): themeId is string => themeId !== undefined),
  );
  const underSupportedPayoffEntries = new Set(
    needs
      .filter((need) => need.needKind === "under_supported_payoff")
      .map((need) => need.entryId)
      .filter((entryId): entryId is string => entryId !== undefined),
  );

  return needs.filter((need) => {
    if (need.needKind === "weak_card" && need.entryId !== undefined) {
      return !underSupportedPayoffEntries.has(need.entryId);
    }
    if (
      need.needKind === "missing_role" &&
      need.role === "abandon_outlet" &&
      survivingUnderSupportedThemes.has("abandon")
    ) {
      return false;
    }
    return true;
  });
}

export function readMerchantDeck(context: MerchantContext): readonly MerchantNeed[] {
  if (context.deckCards.length === 0) return [];

  const profile = buildRoleProfile(context);
  const needs = [
    ...detectUnderSupportedPayoffs(context, profile),
    ...detectMissingRoles(context, profile),
    ...detectCurveProblems(context, profile),
    ...detectUpgradeTargets(context, profile),
    ...detectWeakCards(context, profile),
  ];

  const deduped = dedupeConflicts(needs).sort(compareNeeds);
  const fallbackCandidates = [
    ...detectDreamsignGap(context),
    ...detectBroadGrantFallbacks(context),
  ].filter(
    (fallback) => !deduped.some((need) => need.needId === fallback.needId),
  );
  const withFallbacks = [...deduped];
  for (const fallback of fallbackCandidates.sort(compareNeeds)) {
    if (withFallbacks.length >= 2) break;
    withFallbacks.push(fallback);
  }

  return withFallbacks.sort(compareNeeds);
}
