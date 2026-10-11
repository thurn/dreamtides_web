import { describe, expect, it } from "vitest";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import type { EventContext } from "../../eventlog/types";
import { frontDoorAction } from "../../rules/front-door";
import type { FrontDoorState } from "../../rules/fold-state";
import { buildMainMenuView } from "./main-menu-view-model";

describe("main-menu-view-model", () => {
  const MAIN_MENU_STATE: FrontDoorState = {
    phase: "main",
    journeyId: null,
    tutorial: null,
  };

  const EVENT_CONTEXT: EventContext = {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 1,
    rng: () => 0,
    timestamp: "1970-01-01T00:00:00.000Z",
    intervening: [],
  };

  describe("buildMainMenuView", () => {
    it("keeps every rendered control unique and New Journey reachable through the game fold", () => {
      const view = buildMainMenuView();
      const controls = [
        ...view.actions.map(({ id }) => ({ id, surface: "action" })),
        ...view.socials.map(({ id }) => ({ id, surface: "social" })),
      ];
      const ids = controls.map(({ id }) => id);

      expect(new Set(ids).size).toBe(ids.length);
      const next = frontDoorAction(
        MAIN_MENU_STATE,
        { surface: "main", actionId: "new-journey" },
        EVENT_CONTEXT,
      );

      expect(next).not.toBeNull();
      expect(next).not.toBe(MAIN_MENU_STATE);
    });
  });
});
