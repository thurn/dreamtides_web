import { describe, expect, it } from "vitest";
import { figmentPreviewCard, type EditorFigmentRecord } from "./figment-types";

describe("figmentPreviewCard", () => {
  it("supplies the canonical Figment suffix exactly once", () => {
    const record = {
      id: "86125402-a7ca-4bf2-ab36-f8a91ddd27bf",
      name: "Shadow",
      subtype: "Shadow",
      spark: 2,
      keyword: "",
      "rendered-text": "",
      "image-number": 277174382,
      art: { x: 0.289, y: -0.296, scale: 2.47 },
      sourceIndex: 1,
      source: {},
    } satisfies EditorFigmentRecord;

    expect(figmentPreviewCard(record).name).toBe("Shadow Figment");
    expect(
      figmentPreviewCard({ ...record, name: "Shadow Figment" }).name,
    ).toBe("Shadow Figment");
  });
});
