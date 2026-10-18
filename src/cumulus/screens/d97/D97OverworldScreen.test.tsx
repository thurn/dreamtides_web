// @vitest-environment jsdom
// D97OverworldScreen contract: renders the world slot and the panel slot,
// the HUD chip, the Essence readout only when present, and a control bar
// whose enabled controls report presses and whose disabled ones do not; the
// HUD hides while a panel occupies the screen; the world's fade covers it
// only while covered, letting input through when clear; and it reports the
// control bar's inset from the screen's bottom edge.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { D97OverworldScreen, type D97OverworldHudView, type D97WorldFadeView } from "./D97OverworldScreen";

const VIEW: D97OverworldHudView = {
  actLabel: "Act 1",
  tierLabel: "Tier 4",
  essence: 120,
  controls: [
    { id: "deck", label: "Deck", enabled: false },
    { id: "menu", label: "Menu", enabled: true },
  ],
};

const CLEAR: D97WorldFadeView = { covered: false, seconds: 0.3 };

describe("D97OverworldScreen", () => {
  it("renders its slots, HUD and controls, and reports enabled presses", () => {
    const onControl = vi.fn();
    const { container } = renderInCumulus(
      <D97OverworldScreen
        view={VIEW}
        world={<div data-test-world="" />}
        worldFade={CLEAR}
        panel={<div data-test-panel="" />}
        panelOpen={false}
        onControl={onControl}
        onHudInset={() => undefined}
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

  it("covers the world only while its fade is covered", () => {
    const fade = (covered: boolean) => {
      const { container } = renderInCumulus(
        <D97OverworldScreen view={VIEW} world={null} worldFade={{ ...CLEAR, covered }} panelOpen={false} onControl={() => undefined} onHudInset={() => undefined} />,
      );
      return container.querySelector<HTMLElement>("[data-d97-world-fade]");
    };
    const covered = fade(true);
    expect(covered?.dataset.d97WorldFade).toBe("covered");
    expect(covered?.style.opacity).toBe("1");
    expect(covered?.style.pointerEvents).toBe("auto");
    const clear = fade(false);
    expect(clear?.dataset.d97WorldFade).toBe("clear");
    expect(clear?.style.opacity).toBe("0");
    expect(clear?.style.pointerEvents).toBe("none");
  });

  it("hides the Essence readout before the run holds any", () => {
    const { container } = renderInCumulus(
      <D97OverworldScreen view={{ ...VIEW, essence: null }} world={null} worldFade={CLEAR} panelOpen={false} onControl={() => undefined} onHudInset={() => undefined} />,
    );
    expect(container.querySelector("[data-d97-hud-essence]")).toBeNull();
  });

  it("hides the HUD while a panel occupies the screen", () => {
    const { container } = renderInCumulus(
      <D97OverworldScreen view={VIEW} world={null} worldFade={CLEAR} panel={<div />} panelOpen onControl={() => undefined} onHudInset={() => undefined} />,
    );
    const hud = container.querySelector<HTMLElement>("[data-d97-hud]");
    expect(hud?.getAttribute("data-d97-hud-hidden")).toBe("true");
    expect(hud?.style.visibility).toBe("hidden");
  });

  it("reports the control bar's inset from the screen's bottom edge", () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-d97-hud-controls") ? rect(780, 830) : rect(0, 844);
    });
    const onHudInset = vi.fn();
    renderInCumulus(<D97OverworldScreen view={VIEW} world={null} worldFade={CLEAR} panelOpen={false} onControl={() => undefined} onHudInset={onHudInset} />);
    expect(onHudInset).toHaveBeenLastCalledWith(64);
    spy.mockRestore();
  });
});
