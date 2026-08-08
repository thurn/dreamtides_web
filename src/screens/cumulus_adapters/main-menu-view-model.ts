import { artRef } from "../../cumulus/primitives/art";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import type { MainMenuView } from "../../cumulus/screens/MainMenuScreen";
import { createMessageDescriptor } from "../../data/localization-descriptors";

/** Build the static identity and action order of the pre-journey main menu. */
export function buildMainMenuView(): MainMenuView {
  return {
    title: createMessageDescriptor("main-menu-title"),
    background: artRef.mainMenuBackground(),
    actions: [
      { id: "new-journey", label: createMessageDescriptor("main-menu-new-journey-action") },
      { id: "dream-codex", label: createMessageDescriptor("main-menu-dream-codex-action") },
      { id: "settings", label: createMessageDescriptor("main-menu-settings-action") },
      { id: "about", label: createMessageDescriptor("main-menu-about-action") },
      { id: "quit", label: createMessageDescriptor("main-menu-quit-action") },
    ],
    socials: [
      { id: "github", label: createMessageDescriptor("main-menu-github-action"), glyph: GLYPHS.github },
      { id: "discord", label: createMessageDescriptor("main-menu-discord-action"), glyph: GLYPHS.discord },
      { id: "reddit", label: createMessageDescriptor("main-menu-reddit-action"), glyph: GLYPHS.reddit },
    ],
  };
}
