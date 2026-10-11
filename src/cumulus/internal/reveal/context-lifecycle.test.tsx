// @vitest-environment jsdom

// The reveal coordinator's interaction lifecycle and its diagnostics.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLog } from "../../../logging";
import {
  Source,
  UUID_A,
  UUID_B,
  fire,
  focus,
  isActive,
  logged,
  mount,
  pointer,
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

describe("Cumulus reveal lifecycle and diagnostics", () => {
  it("does not restore a pointer-focused desktop source after hover leaves", () => {
    const [button] = mount(<Source id={UUID_A} />).buttons;
    setRect(button, 20, 220, 120, 60);
    const mouse = { pointerType: "mouse", pointerId: 32 };
    act(() => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ...mouse }));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, ...mouse }));
      button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, ...mouse }));
    });
    expect(isActive(button)).toBe(true);
    pointer(button, "pointerout", mouse);
    expect(isActive(button)).toBe(false);
  });

  it("uses the untransformed source rect captured at interaction start", () => {
    const [button] = mount(<Source id={UUID_A} />).buttons;
    let reads = 0;
    button.getBoundingClientRect = () => {
      reads += 1;
      return reads === 1
        ? DOMRect.fromRect({ x: 40, y: 300, width: 341, height: 200 })
        : DOMRect.fromRect({ x: 44, y: 304, width: 337, height: 196 });
    };
    pointer(button, "pointerover");
    expect(logged("opened")[0]?.sourceRect).toEqual({ x: 40, y: 300, width: 341, height: 200 });
    expect(reads).toBe(1);
  });

  it("pairs focus-hover-focus lifecycles and never closes a pre-measurement dismissal", () => {
    const [button] = mount(<Source id={UUID_A} />).buttons;
    setRect(button, 20, 220, 120, 60);
    focus(button);
    pointer(button, "pointerover", { pointerId: 1 });
    pointer(button, "pointerout", { pointerId: 1 });
    focus(button, "focusout");
    expect(logged("opened")).toHaveLength(3);
    expect(logged("closed")).toHaveLength(3);

    resetLog();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => DOMRect.fromRect({ x: 20, y: 220, width: 0, height: 0 }),
    );
    focus(button);
    fire(window, new Event("resize"));
    expect(logged("opened")).toHaveLength(0);
    expect(logged("closed")).toHaveLength(0);
  });

  it("recaptures the focused source when another source yields hover precedence", () => {
    const [a, b] = mount(
      <>
        <Source id={UUID_A} label="A" />
        <Source id={UUID_B} label="B" />
      </>,
    ).buttons;
    let aRect = DOMRect.fromRect({ x: 20, y: 300, width: 120, height: 60 });
    a.getBoundingClientRect = () => aRect;
    setRect(b, 500, 140, 80, 40);

    focus(a);
    pointer(b, "pointerover", { pointerId: 7 });
    aRect = DOMRect.fromRect({ x: 40, y: 320, width: 140, height: 70 });
    pointer(b, "pointerout", { pointerId: 7 });

    const opens = logged("opened");
    const closes = logged("closed");
    expect(opens.map((entry) => entry.sourceEntityId)).toEqual([UUID_A, UUID_B, UUID_A]);
    expect(opens[2]).toMatchObject({
      modality: "keyboard",
      reason: "focus",
      sourceRect: { x: 40, y: 320, width: 140, height: 70 },
    });
    expect(new Set(opens.map((entry) => entry.interactionId)).size).toBe(3);
    expect(closes.map((entry) => entry.interactionId)).toEqual(
      opens.slice(0, 2).map((entry) => entry.interactionId),
    );

    focus(a, "focusout");
    const closed = logged("closed");
    expect(closed[closed.length - 1]?.interactionId).toBe(opens[2].interactionId);
  });

  it("dismisses on visualViewport resize and removes the listener on unmount", () => {
    const listeners = new Set<EventListener>();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        width: 1200,
        height: 800,
        offsetLeft: 0,
        offsetTop: 0,
        addEventListener: (_name: string, listener: EventListener) =>
          listeners.add(listener),
        removeEventListener: (_name: string, listener: EventListener) =>
          listeners.delete(listener),
      },
    });
    const { buttons, unmount } = mount(<Source id={UUID_A} />);
    const [button] = buttons;
    setRect(button, 20, 220, 120, 60);
    focus(button);
    expect(listeners.size).toBe(1);
    act(() => {
      for (const listener of listeners) listener(new Event("resize"));
    });
    expect(isActive(button)).toBe(false);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
