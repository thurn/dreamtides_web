import type { CardData } from "../../types/cards";
import type { DreamsignTemplate, ResolvedDreamAvatarPackage } from "../../types/content";
import type { DraftState } from "../../types/draft";
import type { PackageDebugView } from "../../cumulus/screens/PackageDebugDialog";
import { extractDraftDebugInfo, extractPackageDebugInfo } from "../debug-helpers";

export function buildPackageDebugView(draftState: DraftState | null, cardDatabase: ReadonlyMap<number, CardData>, resolvedPackage: ResolvedDreamAvatarPackage | null, remainingDreamsignPool: readonly string[], dreamsignTemplates: readonly DreamsignTemplate[]): PackageDebugView {
  const draft = extractDraftDebugInfo(draftState, new Map(cardDatabase));
  const pkg = extractPackageDebugInfo(resolvedPackage, remainingDreamsignPool, dreamsignTemplates);
  return {
    values: pkg === null ? [] : [value("starting-essence", "Starting Essence", pkg.startingEssence), value("draft-pool", "Draft Pool", pkg.draftPoolSize), value("dreamsigns-left", "Dreamsigns Left", pkg.remainingDreamsigns.length), value("dreamsigns-spent", "Dreamsigns Spent", pkg.spentDreamsigns.length), ...(draft === null ? [] : [value("pick", "Pick", draft.pickNumber), value("remaining", "Remaining", draft.remainingCards), value("unique", "Unique", draft.remainingUniqueCards)])],
    dreamAvatar: pkg?.dreamAvatarName ?? null,
    validation: pkg === null ? [] : [value("mandatory", "Mandatory-only pool", pkg.mandatoryOnlyPoolSize), value("doubled", "Doubled cards", pkg.doubledCardCount), value("legal", "Legal subsets", pkg.legalSubsetCount), value("preferred", "Preferred subsets", pkg.preferredSubsetCount)],
    remainingDreamsigns: (pkg?.remainingDreamsigns ?? []).map((entry) => ({ id: entry.id, label: entry.name })),
    spentDreamsigns: (pkg?.spentDreamsigns ?? []).map((entry) => ({ id: entry.id, label: entry.name })),
    currentOffer: (draft?.currentOffer ?? []).map((card) => ({ id: card.id, label: card.name })),
    topRemainingCards: (draft?.topRemainingCards ?? []).map((card) => ({ id: `card:${String(card.cardNumber)}`, label: `${card.name} ×${String(card.copiesRemaining)}` })),
  };
}

function value(id: string, label: string, amount: number) { return { id, label, value: String(amount) }; }
