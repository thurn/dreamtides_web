import { describe, expect, it } from "vitest";
import { primitiveDefinition, primitiveOps } from "../../registry";

describe("primitive registry", () => {
  it("finds every primitive export by its op", () => {
    const ops = primitiveOps();
    expect(new Set(ops).size).toBe(ops.length);
    for (const op of ops) expect(primitiveDefinition(op).op).toBe(op);
    expect(() => primitiveDefinition("noSuchPrimitive")).toThrow();
  });
});
