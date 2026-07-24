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

    if (matchesRulesText) {
      for (const form of [term, ...variants]) {
        const key = form.toLocaleLowerCase();
        const owner = matchedForms.get(key);
        if (owner !== undefined) {
          throw invalid(`Rules-text form "${form}" is claimed by both "${owner}" and "${id}".`);
        }
        matchedForms.set(key, id);
      }
    }

    return { id, category, term, definition, priority, matchesRulesText, variants };
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
    })),
  }).trimEnd()}\n`;
}
