import { describe, expect, it } from "vitest";
import { buildLoadingView } from "./loading-view-model";

describe("buildLoadingView", () => {
  it("builds the authored verse and loading copy", () => {
    expect(buildLoadingView()).toEqual({
      quote:
        "“I looked, and there before me was a pale horse, and its rider was named Death.”",
      loadingLabel: "Loading",
    });
  });
});
