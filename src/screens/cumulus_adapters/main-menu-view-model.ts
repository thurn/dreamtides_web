import { artRef } from "../../cumulus/primitives/art";
import type { MainMenuView } from "../../cumulus/screens/MainMenuScreen";
import { meaning, tx } from "@trox/runtime";

/** Build the static identity and action order of the pre-journey main menu. */
export function buildMainMenuView(): MainMenuView {
  return {
    title: tx(meaning("product-title", "Dreamtides"), "[ui] Product title at the front door."),
    background: artRef.mainMenuBackground(),
    actions: [
      {
        id: "new-journey",
        label: tx("New Journey", "[journey] Command that starts a fresh Journey from a menu or terminal Journey result."),
      },
    ],
    socials: [],
  };
}
