import { FluentBundle, FluentResource } from "@fluent/bundle";
import { ReactLocalization } from "@fluent/react";
import englishManifest from "../../data/locales/en-US/manifest.json";

const englishSourceModules = import.meta.glob<string>(
  "../../data/locales/en-US/*.ftl",
  { eager: true, import: "default", query: "?raw" },
);

const englishBundle = new FluentBundle("en-US");
for (const fileName of englishManifest) {
  const sourcePath = `../../data/locales/en-US/${fileName}`;
  const source = englishSourceModules[sourcePath];
  if (source === undefined) {
    throw new Error(`Missing English Fluent resource: ${fileName}`);
  }
  const [resourceError] = englishBundle.addResource(new FluentResource(source));
  if (resourceError !== undefined) throw resourceError;
}

if (Object.keys(englishSourceModules).length !== englishManifest.length) {
  throw new Error("The English Fluent manifest does not match its resources.");
}

/** The app-wide Fluent localization instance, currently backed by English. */
export const appLocalization = new ReactLocalization([englishBundle], null);
