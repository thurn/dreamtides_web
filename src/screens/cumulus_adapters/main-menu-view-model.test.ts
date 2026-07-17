import { describe, expect, it } from "vitest";
import { resolveArtRef } from "../../cumulus/primitives/art";
import { buildMainMenuView } from "./main-menu-view-model";

describe("buildMainMenuView", () => {
  it("builds the authored menu order and typed social glyphs", () => {
    const view = buildMainMenuView();

    expect(view.title).toBe("Dreamtides");
    expect(resolveArtRef(view.background)).toContain("shutterstock_1891048579");
    expect(view.actions.map(({ id, label }) => [id, label])).toEqual([
      ["new-journey", "New Journey"],
      ["dream-codex", "Dream Codex"],
      ["settings", "Settings"],
      ["about", "About"],
      ["quit", "Quit"],
    ]);
    expect(view.socials.map(({ id, label }) => [id, label])).toEqual([
      ["github", "GitHub"],
      ["discord", "Discord"],
    ]);
    expect(view.socials[0]?.glyph).toContain("bxl-github");
    expect(view.socials[1]?.glyph).toContain("bxl-discord-alt");
  });
});
