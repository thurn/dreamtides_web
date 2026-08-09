import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { po } from "gettext-parser";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const INPUT = resolve(ROOT, "data/locales/gettext/pl/messages.po");
const TEMPLATE = resolve(ROOT, "data/locales/gettext/messages.pot");
const OUTPUT = resolve(ROOT, "src/data/gettext-pl.generated.json");
const check = process.argv.includes("--check");

function messages(catalog) {
  const result = new Map();
  for (const [context, entries] of Object.entries(catalog.translations)) {
    for (const [message, entry] of Object.entries(entries)) {
      if (message === "") continue;
      result.set(`${context}\u0004${message}`, entry);
    }
  }
  return result;
}

function placeholders(message) {
  return [...message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)]
    .map((match) => match[1])
    .sort();
}

const templateMessages = messages(po.parse(readFileSync(TEMPLATE)));
const catalog = po.parse(readFileSync(INPUT));
const translatedMessages = messages(catalog);

for (const [key, source] of templateMessages) {
  const translated = translatedMessages.get(key);
  if (translated === undefined) {
    throw new Error(`Polish catalog is missing template message: ${source.msgid}`);
  }
  if (translated.msgid_plural !== source.msgid_plural) {
    throw new Error(`Plural source drift for message: ${source.msgid}`);
  }
  const expected = placeholders(source.msgid);
  if (
    source.msgid_plural !== undefined &&
    JSON.stringify(placeholders(source.msgid_plural)) !== JSON.stringify(expected)
  ) {
    throw new Error(`Source plural placeholders differ for message: ${source.msgid}`);
  }
  for (const value of translated.msgstr) {
    if (value === "") throw new Error(`Polish translation is empty: ${source.msgid}`);
    if (JSON.stringify(placeholders(value)) !== JSON.stringify(expected)) {
      throw new Error(`Translation placeholder drift for message: ${source.msgid}`);
    }
  }
}

for (const [key, translated] of translatedMessages) {
  if (!templateMessages.has(key)) {
    throw new Error(`Polish catalog has a stale message: ${translated.msgid}`);
  }
}

const next = `${JSON.stringify(catalog, null, 2)}\n`;

if (check) {
  const current = readFileSync(OUTPUT, "utf8");
  if (current !== next) {
    throw new Error(
      `${relative(ROOT, OUTPUT)} is stale; run npm run gettext:compile.`,
    );
  }
} else {
  writeFileSync(OUTPUT, next);
}
