import Gettext from "node-gettext";
import polishCatalog from "./gettext-pl.generated.json";

const DOMAIN = "messages";

export const GETTEXT_LOCALES = ["en-US", "pl"] as const;
export type GettextLocale = (typeof GETTEXT_LOCALES)[number];

export interface GettextFormatter {
  readonly locale: GettextLocale;
  readonly gettext: (message: string) => string;
  readonly pgettext: (context: string, message: string) => string;
  readonly ngettext: (
    singular: string,
    plural: string,
    count: number,
  ) => string;
  readonly npgettext: (
    context: string,
    singular: string,
    plural: string,
    count: number,
  ) => string;
}

export type GettextVariables = Readonly<Record<string, string | number>>;

/** Resolve the temporary proof-of-concept locale from `?locale=`. */
export function resolveGettextLocale(search: string): GettextLocale {
  return new URLSearchParams(search).get("locale") === "pl" ? "pl" : "en-US";
}

/** Create an immutable gettext formatter for one render locale. */
export function createGettext(
  locale: GettextLocale,
  polishTranslations: object = polishCatalog,
): GettextFormatter {
  const engine = new Gettext({ sourceLocale: "en-US" });
  engine.addTranslations("pl", DOMAIN, polishTranslations);
  engine.setTextDomain(DOMAIN);
  engine.setLocale(locale);

  return {
    locale,
    gettext: (message) => engine.gettext(message),
    pgettext: (context, message) => engine.pgettext(context, message),
    ngettext: (singular, plural, count) =>
      engine.ngettext(singular, plural, count),
    npgettext: (context, singular, plural, count) =>
      engine.npgettext(context, singular, plural, count),
  };
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;

/**
 * Substitute named semantic values after gettext selects a complete message.
 * Missing and unused values are errors so catalog/source drift fails loudly.
 */
export function formatGettext(
  message: string,
  variables: GettextVariables,
): string {
  const placeholders = new Set(
    Array.from(message.matchAll(PLACEHOLDER), (match) => match[1]),
  );
  const supplied = new Set(Object.keys(variables));
  const missing = [...placeholders].filter((name) => !supplied.has(name));
  const unexpected = [...supplied].filter((name) => !placeholders.has(name));

  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`Invalid gettext variables (${details}).`);
  }

  return message.replace(PLACEHOLDER, (_placeholder, name: string) =>
    String(variables[name]),
  );
}
