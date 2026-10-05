export interface GlossaryProjection {
  readonly owner?: "card" | "avatar";
  readonly pattern?: string;
  readonly term?: string;
  readonly definition?: string;
}

export interface GlossarySourceEntry {
  readonly id: GlossaryEntryId;
  readonly category: string;
  readonly term: string;
  readonly definition: string;
  readonly priority: number;
  readonly matchesTermInRulesText: boolean;
  readonly variants: readonly string[];
  readonly definitionSymbol?: "fast" | "interrupt" | "exhaust" | "trigger";
  readonly termPresentation?: "symbolOnly" | "definitionOnly";
  readonly projections: readonly GlossaryProjection[];
}

export function validateGlossaryEntries(input: unknown): GlossarySourceEntry[];
import type { GlossaryEntryId } from "../src/types/identifiers";
