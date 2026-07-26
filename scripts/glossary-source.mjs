import { parse, stringify } from "smol-toml";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_GLOSSARY";
  return error;
}

function requiredString(value, field, index) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(`Glossary entry ${String(index + 1)} requires a non-blank ${field}.`);
  }
  return value.trim();
}

function stringArray(value, field, index) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw invalid(`Glossary entry ${String(index + 1)} ${field} must be an array of strings.`);
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry !== "");
}

function integer(value, field, index) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value)) {
    throw invalid(`Glossary entry ${String(index + 1)} ${field} must be an integer.`);
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

function contextArray(value, index) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalid(`Glossary entry ${String(index + 1)} contexts must be an array of tables.`);
  }
  return value.map((context, contextIndex) => {
    if (context === null || typeof context !== "object" || Array.isArray(context)) {
      throw invalid(
        `Glossary entry ${String(index + 1)} context ${String(contextIndex + 1)} must be a table.`,
      );
    }
    const owner = optionalString(context.owner, "context owner", index);
    if (owner !== undefined && owner !== "card" && owner !== "dreamAvatar") {
      throw invalid(
        `Glossary entry ${String(index + 1)} context ${String(contextIndex + 1)} owner must be "card" or "dreamAvatar".`,
      );
    }
    const pattern = optionalString(context.pattern, "context pattern", index);
    if (pattern !== undefined) {
      try {
        new RegExp(pattern, "iu");
      } catch {
        throw invalid(
          `Glossary entry ${String(index + 1)} context ${String(contextIndex + 1)} pattern must be a valid regular expression.`,
        );
      }
    }
    const term = optionalString(context.term, "context term", index);
    const definition = optionalString(
      context.definition,
      "context definition",
      index,
    );
    const singularCapture =
      context["singular-capture"] ?? context.singularCapture;
    const singularDefinition = optionalString(
      context["singular-definition"] ?? context.singularDefinition,
      "context singular-definition",
      index,
    );
    if (
      singularCapture !== undefined &&
      (!Number.isInteger(singularCapture) || singularCapture < 1)
    ) {
      throw invalid(
        `Glossary entry ${String(index + 1)} context ${String(contextIndex + 1)} singular-capture must be a positive integer.`,
      );
    }
    if (
      (singularCapture === undefined) !== (singularDefinition === undefined)
    ) {
      throw invalid(
        `Glossary entry ${String(index + 1)} context ${String(contextIndex + 1)} singular-capture and singular-definition must be provided together.`,
      );
    }
    if (term === undefined && definition === undefined) {
      throw invalid(
        `Glossary entry ${String(index + 1)} context ${String(contextIndex + 1)} must configure term or definition.`,
      );
    }
    return {
      ...(owner === undefined ? {} : { owner }),
      ...(pattern === undefined ? {} : { pattern }),
      ...(term === undefined ? {} : { term }),
      ...(definition === undefined ? {} : { definition }),
      ...(singularCapture === undefined
        ? {}
        : {
            singularCapture,
            singularDefinition,
          }),
    };
  });
}

