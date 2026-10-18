// Folds the Universal LPC Spritesheet Character Generator's CREDITS.csv into
// the credits of exactly the sheets the D97 character recipes use
// (link-characters.ts writes them to `public/d97/characters/credits.json`).
//
// CREDITS.csv has the header `filename,notes,authors,licenses,urls`; each row
// names one spritesheets-relative sheet file, its author, license and URL
// fields each a comma-separated list. The generator writes stray whitespace
// after closing quotes, which the parser ignores outside quoted fields.
//
// A used sheet matches the row naming it exactly. A pre-colored variant sheet
// (`<layer>/<animation>/<variant>.png`) has no row of its own; it matches the
// row of its animation folder (`<layer>/<animation>.png`), as the generator
// credits it.

import { CHARACTER_CREDITS_FORMAT, type CharacterCredits } from "../../src/d97/overworld/characters/credits.ts";

interface CreditsRow {
  readonly authors: readonly string[];
  readonly licenses: readonly string[];
  readonly urls: readonly string[];
}

/** RFC 4180 records of `text`, with unquoted whitespace around quoted fields dropped. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let inQuotes = false;
  const endField = () => {
    record.push(quoted ? field : field.trim());
    field = "";
    quoted = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === "" && !quoted) {
      field = "";
      quoted = true;
      inQuotes = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endField();
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else if (!quoted) {
      field += char;
    }
    // Text after a closing quote other than a separator is the generator's stray whitespace.
  }
  endField();
  if (record.length > 1 || record[0] !== "") records.push(record);
  return records;
}

function list(field: string | undefined): readonly string[] {
  return (field ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** CREDITS.csv's rows by spritesheets-relative file name. */
export function parseCreditsCsv(text: string): ReadonlyMap<string, CreditsRow> {
  const [header, ...records] = csvRecords(text);
  const column = (name: string): number => {
    const index = header?.indexOf(name) ?? -1;
    if (index < 0) throw new Error(`CREDITS.csv has no ${name} column`);
    return index;
  };
  const filename = column("filename");
  const authors = column("authors");
  const licenses = column("licenses");
  const urls = column("urls");
  const rows = new Map<string, CreditsRow>();
  for (const record of records) {
    const file = record[filename];
    if (file === undefined || file === "") continue;
    rows.set(file, { authors: list(record[authors]), licenses: list(record[licenses]), urls: list(record[urls]) });
  }
  return rows;
}

/** The row crediting `sheet` (spritesheets-relative), by the rule in this module's header. */
function rowFor(rows: ReadonlyMap<string, CreditsRow>, sheet: string): CreditsRow | undefined {
  const exact = rows.get(sheet);
  if (exact !== undefined) return exact;
  const parent = sheet.slice(0, Math.max(0, sheet.lastIndexOf("/")));
  return parent === "" ? undefined : rows.get(`${parent}.png`);
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

function codeUnitOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `values` deduplicated ignoring case (the generator spells some names both
 * ways), each kept in its most frequent spelling, code-unit order breaking
 * ties, and collated case-insensitively with code-unit order breaking ties.
 */
function distinctSorted(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const spellings = new Map<string, string>();
  for (const [value, count] of counts) {
    const key = value.toLowerCase();
    const kept = spellings.get(key);
    if (kept === undefined) {
      spellings.set(key, value);
      continue;
    }
    const keptCount = counts.get(kept) ?? 0;
    if (count > keptCount || (count === keptCount && codeUnitOrder(value, kept) < 0)) spellings.set(key, value);
  }
  return [...spellings.values()].sort((a, b) => collator.compare(a, b) || codeUnitOrder(a, b));
}

/** The credits of `sheets` (spritesheets-relative) from CREDITS.csv's `rows`. */
export function creditsForSheets(rows: ReadonlyMap<string, CreditsRow>, sheets: Iterable<string>): CharacterCredits {
  const used = [...new Set(sheets)].sort();
  const matched = used.map((sheet) => [sheet, rowFor(rows, sheet)] as const);
  const credited = matched.flatMap(([, row]) => (row === undefined ? [] : [row]));
  return {
    format: CHARACTER_CREDITS_FORMAT,
    authors: distinctSorted(credited.flatMap((row) => row.authors)),
    licenses: distinctSorted(credited.flatMap((row) => row.licenses)),
    urls: distinctSorted(credited.flatMap((row) => row.urls)),
    sheets: used.length,
    unmatched: matched.flatMap(([sheet, row]) => (row === undefined ? [sheet] : [])),
  };
}
