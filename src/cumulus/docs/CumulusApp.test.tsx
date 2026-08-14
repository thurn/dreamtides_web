// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import CumulusApp from "./CumulusApp";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "";
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("Cumulus documentation route", () => {
  it("renders the complete overview with production localization checks", () => {
    vi.stubEnv("MODE", "production");
    vi.stubGlobal("scrollTo", vi.fn());
    // Keep data-backed demos in their deterministic loading state. This smoke
    // test covers the synchronous route shell and complete registry render.
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    window.location.hash = "";

    const container = document.createElement("div");
    document.body.append(container);
    const uncaughtErrors: unknown[] = [];
    const root = createRoot(container, {
      onUncaughtError: (error) => uncaughtErrors.push(error),
    });

    act(() => {
      root.render(
        <CumulusRoot>
          <CumulusApp />
        </CumulusRoot>,
      );
    });

    expect(uncaughtErrors).toEqual([]);
    expect(container.childElementCount).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-card-pile]")).toHaveLength(3);

    act(() => root.unmount());
  });
});
