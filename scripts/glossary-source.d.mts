export interface GlossaryContext {
  readonly owner?: "card" | "dreamcaller";
  readonly pattern?: string;
  readonly term?: string;
  readonly definition?: string;
  readonly singularCapture?: number;
  readonly singularDefinition?: string;
}

export interface GlossarySourceEntry {
  readonly id: string;
  readonly category: string;
  readonly term: string;
  readonly definition: string;
  readonly priority: number;
  readonly matchesRulesText: boolean;
  readonly variants: readonly string[];
  readonly rulesTextForms?: readonly string[];
  readonly definitionUsesRulesText?: boolean;
  readonly definitionSymbol?: "fast" | "interrupt" | "exhaust" | "trigger";
  readonly termPresentation?: "symbolOnly" | "definitionOnly";
  readonly contexts: readonly GlossaryContext[];
}

export function validateGlossaryEntries(input: unknown): GlossarySourceEntry[];
export function parseGlossarySource(source: string): GlossarySourceEntry[];
export function updateGlossaryEntrySource(
  source: string,
  id: string,
  changes: Partial<
    Pick<GlossarySourceEntry, "term" | "definition" | "priority" | "variants">
  >,
): string;
export function serializeGlossarySource(entries: readonly GlossarySourceEntry[]): string;
