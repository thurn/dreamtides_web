export interface GlossaryProjection {
  readonly owner?: "card" | "dreamAvatar";
  readonly pattern?: string;
  readonly term?: string;
  readonly definition?: string;
}

export interface GlossarySourceEntry {
  readonly id: string;
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
export function parseGlossarySource(source: string): GlossarySourceEntry[];
export function updateGlossaryEntrySource(
  source: string,
  id: string,
  changes: Partial<
    Pick<
      GlossarySourceEntry,
      "term" | "definition" | "priority" | "variants" | "termPresentation"
    >
  >,
): string;
export function serializeGlossarySource(entries: readonly GlossarySourceEntry[]): string;
