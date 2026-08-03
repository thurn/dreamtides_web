import { describe, expect, it } from "vitest";
import { safeAreaInsetAtLeast } from "./safe-area";

describe("safeAreaInsetAtLeast", () => {
  it("combines a physical edge inset with a tokenized spacing floor", () => {
    expect(safeAreaInsetAtLeast("top", "--space-8")).toBe(
      "max(var(--safe-area-inset-top), var(--space-8))",
    );
    expect(safeAreaInsetAtLeast("bottom", "--space-8")).toBe(
      "max(var(--safe-area-inset-bottom), var(--space-8))",
    );
  });
});
