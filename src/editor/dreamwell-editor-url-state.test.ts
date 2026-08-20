// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { DreamwellDisplayState } from "./dreamwell-types";
import {
  DEFAULT_DREAMWELL_DISPLAY_STATE,
  parseDreamwellDisplayState,
  replaceDreamwellDisplayStateInUrl,
} from "./dreamwell-editor-url-state";

describe("Dreamwell editor URL display state", () => {
  it("falls back to default display state for invalid query values", () => {
    expect(
      parseDreamwellDisplayState("?sort=bad&dir=sideways&size=tiny"),
    ).toEqual(DEFAULT_DREAMWELL_DISPLAY_STATE);
  });

  it("parses search, edit mode, sort, direction, and size", () => {
    expect(
      parseDreamwellDisplayState(
        "?q=Meadow&edit=1&sort=energyAdded&dir=desc&size=small",
      ),
    ).toEqual({
      searchText: "Meadow",
      artEditing: true,
      tagEditing: false,
      tagFilters: [],
      excludedTagFilters: [],
      sort: "energyAdded",
      dir: "desc",
      size: "small",
    });
  });

  it("round-trips every non-default control through the URL", () => {
    const state: DreamwellDisplayState = {
      searchText: "Aurora & tide",
      artEditing: true,
      tagEditing: true,
      tagFilters: ["Art Owned"],
      excludedTagFilters: ["Needs Crop"],
      sort: "order",
      dir: "desc",
      size: "medium",
    };

    replaceDreamwellDisplayStateInUrl(state);
    expect(parseDreamwellDisplayState(window.location.search)).toEqual(state);
  });

  it("clears query params when controls return to their defaults", () => {
    replaceDreamwellDisplayStateInUrl({
      ...DEFAULT_DREAMWELL_DISPLAY_STATE,
      searchText: "transient",
      artEditing: true,
    });
    expect(window.location.search).not.toBe("");

    replaceDreamwellDisplayStateInUrl(DEFAULT_DREAMWELL_DISPLAY_STATE);
    expect(window.location.search).toBe("");
  });
});
