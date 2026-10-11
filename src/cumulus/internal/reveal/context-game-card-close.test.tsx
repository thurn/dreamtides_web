// @vitest-environment jsdom

// The reveal coordinator's GameCard reveal close.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLog } from "../../../logging";
import {
  Source,
  UUID_A,
  fire,
  gameCardSpec,
  logged,
  mount,
  pointer,
  portal,
  setRect,
} from "./context.fixtures";

let resizeCallbacks: ResizeObserverCallback[];

async function hoverGameCard(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    await Promise.resolve();
  });
  act(() => {
    for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
  });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetLog();
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const size = this.dataset.revealMeasure === undefined ? 0 : 100;
      return DOMRect.fromRect({ x: 0, y: 0, width: size, height: size });
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
});

describe("Cumulus GameCard reveal close", () => {
  beforeEach(async () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 },
    });
    await import("../../components/card/CardView");
  });

  it("closes in the pointer-leave frame without a duplicate close on later resize or rotation", async () => {
    const [button] = mount(<Source id={UUID_A} spec={gameCardSpec()} />).buttons;
    setRect(button, 400, 250, 100, 50);
    await hoverGameCard(button);
    expect(logged("opened")).toHaveLength(1);
    pointer(button, "pointerout");
    expect(portal()).toBeNull();
    fire(window, new Event("resize"));
    fire(window, new Event("orientationchange"));
    expect(portal()).toBeNull();
    expect(logged("closed")).toHaveLength(1);
    expect(logged("closed")[0]).toMatchObject({ dismissalReason: "pointer-leave" });
  });

  it("closes once before rapid pointer re-entry opens a fresh interaction", async () => {
    const [button] = mount(<Source id={UUID_A} spec={gameCardSpec()} />).buttons;
    setRect(button, 400, 250, 100, 50);
    await hoverGameCard(button);
    pointer(button, "pointerout");
    await hoverGameCard(button);
    expect(logged("opened")).toHaveLength(2);
    expect(logged("closed")).toHaveLength(1);
    expect(portal()).not.toBeNull();
    pointer(button, "pointerout");
    expect(logged("closed")).toHaveLength(2);
  });

  it("does not duplicate a snapped close when its source or provider unmounts", () => {
    const { buttons, rerender, unmount } = mount(
      <Source id={UUID_A} spec={gameCardSpec()} />,
    );
    const [button] = buttons;
    setRect(button, 400, 250, 100, 50);
    pointer(button, "pointerover");
    pointer(button, "pointerout");
    expect(portal()).toBeNull();
    rerender(<div />);
    unmount();
    expect(portal()).toBeNull();
    expect(logged("closed")).toHaveLength(1);
    expect(logged("closed")[0]).toMatchObject({ dismissalReason: "pointer-leave" });
  });
});
