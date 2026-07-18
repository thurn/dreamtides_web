// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import { LoadingScreenAdapter } from "./LoadingScreenAdapter";

vi.mock("./TutorialScreenAdapter", () => ({
  TutorialScreenAdapter: () => <main data-tutorial-screen />,
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/loading?seed=7#journey");
  resetLog();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("LoadingScreenAdapter", () => {
  it("logs direct loading-screen presentation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <LoadingScreenAdapter />
        </CumulusRoot>,
      ),
    );

    expect(container.querySelector("[data-loading-screen]")).not.toBeNull();
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "loading_screen_presented",
          source: "direct",
          attribution: "— Revelation 6:8",
        }),
      ]),
    );

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(container.querySelector("[data-loading-screen]")).not.toBeNull();
    expect(window.location.pathname).toBe("/loading");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(window.location.pathname).toBe("/tutorial");
    expect(window.location.search).toBe("?seed=7");
    expect(window.location.hash).toBe("#journey");

    act(() => root.unmount());
  });
});
