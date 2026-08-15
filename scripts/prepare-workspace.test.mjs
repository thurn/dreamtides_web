// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  prepareWorkspace,
  WORKSPACE_GENERATORS,
} from "./prepare-workspace.mjs";

describe("prepareWorkspace", () => {
  it("runs every workspace generator in dependency order", () => {
    const run = vi.fn();

    prepareWorkspace({ root: "/fixture", run });

    expect(run.mock.calls.map(([, args]) => args[0])).toEqual(
      WORKSPACE_GENERATORS.map(({ script }) => `/fixture/${script}`),
    );
    expect(run).toHaveBeenCalledTimes(4);
  });

  it("stops immediately when a generator fails", () => {
    const failure = new Error("fixture failure");
    const run = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw failure;
      });

    expect(() => prepareWorkspace({ root: "/fixture", run })).toThrow(failure);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
