import { describe, expect, it } from "vitest";
import { resolveArtRef } from "../../cumulus/primitives/art";
import { buildMainMenuView } from "./main-menu-view-model";

describe("buildMainMenuView", () => {
  it("builds the authored menu order and typed social glyphs", () => {
    const view = buildMainMenuView();

    expect(view.title).toBeDefined();
    expect(resolveArtRef(view.background)).toBe("/main-menu/background.jpg");
    expect(view.actions.map(({ id }) => id)).toEqual([
      "new-journey", "dream-codex", "settings", "about", "quit",
    ]);
    expect(view.actions.every(({ label }) => label !== undefined)).toBe(true);
    expect(view.socials.map(({ id }) => id)).toEqual([
      "github", "discord", "reddit",
    ]);
    expect(view.socials.every(({ label }) => label !== undefined)).toBe(true);
    expect(view.socials[0]?.glyph).toContain("bxl-github");
    expect(view.socials[1]?.glyph).toContain("bxl-discord-alt");
    expect(view.socials[2]?.glyph).toContain("bxl-reddit");
  });
});
