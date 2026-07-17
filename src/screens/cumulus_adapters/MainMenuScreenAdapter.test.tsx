// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import { MainMenuScreenAdapter } from "./MainMenuScreenAdapter";

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
  resetLog();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("MainMenuScreenAdapter", () => {
  it("logs presentation and the intentionally inert player intents", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <MainMenuScreenAdapter />
        </CumulusRoot>,
      ),
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="main-menu-action-new-journey"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="main-menu-social-github"]',
        )
        ?.click(),
    );

    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "main_menu_presented" }),
        expect.objectContaining({
          event: "main_menu_action_pressed",
          actionId: "new-journey",
        }),
        expect.objectContaining({
          event: "main_menu_social_pressed",
          socialId: "github",
        }),
      ]),
    );

    act(() => root.unmount());
  });
});
