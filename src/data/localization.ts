import { FluentBundle, FluentResource } from "@fluent/bundle";
import { ReactLocalization } from "@fluent/react";
import englishSource from "../../data/tabula/strings.flt?raw";

const englishBundle = new FluentBundle("en-US");
const [resourceError] = englishBundle.addResource(
  new FluentResource(englishSource),
);

if (resourceError !== undefined) {
  throw resourceError;
}

/** The app-wide Fluent localization instance, currently backed by English. */
export const appLocalization = new ReactLocalization([englishBundle], null);
