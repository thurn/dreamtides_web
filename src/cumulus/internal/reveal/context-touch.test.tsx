// @vitest-environment jsdom

// The reveal coordinator's touch interaction.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLog } from "../../../logging";
import {
  Source,
  UUID_A,
  isActive,
  logged,
  mount,
  pointer,
  portal,
  setRect,
} from "./context.fixtures";

let resizeCallbacks: ResizeObserverCallback[];

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

describe("Cumulus reveal touch interaction", () => {
  it("keeps a touch reveal open when an ancestor pointer capture retargets the pointer", () => {
    vi.useFakeTimers();
    const [button] = mount(<Source id={UUID_A} />).buttons;
    setRect(button, 20, 220, 120, 60);
    const touch = { pointerType: "touch", pointerId: 11 };
    pointer(button, "pointerdown", touch);
    expect(isActive(button)).toBe(true);
    pointer(button, "pointerout", touch);
    expect(isActive(button)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(portal()).not.toBeNull();
    pointer(button, "pointerup", touch);
    expect(isActive(button)).toBe(false);
  });

  it.each(["pointerup", "pointercancel"] as const)(
    "dismisses a touch reveal when terminal %s is retargeted away from its source",
    (eventType) => {
      vi.useFakeTimers();
      const activate = vi.fn();
      const [button] = mount(<Source id={UUID_A} onActivate={activate} />).buttons;
      setRect(button, 20, 220, 120, 60);
      pointer(button, "pointerdown", { pointerType: "touch", pointerId: 12 });
      act(() => {
        vi.advanceTimersByTime(30);
      });
      expect(portal()).not.toBeNull();
      pointer(window, eventType, { pointerType: "touch", pointerId: 12 });
      expect(isActive(button)).toBe(false);
      expect(portal()).toBeNull();
      expect(activate).not.toHaveBeenCalled();
    },
  );

  it("keeps touch pending visual-only until the 30ms intent filter elapses", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const [button] = mount(<Source id={UUID_A} onActivate={activate} />).buttons;
    setRect(button, 20, 220, 120, 60);
    const touch = { pointerType: "touch", pointerId: 17, clientX: 40, clientY: 240 };
    pointer(button, "pointerdown", touch);
    expect(isActive(button)).toBe(true);
    expect(portal()).toBeNull();
    expect(logged("opened")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(29);
    });
    expect(portal()).toBeNull();
    pointer(button, "pointerup", touch);
    expect(activate).toHaveBeenCalledOnce();
    expect(logged("closed")).toHaveLength(0);
  });

  it("logs exactly one lifecycle once touch intent elapses and does not reopen as focus after release", () => {
    vi.useFakeTimers();
    const [button] = mount(<Source id={UUID_A} />).buttons;
    setRect(button, 20, 220, 120, 60);
    const touch = { pointerType: "touch", pointerId: 31, clientX: 40, clientY: 240 };
    pointer(button, "pointerdown", touch);
    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(logged("opened")).toHaveLength(1);
    expect(document.querySelector("[data-cumulus-reveal-card=primary]")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(270);
      button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, ...touch }));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(isActive(button)).toBe(false);
    expect(document.querySelector("[data-cumulus-reveal-card=primary]")).toBeNull();
    expect(logged("opened")).toHaveLength(1);
    expect(logged("closed")).toHaveLength(1);
  });
});
