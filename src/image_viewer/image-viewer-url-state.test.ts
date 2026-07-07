import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_VIEWER_DISPLAY_STATE,
  parseImageViewerDisplayState,
  serializeImageViewerDisplayState,
} from "./image-viewer-url-state";

describe("parseImageViewerDisplayState", () => {
  it("returns defaults for an empty query", () => {
    expect(parseImageViewerDisplayState("")).toEqual(
      DEFAULT_IMAGE_VIEWER_DISPLAY_STATE,
    );
  });

  it("parses category, used, named, random, and columns", () => {
    expect(
      parseImageViewerDisplayState(
        "?category=warrior&used=1&named=1&random=1&cols=6",
      ),
    ).toEqual({
      category: "warrior",
      showUsed: true,
      onlyNamed: true,
      randomOrder: true,
      columns: 6,
    });
  });

  it("defaults the named filter off", () => {
    expect(parseImageViewerDisplayState("?category=warrior").onlyNamed).toBe(
      false,
    );
  });

  it("defaults random order off", () => {
    expect(parseImageViewerDisplayState("?category=warrior").randomOrder).toBe(
      false,
    );
  });

  it("falls back to four columns for an unsupported count", () => {
    expect(parseImageViewerDisplayState("?cols=5").columns).toBe(4);
  });

  it("treats a blank category as all", () => {
    expect(parseImageViewerDisplayState("?category=").category).toBe("all");
  });
});

describe("serializeImageViewerDisplayState", () => {
  it("omits default values", () => {
    expect(
      serializeImageViewerDisplayState(DEFAULT_IMAGE_VIEWER_DISPLAY_STATE),
    ).toBe("");
  });

  it("round-trips a non-default state", () => {
    const state = {
      category: "events",
      showUsed: true,
      onlyNamed: true,
      randomOrder: true,
      columns: 8 as const,
    };
    const parsed = parseImageViewerDisplayState(
      serializeImageViewerDisplayState(state),
    );
    expect(parsed).toEqual(state);
  });
});
