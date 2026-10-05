// Validation of the glossary content module (`src/content/glossary.ts`). The
// checks guard invariants the type system cannot express: unique ids, one
// owner per rules-text form, and exactly one owner per rules symbol.

import {
  parseGlossaryEntryId,
  type GlossaryEntryId,
} from "../types/identifiers";

type Owner = "card" | "avatar";
type DefinitionSymbol = "fast" | "interrupt" | "exhaust" | "trigger";
type TermPresentation = "symbolOnly" | "definitionOnly";
type SemanticColorRole = "essence" | "energy" | "spark";

const RULES_SYMBOL_GLYPHS = {
  essence: "essence",
  points: "points",
  lunar: "exhaust",
  store: "memory",
  energy: "energy",
  spark: "sparkInline",
} as const;

type RulesSymbolToken = keyof typeof RULES_SYMBOL_GLYPHS;

export interface GlossaryProjection {
  readonly owner?: Owner;
  readonly pattern?: string;
  readonly term?: string;
  readonly definition?: string;
}

interface GlossaryRulesSymbol {
  readonly token: RulesSymbolToken;
  readonly glyph: (typeof RULES_SYMBOL_GLYPHS)[RulesSymbolToken];
  readonly accessibleLabel: string;
  readonly semanticColorRole?: SemanticColorRole;
}

export interface GlossarySourceEntry {
  readonly id: GlossaryEntryId;
  readonly category: string;
  readonly term: string;
  readonly definition: string;
  readonly priority: number;
  readonly matchesTermInRulesText: boolean;
  readonly variants: readonly string[];
  readonly definitionSymbol?: DefinitionSymbol;
  readonly termPresentation?: TermPresentation;
  readonly rulesSymbol?: GlossaryRulesSymbol;
  readonly projections: readonly GlossaryProjection[];
}

function invalid(message: string): Error {
  return new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(
      `Glossary entry ${String(index + 1)} requires a non-blank ${field}.`,
    );
  }
  return value.trim();
}

function stringArray(value: unknown, field: string, index: number): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw invalid(
      `Glossary entry ${String(index + 1)} ${field} must be an array of strings.`,
    );
  }
  return (value as string[])
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function integer(value: unknown, field: string, index: number): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} ${field} must be an integer.`,
    );
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  index: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field, index);
}

function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  index: number,
  allowed: readonly T[],
): T | undefined {
  const normalized = optionalString(value, field, index);
  if (normalized === undefined) return undefined;
  const match = allowed.find((candidate) => candidate === normalized);
  if (match === undefined) {
    throw invalid(
      `Glossary entry ${String(index + 1)} ${field} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function projectionArray(value: unknown, index: number): GlossaryProjection[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} projections must be an array of objects.`,
    );
  }
  return value.map((projection: unknown, projectionIndex) => {
    const label = `Glossary entry ${String(index + 1)} projection ${String(projectionIndex + 1)}`;
    if (!isObject(projection)) {
      throw invalid(`${label} must be an object.`);
    }
    const owner = optionalEnum<Owner>(
      projection.owner,
      "projection owner",
      index,
      ["card", "avatar"],
    );
    const pattern = optionalString(
      projection.pattern,
      "projection pattern",
      index,
    );
    if (pattern !== undefined) {
      try {
        new RegExp(pattern, "iu");
      } catch {
        throw invalid(`${label} pattern must be a valid regular expression.`);
      }
    }
    const term = optionalString(projection.term, "projection term", index);
    const definition = optionalString(
      projection.definition,
      "projection definition",
      index,
    );
    if (term === undefined && definition === undefined) {
      throw invalid(`${label} must configure term or definition.`);
    }
    return {
      ...(owner === undefined ? {} : { owner }),
      ...(pattern === undefined ? {} : { pattern }),
      ...(term === undefined ? {} : { term }),
      ...(definition === undefined ? {} : { definition }),
    };
  });
}

function isRulesSymbolToken(value: string): value is RulesSymbolToken {
  return Object.prototype.hasOwnProperty.call(RULES_SYMBOL_GLYPHS, value);
}

function rulesSymbol(
  value: unknown,
  index: number,
): GlossaryRulesSymbol | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} rulesSymbol must be an object.`,
    );
  }
  const token = requiredString(value.token, "rulesSymbol token", index);
  const glyph = requiredString(value.glyph, "rulesSymbol glyph", index);
  if (!isRulesSymbolToken(token) || RULES_SYMBOL_GLYPHS[token] !== glyph) {
    throw invalid(
      `Glossary entry ${String(index + 1)} rulesSymbol has an unsupported token/glyph pairing.`,
    );
  }
  const accessibleLabel = requiredString(
    value.accessibleLabel,
    "rulesSymbol accessibleLabel",
    index,
  );
  const semanticColorRole = optionalEnum<SemanticColorRole>(
    value.semanticColorRole,
    "rulesSymbol semanticColorRole",
    index,
    ["essence", "energy", "spark"],
  );
  return {
    token,
    glyph: RULES_SYMBOL_GLYPHS[token],
    accessibleLabel,
    ...(semanticColorRole === undefined ? {} : { semanticColorRole }),
  };
}

