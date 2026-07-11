// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { TangoRoot } from "../../TangoRoot";
import { useRevealSource } from "./context";
import { makeTextRevealSpec } from "./test-utils";
import type { RevealSpec } from "./model";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import { asCardId, asCardName } from "../../../types/card-identity";

const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";

function Source({ id, label = "Source", onActivate, spec, feedback }: { id: string; label?: string; onActivate?: () => void; spec?: RevealSpec; feedback?: "scale" | "stationary" }) {
  const binding = useRevealSource({
    identity: { entityType: "test", entityId: id },
    spec: spec ?? makeTextRevealSpec(label, "Primary body", ["Secondary body"]),
    feedback,
    onActivate,
  });
  return <button ref={binding.ref} {...binding.sourceProps}>{label}</button>;
}

function mount(node: React.ReactNode): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); mountedRoots.add(root); act(() => root.render(node)); return { root, container };
}

const mountedRoots = new Set<Root>();
let resizeCallbacks: ResizeObserverCallback[];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {}); resetLog();
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.revealMeasure !== undefined) return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) };
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  });
});
afterEach(() => {
  for (const root of mountedRoots) act(() => root.unmount());
  mountedRoots.clear(); document.body.innerHTML = ""; vi.restoreAllMocks();
  vi.useRealTimers();
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
});

