export interface GlossarySourceEntry {
  readonly id: string;
  readonly category: string;
  readonly term: string;
  readonly definition: string;
  readonly matchesRulesText: boolean;
  readonly variants: readonly string[];
}

export function validateGlossaryEntries(input: unknown): GlossarySourceEntry[];
export function parseGlossarySource(source: string): GlossarySourceEntry[];
export function serializeGlossarySource(entries: readonly GlossarySourceEntry[]): string;
