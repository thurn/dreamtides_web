import { describe, expect, it } from "vitest";
import { supportedDeploySlots, supportingReserveSlots } from "./support";

describe("support adjacency", () => {
  it("maps each reserve slot to the deploy slots it supports", () => {
    expect(supportedDeploySlots("B0")).toEqual(["F0"]);
    expect(supportedDeploySlots("B1")).toEqual(["F0", "F1"]);
    expect(supportedDeploySlots("B2")).toEqual(["F1", "F2"]);
    expect(supportedDeploySlots("B3")).toEqual(["F2", "F3"]);
    expect(supportedDeploySlots("B4")).toEqual(["F3"]);
  });
  it("inverts to the reserve slots supporting each deploy slot", () => {
    expect(supportingReserveSlots("F0")).toEqual(["B0", "B1"]);
    expect(supportingReserveSlots("F1")).toEqual(["B1", "B2"]);
    expect(supportingReserveSlots("F2")).toEqual(["B2", "B3"]);
    expect(supportingReserveSlots("F3")).toEqual(["B3", "B4"]);
  });
});
