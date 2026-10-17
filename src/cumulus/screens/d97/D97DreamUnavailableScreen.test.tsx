// @vitest-environment jsdom
// D97DreamUnavailableScreen contract: it reports Main Menu, and offers no
// action when no main menu can be opened.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { D97DreamUnavailableScreen } from "./D97DreamUnavailableScreen";

const MAIN_MENU = '[data-testid="d97-dream-unavailable-main-menu"]';

describe("D97DreamUnavailableScreen", () => {
  it("reports Main Menu", () => {
    const onMainMenu = vi.fn();
    const { container } = renderInCumulus(<D97DreamUnavailableScreen onMainMenu={onMainMenu} />);
    const document = container.ownerDocument;
    expect(document.querySelector('[data-d97-screen="dream-unavailable"] [role="alert"]')).not.toBeNull();
    act(() => document.querySelector<HTMLElement>(MAIN_MENU)?.click());
    expect(onMainMenu).toHaveBeenCalledTimes(1);
  });

  it("offers no action without a main menu", () => {
    const { container } = renderInCumulus(<D97DreamUnavailableScreen onMainMenu={null} />);
    expect(container.ownerDocument.querySelector(MAIN_MENU)).toBeNull();
  });
});
