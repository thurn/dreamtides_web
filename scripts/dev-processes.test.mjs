// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { summarizeRuntimeState } from "./dev-processes.mjs";

describe("managed development process state", () => {
  it("reports a live wrapper and its live children", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
      if (pid === 10 || pid === 11) return true;
      const error = new Error("missing");
      error.code = "ESRCH";
      throw error;
    });
    const summary = summarizeRuntimeState({
      pid: 10,
      cwd: "/repo",
      children: [{ pid: 11 }, { pid: 12 }],
    });
    expect(summary.wrapperAlive).toBe(true);
    expect(summary.liveChildren).toEqual([{ pid: 11 }]);
    expect(summary.active).toBe(true);
    kill.mockRestore();
  });

  it("identifies an orphaned child and a fully stopped server", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
      if (pid === 21) return true;
      const error = new Error("missing");
      error.code = "ESRCH";
      throw error;
    });
    const orphaned = summarizeRuntimeState({ pid: 20, children: [{ pid: 21 }] });
    const stopped = summarizeRuntimeState({ pid: 30, children: [{ pid: 31 }] });
    expect(orphaned).toMatchObject({ wrapperAlive: false, active: true });
    expect(stopped).toMatchObject({ wrapperAlive: false, active: false });
    kill.mockRestore();
  });
});
