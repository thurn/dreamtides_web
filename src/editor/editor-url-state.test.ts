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

  it("round-trips shared-name-substring grouping through sort", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      sort: "nameSubstring" as const,
    };

    expect(serializeEditorDisplayState(state).toString()).toBe(
      "sort=namesubstring",
    );
    expect(parseEditorDisplayState("?sort=namesubstring").sort).toBe(
      "nameSubstring",
    );
  });

  it("serializes non-default controls into stable query params", () => {
    const state: EditorDisplayState = {
      searchText: "",
      searchScope: "all",
      type: "character",
      cost: "5plus",
      subtype: "Scout",
      tagFilters: [],
      excludedTagFilters: [],
      tideFilters: [],
      tagEditing: false,
      tideEditing: false,
      artEditing: false,
      checkboxTag: "",
      showFontSize: false,
      showGlossaryInfoOnHover: false,
      sort: "cost",
      dir: "desc",
      size: "small",
    };

    expect(serializeEditorDisplayState(state).toString()).toBe(
      "scope=all&type=character&cost=5plus&subtype=Scout&sort=cost&dir=desc&size=small",
    );
    expect(parseEditorDisplayState(serializeEditorDisplayState(state))).toEqual(
      state,
    );
  });

  it("round-trips non-default search scopes through scope", () => {
    expect(parseEditorDisplayState("?q=shield&scope=all")).toMatchObject({
      searchText: "shield",
      searchScope: "all",
    });
    expect(parseEditorDisplayState("?scope=bogus").searchScope).toBe("name");
    expect(parseEditorDisplayState("?q=1042&scope=imageNumber")).toMatchObject({
      searchText: "1042",
      searchScope: "imageNumber",
    });
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

  it("round-trips excluded tag filters through nottag", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      tagFilters: ["Removal"],
      excludedTagFilters: ["Elves", "Tokens"],
    };
    const params = serializeEditorDisplayState(state);

    expect(params.getAll("tag")).toEqual(["Removal"]);
    expect(params.getAll("nottag")).toEqual(["Elves", "Tokens"]);

    const parsed = parseEditorDisplayState(params);
    expect(parsed.tagFilters).toEqual(["Removal"]);
    expect(parsed.excludedTagFilters).toEqual(["Elves", "Tokens"]);
  });

  it("drops an excluded tag that also appears as an include filter", () => {
    const parsed = parseEditorDisplayState(
      "?tag=Removal&nottag=Removal&nottag=Elves",
    );
    expect(parsed.tagFilters).toEqual(["Removal"]);
    expect(parsed.excludedTagFilters).toEqual(["Elves"]);
  });

  it("round-trips a single tide filter and tide-editing mode", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      tideFilters: ["event_chain"],
      tideEditing: true,
    };
    const params = serializeEditorDisplayState(state);

    expect(params.getAll("tide")).toEqual(["event_chain"]);
    expect(params.get("tideedit")).toBe("1");

    const parsed = parseEditorDisplayState(params);
    expect(parsed.tideFilters).toEqual(["event_chain"]);
    expect(parsed.tideEditing).toBe(true);
  });

  it("keeps only the first tide filter when several are present", () => {
    const parsed = parseEditorDisplayState("?tide=event_chain&tide=void_recursion");
    expect(parsed.tideFilters).toEqual(["event_chain"]);
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

  it("round-trips checkbox tagging mode", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      checkboxTag: "Removal",
    };
    const params = serializeEditorDisplayState(state);

    expect(params.get("checkboxtag")).toBe("Removal");
    expect(parseEditorDisplayState(params).checkboxTag).toBe("Removal");
    expect(parseEditorDisplayState("?checkboxtag=%20Elves%20").checkboxTag).toBe(
      "Elves",
    );
    expect(parseEditorDisplayState("").checkboxTag).toBe("");
  });

  it("round-trips glossary hover info cards", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      showGlossaryInfoOnHover: true,
    };

    const params = serializeEditorDisplayState(state);

    expect(params.get("glossaryhover")).toBe("1");
    expect(parseEditorDisplayState(params).showGlossaryInfoOnHover).toBe(true);
    expect(parseEditorDisplayState("").showGlossaryInfoOnHover).toBe(false);
  });

  it("round-trips the font-size overlay toggle", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      showFontSize: true,
    };
    const params = serializeEditorDisplayState(state);

    expect(params.get("showfontsize")).toBe("1");
    expect(parseEditorDisplayState(params).showFontSize).toBe(true);
    expect(parseEditorDisplayState("?showfontsize=0").showFontSize).toBe(false);
    expect(parseEditorDisplayState("").showFontSize).toBe(false);
  });

  it("round-trips the rules-text font-size sort field", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      sort: "rulesTextFontSize" as const,
      dir: "asc" as const,
    };
    const params = serializeEditorDisplayState(state);

    expect(params.get("sort")).toBe("rulestextfontsize");
    expect(parseEditorDisplayState(params).sort).toBe("rulesTextFontSize");
  });

  it("round-trips the popularity sort field", () => {
    const state = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      sort: "popularity" as const,
      dir: "desc" as const,
    };
    const params = serializeEditorDisplayState(state);

    expect(params.get("sort")).toBe("popularity");
    expect(parseEditorDisplayState(params).sort).toBe("popularity");
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

  it("preserves the canonical source selection across display-state URL updates", () => {
    window.history.pushState(null, "", "/editor?toml=data/cards.toml");
    const replaceState = vi.spyOn(window.history, "replaceState");

    replaceEditorDisplayStateInUrl({
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      searchText: "spark",
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/editor?q=spark&source=data%2Fcards.toml",
    );
    replaceState.mockRestore();
  });
});
