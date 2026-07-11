// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { TangoRoot } from "../../TangoRoot";
import { useRevealSource } from "./context";
import { makeTextRevealSpec } from "./test-utils";

const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";

function Source({ id, label = "Source", onActivate }: { id: string; label?: string; onActivate?: () => void }) {
  const binding = useRevealSource({
    identity: { entityType: "test", entityId: id },
    spec: makeTextRevealSpec(label, "Primary body", ["Secondary body"]),
    onActivate,
  });
  return <button ref={binding.ref} {...binding.sourceProps}>{label}</button>;
}

function mount(node: React.ReactNode): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); act(() => root.render(node)); return { root, container };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {}); resetLog();
});
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

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
});
