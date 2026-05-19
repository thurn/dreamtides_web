// @vitest-environment jsdom

// Render tests for `JourneyHoverCard`.
//
// Bug classes guarded against:
//
//   1. Prose-only effects should NOT render an empty glossary stack container,
//      i.e. journey options whose text has no glossary terms must produce
//      zero definition panels (no decorative empty box, no extra spacing).
//   2. Effects that mention a glossary term must render the matching
//      `GlossaryDefinitionCard` beneath the prose, with the canonical term
//      heading visible.
//   3. Multiple terms in effect text must render in first-occurrence order
//      and deduplicate (one panel per distinct entry), so the player gets
//      stable, predictable definitions when scanning a rich effect.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactNode } from "react";

import { JourneyHoverCard } from "./JourneyHoverCard";

// Mock framer-motion so the rendered DOM matches the JSX one-to-one and we
// can query without animation wrappers swallowing children.
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

interface MountResult {
  readonly container: HTMLDivElement;
  readonly root: Root;
}

function mount(node: ReactNode): MountResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

function queryGlossaryStack(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    '[data-testid="journey-hover-glossary-stack"]',
  );
}

function queryTermHeadings(container: HTMLElement): string[] {
  const stack = queryGlossaryStack(container);
  if (stack === null) return [];
  // The stack contains one `GlossaryDefinitionCard` per term. The first `<p>`
  // inside each card renders the canonical term name (styled uppercase via
  // CSS, but the underlying textContent matches `entry.term`).
  return Array.from(stack.children)
    .map((panel) => panel.querySelector("p")?.textContent ?? "")
    .filter((text) => text.length > 0);
}

describe("JourneyHoverCard", () => {
  let cleanups: MountResult[] = [];

  beforeEach(() => {
    cleanups = [];
  });

  afterEach(() => {
    for (const { root, container } of cleanups) {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
    cleanups = [];
  });

  function trackedMount(node: ReactNode): MountResult {
    const result = mount(node);
    cleanups.push(result);
    return result;
  }

  it("renders the dream name and effect text", () => {
    const { container } = trackedMount(
      <JourneyHoverCard
        dreamName="Hollow Pact"
        text="Gain 2 essence."
      />,
    );
    expect(container.textContent).toContain("Hollow Pact");
    expect(container.textContent).toContain("Gain 2 essence.");
  });

  it("does not render a glossary stack when effect text has no terms", () => {
    const { container } = trackedMount(
      <JourneyHoverCard
        dreamName="Quiet Grove"
        text="Gain 2 essence and one point."
      />,
    );
    expect(queryGlossaryStack(container)).toBeNull();
  });

  it("renders a single glossary definition panel when the effect text mentions one term", () => {
    const { container } = trackedMount(
      <JourneyHoverCard
        dreamName="Burning Pact"
        text="Gain 1 essence. Add a Bane to your deck."
      />,
    );
    const stack = queryGlossaryStack(container);
    expect(stack).not.toBeNull();
    expect(queryTermHeadings(container)).toEqual(["Bane"]);
  });

  it("renders one panel per glossary term in first-occurrence order with dedup", () => {
    const { container } = trackedMount(
      <JourneyHoverCard
        dreamName="Twilight Trial"
        text="Purge up to 2 chosen Banes from your deck, then Transfigure a card and Foresee 1. Bane stays in your deck."
      />,
    );
    expect(queryTermHeadings(container)).toEqual([
      "Purge",
      "Bane",
      "Transfigure",
      "Foresee",
    ]);
  });
});
