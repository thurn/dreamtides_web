import { artRef } from "../../cumulus/primitives/art";
import { GLYPHS } from "../../cumulus/primitives/glyph";
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
      {
        id: "dream-codex",
        label: tx(
          "Dream Codex",
          "[ui] Main-menu action that opens the Dream Codex.",
        ),
      },
      {
        id: "settings",
        label: tx(
          "Settings",
          "[ui] Main-menu action that opens application settings.",
        ),
      },
      {
        id: "about",
        label: tx("About", "[ui] Main-menu action that opens product information."),
      },
      {
        id: "quit",
        label: tx("Quit", "[ui] Main-menu action that exits the application."),
      },
    ],
    socials: [
      {
        id: "github",
        label: tx(
          "GitHub",
          "[ui] Main-menu external link to the Dreamtides GitHub community.",
        ),
        glyph: GLYPHS.github,
      },
      {
        id: "discord",
        label: tx(
          "Discord",
          "[ui] Main-menu external link to the Dreamtides Discord community.",
        ),
        glyph: GLYPHS.discord,
      },
      {
        id: "reddit",
        label: tx(
          "Reddit",
          "[ui] Main-menu external link to the Dreamtides Reddit community.",
        ),
        glyph: GLYPHS.reddit,
      },
    ],
  };
}
