import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIDES_FILE,
  parseTidesEditorUrlState,
  serializeTidesEditorUrlState,
} from "./tides-editor-url-state";

describe("tides editor URL state", () => {
  it("defaults to the tides4 list view at medium size", () => {
    const state = parseTidesEditorUrlState("");
    expect(state).toEqual({ file: DEFAULT_TIDES_FILE, tideId: null, size: "medium" });
  });

  it("parses the file, selected tide, and size", () => {
    const state = parseTidesEditorUrlState("?file=tides5&tide=tide-fac-03&size=large");
    expect(state).toEqual({ file: "tides5", tideId: "tide-fac-03", size: "large" });
  });

  it("rejects a malformed file selector and an unknown size", () => {
    const state = parseTidesEditorUrlState("?file=../secret&size=huge");
    expect(state.file).toBe(DEFAULT_TIDES_FILE);
    expect(state.size).toBe("medium");
  });

  it("omits default values when serializing", () => {
    const params = serializeTidesEditorUrlState({
      file: DEFAULT_TIDES_FILE,
      tideId: null,
      size: "medium",
    });
    expect(params.toString()).toBe("");
  });

  it("round-trips a non-default view", () => {
    const original = { file: "tides5", tideId: "tide-neu-01", size: "small" as const };
    const params = serializeTidesEditorUrlState(original);
    expect(parseTidesEditorUrlState(`?${params.toString()}`)).toEqual(original);
  });
});
