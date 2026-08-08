import { describe, expect, it } from "vitest";
import { resolveArtRef } from "../../cumulus/primitives/art";
import { buildMainMenuView } from "./main-menu-view-model";

describe("buildMainMenuView", () => {
  it("builds the authored menu order and typed social glyphs", () => {
    const view = buildMainMenuView();

    expect(view.title.id).toBe("main-menu-title");
    expect(resolveArtRef(view.background)).toBe("/main-menu/background.jpg");
    expect(view.actions.map(({ id, label }) => [id, label.id])).toEqual([
      ["new-journey", "main-menu-new-journey-action"],
      ["dream-codex", "main-menu-dream-codex-action"],
      ["settings", "main-menu-settings-action"],
      ["about", "main-menu-about-action"],
      ["quit", "main-menu-quit-action"],
    ]);
    expect(view.socials.map(({ id, label }) => [id, label.id])).toEqual([
      ["github", "main-menu-github-action"],
      ["discord", "main-menu-discord-action"],
      ["reddit", "main-menu-reddit-action"],
    ]);
    expect(view.socials[0]?.glyph).toContain("bxl-github");
    expect(view.socials[1]?.glyph).toContain("bxl-discord-alt");
    expect(view.socials[2]?.glyph).toContain("bxl-reddit");
  });
});
