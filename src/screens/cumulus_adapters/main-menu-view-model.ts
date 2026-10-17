import { artRef } from "../../cumulus/primitives/art";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import type { MainMenuView } from "../../cumulus/screens/MainMenuScreen";

/** What the pre-journey main menu offers beyond its fixed actions. */
export interface MainMenuOptions {
  /** A stored Dreamtides 97 run exists to continue. */
  readonly d97ContinueAvailable?: boolean;
}

/** Build the identity and action order of the pre-journey main menu. */
export function buildMainMenuView({
  d97ContinueAvailable = false,
}: MainMenuOptions = {}): MainMenuView {
  return {
    title: "Dreamtides",
    background: artRef.mainMenuBackground(),
    actions: [
      {
        id: "new-journey",
        label: "New Journey",
      },
      {
        id: "d97-new-run",
        label: "Dreamtides 97",
      },
      ...(d97ContinueAvailable
        ? [{ id: "d97-continue" as const, label: "Continue 97" }]
        : []),
      {
        id: "dream-codex",
        label: "Dream Codex",
      },
      {
        id: "settings",
        label: "Settings",
      },
      {
        id: "about",
        label: "About",
      },
      {
        id: "quit",
        label: "Quit",
      },
    ],
    socials: [
      {
        id: "github",
        label: "GitHub",
        glyph: GLYPHS.github,
      },
      {
        id: "discord",
        label: "Discord",
        glyph: GLYPHS.discord,
      },
      {
        id: "reddit",
        label: "Reddit",
        glyph: GLYPHS.reddit,
      },
    ],
  };
}
