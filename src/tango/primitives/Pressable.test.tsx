// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Pressable,
  PRESS_SCALE,
  HOVER_SCALE,
  type PressableProps,
} from "./Pressable";

// The API gap this fixes, asserted at COMPILE time (`tsc --noEmit` checks this
// file): a reveal trigger with no press animation must be inexpressible. If the
// API ever regresses to allow it, the `@ts-expect-error` below goes unused and
// the typecheck fails. Never executed — the types are the whole test.
function _pressFeedbackTypeGuards(): PressableProps[] {
  // @ts-expect-error the `compress={false}` boolean escape hatch is gone.
  const legacyBoolean: PressableProps = { compress: false };
  // @ts-expect-error there is no un-animated feedback value; every press animates.
  const unanimated: PressableProps = { pressFeedback: "none" };
  return [legacyBoolean, unanimated];
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
    })) as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Pressable press feedback", () => {
  it("compresses (scales DOWN) while pressed with the default feedback", () => {
    const { container } = mountInto(<Pressable as="button">x</Pressable>);
    const el = container.querySelector("button");
    if (!el) throw new Error("no button");
    pressDown(el);
    expect(el.style.transform).toBe(`scale(${String(PRESS_SCALE)})`);
  });

  it("enlarge feedback still ANIMATES a touch press — it scales UP, never 'none'", () => {
    // The whole point of the guarantee: an info-only reveal trigger has no
    // hover to fall back on under a finger, so its press MUST animate. "enlarge"
    // grows it instead of leaving it inert.
    const { container } = mountInto(
      <Pressable as="span" pressFeedback="enlarge">
        x
      </Pressable>,
    );
    const el = container.querySelector("span");
    if (!el) throw new Error("no span");
    pressDown(el);
    expect(el.style.transform).toBe(`scale(${String(HOVER_SCALE)})`);
    expect(el.style.transform).not.toBe("none");
  });

  it("disabled suppresses the press animation entirely", () => {
    const { container } = mountInto(
      <Pressable as="span" pressFeedback="enlarge" disabled>
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
});
