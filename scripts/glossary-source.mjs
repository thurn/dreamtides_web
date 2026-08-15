import { parse, stringify } from "smol-toml";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_GLOSSARY";
  return error;
}

function requiredString(value, field, index) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(
      `Glossary entry ${String(index + 1)} requires a non-blank ${field}.`,
    );
  }
  return value.trim();
}

function isSourceMessageRef(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.format === "trox-source-message-ref" &&
    typeof value.entry_id === "string" &&
    typeof value.source_signature === "string" &&
    typeof value.contract_signature === "string";
}

function optionalLocalized(value, field, index) {
  if (value === undefined) return undefined;
  if (isSourceMessageRef(value)) return value;
  return requiredString(value, field, index);
}

function stringArray(value, field, index) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw invalid(
      `Glossary entry ${String(index + 1)} ${field} must be an array of strings.`,
    );
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry !== "");
}

function integer(value, field, index) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} ${field} must be an integer.`,
    );
  }
  return value;
}

function optionalString(value, field, index) {
  if (value === undefined) return undefined;
  return requiredString(value, field, index);
}

function optionalEnum(value, field, index, allowed) {
  const normalized = optionalString(value, field, index);
  if (normalized !== undefined && !allowed.includes(normalized)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} ${field} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return normalized;
}

function projectionArray(value, index) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} projections must be an array of tables.`,
    );
  }
  return value.map((projection, projectionIndex) => {
    if (
      projection === null ||
      typeof projection !== "object" ||
      Array.isArray(projection)
    ) {
      throw invalid(
        `Glossary entry ${String(index + 1)} projection ${String(projectionIndex + 1)} must be a table.`,
      );
    }
    const owner = optionalString(projection.owner, "projection owner", index);
    if (owner !== undefined && owner !== "card" && owner !== "avatar") {
      throw invalid(
        `Glossary entry ${String(index + 1)} projection ${String(projectionIndex + 1)} owner must be "card" or "avatar".`,
      );
    }
    const pattern = optionalString(
      projection.pattern,
      "projection pattern",
      index,
    );
    if (pattern !== undefined) {
      try {
        new RegExp(pattern, "iu");
      } catch {
        throw invalid(
          `Glossary entry ${String(index + 1)} projection ${String(projectionIndex + 1)} pattern must be a valid regular expression.`,
        );
      }
    }
    const term = optionalLocalized(projection.term, "projection term", index);
    const definition = optionalLocalized(
      projection.definition,
      "projection definition",
      index,
    );
    if (term === undefined && definition === undefined) {
      throw invalid(
        `Glossary entry ${String(index + 1)} projection ${String(projectionIndex + 1)} must configure term or definition.`,
      );
    }
    return {
      ...(owner === undefined ? {} : { owner }),
      ...(pattern === undefined ? {} : { pattern }),
      ...(term === undefined ? {} : { term }),
      ...(definition === undefined ? {} : { definition }),
    };
  });
}

const RULES_SYMBOL_GLYPHS = {
  essence: "essence",
  points: "points",
  lunar: "exhaust",
  store: "memory",
  energy: "energy",
  spark: "sparkInline",
};

function rulesSymbol(value, index) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(
      `Glossary entry ${String(index + 1)} rules-symbol must be a table.`,
    );
  }
  const token = requiredString(value.token, "rules-symbol token", index);
  const glyph = requiredString(value.glyph, "rules-symbol glyph", index);
  if (RULES_SYMBOL_GLYPHS[token] !== glyph) {
    throw invalid(
      `Glossary entry ${String(index + 1)} rules-symbol has an unsupported token/glyph pairing.`,
    );
  }
  const accessibleLabel = requiredString(
    value["accessible-label"] ?? value.accessibleLabel,
    "rules-symbol accessible-label",
    index,
  );
  const semanticColorRole = optionalEnum(
    value["semantic-color-role"] ?? value.semanticColorRole,
    "rules-symbol semantic-color-role",
    index,
    ["essence", "energy", "spark"],
  );
  return {
    token,
    glyph,
    accessibleLabel,
    ...(semanticColorRole === undefined ? {} : { semanticColorRole }),
  };
}

/** Validate and normalize parsed glossary records. */
export function validateGlossaryEntries(input) {
  if (!Array.isArray(input)) {
    throw invalid("glossary.toml must contain an [[entries]] array.");
  }

  const ids = new Set();
  const matchedForms = new Map();
  const rulesSymbolTokens = new Set();
  const entries = input.map((value, index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw invalid(`Glossary entry ${String(index + 1)} must be a table.`);
    }
    const id = requiredString(value.id, "id", index);
    if (!ID_RE.test(id)) {
      throw invalid(`Glossary entry id "${id}" must use lowercase kebab-case.`);
    }
    if (ids.has(id)) {
      throw invalid(`Glossary entry id "${id}" is duplicated.`);
    }
    ids.add(id);

    const category = requiredString(value.category, "category", index);
    const term = requiredString(value.term, "term", index);
    const definition = requiredString(value.definition, "definition", index);
    const priority = integer(value.priority, "priority", index);
    const variants = stringArray(value.variants, "variants", index);
    const matchesTermInRulesText =
      value["matches-term-in-rules-text"] === true || value.matchesTermInRulesText === true;
    const projections = projectionArray(value.projections, index);
    const symbol = rulesSymbol(
      value["rules-symbol"] ?? value.rulesSymbol,
      index,
    );
    if (symbol !== undefined && rulesSymbolTokens.has(symbol.token)) {
      throw invalid(
        `Rules-symbol token "${symbol.token}" has more than one glossary owner.`,
      );
    }
    if (symbol !== undefined) rulesSymbolTokens.add(symbol.token);
    const definitionSymbol = optionalEnum(
      value["definition-symbol"] ?? value.definitionSymbol,
      "definition-symbol",
      index,
      ["fast", "interrupt", "exhaust", "trigger"],
    );
    const termPresentationSource =
      value["term-presentation"] ?? value.termPresentation;
    const termPresentation =
      termPresentationSource === "symbol-only"
        ? "symbolOnly"
        : termPresentationSource === "definition-only"
          ? "definitionOnly"
          : optionalEnum(termPresentationSource, "term-presentation", index, [
              "symbolOnly",
              "definitionOnly",
            ]);

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
      (token) => !rulesSymbolTokens.has(token),
    )
  ) {
    throw invalid(
      "Glossary rules symbols must cover every supported token exactly once.",
    );
  }
  return entries;
}

