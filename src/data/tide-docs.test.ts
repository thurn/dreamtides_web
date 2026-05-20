import { describe, expect, it } from "vitest";
import { getTideDocumentation, parseTideDocumentation } from "./tide-docs";

describe("tide documentation", () => {
  it("loads literal tide sections from docs/tides/tides.md", () => {
    const documentation = getTideDocumentation("warrior_pressure");

    expect(documentation?.markdown).toContain("Display name: Iron Charge.");
    expect(documentation?.markdown).toContain(
      "Mechanical identity: Low-curve Warriors, direct spark buffs, point racing, and",
    );
    expect(documentation?.markdown).not.toContain(
      "A war drum beat made into doctrine.",
    );
  });

  it("stops a structural tide section before the next tide layer heading", () => {
    const documentation = getTideDocumentation("spark_tall");

    expect(documentation?.markdown).toContain("Display name: Kindled Crown.");
    expect(documentation?.markdown).not.toContain("## Support Tides");
    expect(documentation?.markdown).not.toContain("### `big_energy`");
  });

  it("parses simple lists and paragraphs for rendered popovers", () => {
    const parsed = parseTideDocumentation([
      "### `sample_tide`",
      "",
      "Opening line",
      "continued.",
      "",
      "- first",
      "- second",
      "",
      "### `next_tide`",
      "Next.",
    ].join("\n"));

    expect(parsed.get("sample_tide")?.blocks).toEqual([
      { kind: "heading", text: "`sample_tide`" },
      { kind: "paragraph", text: "Opening line continued." },
      { kind: "list", items: ["first", "second"] },
    ]);
  });
});
