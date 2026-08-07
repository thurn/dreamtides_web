import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSourceRevision,
  queueSourceSave,
  withExpectedSourceRevision,
} from "./source-revision";

describe("per-source editor revision queues", () => {
  beforeEach(() => {
    confirmSourceRevision("fixture", { sourceRevision: "reset" });
  });

  it("injects the confirmed revision and advances it after a load", () => {
    confirmSourceRevision("fixture", { sourceRevision: "one" });
    expect(withExpectedSourceRevision("fixture", { field: "name" })).toEqual({
      field: "name",
      expectedSourceRevision: "one",
    });
    confirmSourceRevision("fixture", { sourceRevision: "two" });
    expect(withExpectedSourceRevision("fixture", {})).toEqual({
      expectedSourceRevision: "two",
    });
  });

  it("serializes saves and pauses later operations after failure", async () => {
    const calls: string[] = [];
    let release: (() => void) | undefined;
    const first = queueSourceSave("fixture", async () => {
      calls.push("first-start");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      calls.push("first-end");
      throw new Error("rejected");
    });
    const secondOperation = vi.fn(() => Promise.resolve(calls.push("second")));
    const second = queueSourceSave("fixture", secondOperation);
    await Promise.resolve();
    expect(calls).toEqual(["first-start"]);
    if (release === undefined) {
      throw new Error("First queued save did not start");
    }
    release();
    await expect(first).rejects.toThrow("rejected");
    await expect(second).rejects.toThrow("rejected");
    expect(secondOperation).not.toHaveBeenCalled();

    confirmSourceRevision("fixture", { sourceRevision: "confirmed" });
    await expect(
      queueSourceSave("fixture", () => Promise.resolve("retried")),
    ).resolves.toBe("retried");
  });
});