describe("Tango reveal coordinator root", () => {
  it("fails fast when a semantic source is mounted without TangoRoot", () => {
    expect(() => mount(<Source id={UUID_A} />)).toThrow(/TangoRoot/);
  });

  it("provides one coordinator and renders a complete accessible description", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    const description = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(description?.textContent).toContain("Source");
    expect(description?.textContent).toContain("Primary body");
    expect(description?.textContent).toContain("Secondary body");
    expect(description?.getAttribute("aria-live")).toBeNull();
  });

  it("throws a clear error for nested roots", () => {
    expect(() => mount(<TangoRoot><TangoRoot><div /></TangoRoot></TangoRoot>)).toThrow(/TangoRoot.*nested/i);
  });

  it("replaces the active source and dismisses it on unmount", () => {
    const { root, container } = mount(<TangoRoot><Source id={UUID_A} label="A" /><Source id={UUID_B} label="B" /></TangoRoot>);
    const [a, b] = [...container.querySelectorAll("button")];
    act(() => { a.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    expect(a.dataset.revealActive).toBe("true");
    act(() => { b.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    expect(a.dataset.revealActive).toBe("false"); expect(b.dataset.revealActive).toBe("true");
    act(() => root.render(<TangoRoot><Source id={UUID_A} label="A" /></TangoRoot>));
    expect(getLogEntries().some((entry) => entry.event === "tango_entity_reveal_closed" && entry.dismissalReason === "source-unmount")).toBe(true);
  });

  it("dismisses centrally on route change", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(button.dataset.revealActive).toBe("true");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(button.dataset.revealActive).toBe("false");
  });

  it.each(["pushState", "replaceState"] as const)("dismisses centrally on history.%s", (method) => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { window.history[method]({}, "", `#${method}`); });
    expect(button.dataset.revealActive).toBe("false");
  });

  it("dismisses centrally on hashchange", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(button.dataset.revealActive).toBe("false");
  });

  it("captures nested non-bubbling scroll and native drag recognition", () => {
    const { container } = mount(<TangoRoot><div data-scroll-container=""><Source id={UUID_A} /></div></TangoRoot>);
    const button = container.querySelector("button")!;
    const scroller = container.querySelector<HTMLElement>("[data-scroll-container]")!;
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { scroller.dispatchEvent(new Event("scroll", { bubbles: false })); });
    expect(button.dataset.revealActive).toBe("false");
    act(() => { button.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { button.dispatchEvent(new Event("dragstart", { bubbles: true })); });
    expect(button.dataset.revealActive).toBe("false");
  });

  it("routes Escape centrally and allows reveal after the next focus visit", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(button.dataset.revealActive).toBe("false");
    act(() => { button.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(button.dataset.revealActive).toBe("true");
  });

  it("suppresses only a malformed source reveal and reports a diagnostic", () => {
    const { container } = mount(<TangoRoot><Source id="not-a-uuid" label="Bad" /><Source id={UUID_A} label="Good" /></TangoRoot>);
    const [bad, good] = [...container.querySelectorAll("button")];
    act(() => { bad.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(bad.dataset.revealActive).toBe("false");
    expect(getLogEntries().some((entry) => entry.event === "tango_entity_reveal_invalid_source")).toBe(true);
    act(() => { good.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(good.dataset.revealActive).toBe("true");
  });

  it("allows only the first active touch to activate", () => {
    const activateA = vi.fn(); const activateB = vi.fn();
    const { container } = mount(<TangoRoot><Source id={UUID_A} onActivate={activateA} /><Source id={UUID_B} onActivate={activateB} /></TangoRoot>);
    const [a, b] = [...container.querySelectorAll("button")];
    act(() => { a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1 })); });
    act(() => { b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 2 })); });
    act(() => { b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 2 })); });
    expect(activateB).not.toHaveBeenCalled();
  });

  it("does not reveal for a contact pen pointer-enter", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "pen", buttons: 1, pressure: 0.5 })); });
    expect(button.dataset.revealActive).toBe("false");
  });

  it("keeps duplicate UUID mounts registered independently when one unmounts", () => {
    const { root, container } = mount(<TangoRoot><Source key="first" id={UUID_A} label="First" /><Source key="second" id={UUID_A} label="Second" /></TangoRoot>);
    const [first, second] = [...container.querySelectorAll("button")];
    expect(first.getAttribute("aria-describedby")).not.toBe(second.getAttribute("aria-describedby"));
    expect(document.getElementById(first.getAttribute("aria-describedby")!)?.textContent).toContain("First");
    expect(document.getElementById(second.getAttribute("aria-describedby")!)?.textContent).toContain("Second");
    act(() => root.render(<TangoRoot><Source key="second" id={UUID_A} label="Second" /></TangoRoot>));
    const remaining = container.querySelector("button")!;
    expect(document.getElementById(remaining.getAttribute("aria-describedby")!)?.textContent).toContain("Second");
  });

  it("describes every strict InfoCard variant and preserves secondary order", () => {
    const variants: RevealSpec["secondaries"] = [
      { variant: "object", image: artRef.dreamsign("a.png"), title: "Object Title", body: { kind: "plain", text: "Object Body" } },
      { variant: "fullBleed", image: artRef.dreamscapeScene("scene"), meta: "Profile", title: "Full Title", subtitle: "Full Subtitle", body: { kind: "plain", text: "Full Body" } },
      { variant: "atlasReveal", image: artRef.dreamscapeScene("atlas"), title: "Atlas Title", subtitle: "Atlas Guide", body: { kind: "plain", text: "Atlas Body" } },
      { variant: "icon", glyph: GLYPHS.info, title: "Icon Title", body: { kind: "plain", text: "Icon Body" } },
      { variant: "tide", tide: "valor", title: "Tide Title", body: { kind: "plain", text: "Tide Body" } },
      { variant: "text", meta: "Keyword", title: "Text Title", subtitle: "Text Subtitle", body: { kind: "plain", text: "Text Body" } },
    ];
    const spec: RevealSpec = { primary: { kind: "infoCard", card: variants[0] }, secondaries: variants.slice(1) };
    const { container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    const text = document.getElementById(button.getAttribute("aria-describedby")!)?.textContent ?? "";
    for (const expected of ["Object Title", "Object Body", "Profile", "Full Subtitle", "Atlas Guide", "Icon Title", "Valor", "Tide Title", "Keyword", "Text Subtitle"]) expect(text).toContain(expected);
    expect(text.indexOf("Full Title")).toBeLessThan(text.indexOf("Atlas Title"));
    expect(text.indexOf("Atlas Title")).toBeLessThan(text.indexOf("Icon Title"));
  });

  it("describes a complete GameCard display snapshot", () => {
    const cardId = asCardId(UUID_A);
    const spec: RevealSpec = {
      primary: { kind: "gameCard", cardId, displaySnapshot: {
        id: cardId, name: asCardName("Moon Twin"), cardNumber: 42,
        cardType: "Character", subtype: "Guide", isStarter: false, rarity: "Legendary",
        energyCost: null, energyCosts: ["2", "X"], spark: null, sparkVariable: true,
        isFast: true, isInterrupt: true, reclaimCost: 3, renderedText: "Challenge: Awaken.",
        imageNumber: 42, artOwned: true,
      } },
      secondaries: [{ variant: "text", title: "First Definition", body: { kind: "rules", text: "First rules." } }, { variant: "text", title: "Second Definition", body: { kind: "rules", text: "Second rules." } }],
    };
    const { container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    const text = document.getElementById(button.getAttribute("aria-describedby")!)?.textContent ?? "";
    for (const expected of ["Moon Twin", "Legendary", "Character", "Guide", "Energy 2 and X", "Spark X", "Fast", "Interrupt", "Reclaim 3", "Challenge: Awaken."]) expect(text).toContain(expected);
    expect(text.indexOf("First Definition")).toBeLessThan(text.indexOf("Second Definition"));
  });

  it("rejects an incomplete GameCard registration instead of describing only its UUID", () => {
    const incomplete = {
      primary: { kind: "gameCard", cardId: asCardId(UUID_A) },
      secondaries: [],
    } as unknown as RevealSpec;
    const { container } = mount(<TangoRoot><Source id={UUID_A} spec={incomplete} /></TangoRoot>);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-describedby")).toBeNull();
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(button.dataset.revealActive).toBe("false");
    expect(getLogEntries().some((entry) => entry.event === "tango_entity_reveal_invalid_source")).toBe(true);
  });

  it("mounts the one shared visual overlay and supplies measured source feedback", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => ({ x: 10, y: 200, left: 10, top: 200, right: 110, bottom: 250, width: 100, height: 50, toJSON: () => ({}) });
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    expect(button.getAttribute("data-reveal-feedback")).toBe("measured");
    expect(button.style.getPropertyValue("--reveal-press-scale")).toBe("0.9");
    expect(document.body.querySelectorAll(":scope > [data-tango-reveal-portal]")).toHaveLength(1);
  });

  it("keeps stationary readable sources unscaled", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} feedback="stationary" /></TangoRoot>);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("data-reveal-feedback")).toBe("stationary");
    expect(button.style.getPropertyValue("--reveal-press-scale")).toBe("1");
    expect(button.style.getPropertyValue("--reveal-hover-scale")).toBe("1");
  });

  it("logs one placed open decision and one terminal close decision", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => ({ x: 10, y: 200, left: 10, top: 200, right: 110, bottom: 250, width: 100, height: 50, toJSON: () => ({}) });
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(1);
    act(() => { window.dispatchEvent(new Event("resize")); });
    const closes = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed");
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ dismissalReason: "resize" });
  });

  it("keeps touch pending visual-only until the 30ms intent filter elapses", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const { container } = mount(<TangoRoot><Source id={UUID_A} onActivate={activate} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });
    act(() => { button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 17, clientX: 40, clientY: 240 })); });
    expect(button.dataset.revealActive).toBe("true");
    expect(document.querySelector("[data-tango-reveal-portal]")).toBeNull();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(29); });
    expect(document.querySelector("[data-tango-reveal-portal]")).toBeNull();
    act(() => { button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 17 })); });
    expect(activate).toHaveBeenCalledOnce();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(0);
  });

  it("logs exactly one lifecycle when touch intent reaches 30ms", () => {
    vi.useFakeTimers();
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });
    act(() => { button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 18, clientX: 40, clientY: 240 })); });
    act(() => { vi.advanceTimersByTime(30); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(270); button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 18 })); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(1);
  });

  it("does not reopen a touch reveal as focus after release", () => {
    vi.useFakeTimers();
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });

    act(() => { button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 31, clientX: 40, clientY: 240 })); });
    act(() => { vi.advanceTimersByTime(30); });
    expect(document.querySelector("[data-tango-reveal-card=primary]")).not.toBeNull();

    act(() => {
      button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 31, clientX: 40, clientY: 240 }));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(button.dataset.revealActive).toBe("false");
    expect(document.querySelector("[data-tango-reveal-card=primary]")).toBeNull();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(1);
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(1);
  });

  it("does not restore a pointer-focused desktop source after hover leaves", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });

    act(() => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", pointerId: 32 }));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 32 }));
      button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", pointerId: 32 }));
    });
    expect(button.dataset.revealActive).toBe("true");

    act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", pointerId: 32 })); });

    expect(button.dataset.revealActive).toBe("false");
  });

  it("uses the untransformed source rect captured at interaction start", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    let reads = 0;
    button.getBoundingClientRect = () => {
      reads += 1;
      return reads === 1
        ? DOMRect.fromRect({ x: 40, y: 300, width: 341, height: 200 })
        : DOMRect.fromRect({ x: 44, y: 304, width: 337, height: 196 });
    };
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    const opened = getLogEntries().find((entry) => entry.event === "tango_entity_reveal_opened");
    expect(opened?.sourceRect).toEqual({ x: 40, y: 300, width: 341, height: 200 });
    expect(reads).toBe(1);
  });

  it("preserves pen hover modality in the opened diagnostic", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "pen", pointerId: 4, buttons: 0, pressure: 0 })); });
    expect(getLogEntries().find((entry) => entry.event === "tango_entity_reveal_opened")?.modality).toBe("pen");
  });

  it("pairs focus-hover-focus lifecycles and never closes a pre-measurement dismissal", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    act(() => { button.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(3);
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(3);

    resetLog();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => DOMRect.fromRect({ x: 20, y: 220, width: 0, height: 0 }));
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(0);
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(0);
  });

  it("recaptures the focused source when another source yields hover precedence", () => {
    const { container } = mount(<TangoRoot><Source id={UUID_A} label="A" /><Source id={UUID_B} label="B" /></TangoRoot>);
    const [a, b] = [...container.querySelectorAll("button")];
    let aRect = DOMRect.fromRect({ x: 20, y: 300, width: 120, height: 60 });
    a.getBoundingClientRect = () => aRect;
    b.getBoundingClientRect = () => DOMRect.fromRect({ x: 500, y: 140, width: 80, height: 40 });

    act(() => { a.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    act(() => { b.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 7 })); });
    aRect = DOMRect.fromRect({ x: 40, y: 320, width: 140, height: 70 });
    act(() => { b.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", pointerId: 7 })); });

    const opens = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened");
    const closes = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed");
    expect(opens).toHaveLength(3);
    expect(closes).toHaveLength(2);
    expect(opens.map((entry) => entry.sourceEntityId)).toEqual([UUID_A, UUID_B, UUID_A]);
    expect(opens[2]).toMatchObject({
      modality: "keyboard",
      reason: "focus",
      sourceRect: { x: 40, y: 320, width: 140, height: 70 },
    });
    expect(new Set(opens.map((entry) => entry.interactionId)).size).toBe(3);
    expect(closes.map((entry) => entry.interactionId)).toEqual(opens.slice(0, 2).map((entry) => entry.interactionId));

    act(() => { a.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    const finalCloses = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed");
    const finalClose = finalCloses[finalCloses.length - 1];
    expect(finalClose?.interactionId === opens[2].interactionId).toBe(true);
  });

  it("dismisses on visualViewport resize and removes the listener on unmount", () => {
    const listeners = new Set<EventListener>();
    const visualViewport = {
      width: 1200, height: 800, offsetLeft: 0, offsetTop: 0,
      addEventListener: (_name: string, listener: EventListener) => listeners.add(listener),
      removeEventListener: (_name: string, listener: EventListener) => listeners.delete(listener),
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    const { container, root } = mount(<TangoRoot><Source id={UUID_A} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => DOMRect.fromRect({ x: 20, y: 220, width: 120, height: 60 });
    act(() => { button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(listeners.size).toBe(1);
    act(() => { for (const listener of listeners) listener(new Event("resize")); });
    expect(button.dataset.revealActive).toBe("false");
    act(() => root.unmount()); mountedRoots.delete(root);
    expect(listeners.size).toBe(0);
  });

  it("keeps a desktop GameCard return copy until the 160ms terminal transition", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
    const cardId = asCardId(UUID_A);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Return Card"), cardNumber: 7, cardType: "Event", subtype: "",
      isStarter: false, rarity: "Special", energyCost: 1, spark: null, isFast: false,
      renderedText: "Return home.", imageNumber: 7, artOwned: false,
    } }, secondaries: [] };
    const { container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => ({ x: 400, y: 250, left: 400, top: 250, right: 500, bottom: 300, width: 100, height: 50, toJSON: () => ({}) });
    await import("../../components/card/CardView");
    await act(async () => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); await Promise.resolve(); });
    act(() => { for (const callback of resizeCallbacks) callback([], {} as ResizeObserver); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(1);
    act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })); });
    expect(document.querySelector("[data-tango-reveal-portal]")).not.toBeNull();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(160); });
    expect(document.querySelector("[data-tango-reveal-portal]")).toBeNull();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(1);
    vi.useRealTimers();
  });

  it.each(["resize", "orientationchange"])("cancels an in-progress GameCard return immediately on %s", async (eventName) => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
    const cardId = asCardId(UUID_A);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Cancel Return"), cardNumber: 8, cardType: "Event", subtype: "", isStarter: false,
      rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Cancel.", imageNumber: 8, artOwned: false,
    } }, secondaries: [] };
    const { container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => ({ x: 400, y: 250, left: 400, top: 250, right: 500, bottom: 300, width: 100, height: 50, toJSON: () => ({}) });
    await import("../../components/card/CardView");
    await act(async () => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); await Promise.resolve(); });
    act(() => { for (const callback of resizeCallbacks) callback([], {} as ResizeObserver); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(1);
    act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })); });
    expect(document.querySelector("[data-tango-reveal-portal]")).not.toBeNull();
    act(() => { window.dispatchEvent(new Event(eventName)); });
    expect(document.querySelector("[data-tango-reveal-portal]")).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    const closes = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed");
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ dismissalReason: eventName === "resize" ? "resize" : "orientation-change" });
  });

  it("closes a returning interaction exactly once before rapid pointer re-entry opens a fresh one", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
    const cardId = asCardId(UUID_A);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Re-enter"), cardNumber: 9, cardType: "Event", subtype: "", isStarter: false,
      rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Again.", imageNumber: 9, artOwned: false,
    } }, secondaries: [] };
    const { container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => ({ x: 400, y: 250, left: 400, top: 250, right: 500, bottom: 300, width: 100, height: 50, toJSON: () => ({}) });
    await import("../../components/card/CardView");
    const enter = async () => { await act(async () => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); await Promise.resolve(); }); act(() => { for (const callback of resizeCallbacks) callback([], {} as ResizeObserver); }); };
    const leave = () => act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })); });
    await enter(); leave(); await enter();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_opened")).toHaveLength(2);
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelector("[data-tango-reveal-portal]")).not.toBeNull();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(1);
    leave(); act(() => { vi.advanceTimersByTime(160); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(2);
  });

  it("cancels a GameCard return immediately when its source unmounts", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
    const cardId = asCardId(UUID_A);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Unmount Return"), cardNumber: 10, cardType: "Event", subtype: "", isStarter: false,
      rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Vanish.", imageNumber: 10, artOwned: false,
    } }, secondaries: [] };
    const { root, container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () => ({ x: 400, y: 250, left: 400, top: 250, right: 500, bottom: 300, width: 100, height: 50, toJSON: () => ({}) });
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })); });
    expect(document.querySelector("[data-tango-reveal-portal]")).not.toBeNull();
    act(() => root.render(<TangoRoot><div /></TangoRoot>));
    expect(document.querySelector("[data-tango-reveal-portal]")).toBeNull();
    const closes = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed");
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ dismissalReason: "source-unmount" });
    act(() => { vi.advanceTimersByTime(160); });
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(1);
  });

  it("cleans a pending return on provider unmount without stale timer logging", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
    const cardId = asCardId(UUID_A);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Root Return"), cardNumber: 11, cardType: "Event", subtype: "", isStarter: false,
      rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "End.", imageNumber: 11, artOwned: false,
    } }, secondaries: [] };
    const { root, container } = mount(<TangoRoot><Source id={UUID_A} spec={spec} /></TangoRoot>);
    const button = container.querySelector("button")!;
    act(() => { button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); });
    act(() => { button.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })); });
    act(() => root.unmount());
    mountedRoots.delete(root);
    const closeCount = getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed").length;
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelector("[data-tango-reveal-portal]")).toBeNull();
    expect(getLogEntries().filter((entry) => entry.event === "tango_entity_reveal_closed")).toHaveLength(closeCount);
  });
});
