// @vitest-environment jsdom
// D97OverworldScreen contract: renders the world slot and the panel slot,
// the HUD chip, the Essence readout only when present, and a control bar
// whose enabled controls report presses and whose disabled ones do not.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { D97OverworldScreen, type D97OverworldHudView } from "./D97OverworldScreen";

const VIEW: D97OverworldHudView = {
  actLabel: "Act 1",
  tierLabel: "Tier 4",
  essence: 120,
  controls: [
    { id: "deck", label: "Deck", enabled: false },
    { id: "menu", label: "Menu", enabled: true },
  ],
};

describe("D97OverworldScreen", () => {
  it("renders its slots, HUD and controls, and reports enabled presses", () => {
    const onControl = vi.fn();
    const { container } = renderInCumulus(
      <D97OverworldScreen
        view={VIEW}
        world={<div data-test-world="" />}
        panel={<div data-test-panel="" />}
        onControl={onControl}
      />,
    );
    expect(container.querySelector("[data-test-world]")).not.toBeNull();
    expect(container.querySelector("[data-test-panel]")).not.toBeNull();
    expect(container.querySelector("[data-d97-hud-chip]")).not.toBeNull();
    expect(container.querySelector("[data-d97-hud-essence]")).not.toBeNull();
    const menu = container.querySelector<HTMLElement>('[data-testid="d97-control-menu"]');
    const deck = container.querySelector<HTMLElement>('[data-testid="d97-control-deck"]');
    act(() => {
      menu?.click();
      deck?.click();
    });
    expect(onControl.mock.calls).toEqual([["menu"]]);
    expect(deck?.getAttribute("aria-disabled")).toBe("true");
  });

  it("hides the Essence readout before the run holds any", () => {
    const { container } = renderInCumulus(
      <D97OverworldScreen view={{ ...VIEW, essence: null }} world={null} onControl={() => undefined} />,
    );
    expect(container.querySelector("[data-d97-hud-essence]")).toBeNull();
  });
});
