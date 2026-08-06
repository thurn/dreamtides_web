import { describe, expect, it } from "vitest";
import { formatDocDescription, formatPropType } from "./PropsTable";

describe("formatPropType", () => {
  it("shows string-literal values next to a named type alias", () => {
    expect(
      formatPropType({
        tsType: "IconButtonSize",
        unionMembers: ["sm", "md"],
      }),
    ).toBe('IconButtonSize = "sm" | "md"');
  });

  it("does not repeat values already present in a direct union", () => {
    expect(
      formatPropType({
        tsType: '"default" | "accent"',
        unionMembers: ["default", "accent"],
      }),
    ).toBe('"default" | "accent"');
  });

  it("leaves non-enum types unchanged", () => {
    expect(
      formatPropType({ tsType: "boolean", unionMembers: [] }),
    ).toBe("boolean");
  });
});

describe("formatDocDescription", () => {
  it("renders JSDoc links as readable labels and normalizes source wrapping", () => {
    expect(
      formatDocDescription(
        "Uses an {@link ArtRef} from the\ncomponent and an {@link Glyph | icon}.",
      ),
    ).toBe("Uses an ArtRef from the component and an icon.");
  });
});
