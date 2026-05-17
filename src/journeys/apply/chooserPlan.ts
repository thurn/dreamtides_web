import type { TransfigurationType } from "../../types/quest";

export type ChooserRequest =
  | {
      kind: "card";
      requestId: string;
      poolKind: "deck" | "catalog" | "rolled";
      deckFilter?: {
        predicateId?: string;
        starterOnly?: boolean;
        entryIds?: readonly string[];
      };
      rolledCardIds?: readonly string[];
      minPicks: number;
      maxPicks: number;
      title: string;
    }
  | {
      kind: "dreamsign";
      requestId: string;
      poolKind: "active" | "pool" | "rolled";
      rolledDreamsignIds?: readonly string[];
      minPicks: number;
      maxPicks: number;
      title: string;
    }
  | {
      kind: "transfiguration";
      requestId: string;
      eligibleTransfigurations: readonly TransfigurationType[];
      title: string;
    };

export type ChooserResolution =
  | { kind: "card"; entryIds: readonly string[]; cardIds?: readonly string[] }
  | {
      kind: "dreamsign";
      indices: readonly number[];
      dreamsignIds?: readonly string[];
    }
  | { kind: "transfiguration"; type: TransfigurationType };

export interface ChooserPlanningContext {
  readonly requestIdForSlot: (slot?: number) => string;
  readonly resolutions: ReadonlyMap<string, ChooserResolution>;
}

export type ApplyResult =
  | { done: true }
  | { done: false; needsChoice: ChooserRequest };

export function requestIdFor(
  optionNumberOrBranchId: number | string,
  templateId: string,
  slot: number = 0,
): string {
  return `${optionNumberOrBranchId}:${templateId}:${slot}`;
}