/** Parse generated compatibility TOML into runtime/editor glossary records. */
export function parseGlossarySource(source) {
  if (typeof source !== "string") {
    throw invalid("Glossary source must be text.");
  }
  const parsed = parse(source);
  return validateGlossaryEntries(parsed.entries);
}

const EDITABLE_SOURCE_KEYS = {
  term: "term",
  definition: "definition",
  priority: "priority",
  variants: "variants",
  termPresentation: "term-presentation",
};

function entrySourceRanges(source) {
  const starts = Array.from(
    source.matchAll(/^\[\[entries\]\][ \t]*$/gmu),
    (match) => match.index,
  );
  return starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? source.length,
  }));
}

function replaceSourceAssignment(source, key, value) {
  const projectionStart = source.search(
    /^\[\[entries\.projections\]\][ \t]*$/mu,
  );
  const headerEnd = projectionStart < 0 ? source.length : projectionStart;
  const header = source.slice(0, headerEnd);
  const projections = source.slice(headerEnd);
  const pattern = new RegExp(`^${key}[ \\t]*=.*$`, "mu");
  if (value === undefined) {
    if (!pattern.test(header)) return source;
    return `${header.replace(pattern, "").replace(/\n{3,}$/u, "\n\n")}${projections}`;
  }
  const sourceValue =
    key === "term-presentation"
      ? value === "symbolOnly"
        ? "symbol-only"
        : "definition-only"
      : value;
  const assignment = stringify({ [key]: sourceValue }).trimEnd();
  if (pattern.test(header)) {
    return `${header.replace(pattern, assignment)}${projections}`;
  }
  const separator = header.endsWith("\n") ? "" : "\n";
  return `${header}${separator}${assignment}\n${projections}`;
}

/**
 * Replace only explicitly edited fields in one glossary entry while retaining
 * every other authored byte in a compatibility-TOML fixture.
 */
export function updateGlossaryEntrySource(source, id, changes) {
  const entries = parseGlossarySource(source);
  const entryIndex = entries.findIndex((entry) => entry.id === id);
  if (entryIndex < 0) {
    throw invalid(`No glossary entry has id "${id}".`);
  }
  const range = entrySourceRanges(source)[entryIndex];
  if (range === undefined) {
    throw invalid(`Could not locate glossary entry "${id}" in the source.`);
  }

  let entrySource = source.slice(range.start, range.end);
  for (const [field, sourceKey] of Object.entries(EDITABLE_SOURCE_KEYS)) {
    if (!Object.hasOwn(changes, field)) continue;
    entrySource = replaceSourceAssignment(
      entrySource,
      sourceKey,
      changes[field],
    );
  }

  const updated =
    source.slice(0, range.start) + entrySource + source.slice(range.end);
  parseGlossarySource(updated);
  return updated;
}

/** Serialize validated glossary records as compatibility TOML for fixtures. */
export function serializeGlossarySource(entries) {
  const normalized = validateGlossaryEntries(entries);
  return `${stringify({
    entries: normalized.map((entry) => ({
      id: entry.id,
      category: entry.category,
      term: entry.term,
      definition: entry.definition,
      priority: entry.priority,
      "matches-term-in-rules-text": entry.matchesTermInRulesText,
      variants: entry.variants,
      ...(entry.definitionSymbol === undefined
        ? {}
        : { "definition-symbol": entry.definitionSymbol }),
      ...(entry.termPresentation === undefined
        ? {}
        : {
            "term-presentation":
              entry.termPresentation === "symbolOnly"
                ? "symbol-only"
                : entry.termPresentation === "definitionOnly"
                  ? "definition-only"
                  : entry.termPresentation,
          }),
      ...(entry.rulesSymbol === undefined
        ? {}
        : {
            "rules-symbol": {
              token: entry.rulesSymbol.token,
              glyph: entry.rulesSymbol.glyph,
              "accessible-label": entry.rulesSymbol.accessibleLabel,
              ...(entry.rulesSymbol.semanticColorRole === undefined
                ? {}
                : {
                    "semantic-color-role": entry.rulesSymbol.semanticColorRole,
                  }),
            },
          }),
      ...(entry.projections.length === 0
        ? {}
        : {
            projections: entry.projections.map((projection) => ({
              ...(projection.owner === undefined
                ? {}
                : { owner: projection.owner }),
              ...(projection.pattern === undefined
                ? {}
                : { pattern: projection.pattern }),
              ...(projection.term === undefined
                ? {}
                : { term: projection.term }),
              ...(projection.definition === undefined
                ? {}
                : { definition: projection.definition }),
            })),
          }),
    })),
  }).trimEnd()}\n`;
}
