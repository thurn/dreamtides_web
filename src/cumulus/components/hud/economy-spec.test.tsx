// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ECONOMY_MARKS, type EconomyKind } from "./economy-spec";
import { ResourceChip } from "./ResourceChip";
import { GLYPHS } from "../../primitives/glyph";

// The five economy kinds, listed locally (per AGENTS.md fixtures derive from the
// live GLYPHS/token vocabulary — never re-type a glyph class string here). Each
// entry's expected glyph is read back from `GLYPHS[kind]`, so a glyph edit
// propagates into the test instead of drifting from it.
const KINDS: EconomyKind[] = ["essence", "energy", "spark", "points", "counter"];

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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ECONOMY_MARKS", () => {
  it("maps each kind to its GLYPHS.<kind> glyph", () => {
    for (const kind of KINDS) {
      expect(ECONOMY_MARKS[kind].glyph).toBe(GLYPHS[kind]);
    }
  });

  it("uses the same filled brain for memory counters and rules text", () => {
    expect(ECONOMY_MARKS.counter.glyph).toBe(GLYPHS.memory);
    expect(ECONOMY_MARKS.counter.glyph).toBe("bxf bx-brain");
    expect(ECONOMY_MARKS.counter.glyph).not.toContain("hourglass");
  });

  it("colors each kind with its role token", () => {
    expect(ECONOMY_MARKS.essence.color).toContain("--essence");
    expect(ECONOMY_MARKS.energy.color).toContain("--energy");
    expect(ECONOMY_MARKS.spark.color).toContain("--spark");
    expect(ECONOMY_MARKS.points.color).toContain("--text-primary");
    expect(ECONOMY_MARKS.counter.color).toContain("--accent-bright");
  });
});

describe("ResourceChip", () => {
  it("renders the shared glyph class and role color per kind, and shows the value", () => {
    for (const kind of KINDS) {
      const { container, root } = mountInto(
        <ResourceChip kind={kind} value={42} />,
      );

      const mark = container.querySelector("i");
      expect(mark?.className).toBe(String(ECONOMY_MARKS[kind].glyph));
      // The mark is painted in the kind's role color (a `var(--...)` reference).
      expect(mark?.getAttribute("style")).toContain(ECONOMY_MARKS[kind].color);
      expect(container.textContent).toContain("42");

      act(() => {
        root.unmount();
      });
    }
  });

  it("defaults to a 16px font and a tight (0px) gap — the md/tight rendering", () => {
    const { container, root } = mountInto(
      <ResourceChip kind="essence" value={200} />,
    );

    const span = container.querySelector("span");
    expect(span?.style.fontSize).toBe("16px");
    expect(span?.style.gap).toBe("0px");

    act(() => {
      root.unmount();
    });
  });

  it("maps enumerated sizes and spacing to their px meanings", () => {
    const small = mountInto(<ResourceChip value={1} size="sm" />);
    expect(small.container.querySelector("span")?.style.fontSize).toBe("13px");
    act(() => {
      small.root.unmount();
    });

    const large = mountInto(<ResourceChip value={1} size="lg" spacing="loose" />);
    const largeSpan = large.container.querySelector("span");
    expect(largeSpan?.style.fontSize).toBe("20px");
    expect(largeSpan?.style.gap).toBe("4px");
    act(() => {
      large.root.unmount();
    });
  });

  it("can inherit a glass surface's text tone without changing the default resource tone", () => {
    const inherited = mountInto(
      <div style={{ color: "var(--text-on-glass)" }}>
        <ResourceChip kind="points" value={4} tone="inherit" />
      </div>,
    );
    const inheritedChip = inherited.container.querySelector<HTMLElement>(
      "[data-resource-chip]",
    );
    expect(inheritedChip?.style.color).toBe("inherit");
    expect(inheritedChip?.querySelector("i")?.style.color).toBe("inherit");
    act(() => {
      inherited.root.unmount();
    });

    const defaultPoints = mountInto(<ResourceChip kind="points" value={4} />);
    const defaultChip = defaultPoints.container.querySelector<HTMLElement>(
      "[data-resource-chip]",
    );
    expect(defaultChip?.style.color).toBe("var(--text-primary)");
    expect(defaultChip?.querySelector("i")?.style.color).toContain("--text-primary");
    act(() => {
      defaultPoints.root.unmount();
    });
  });
});
