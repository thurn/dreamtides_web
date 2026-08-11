import type { JourneyContent } from "../data/journey-content";
import type { ExplorationPredicate } from "../data/exploration";
import {
  rewardTransfigurations,
  transfigurationBenefit,
} from "../journey_v2/archetypes/improve";
import { buildRewardSelectionContext } from "../reward-selection/context";
import { selectReward } from "../reward-selection/selectReward";
import { stableDigest } from "../reward-selection/stable";
import {
  SELECTION_RULES_VERSION,
  type RewardSelectionContext,
  type RewardSelectionRequest,
  type RewardSelectionResult,
  type RewardSelectionTrace,
  type SelectionRulesVersion,
} from "../reward-selection/types";
import {
  applyTransfigurationToCard,
  eligibleTransfigurations,
} from "../transfiguration/transfiguration-logic";
import type { CardData, CardType } from "../types/cards";
import type {
  JourneyState,
  SiteState,
  TransfigurationType,
} from "../types/journey";

export type ExplorationCompoundActionKind =
  | "all-card-transfiguration"
  | "purge-disclosed-transfigure-same-type"
  | "predicate-fast-nightmares"
  | "take-transfigured-nightmares"
  | "purge-transfigure-copy";

export interface ExplorationCompoundActionBinding {
  entryId: string;
  cardId: string;
}

export interface ExplorationCompoundActionTransfigurationTarget extends ExplorationCompoundActionBinding {
  transfiguration: TransfigurationType;
}

export type ExplorationCompoundActionUnavailableReason =
  | "empty-deck"
  | "all-cards-not-transfigurable"
  | "no-purge-target"
  | "no-same-type-companion"
  | "no-predicate-matches"
  | "insufficient-fixed-form-catalog-cards"
  | "insufficient-fixed-form-deck-entries"
  | "invalid-authored-configuration";

interface ExplorationCompoundActionPreparationCommon {
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: string;
  selectionKey: string;
  selectorSignatures: readonly string[];
  selectorTraces: readonly RewardSelectionTrace[];
  unavailableReason?: ExplorationCompoundActionUnavailableReason;
  planSignature: string;
}

export interface ExplorationAllCardTransfigurationBinding extends ExplorationCompoundActionBinding {
  positiveForms: readonly TransfigurationType[];
}

export interface ExplorationPurgeSameTypeBinding extends ExplorationCompoundActionBinding {
  effectiveCardType: CardType;
}

export type ExplorationCompoundActionPreparation =
  | (ExplorationCompoundActionPreparationCommon & {
      kind: "all-card-transfiguration";
      allCards: readonly ExplorationAllCardTransfigurationBinding[];
      targets: readonly ExplorationCompoundActionTransfigurationTarget[];
    })
  | (ExplorationCompoundActionPreparationCommon & {
      kind: "purge-disclosed-transfigure-same-type";
      transfiguration: TransfigurationType;
      eligiblePurgeTargets: readonly ExplorationPurgeSameTypeBinding[];
      target: ExplorationPurgeSameTypeBinding | null;
      companionTargets: readonly ExplorationCompoundActionTransfigurationTarget[];
    })
  | (ExplorationCompoundActionPreparationCommon & {
      kind: "predicate-fast-nightmares";
      predicate: ExplorationPredicate;
      nightmareCount: number;
      targets: readonly ExplorationCompoundActionBinding[];
    })
  | (ExplorationCompoundActionPreparationCommon & {
      kind: "take-transfigured-nightmares";
      predicate: ExplorationPredicate;
      offerCount: 4;
      transfiguration: TransfigurationType;
      nightmareCount: number;
      offeredCards: readonly {
        cardId: string;
        transfiguration: TransfigurationType;
      }[];
    })
  | (ExplorationCompoundActionPreparationCommon & {
      kind: "purge-transfigure-copy";
      offerCount: 4;
      transfiguration: TransfigurationType;
      eligibleCards: readonly ExplorationCompoundActionBinding[];
      targets: readonly ExplorationCompoundActionTransfigurationTarget[];
    });

type ExplorationUnsignedCompoundActionPreparation =
  ExplorationCompoundActionPreparation extends infer Preparation
    ? Preparation extends { planSignature: string }
      ? Omit<Preparation, "planSignature">
      : never
    : never;

