import { describe, expect, it } from "vitest";
import { supportedDeploySlots, supportingReserveSlots } from "./support";

describe("support adjacency", () => {
  it("maps each reserve slot to the deploy slots it supports", () => {
    expect(supportedDeploySlots("R0")).toEqual(["D0"]);
    expect(supportedDeploySlots("R1")).toEqual(["D0", "D1"]);
    expect(supportedDeploySlots("R2")).toEqual(["D1", "D2"]);
    expect(supportedDeploySlots("R3")).toEqual(["D2", "D3"]);
    expect(supportedDeploySlots("R4")).toEqual(["D3"]);
  });
  it("inverts to the reserve slots supporting each deploy slot", () => {
    expect(supportingReserveSlots("D0")).toEqual(["R0", "R1"]);
    expect(supportingReserveSlots("D1")).toEqual(["R1", "R2"]);
    expect(supportingReserveSlots("D2")).toEqual(["R2", "R3"]);
    expect(supportingReserveSlots("D3")).toEqual(["R3", "R4"]);
  });
});
