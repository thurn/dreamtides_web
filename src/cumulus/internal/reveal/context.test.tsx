// @vitest-environment jsdom

// The reveal coordinator root: registration, descriptions, active-source
// replacement, central dismissal, feedback, and pen modality. Touch,
// lifecycle, and GameCard close contracts have their own context-*.test.tsx.
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { CumulusRoot } from "../../CumulusRoot";
import type { RevealSpec } from "./model";
import { testCardId } from "../../../types/test-identities";
import {
  Source,
  UUID_A,
  UUID_B,
  focus,
  gameCardSpec,
  isActive,
  logged,
  mount,
  pointer,
  setRect,
} from "./context.fixtures";

function mountWithoutCumulus(element: ReactElement): void {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(element));
  } finally {
    act(() => root.unmount());
  }
}

function description(button: HTMLElement): string {
  return document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
}

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

describe("Cumulus reveal coordinator root", () => {
  it("fails fast for a source without CumulusRoot and for nested roots", () => {
    expect(() => mountWithoutCumulus(<Source id={UUID_A} />)).toThrow(/CumulusRoot/);
    expect(() =>
      mountWithoutCumulus(
        <CumulusRoot>
          <CumulusRoot>
            <div />
          </CumulusRoot>
        </CumulusRoot>,
      ),
    ).toThrow(/CumulusRoot.*nested/i);
  });

  it("renders a complete, non-live accessible description on the source", () => {
    const [button] = mount(<Source id={UUID_A} />).buttons;
    const text = description(button);
    for (const part of ["Source", "Primary body", "Secondary body"])
      expect(text).toContain(part);
    expect(
      document
        .getElementById(button.getAttribute("aria-describedby")!)
        ?.getAttribute("aria-live"),
    ).toBeNull();
  });

  it("treats the catalog wildcard subtype as absent reveal copy", () => {
    const [button] = mount(<Source id={UUID_A} spec={gameCardSpec("*")} />).buttons;
    expect(description(button).trim()).not.toBe("");
    expect(description(button)).not.toContain("*");
  });

  it("rejects an incomplete GameCard registration instead of describing only its UUID", () => {
    const incomplete = {
      primary: { kind: "gameCard", cardId: testCardId(UUID_A) },
      secondaries: [],
    } as unknown as RevealSpec;
    const [button] = mount(<Source id={UUID_A} spec={incomplete} />).buttons;
    expect(button.getAttribute("aria-describedby")).toBeNull();
    focus(button);
    expect(isActive(button)).toBe(false);
    expect(
      getLogEntries().some(
        (entry) => entry.event === "cumulus_entity_reveal_invalid_source",
      ),
    ).toBe(true);
  });

  it("keeps duplicate UUID mounts registered independently when one unmounts", () => {
    const { buttons, rerender, container } = mount(
      <>
        <Source key="first" id={UUID_A} label="First" />
        <Source key="second" id={UUID_A} label="Second" />
      </>,
    );
    const [first, second] = buttons;
    expect(first.getAttribute("aria-describedby")).not.toBe(
      second.getAttribute("aria-describedby"),
    );
    expect(description(first)).toContain("First");
    expect(description(second)).toContain("Second");
    rerender(<Source key="second" id={UUID_A} label="Second" />);
    expect(description(container.querySelector("button")!)).toContain("Second");
  });

  it("replaces the active source and dismisses it on unmount", () => {
    const { buttons, rerender } = mount(
      <>
        <Source id={UUID_A} label="A" />
        <Source id={UUID_B} label="B" />
      </>,
    );
    const [a, b] = buttons;
    pointer(a, "pointerover");
    expect(isActive(a)).toBe(true);
    pointer(b, "pointerover");
    expect(isActive(a)).toBe(false);
    expect(isActive(b)).toBe(true);
    rerender(<Source id={UUID_A} label="A" />);
    expect(logged("closed").some((entry) => entry.dismissalReason === "source-unmount")).toBe(true);
  });

  it("dismisses centrally on every route change and on nested non-bubbling scroll", () => {
    const { container } = mount(
      <div data-scroll-container="">
        <Source id={UUID_A} />
      </div>,
    );
    const button = container.querySelector("button")!;
    const scroller = container.querySelector("[data-scroll-container]")!;
    const triggers: Array<() => void> = [
      () => scroller.dispatchEvent(new Event("scroll", { bubbles: false })),
      () => window.dispatchEvent(new PopStateEvent("popstate")),
      () => window.history.pushState({}, "", "#push"),
      () => window.history.replaceState({}, "", "#replace"),
      () => window.dispatchEvent(new HashChangeEvent("hashchange")),
    ];
    for (const trigger of triggers) {
      focus(button, "focusout");
      focus(button);
      expect(isActive(button)).toBe(true);
      act(trigger);
      expect(isActive(button)).toBe(false);
    }
  });

  it("gives measured feedback to scaling sources and none to stationary readable sources", () => {
    const { buttons } = mount(
      <>
        <Source id={UUID_A} />
        <Source id={UUID_B} feedback="stationary" />
      </>,
    );
    const [scaled, stationary] = buttons;
    setRect(scaled, 10, 200, 100, 50);
    pointer(scaled, "pointerover");
    expect(scaled.getAttribute("data-reveal-feedback")).toBe("measured");
    expect(stationary.getAttribute("data-reveal-feedback")).toBe("stationary");
    expect(
      document.body.querySelectorAll(":scope > [data-cumulus-reveal-portal]"),
    ).toHaveLength(1);
  });

  it("reveals for a hovering pen with pen modality but not for a contact pen", () => {
    const [button] = mount(<Source id={UUID_A} />).buttons;
    setRect(button, 20, 220, 120, 60);
    pointer(button, "pointerover", { pointerType: "pen", buttons: 1, pressure: 0.5 });
    expect(isActive(button)).toBe(false);
    pointer(button, "pointerover", { pointerType: "pen", pointerId: 4, buttons: 0, pressure: 0 });
    expect(logged("opened")[0]?.modality).toBe("pen");
  });
});