interface ExplorationCompoundActionPlanInputCommon {
  actionId: string;
  encounterCardId: string;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

export type ExplorationCompoundActionPlanInput =
  ExplorationCompoundActionPlanInputCommon &
    (
      | { kind: "all-card-transfiguration" }
      | {
          kind: "purge-disclosed-transfigure-same-type";
          transfiguration: TransfigurationType;
        }
      | {
          kind: "predicate-fast-nightmares";
          predicate: ExplorationPredicate;
          nightmareCount: number;
        }
      | {
          kind: "take-transfigured-nightmares";
          predicate: ExplorationPredicate;
          offerCount: number;
          transfiguration: TransfigurationType;
          nightmareCount: number;
        }
      | {
          kind: "purge-transfigure-copy";
          offerCount: number;
          transfiguration: TransfigurationType;
        }
    );

const EXPLORATION_PREDICATES: ReadonlySet<ExplorationPredicate> = new Set([
  "character",
  "event",
  "cheap-character",
  "legendary",
  "spirit-animal",
  "survivor",
  "warrior",
]);

function matchesPredicate(
  card: CardData,
  predicate: ExplorationPredicate,
  content: JourneyContent,
): boolean {
  switch (predicate) {
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return (
        card.cardType === "Character" &&
        card.energyCost !== null &&
        card.energyCost <=
          content.rewardSelectionData.tuning.costBands.cheapCharacterMaximum
      );
    case "legendary":
      return card.rarity === "Legendary";
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function positiveForms(
  content: JourneyContent,
  card: CardData,
): readonly TransfigurationType[] {
  return rewardTransfigurations(content.transfigurationData, card).filter(
    (transfiguration) =>
      transfigurationBenefit(
        content.transfigurationData,
        card,
        transfiguration,
        applyTransfigurationToCard(
          content.transfigurationData,
          card,
          transfiguration,
        ),
      ) > 0,
  );
}

function supportsFixedForm(
  content: JourneyContent,
  card: CardData,
  transfiguration: TransfigurationType,
): boolean {
  if (
    !eligibleTransfigurations(content.transfigurationData, card).includes(
      transfiguration,
    )
  ) {
    return false;
  }
  return (
    transfigurationBenefit(
      content.transfigurationData,
      card,
      transfiguration,
      applyTransfigurationToCard(
        content.transfigurationData,
        card,
        transfiguration,
      ),
    ) > 0
  );
}

function isKnownTransfiguration(
  input: ExplorationCompoundActionPlanInput,
  transfiguration: unknown,
): transfiguration is TransfigurationType {
  return input.content.transfigurationData.forms.some(
    ({ id }) => id === transfiguration,
  );
}

function isValidAuthoredInput(
  input: ExplorationCompoundActionPlanInput,
): boolean {
  switch (input.kind) {
    case "all-card-transfiguration":
      return true;
    case "purge-disclosed-transfigure-same-type":
      return isKnownTransfiguration(input, input.transfiguration);
    case "predicate-fast-nightmares":
      return (
        EXPLORATION_PREDICATES.has(input.predicate) &&
        Number.isInteger(input.nightmareCount) &&
        input.nightmareCount > 0
      );
    case "take-transfigured-nightmares":
      return (
        EXPLORATION_PREDICATES.has(input.predicate) &&
        input.offerCount === 4 &&
        isKnownTransfiguration(input, input.transfiguration) &&
        Number.isInteger(input.nightmareCount) &&
        input.nightmareCount > 0
      );
    case "purge-transfigure-copy":
      return (
        input.offerCount === 4 &&
        isKnownTransfiguration(input, input.transfiguration)
      );
  }
}

function request(
  input: ExplorationCompoundActionPlanInput,
  suffix: string,
  fields: Omit<RewardSelectionRequest, "scope">,
): RewardSelectionRequest {
  return {
    ...fields,
    scope: {
      journeySeed: input.journey.seed,
      siteUuid: input.site.id,
      selectionKey: `${input.actionId}:${suffix}`,
    },
  };
}

function common(
  context: RewardSelectionContext,
  input: ExplorationCompoundActionPlanInput,
  selectors: readonly RewardSelectionResult[],
  unavailableReason?: ExplorationCompoundActionUnavailableReason,
): Omit<ExplorationCompoundActionPreparationCommon, "planSignature"> {
  return {
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: input.actionId,
    selectorSignatures: selectors.map(({ signature }) => signature),
    selectorTraces: selectors.map(({ trace }) => trace),
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
  };
}

function signedPreparation(
  input: ExplorationCompoundActionPlanInput,
  preparation: ExplorationUnsignedCompoundActionPreparation,
): ExplorationCompoundActionPreparation {
  return {
    ...preparation,
    planSignature: stableDigest({
      effect: authoredEffect(input),
      actionId: input.actionId,
      encounterCardId: input.encounterCardId,
      siteId: input.site.id,
      journeySeed: input.journey.seed,
      selectionContentRevision: preparation.selectionContentRevision,
      preparation,
    }),
  };
}

function authoredEffect(input: ExplorationCompoundActionPlanInput): unknown {
  switch (input.kind) {
    case "all-card-transfiguration":
      return { kind: input.kind };
    case "purge-disclosed-transfigure-same-type":
      return { kind: input.kind, transfiguration: input.transfiguration };
    case "predicate-fast-nightmares":
      return {
        kind: input.kind,
        predicate: input.predicate,
        nightmareCount: input.nightmareCount,
      };
    case "take-transfigured-nightmares":
      return {
        kind: input.kind,
        predicate: input.predicate,
        offerCount: input.offerCount,
        transfiguration: input.transfiguration,
        nightmareCount: input.nightmareCount,
      };
    case "purge-transfigure-copy":
      return {
        kind: input.kind,
        offerCount: input.offerCount,
        transfiguration: input.transfiguration,
      };
  }
}

function invalidPreparation(
  input: ExplorationCompoundActionPlanInput,
  context: RewardSelectionContext,
): ExplorationCompoundActionPreparation {
  const shared = common(context, input, [], "invalid-authored-configuration");
  switch (input.kind) {
    case "all-card-transfiguration":
      return signedPreparation(input, {
        kind: input.kind,
        allCards: [],
        targets: [],
        ...shared,
      });
    case "purge-disclosed-transfigure-same-type":
      return signedPreparation(input, {
        kind: input.kind,
        transfiguration: input.transfiguration,
        eligiblePurgeTargets: [],
        target: null,
        companionTargets: [],
        ...shared,
      });
    case "predicate-fast-nightmares":
      return signedPreparation(input, {
        kind: input.kind,
        predicate: input.predicate,
        nightmareCount: input.nightmareCount,
        targets: [],
        ...shared,
      });
    case "take-transfigured-nightmares":
      return signedPreparation(input, {
        kind: input.kind,
        predicate: input.predicate,
        offerCount: 4,
        transfiguration: input.transfiguration,
        nightmareCount: input.nightmareCount,
        offeredCards: [],
        ...shared,
      });
    case "purge-transfigure-copy":
      return signedPreparation(input, {
        kind: input.kind,
        offerCount: 4,
        transfiguration: input.transfiguration,
        eligibleCards: [],
        targets: [],
        ...shared,
      });
  }
}

function prepareAllCardTransfiguration(
  input: Extract<
    ExplorationCompoundActionPlanInput,
    { kind: "all-card-transfiguration" }
  >,
  context: RewardSelectionContext,
): ExplorationCompoundActionPreparation {
  const candidates = [...context.effectiveDeckCards]
    .map(({ entry, baseCard, effectiveCard }) => ({
      entry,
      baseCard,
      effectiveCard,
      forms:
        entry.transfiguration === null
          ? positiveForms(input.content, effectiveCard)
          : [],
    }))
    .sort(
      (left, right) =>
        left.entry.entryId.localeCompare(right.entry.entryId) ||
        left.baseCard.id.localeCompare(right.baseCard.id),
    );
  const allCards = candidates.map(({ entry, baseCard, forms }) => ({
    entryId: entry.entryId,
    cardId: baseCard.id,
    positiveForms: forms,
  }));
  const unavailable = (
    reason: ExplorationCompoundActionUnavailableReason,
  ): ExplorationCompoundActionPreparation =>
    signedPreparation(input, {
      kind: input.kind,
      allCards,
      targets: [],
      ...common(context, input, [], reason),
    });
  if (input.journey.deck.length === 0) return unavailable("empty-deck");
  if (
    candidates.length !== input.journey.deck.length ||
    candidates.some(
      ({ entry, forms }) =>
        entry.transfiguration !== null || forms.length === 0,
    )
  ) {
    return unavailable("all-cards-not-transfigurable");
  }

  const selectors: RewardSelectionResult[] = [];
  const targets: ExplorationCompoundActionTransfigurationTarget[] = [];
  for (const candidate of candidates) {
    const selection = selectReward(
      context,
      request(input, `all-card-form:${candidate.entry.entryId}`, {
        mechanicId: "transfigure-deck-entry",
        policyId: "uniform",
        count: 1,
        constraints: {
          fixedDeckEntryId: candidate.entry.entryId,
          allowedTransfigurations: candidate.forms,
          allowStarters: true,
          allowNightmare: true,
          distinctDeckEntries: true,
        },
      }),
    );
    const binding = selection.ok
      ? selection.bindings.transfigurations[0]
      : undefined;
    if (
      !selection.ok ||
      binding === undefined ||
      binding.entryId !== candidate.entry.entryId ||
      binding.cardUuid !== candidate.baseCard.id ||
      !candidate.forms.includes(binding.transfiguration)
    ) {
      return unavailable("all-cards-not-transfigurable");
    }
    selectors.push(selection);
    targets.push({
      entryId: candidate.entry.entryId,
      cardId: candidate.baseCard.id,
      transfiguration: binding.transfiguration,
    });
  }
  return signedPreparation(input, {
    kind: input.kind,
    allCards,
    targets,
    ...common(context, input, selectors),
  });
}

function preparePurgeSameType(
  input: Extract<
    ExplorationCompoundActionPlanInput,
    { kind: "purge-disclosed-transfigure-same-type" }
  >,
  context: RewardSelectionContext,
): ExplorationCompoundActionPreparation {
  const cards = [...context.effectiveDeckCards].sort((left, right) =>
    left.entry.entryId.localeCompare(right.entry.entryId),
  );
  const purgeable = cards.map(({ entry, baseCard, effectiveCard }) => ({
    entry,
    baseCard,
    effectiveCard,
    binding: {
      entryId: entry.entryId,
      cardId: baseCard.id,
      effectiveCardType: effectiveCard.cardType,
    },
  }));
  const eligible = purgeable.filter(({ entry, effectiveCard }) =>
    cards.some(
      ({ entry: companionEntry, effectiveCard: companionCard }) =>
        companionEntry.entryId !== entry.entryId &&
        companionEntry.transfiguration === null &&
        companionCard.cardType === effectiveCard.cardType &&
        supportsFixedForm(input.content, companionCard, input.transfiguration),
    ),
  );
  const eligiblePurgeTargets = eligible.map(({ binding }) => binding);
  const unavailable = (
    reason: ExplorationCompoundActionUnavailableReason,
    selectors: readonly RewardSelectionResult[] = [],
  ): ExplorationCompoundActionPreparation =>
    signedPreparation(input, {
      kind: input.kind,
      transfiguration: input.transfiguration,
      eligiblePurgeTargets,
      target: null,
      companionTargets: [],
      ...common(context, input, selectors, reason),
    });
  if (purgeable.length === 0) return unavailable("no-purge-target");
  if (eligible.length === 0) return unavailable("no-same-type-companion");

  const eligibleIds = new Set(eligible.map(({ entry }) => entry.entryId));
  const targetSelection = selectReward(
    context,
    request(input, "purge-target", {
      mechanicId: "purge-deck-entry",
      policyId: "purge-misfit",
      count: 1,
      constraints: {
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: input.journey.deck
          .filter(({ entryId }) => !eligibleIds.has(entryId))
          .map(({ entryId }) => entryId)
          .sort((left, right) => left.localeCompare(right)),
      },
    }),
  );
  if (!targetSelection.ok) return unavailable("no-purge-target");
  const targetId = targetSelection.bindings.deckEntryIds[0];
  const selected = eligible.find(({ entry }) => entry.entryId === targetId);
  if (selected === undefined) return unavailable("no-purge-target");

  const companionCandidates = cards.filter(
    ({ entry, effectiveCard }) =>
      entry.entryId !== selected.entry.entryId &&
      entry.transfiguration === null &&
      effectiveCard.cardType === selected.effectiveCard.cardType &&
      supportsFixedForm(input.content, effectiveCard, input.transfiguration),
  );
  if (companionCandidates.length === 0) {
    return unavailable("no-same-type-companion", [targetSelection]);
  }
  const selectors: RewardSelectionResult[] = [targetSelection];
  const companionTargets: ExplorationCompoundActionTransfigurationTarget[] = [];
  for (const { entry, baseCard } of companionCandidates) {
    const selection = selectReward(
      context,
      request(input, `companion-form:${entry.entryId}`, {
        mechanicId: "transfigure-deck-entry",
        policyId: "fixed",
        count: 1,
        constraints: {
          fixedDeckEntryId: entry.entryId,
          fixedTransfiguration: input.transfiguration,
          allowedTransfigurations: [input.transfiguration],
          allowPerfected: true,
          allowStarters: true,
          allowNightmare: true,
          distinctDeckEntries: true,
        },
      }),
    );
    const binding = selection.ok
      ? selection.bindings.transfigurations[0]
      : undefined;
    if (
      !selection.ok ||
      binding === undefined ||
      binding.entryId !== entry.entryId ||
      binding.cardUuid !== baseCard.id ||
      binding.transfiguration !== input.transfiguration
    ) {
      return unavailable("no-same-type-companion", selectors);
    }
    selectors.push(selection);
    companionTargets.push({
      entryId: entry.entryId,
      cardId: baseCard.id,
      transfiguration: input.transfiguration,
    });
  }
  return signedPreparation(input, {
    kind: input.kind,
    transfiguration: input.transfiguration,
    eligiblePurgeTargets,
    target: selected.binding,
    companionTargets,
    ...common(context, input, selectors),
  });
}

function prepareFastNightmares(
  input: Extract<
    ExplorationCompoundActionPlanInput,
    { kind: "predicate-fast-nightmares" }
  >,
  context: RewardSelectionContext,
): ExplorationCompoundActionPreparation {
  const targets = context.effectiveDeckCards
    .filter(({ effectiveCard }) =>
      matchesPredicate(effectiveCard, input.predicate, input.content),
    )
    .map(({ entry, baseCard }) => ({
      entryId: entry.entryId,
      cardId: baseCard.id,
    }))
    .sort(
      (left, right) =>
        left.entryId.localeCompare(right.entryId) ||
        left.cardId.localeCompare(right.cardId),
    );
  return signedPreparation(input, {
    kind: input.kind,
    predicate: input.predicate,
    nightmareCount: input.nightmareCount,
    targets,
    ...common(
      context,
      input,
      [],
      targets.length === 0 ? "no-predicate-matches" : undefined,
    ),
  });
}

function prepareTakeTransfiguredNightmares(
  input: Extract<
    ExplorationCompoundActionPlanInput,
    { kind: "take-transfigured-nightmares" }
  >,
  context: RewardSelectionContext,
): ExplorationCompoundActionPreparation {
  const selection = selectReward(
    context,
    request(input, "fixed-form-catalog-offer", {
      mechanicId: "transfigured-card-chooser",
      policyId: "card-fit",
      count: 4,
      constraints: {
        predicate: input.predicate,
        cardScope: "catalog",
        fixedTransfiguration: input.transfiguration,
        allowedTransfigurations: [input.transfiguration],
        allowPerfected: true,
        distinctCards: true,
      },
    }),
  );
  const offeredCards = selection.ok
    ? selection.bindings.transfigurations.map(
        ({ cardUuid, transfiguration }) => ({
          cardId: cardUuid,
          transfiguration,
        }),
      )
    : [];
  const valid =
    selection.ok &&
    offeredCards.length === 4 &&
    new Set(offeredCards.map(({ cardId }) => cardId)).size === 4 &&
    offeredCards.every(
      ({ transfiguration }) => transfiguration === input.transfiguration,
    );
  return signedPreparation(input, {
    kind: input.kind,
    predicate: input.predicate,
    offerCount: 4,
    transfiguration: input.transfiguration,
    nightmareCount: input.nightmareCount,
    offeredCards: valid ? offeredCards : [],
    ...common(
      context,
      input,
      valid ? [selection] : [],
      valid ? undefined : "insufficient-fixed-form-catalog-cards",
    ),
  });
}

function preparePurgeTransfigureCopy(
  input: Extract<
    ExplorationCompoundActionPlanInput,
    { kind: "purge-transfigure-copy" }
  >,
  context: RewardSelectionContext,
): ExplorationCompoundActionPreparation {
  const eligibleCards = context.effectiveDeckCards
    .filter(
      ({ entry, effectiveCard }) =>
        entry.transfiguration === null &&
        supportsFixedForm(input.content, effectiveCard, input.transfiguration),
    )
    .map(({ entry, baseCard }) => ({
      entryId: entry.entryId,
      cardId: baseCard.id,
    }))
    .sort(
      (left, right) =>
        left.entryId.localeCompare(right.entryId) ||
        left.cardId.localeCompare(right.cardId),
    );
  const selection = selectReward(
    context,
    request(input, "fixed-form-deck-targets", {
      mechanicId: "transfigure-deck-entry",
      policyId: "uniform",
      count: 4,
      constraints: {
        fixedTransfiguration: input.transfiguration,
        allowedTransfigurations: [input.transfiguration],
        allowPerfected: true,
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: input.journey.deck
          .filter(
            ({ entryId }) =>
              !eligibleCards.some((candidate) => candidate.entryId === entryId),
          )
          .map(({ entryId }) => entryId)
          .sort((left, right) => left.localeCompare(right)),
      },
    }),
  );
  const eligibleByEntry = new Map(
    eligibleCards.map((binding) => [binding.entryId, binding]),
  );
  const targets = selection.ok
    ? selection.bindings.transfigurations.flatMap(
        ({ entryId, cardUuid, transfiguration }) => {
          const eligible =
            entryId === undefined ? undefined : eligibleByEntry.get(entryId);
          return eligible === undefined ||
            eligible.cardId !== cardUuid ||
            transfiguration !== input.transfiguration
            ? []
            : [{ ...eligible, transfiguration }];
        },
      )
    : [];
  const valid =
    selection.ok &&
    targets.length === 4 &&
    new Set(targets.map(({ entryId }) => entryId)).size === 4;
  return signedPreparation(input, {
    kind: input.kind,
    offerCount: 4,
    transfiguration: input.transfiguration,
    eligibleCards,
    targets: valid ? targets : [],
    ...common(
      context,
      input,
      valid ? [selection] : [],
      valid ? undefined : "insufficient-fixed-form-deck-entries",
    ),
  });
}

/** Prepare one signed, replayable body for each Wave 8 compound action. */
export function prepareExplorationCompoundActionPlan(
  input: ExplorationCompoundActionPlanInput,
): ExplorationCompoundActionPreparation {
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  if (!isValidAuthoredInput(input)) return invalidPreparation(input, context);
  switch (input.kind) {
    case "all-card-transfiguration":
      return prepareAllCardTransfiguration(input, context);
    case "purge-disclosed-transfigure-same-type":
      return preparePurgeSameType(input, context);
    case "predicate-fast-nightmares":
      return prepareFastNightmares(input, context);
    case "take-transfigured-nightmares":
      return prepareTakeTransfiguredNightmares(input, context);
    case "purge-transfigure-copy":
      return preparePurgeTransfigureCopy(input, context);
  }
}

/** Reject retained-signature mutations and stale compound preparations. */
export function explorationCompoundActionPreparationsEqual(
  actual: ExplorationCompoundActionPreparation,
  expected: ExplorationCompoundActionPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  const { planSignature: expectedSignature, ...expectedBody } = expected;
  return (
    actualSignature === expectedSignature &&
    stableDigest(actualBody) === stableDigest(expectedBody)
  );
}
