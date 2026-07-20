// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pressable, PRESS_SCALE, type PressableProps } from "./Pressable";

// The named press-feedback vocabulary is asserted at compile time: arbitrary
// per-call motion remains inexpressible while the rules-copy exception is a
// strict variant.
function _pressFeedbackTypeGuards(): PressableProps[] {
  // @ts-expect-error there is no `compress` boolean escape hatch.
  const legacyBoolean: PressableProps = { compress: false };
  // @ts-expect-error arbitrary feedback modes are not part of the strict API.
  const optOut: PressableProps = { pressFeedback: "enlarge" };
  return [legacyBoolean, optOut];
}

// jsdom exposes no real hover, so Pressable behaves as it does under a touch
// finger: there is no hover state to fall back on, so the press transform IS
// the only feedback a touch user gets. That makes these the touch-case tests.

function mountInto(node: React.ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

/** Press the element with the PRIMARY button (usePress ignores button !== 0). */
function pressDown(el: Element): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // usePrefersReducedMotion reads window.matchMedia; jsdom lacks it.
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Pressable press feedback", () => {
  it("scales DOWN on press — the default and only behaviour, on touch too", () => {
    // Under a finger there is no hover to fall back on, so the press transform
    // IS the only feedback: it must scale down, never sit at "none".
    const { container } = mountInto(<Pressable as="button">x</Pressable>);
    const el = container.querySelector("button");
    if (!el) throw new Error("no button");
    pressDown(el);
    expect(el.style.transform).toBe(`scale(${String(PRESS_SCALE)})`);
    expect(el.style.transform).not.toBe("none");
  });

  it("scales an info-only reveal surface DOWN on press, exactly like a button", () => {
    // A tide disc / essence value wraps a plain Pressable with no opt-out, so it
    // gets the same press-down feedback as any control.
    const { container } = mountInto(<Pressable as="span">x</Pressable>);
    const el = container.querySelector("span");
    if (!el) throw new Error("no span");
    pressDown(el);
    expect(el.style.transform).toBe(`scale(${String(PRESS_SCALE)})`);
  });

  it("keeps readable rules-copy reveal surfaces stationary while pressed", () => {
    const { container } = mountInto(
      <Pressable as="span" pressFeedback="stationary">
        Read this ability
      </Pressable>,
    );
    const el = container.querySelector("span");
    if (!el) throw new Error("no span");
    pressDown(el);
    expect(el.style.transform).toBe("none");
  });

  it("keeps readable rules-copy reveal surfaces stationary on pointer hover", () => {
    const { container } = mountInto(<Pressable as="span" pressFeedback="stationary">Read</Pressable>);
    const el = container.querySelector("span")!;
    act(() => { el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); });
    expect(el.style.transform).toBe("none");
  });

  it("disabled suppresses the press animation entirely", () => {
    const { container } = mountInto(
      <Pressable as="span" disabled>
        x
      </Pressable>,
    );
    const el = container.querySelector("span");
    if (!el) throw new Error("no span");
    pressDown(el);
    expect(el.style.transform).toBe("none");
  });

  it("keeps the compile-time guards referenced", () => {
    // Anchors _pressFeedbackTypeGuards so it is not dead code; its value is the
    // type-level assertions above, verified by `tsc`, not this runtime check.
    expect(typeof _pressFeedbackTypeGuards).toBe("function");
  });

  it("consumes the interaction-stable measured scale supplied by a reveal source", () => {
    const { container } = mountInto(
      <Pressable
        as="button"
        data-reveal-feedback="measured"
        style={{ "--reveal-press-scale": "0.94", "--reveal-hover-scale": "1.018" } as React.CSSProperties}
      >x</Pressable>,
    );
    const el = container.querySelector("button")!;
    pressDown(el);
    expect(el.style.transform).toBe("scale(var(--reveal-press-scale))");
  });

  it("measures a wide surface so press feedback stays proportional to its rendered size", () => {
    const { container } = mountInto(<Pressable as="button">Wide option</Pressable>);
    const el = container.querySelector("button")!;
    el.getBoundingClientRect = () => DOMRect.fromRect({ width: 600, height: 80 });
    pressDown(el);
    expect(el.style.transform).toBe("scale(0.98)");
  });

  it("snaps out of hover when a physical card requests an instant feedback exit", () => {
    const { container } = mountInto(
      <Pressable as="button" snapFeedbackExit>
        Card
      </Pressable>,
    );
    const el = container.querySelector("button")!;

    act(() => {
      el.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
    });
    expect(el.style.transform).toContain("scale(");
    expect(el.style.transition).toContain("transform");

    act(() => {
      el.dispatchEvent(
        new PointerEvent("pointerout", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
    });
    expect(el.style.transform).toBe("none");
    expect(el.style.transition).toBe("none");
  });

  it("snaps a released physical card to its original size instead of resuming hover scale", () => {
    const { container } = mountInto(
      <Pressable as="button" snapFeedbackExit>
        Card
      </Pressable>,
    );
    const el = container.querySelector("button")!;

    act(() => {
      el.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
    });
    expect(el.style.transform).toContain("scale(");

    pressDown(el);
    expect(el.style.transform).toContain("scale(");

    act(() => {
      el.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
    });
    expect(el.style.transform).toBe("none");
    expect(el.style.transition).toBe("none");
  });

  it("keeps press feedback while suppressing battlefield hover scaling", () => {
    const { container } = mountInto(
      <Pressable as="button" hoverFeedback="stationary">
        Battlefield card
      </Pressable>,
    );
    const el = container.querySelector("button")!;

    act(() => {
      el.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
    });
    expect(el.style.transform).toBe("none");

    pressDown(el);
    expect(el.style.transform).toContain("scale(");
  });
});
