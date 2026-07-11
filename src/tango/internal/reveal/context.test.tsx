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

function Source({ id, label = "Source", onActivate, spec }: { id: string; label?: string; onActivate?: () => void; spec?: RevealSpec }) {
  const binding = useRevealSource({
    identity: { entityType: "test", entityId: id },
    spec: spec ?? makeTextRevealSpec(label, "Primary body", ["Secondary body"]),
    onActivate,
  });
  return <button ref={binding.ref} {...binding.sourceProps}>{label}</button>;
}

function mount(node: React.ReactNode): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); mountedRoots.add(root); act(() => root.render(node)); return { root, container };
}

const mountedRoots = new Set<Root>();

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {}); resetLog();
});
afterEach(() => {
  for (const root of mountedRoots) act(() => root.unmount());
  mountedRoots.clear(); document.body.innerHTML = ""; vi.restoreAllMocks();
});

describe("Tango reveal coordinator root", () => {
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
});
