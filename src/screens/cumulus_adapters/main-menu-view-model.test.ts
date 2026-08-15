import { describe, expect, it } from "vitest";
import { resolveArtRef } from "../../cumulus/primitives/art";
import type { EventContext } from "../../eventlog/types";
import { frontDoorAction } from "../../rules/front-door";
import type { FrontDoorState } from "../../rules/fold-state";
import { buildMainMenuView } from "./main-menu-view-model";

const MAIN_MENU_STATE: FrontDoorState = {
  phase: "main",
  journeyId: null,
  tutorial: null,
};

const EVENT_CONTEXT: EventContext = {
  seq: 1,
  rng: () => 0,
  timestamp: "1970-01-01T00:00:00.000Z",
  intervening: [],
};

describe("buildMainMenuView", () => {
  it("builds the available production menu actions", () => {
    const view = buildMainMenuView();

    expect(view.title).toBeDefined();
    expect(resolveArtRef(view.background)).toBe("/main-menu/background.jpg");
    expect(view.actions.map(({ id }) => id)).toEqual(["new-journey"]);
    expect(view.actions.every(({ label }) => label !== undefined)).toBe(true);
    expect(view.socials).toEqual([]);
  });

  it("keeps every rendered control unique and reachable through the room fold", () => {
    const view = buildMainMenuView();
    const controls = [
      ...view.actions.map(({ id }) => ({ id, surface: "action" })),
      ...view.socials.map(({ id }) => ({ id, surface: "social" })),
    ];
    const ids = controls.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const control of controls) {
      const next = frontDoorAction(
        MAIN_MENU_STATE,
        { surface: "main", actionId: control.id },
        EVENT_CONTEXT,
      );

      expect(next, `${control.surface} ${control.id}`).not.toBeNull();
      expect(next, `${control.surface} ${control.id}`).not.toBe(
        MAIN_MENU_STATE,
      );
    }
  });
});
