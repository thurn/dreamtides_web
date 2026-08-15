import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIDES_FILE,
  parseTidesEditorUrlState,
  serializeTidesEditorUrlState,
} from "./tides-editor-url-state";
import { testTideId } from "../types/test-identities";

const TIDE_ID = testTideId("10000000-0000-4000-8000-000000000001");

describe("tides editor URL state", () => {
  it("defaults to the tides list view at medium size", () => {
    const state = parseTidesEditorUrlState("");
    expect(state).toEqual({ file: DEFAULT_TIDES_FILE, tideId: null, size: "medium" });
  });

  it("parses the selected tide and size", () => {
    const state = parseTidesEditorUrlState(`?tide=${TIDE_ID}&size=large`);
    expect(state).toEqual({ file: "tides", tideId: TIDE_ID, size: "large" });
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
    const original = {
      file: "tides" as const,
      tideId: TIDE_ID,
      size: "small" as const,
    };
    const params = serializeTidesEditorUrlState(original);
    expect(parseTidesEditorUrlState(`?${params.toString()}`)).toEqual(original);
  });
});
