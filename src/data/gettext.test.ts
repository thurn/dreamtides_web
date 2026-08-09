import { describe, expect, it } from "vitest";
import { createGettext, formatGettext, resolveGettextLocale } from "./gettext";
import productionPolishCatalog from "./gettext-pl.generated.json";

interface CatalogMessage {
  readonly msgid: string;
  readonly msgid_plural?: string;
  readonly msgstr: readonly string[];
}

interface Catalog {
  readonly translations: Readonly<
    Record<string, Readonly<Record<string, CatalogMessage>>>
  >;
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;

const syntheticPolishCatalog = {
  charset: "utf-8",
  headers: {
    Language: "pl",
    "Plural-Forms":
      "nplurals=3; plural=(n == 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2);",
  },
  translations: {
    "": {
      "": { msgid: "", msgstr: [""] },
      "{count} item": {
        msgid: "{count} item",
        msgid_plural: "{count} items",
        msgstr: ["one:{count}", "few:{count}", "many:{count}"],
      },
    },
    control: {
      Open: { msgctxt: "control", msgid: "Open", msgstr: ["control-form"] },
    },
  },
};

describe("gettext proof-of-concept runtime", () => {
  it("uses the catalog's three-form plural rule", () => {
    const { ngettext } = createGettext("pl", syntheticPolishCatalog);
    const pluralForm = (count: number) =>
      formatGettext(ngettext("{count} item", "{count} items", count), {
        count,
      });

    expect([1, 2, 5, 12, 22, 25].map(pluralForm)).toEqual([
      "one:1",
      "few:2",
      "many:5",
      "many:12",
      "few:22",
      "many:25",
    ]);
  });

  it("loads every plural from the compiled production catalog", () => {
    const catalog = productionPolishCatalog as Catalog;
    const english = createGettext("en-US");
    const polish = createGettext("pl");
    let pluralCount = 0;

    for (const [context, entries] of Object.entries(catalog.translations)) {
      for (const entry of Object.values(entries)) {
        if (entry.msgid_plural === undefined) continue;
        pluralCount += 1;
        const selectedPolishForms = new Set<string>();

        for (const count of [0, 1, 2, 5, 12, 22, 25]) {
          const englishTemplate = context === ""
            ? english.ngettext(entry.msgid, entry.msgid_plural, count)
            : english.npgettext(
                context,
                entry.msgid,
                entry.msgid_plural,
                count,
              );
          expect(englishTemplate).toBe(
            count === 1 ? entry.msgid : entry.msgid_plural,
          );

          const polishTemplate = context === ""
            ? polish.ngettext(entry.msgid, entry.msgid_plural, count)
            : polish.npgettext(
                context,
                entry.msgid,
                entry.msgid_plural,
                count,
              );
          expect(entry.msgstr).toContain(polishTemplate);
          selectedPolishForms.add(polishTemplate);

          const variables = Object.fromEntries(
            [...polishTemplate.matchAll(PLACEHOLDER)].map((match) => [
              match[1],
              count,
            ]),
          );
          expect(formatGettext(polishTemplate, variables)).not.toMatch(
            PLACEHOLDER,
          );
        }

        expect(selectedPolishForms).toEqual(new Set(entry.msgstr));
      }
    }

    expect(pluralCount).toBeGreaterThan(0);
  });

  it("keeps contextual translations separate", () => {
    const { gettext, pgettext } = createGettext("pl", syntheticPolishCatalog);

    expect(pgettext("control", "Open")).toBe("control-form");
    expect(gettext("Open")).toBe("Open");
  });

  it("supports translator-controlled placeholder order and validates values", () => {
    expect(
      formatGettext("{second}, then {first}, then {second}", {
        first: 1,
        second: 2,
      }),
    ).toBe("2, then 1, then 2");

    expect(() => formatGettext("{required}", {})).toThrow(/missing: required/u);
    expect(() => formatGettext("fixed", { unused: 1 })).toThrow(
      /unexpected: unused/u,
    );
  });

  it("accepts only the locale implemented by the proof of concept", () => {
    expect(resolveGettextLocale("?locale=pl")).toBe("pl");
    expect(resolveGettextLocale("?locale=de")).toBe("en-US");
  });
});