/** Validate and normalize parsed glossary records. */
export function validateGlossaryEntries(input) {
  if (!Array.isArray(input)) {
    throw invalid("glossary.toml must contain an [[entries]] array.");
  }

  const ids = new Set();
  const matchedForms = new Map();
  return input.map((value, index) => {
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
    const matchesRulesText = value["matches-rules-text"] === true || value.matchesRulesText === true;
    const rulesTextFormsValue =
      value["rules-text-forms"] ?? value.rulesTextForms;
    const rulesTextForms =
      rulesTextFormsValue === undefined
        ? undefined
        : stringArray(rulesTextFormsValue, "rules-text-forms", index);
    const contexts = contextArray(value.contexts, index);
    const definitionUsesRulesTextValue =
      value["definition-uses-rules-text"] ?? value.definitionUsesRulesText;
    if (
      definitionUsesRulesTextValue !== undefined &&
      typeof definitionUsesRulesTextValue !== "boolean"
    ) {
      throw invalid(
        `Glossary entry ${String(index + 1)} definition-uses-rules-text must be a boolean.`,
      );
    }
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
        : optionalEnum(
            termPresentationSource,
            "term-presentation",
            index,
            ["symbolOnly", "definitionOnly"],
          );

    const matchedEntryForms = rulesTextForms ??
      (matchesRulesText ? [term, ...variants] : []);
    for (const form of matchedEntryForms) {
      const key = form.toLocaleLowerCase();
      const owner = matchedForms.get(key);
      if (owner !== undefined) {
        throw invalid(`Rules-text form "${form}" is claimed by both "${owner}" and "${id}".`);
      }
      matchedForms.set(key, id);
    }

    return {
      id,
      category,
      term,
      definition,
      priority,
      matchesRulesText,
      variants,
      ...(rulesTextForms === undefined ? {} : { rulesTextForms }),
      ...(definitionUsesRulesTextValue === undefined
        ? {}
        : { definitionUsesRulesText: definitionUsesRulesTextValue }),
      ...(definitionSymbol === undefined ? {} : { definitionSymbol }),
      ...(termPresentation === undefined ? {} : { termPresentation }),
      contexts,
    };
  });
}

/** Parse the tracked TOML source into runtime/editor glossary records. */
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
  const contextStart = source.search(/^\[\[entries\.contexts\]\][ \t]*$/mu);
  const headerEnd = contextStart < 0 ? source.length : contextStart;
  const header = source.slice(0, headerEnd);
  const contexts = source.slice(headerEnd);
  const pattern = new RegExp(`^${key}[ \\t]*=.*$`, "mu");
  if (value === undefined) {
    if (!pattern.test(header)) return source;
    return `${header.replace(pattern, "").replace(/\n{3,}$/u, "\n\n")}${contexts}`;
  }
  const sourceValue =
    key === "term-presentation"
      ? value === "symbolOnly"
        ? "symbol-only"
        : "definition-only"
      : value;
  const assignment = stringify({ [key]: sourceValue }).trimEnd();
  if (pattern.test(header)) {
    return `${header.replace(pattern, assignment)}${contexts}`;
  }
  const separator = header.endsWith("\n") ? "" : "\n";
  return `${header}${separator}${assignment}\n${contexts}`;
}

/**
 * Replace only explicitly edited fields in one glossary entry while retaining
 * every other authored byte in glossary.toml.
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

/** Serialize validated glossary records back to the tracked TOML source. */
export function serializeGlossarySource(entries) {
  const normalized = validateGlossaryEntries(entries);
  return `${stringify({
    entries: normalized.map((entry) => ({
      id: entry.id,
      category: entry.category,
      term: entry.term,
      definition: entry.definition,
      priority: entry.priority,
      "matches-rules-text": entry.matchesRulesText,
      variants: entry.variants,
      ...(entry.rulesTextForms === undefined
        ? {}
        : { "rules-text-forms": entry.rulesTextForms }),
      ...(entry.definitionUsesRulesText === undefined
        ? {}
        : {
            "definition-uses-rules-text": entry.definitionUsesRulesText,
          }),
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
      ...(entry.contexts.length === 0
        ? {}
        : {
            contexts: entry.contexts.map((context) => ({
              ...(context.owner === undefined ? {} : { owner: context.owner }),
              ...(context.pattern === undefined
                ? {}
                : { pattern: context.pattern }),
              ...(context.term === undefined ? {} : { term: context.term }),
              ...(context.definition === undefined
                ? {}
                : { definition: context.definition }),
              ...(context.singularCapture === undefined
                ? {}
                : {
                    "singular-capture": context.singularCapture,
                    "singular-definition": context.singularDefinition,
                  }),
            })),
          }),
    })),
  }).trimEnd()}\n`;
}
