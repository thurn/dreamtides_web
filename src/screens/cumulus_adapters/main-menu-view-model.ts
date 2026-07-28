import { artRef } from "../../cumulus/primitives/art";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import type { MainMenuView } from "../../cumulus/screens/MainMenuScreen";

/** Build the static identity and action order of the pre-journey main menu. */
export function buildMainMenuView(): MainMenuView {
  return {
    title: "Dreamtides",
    background: artRef.mainMenuBackground(),
    actions: [
      { id: "new-journey", label: "New Journey" },
      { id: "dream-codex", label: "Dream Codex" },
      { id: "settings", label: "Settings" },
      { id: "about", label: "About" },
      { id: "quit", label: "Quit" },
    ],
    socials: [
      { id: "github", label: "GitHub", glyph: GLYPHS.github },
      { id: "discord", label: "Discord", glyph: GLYPHS.discord },
      { id: "reddit", label: "Reddit", glyph: GLYPHS.reddit },
    ],
  };
}
