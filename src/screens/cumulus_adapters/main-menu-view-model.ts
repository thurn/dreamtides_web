import {artRef } from "../../cumulus/primitives/art";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import type { MainMenuView } from "../../cumulus/screens/MainMenuScreen";
import { meaning, tx } from "@trox/runtime";

/** Build the static identity and action order of the pre-journey main menu. */
export function buildMainMenuView(): MainMenuView {
  return {
    title: tx(meaning("product-title", "Dreamtides"), "Product title at the front door."),
    background: artRef.mainMenuBackground(),
    actions: [
      {
        id: "new-journey",
        label: tx("New Journey", "Command that starts a fresh Journey from a menu or terminal Journey result."),
      },
      {
        id: "dream-codex",
        label: tx(
          "Dream Codex",
          "Main-menu action that opens the Dream Codex.",
        ),
      },
      {
        id: "settings",
        label: tx(
          "Settings",
          "Main-menu action that opens application settings.",
        ),
      },
      {
        id: "about",
        label: tx("About", "Main-menu action that opens product information."),
      },
      {
        id: "quit",
        label: tx("Quit", "Main-menu action that exits the application."),
      },
    ],
    socials: [
      {
        id: "github",
        label: tx(
          "GitHub",
          "Main-menu external link to the Dreamtides GitHub community.",
        ),
        glyph: GLYPHS.github,
      },
      {
        id: "discord",
        label: tx(
          "Discord",
          "Main-menu external link to the Dreamtides Discord community.",
        ),
        glyph: GLYPHS.discord,
      },
      {
        id: "reddit",
        label: tx(
          "Reddit",
          "Main-menu external link to the Dreamtides Reddit community.",
        ),
        glyph: GLYPHS.reddit,
      },
    ],
  };
}
