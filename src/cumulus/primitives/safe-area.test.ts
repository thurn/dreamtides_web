import { describe, expect, it } from "vitest";
import { safeAreaInsetAtLeast } from "./safe-area";

describe("safeAreaInsetAtLeast", () => {
  it("combines a physical edge inset with a tokenized spacing floor", () => {
    expect(safeAreaInsetAtLeast("top", "--space-2xl")).toBe(
      "max(var(--safe-area-inset-top), var(--space-2xl))",
    );
    expect(safeAreaInsetAtLeast("bottom", "--space-2xl")).toBe(
      "max(var(--safe-area-inset-bottom), var(--space-2xl))",
    );
  });
});
