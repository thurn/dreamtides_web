import { describe, expect, it } from "vitest";
import { parseIdenticonsParam } from "./identicon-mode";

describe("parseIdenticonsParam", () => {
  it("is true only when identicons is exactly 1", () => {
    expect(parseIdenticonsParam("?identicons=1")).toBe(true);
  });

  it("ignores other values", () => {
    expect(parseIdenticonsParam("")).toBe(false);
    expect(parseIdenticonsParam("?identicons=0")).toBe(false);
    expect(parseIdenticonsParam("?identicons=true")).toBe(false);
    expect(parseIdenticonsParam("?identicons=")).toBe(false);
  });

  it("reads the parameter alongside other params", () => {
    expect(parseIdenticonsParam("?seed=42&identicons=1")).toBe(true);
  });
});
