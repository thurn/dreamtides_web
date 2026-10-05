import type { CardData } from "../../types/cards";
import type {
  DreamsignTemplate,
  ResolvedAvatarPackage,
} from "../../types/content";
import type { DraftState } from "../../types/draft";
import type {
  PackageDebugCardEntryId,
  PackageDebugValueId,
  PackageDebugView,
} from "../../cumulus/screens/PackageDebugDialog";
import {
  extractDraftDebugInfo,
  extractPackageDebugInfo,
} from "../debug-helpers";
import type { DreamsignId } from "../../types/identifiers";

const VALUE_LABELS: Readonly<Record<PackageDebugValueId, string>> = {
  "starting-essence": "Starting Essence",
  "draft-pool": "Draft Pool",
  "dreamsigns-left": "Dreamsigns Left",
  "dreamsigns-spent": "Dreamsigns Spent",
  pick: "Pick",
  remaining: "Remaining",
  unique: "Unique",
  mandatory: "Mandatory-only pool",
  doubled: "Doubled cards",
  legal: "Legal subsets",
  preferred: "Preferred subsets",
};

export function buildPackageDebugView(
  draftState: DraftState | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  resolvedPackage: ResolvedAvatarPackage | null,
  remainingDreamsignPool: readonly DreamsignId[],
  dreamsignTemplates: readonly DreamsignTemplate[],
): PackageDebugView {
  const draft = extractDraftDebugInfo(draftState, new Map(cardDatabase));
  const pkg = extractPackageDebugInfo(
    resolvedPackage,
    remainingDreamsignPool,
    dreamsignTemplates,
  );
  return {
    values:
      pkg === null
        ? []
        : [
            value("starting-essence", pkg.startingEssence),
            value("draft-pool", pkg.draftPoolSize),
            value("dreamsigns-left", pkg.remainingDreamsigns.length),
            value("dreamsigns-spent", pkg.spentDreamsigns.length),
            ...(draft === null
              ? []
              : [
                  value("pick", draft.pickNumber),
                  value("remaining", draft.remainingCards),
                  value("unique", draft.remainingUniqueCards),
                ]),
          ],
    avatar:
      pkg?.avatarName === undefined
        ? null
        : pkg.avatarName,
    validation:
      pkg === null
        ? []
        : [
            value("mandatory", pkg.mandatoryOnlyPoolSize),
            value("doubled", pkg.doubledCardCount),
            value("legal", pkg.legalSubsetCount),
            value("preferred", pkg.preferredSubsetCount),
          ],
    remainingDreamsigns: (pkg?.remainingDreamsigns ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
    })),
    spentDreamsigns: (pkg?.spentDreamsigns ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
    })),
    currentOffer: (draft?.currentOffer ?? []).map((card) => ({
      id: card.id,
      label: card.name,
    })),
    topRemainingCards: (draft?.topRemainingCards ?? []).map((card) => ({
      id: packageDebugCardEntryId(card.cardNumber),
      label: `${card.name} ×${String(card.copiesRemaining)}`,
    })),
  };
}

function value(id: PackageDebugValueId, amount: number) {
  return {
    id,
    label: VALUE_LABELS[id],
    value: String(amount),
  };
}

function packageDebugCardEntryId(cardNumber: number): PackageDebugCardEntryId {
  return `card-number:${cardNumber}`;
}
