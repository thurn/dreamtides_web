// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { EditorDisplayState } from "./types";
import {
  DEFAULT_EDITOR_DISPLAY_STATE,
  parseEditorDisplayState,
  replaceEditorDisplayStateInUrl,
  serializeEditorDisplayState,
} from "./editor-url-state";

describe("editor URL display state", () => {
  it("falls back to default display state for invalid query values", () => {
    expect(
      parseEditorDisplayState(
        "?type=Spell&cost=99&sort=bad&dir=sideways&size=tiny",
      ),
    ).toEqual(DEFAULT_EDITOR_DISPLAY_STATE);
  });

  it("accepts spec type and cost filter values", () => {
    expect(parseEditorDisplayState("?type=character&cost=5plus")).toMatchObject({
      type: "character",
      cost: "5plus",
    });
    expect(parseEditorDisplayState("?type=event&cost=x")).toMatchObject({
      type: "event",
      cost: "x",
    });
  });

  it("round-trips search text through q", () => {
    const state: EditorDisplayState = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      searchText: "Moon & tide",
    };

    const params = serializeEditorDisplayState(state);

    expect(params.toString()).toBe("q=Moon+%26+tide");
    expect(parseEditorDisplayState(params).searchText).toBe("Moon & tide");
  });

  it("serializes non-default controls into stable query params", () => {
    const state: EditorDisplayState = {
      searchText: "",
      searchScope: "all",
      type: "character",
      cost: "5plus",
      subtype: "Scout",
      tagFilters: [],
      tagEditing: false,
      artEditing: false,
      sort: "cost",
      dir: "desc",
      size: "large",
    };

    expect(serializeEditorDisplayState(state).toString()).toBe(
      "scope=all&type=character&cost=5plus&subtype=Scout&sort=cost&dir=desc&size=large",
    );
    expect(parseEditorDisplayState(serializeEditorDisplayState(state))).toEqual(
      state,
    );
  });

  it("round-trips the rules-text search scope through scope", () => {
    expect(parseEditorDisplayState("?q=shield&scope=all")).toMatchObject({
      searchText: "shield",
      searchScope: "all",
    });
    expect(parseEditorDisplayState("?scope=bogus").searchScope).toBe("name");
    expect(
      serializeEditorDisplayState({
        ...DEFAULT_EDITOR_DISPLAY_STATE,
        searchScope: "name",
      }).toString(),
    ).toBe("");
  });

  it("omits empty and default values", () => {
    expect(serializeEditorDisplayState(DEFAULT_EDITOR_DISPLAY_STATE).toString()).toBe(
      "",
    );
    expect(
      serializeEditorDisplayState({
        ...DEFAULT_EDITOR_DISPLAY_STATE,
        searchText: "",
        subtype: "",
      }).toString(),
    ).toBe("");
  });

  it("round-trips tag filters and tag-editing mode", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      tagFilters: ["Removal", "Elves"],
      tagEditing: true,
    };
    const params = serializeEditorDisplayState(state);

    expect(params.getAll("tag")).toEqual(["Removal", "Elves"]);
    expect(params.get("tagedit")).toBe("1");

    const parsed = parseEditorDisplayState(params);
    expect(parsed.tagFilters).toEqual(["Removal", "Elves"]);
    expect(parsed.tagEditing).toBe(true);
  });

  it("round-trips art-editing mode", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      artEditing: true,
    };
    const params = serializeEditorDisplayState(state);

    expect(params.get("artedit")).toBe("1");
    expect(parseEditorDisplayState(params).artEditing).toBe(true);
    expect(parseEditorDisplayState("?artedit=0").artEditing).toBe(false);
  });

  it("dedupes and trims tag filters and defaults tag-editing off", () => {
    const parsed = parseEditorDisplayState("?tag=Removal&tag=Removal&tag=%20Elves%20");
    expect(parsed.tagFilters).toEqual(["Removal", "Elves"]);
    expect(parsed.tagEditing).toBe(false);
  });

  it("updates the current URL with replaceState", () => {
    window.history.pushState(null, "", "/editor");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");

    replaceEditorDisplayStateInUrl({
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      searchText: "spark",
      size: "small",
    });

    expect(replaceState).toHaveBeenCalledWith(null, "", "/editor?q=spark&size=small");
    expect(pushState).not.toHaveBeenCalled();
    replaceState.mockRestore();
    pushState.mockRestore();
  });

  it("preserves the toml file selection across display-state URL updates", () => {
    window.history.pushState(null, "", "/editor?toml=data/tabula/cards_v2.toml");
    const replaceState = vi.spyOn(window.history, "replaceState");

    replaceEditorDisplayStateInUrl({
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      searchText: "spark",
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/editor?q=spark&toml=data%2Ftabula%2Fcards_v2.toml",
    );
    replaceState.mockRestore();
  });
});
