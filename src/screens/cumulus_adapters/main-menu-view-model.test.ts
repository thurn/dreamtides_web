import { describe, expect, it } from "vitest";
import { resolveArtRef } from "../../cumulus/primitives/art";
import { buildMainMenuView } from "./main-menu-view-model";

describe("buildMainMenuView", () => {
  it("builds the available production menu actions", () => {
    const view = buildMainMenuView();

    expect(view.title).toBeDefined();
    expect(resolveArtRef(view.background)).toBe("/main-menu/background.jpg");
    expect(view.actions.map(({ id }) => id)).toEqual(["new-journey"]);
    expect(view.actions.every(({ label }) => label !== undefined)).toBe(true);
    expect(view.socials).toEqual([]);
  });
});