/** Validate and normalize the glossary content records. */
export function validateGlossaryEntries(
  input: unknown,
): GlossarySourceEntry[] {
  if (!Array.isArray(input)) {
    throw invalid("The glossary must be an array of entries.");
  }

  const ids = new Set<GlossaryEntryId>();
  const matchedForms = new Map<string, GlossaryEntryId>();
  const rulesSymbolTokens = new Set<RulesSymbolToken>();
  const entries = input.map((value: unknown, index): GlossarySourceEntry => {
    if (!isObject(value)) {
      throw invalid(`Glossary entry ${String(index + 1)} must be an object.`);
    }
    const id = parseGlossaryEntryId(requiredString(value.id, "id", index));
    if (ids.has(id)) {
      throw invalid(`Glossary entry id "${id}" is duplicated.`);
    }
    ids.add(id);

    const category = requiredString(value.category, "category", index);
    const term = requiredString(value.term, "term", index);
    const definition = requiredString(value.definition, "definition", index);
    const priority = integer(value.priority, "priority", index);
    const variants = stringArray(value.variants, "variants", index);
    const matchesTermInRulesText = value.matchesTermInRulesText === true;
    const projections = projectionArray(value.projections, index);
    const symbol = rulesSymbol(value.rulesSymbol, index);
    if (symbol !== undefined && rulesSymbolTokens.has(symbol.token)) {
      throw invalid(
        `Rules-symbol token "${symbol.token}" has more than one glossary owner.`,
      );
    }
    if (symbol !== undefined) rulesSymbolTokens.add(symbol.token);
    const definitionSymbol = optionalEnum<DefinitionSymbol>(
      value.definitionSymbol,
      "definitionSymbol",
      index,
      ["fast", "interrupt", "exhaust", "trigger"],
    );
    const termPresentation = optionalEnum<TermPresentation>(
      value.termPresentation,
      "termPresentation",
      index,
      ["symbolOnly", "definitionOnly"],
    );

    const matchedEntryForms = [
      ...(matchesTermInRulesText ? [term] : []),
      ...variants,
    ];
    for (const form of matchedEntryForms) {
      const key = form.toLocaleLowerCase();
      const owner = matchedForms.get(key);
      if (owner !== undefined) {
        throw invalid(
          `Rules-text form "${form}" is claimed by both "${owner}" and "${id}".`,
        );
      }
      matchedForms.set(key, id);
    }

    return {
      id,
      category,
      term,
      definition,
      priority,
      matchesTermInRulesText,
      variants,
      ...(definitionSymbol === undefined ? {} : { definitionSymbol }),
      ...(termPresentation === undefined ? {} : { termPresentation }),
      ...(symbol === undefined ? {} : { rulesSymbol: symbol }),
      projections,
    };
  });
  if (
    rulesSymbolTokens.size > 0 &&
    Object.keys(RULES_SYMBOL_GLYPHS).some(
      (token) => !isRulesSymbolToken(token) || !rulesSymbolTokens.has(token),
    )
  ) {
    throw invalid(
      "Glossary rules symbols must cover every supported token exactly once.",
    );
  }
  return entries;
}
