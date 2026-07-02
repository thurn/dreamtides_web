// Unit tests for controlForProp, the pure mapping from a docgen PropMeta to
// the interactive control the /tango doc site renders for that prop. Each
// test pins one branch of the priority-ordered decision rule (union check
// FIRST, then boolean/number/string, then a "none" fallback for anything
// else) so a future edit can't silently reorder or drop a branch.

import { describe, expect, it } from "vitest";
import { controlForProp, type PropMeta } from "./controls";

/** Build a full PropMeta, overriding only the fields a test cares about. */
function meta(overrides: Partial<PropMeta>): PropMeta {
  return {
    name: "prop",
    tsType: "string",
    unionMembers: [],
    required: false,
    defaultValue: null,
    description: "",
    ...overrides,
  };
}

describe("controlForProp", () => {
  it("maps a boolean prop to a toggle", () => {
    expect(controlForProp(meta({ tsType: "boolean" }))).toEqual({
      kind: "toggle",
    });
  });

  it("maps a string-literal union prop to a select, checked before the string/text branch", () => {
    // tsType is the quoted union string react-docgen-typescript reports; the
    // decision must key off unionMembers (structured), not string-parse tsType.
    const result = controlForProp(
      meta({
        tsType: '"sm" | "md" | "lg"',
        unionMembers: ["sm", "md", "lg"],
      }),
    );
    expect(result).toEqual({ kind: "select", options: ["sm", "md", "lg"] });
  });

  it("maps a number prop to a number control", () => {
    expect(controlForProp(meta({ tsType: "number" }))).toEqual({
      kind: "number",
    });
  });

  it("maps a plain string prop (no union members) to a text control", () => {
    expect(
      controlForProp(meta({ tsType: "string", unionMembers: [] })),
    ).toEqual({ kind: "text" });
  });

  it("maps an unhandled ReactNode prop to no control, rather than silently rendering a broken one", () => {
    expect(
      controlForProp(meta({ tsType: "ReactNode", unionMembers: [] })),
    ).toEqual({ kind: "none" });
  });
});
