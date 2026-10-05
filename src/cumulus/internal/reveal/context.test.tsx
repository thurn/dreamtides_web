// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { CumulusRoot } from "../../CumulusRoot";
import { renderInCumulus, type CumulusRender } from "../../testing/render";
import { useRevealSource } from "./context";
import { makeTextRevealSpec } from "./test-utils";
import type { RevealSpec } from "./model";
import { parseCardName, type CardSubtype } from "../../../types/card-identity";
import { testCardId, testSemanticEntityId } from "../../../types/test-identities";
import type { SemanticEntityId } from "../../../types/identifiers";

const UUID_A = testSemanticEntityId("00000000-0000-4000-8000-000000000001");
const UUID_B = testSemanticEntityId("00000000-0000-4000-8000-000000000002");

interface SourceProps {
  id: SemanticEntityId;
  label?: string;
  onActivate?: () => void;
  spec?: RevealSpec;
  feedback?: "scale" | "stationary";
}

function Source({ id, label = "Source", onActivate, spec, feedback }: SourceProps) {
  const binding = useRevealSource({
    identity: { entityType: "test", entityId: id },
    spec: spec ?? makeTextRevealSpec(label, "Primary body", ["Secondary body"]),
    feedback,
    onActivate,
  });
  return <button ref={binding.ref} {...binding.sourceProps}>{label}</button>;
}

function gameCardSpec(subtype: CardSubtype = ""): RevealSpec {
  const cardId = testCardId(UUID_A);
  return {
    primary: {
      kind: "gameCard",
      cardId,
      displaySnapshot: {
        id: cardId,
        name: parseCardName("Fixture Card"),
        cardNumber: 7,
        cardType: "Event",
        subtype,
        isStarter: false,
        rarity: "Special",
        energyCost: 1,
        spark: null,
        isFast: false,
        renderedText: "Fixture text.",
        imageNumber: 7,
        artOwned: false,
      },
    },
    secondaries: [],
  };
}

interface Mounted extends CumulusRender {
  readonly buttons: HTMLButtonElement[];
}

function mount(element: ReactElement): Mounted {
  const rendered = renderInCumulus(element);
  return { ...rendered, buttons: [...rendered.container.querySelectorAll("button")] };
}

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

function setRect(element: HTMLElement, x: number, y: number, width: number, height: number): void {
  element.getBoundingClientRect = () => DOMRect.fromRect({ x, y, width, height });
}

function fire(target: EventTarget, event: Event): void {
  act(() => void target.dispatchEvent(event));
}

function pointer(target: EventTarget, type: string, init: PointerEventInit = {}): void {
  fire(target, new PointerEvent(type, { bubbles: true, pointerType: "mouse", ...init }));
}

function focus(target: HTMLElement, type: "focusin" | "focusout" = "focusin"): void {
  fire(target, new FocusEvent(type, { bubbles: true }));
}

function logged(kind: "opened" | "closed") {
  return getLogEntries().filter((entry) => entry.event === `cumulus_entity_reveal_${kind}`);
}

function description(button: HTMLElement): string {
  return document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
}

const portal = () => document.querySelector("[data-cumulus-reveal-portal]");
const isActive = (button: HTMLElement) => button.dataset.revealActive === "true";

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
