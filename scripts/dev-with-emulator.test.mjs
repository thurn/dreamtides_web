import { describe, expect, it } from "vitest";
import { normalizeForwardedViteArgs } from "./dev-with-emulator.mjs";

describe("normalizeForwardedViteArgs", () => {
  it("uses the default strict port when no port is provided", () => {
    expect(normalizeForwardedViteArgs([])).toEqual([
      "--port",
      "5173",
      "--strictPort",
    ]);
  });

  it("forwards a caller-provided port without also adding the default port", () => {
    expect(normalizeForwardedViteArgs(["--port", "5174"])).toEqual([
      "--strictPort",
      "--port",
      "5174",
    ]);
  });

  it("supports equals-form port arguments", () => {
    expect(normalizeForwardedViteArgs(["--port=5174"])).toEqual([
      "--strictPort",
      "--port=5174",
    ]);
  });

  it("strips a leading separator before forwarding to Vite", () => {
    expect(normalizeForwardedViteArgs(["--", "--port", "5174"])).toEqual([
      "--strictPort",
      "--port",
      "5174",
    ]);
  });

  it("does not duplicate strictPort when it is provided by the caller", () => {
    expect(normalizeForwardedViteArgs(["--strictPort", "--host", "0.0.0.0"])).toEqual([
      "--port",
      "5173",
      "--strictPort",
      "--host",
      "0.0.0.0",
    ]);
  });
});
