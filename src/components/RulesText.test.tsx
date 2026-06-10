// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENERGY_PIP_COLOR } from "./PipBadge";
import { RulesText } from "./RulesText";

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
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

describe("RulesText", () => {
  it("renders recognized glossary terms as plain text without an underline", () => {
    const { container, root } = mount(
      <RulesText text="Reclaim this card." />,
    );

    // The "Reclaim" word renders as plain prose; its definition surfaces in the
    // card's hover-help panel rather than as a per-word underline/tooltip.
    const allSpans = container.querySelectorAll("span");
    const reclaimSpan = Array.from(allSpans).find(
      (s) => s.textContent === "Reclaim",
    );
    expect(reclaimSpan).toBeDefined();
    expect(reclaimSpan?.getAttribute("style") ?? "").not.toContain(
      "text-decoration",
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders the energy glyph as the boxicons fire-alt icon", () => {
    const { container, root } = mount(<RulesText text="Pay ●3." />);

    const flame = container.querySelector("i.bxf.bx-fire-alt");
    expect(flame).not.toBeNull();
    expect(container.textContent).not.toContain("●");

    act(() => {
      root.unmount();
    });
  });

  // Backlog task 001: the inline energy flame inside rules text must be
  // rendered in the exact same teal as the corner energy-cost PipBadge
  // (`ENERGY_PIP_COLOR`). They represent the same resource at two anchors
  // on the card and must read as unified at normal viewing distance. Both
  // sides pull from the same exported constant so they cannot drift again.
  it("colors the inline energy flame with ENERGY_PIP_COLOR (matches the energy-cost pip)", () => {
    const { container, root } = mount(<RulesText text="Pay ●2 to draw a card." />);

    const flame = container.querySelector<HTMLElement>("i.bxf.bx-fire-alt");
    expect(flame).not.toBeNull();
    const style = flame?.getAttribute("style") ?? "";
    // jsdom serializes hex colors as `rgb(r, g, b)`. ENERGY_PIP_COLOR is
    // `#0ea5e9` => `rgb(14, 165, 233)`.
    expect(style.toLowerCase()).toContain("rgb(14, 165, 233)");
    // Sanity-check ENERGY_PIP_COLOR itself: if the shared token ever
    // changes hex value, this assertion makes the change explicit.
    expect(ENERGY_PIP_COLOR.toLowerCase()).toBe("#0ea5e9");
    // Guard against regression to the previous gold/amber fill `#fbbf24`
    // = `rgb(251, 191, 36)`.
    expect(style.toLowerCase()).not.toContain("rgb(251, 191, 36)");

    act(() => {
      root.unmount();
    });
  });

  // The activated-ability marker `❖` renders as the filled lightning bolt
  // (the same `bxf bx-bolt` mark the title bar shows before the card name), not
  // the literal diamond character.
  it("renders the activated-ability marker ❖ as the boxicons bolt icon", () => {
    const { container, root } = mount(
      <RulesText text="❖ – 1●: Move this character." />,
    );

    const bolts = container.querySelectorAll("i.bxf.bx-bolt");
    expect(bolts).toHaveLength(1);
    expect(container.textContent).not.toContain("❖");

    act(() => {
      root.unmount();
    });
  });

  // The interrupt marker `❖❖` renders as two bolts so it reads the same as the
  // double-bolt interrupt chip in the title bar.
  it("renders the interrupt marker ❖❖ as two bolt icons", () => {
    const { container, root } = mount(
      <RulesText text="❖❖ – Abandon an ally: Effect." />,
    );

    const bolts = container.querySelectorAll("i.bxf.bx-bolt");
    expect(bolts).toHaveLength(2);
    expect(container.textContent).not.toContain("❖");

    act(() => {
      root.unmount();
    });
  });

  it("does not wrap unknown words", () => {
    const { container, root } = mount(<RulesText text="Deal 3 damage." />);

    const triggerSpans = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.getAttribute("style")?.includes("text-decoration") === true,
    );
    expect(triggerSpans).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("keeps the trigger keyword on one line and renders it as plain text", () => {
    const { container, root } = mount(
      <RulesText text="▸ Judgment: Draw a card." />,
    );

    // The Judgment keyword renders as plain prose (no per-word underline).
    const judgmentSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "Judgment",
    );
    expect(judgmentSpan).toBeDefined();
    expect(judgmentSpan?.getAttribute("style") ?? "").not.toContain(
      "text-decoration",
    );

    // The caret + keyword still sit inside a nowrap group so they never wrap
    // apart across a line break.
    const nowrapGroup = Array.from(container.querySelectorAll("span")).some(
      (s) =>
        (s.getAttribute("style") ?? "").includes("nowrap") &&
        s.textContent?.includes("Judgment") === true,
    );
    expect(nowrapGroup).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  // Backlog task 018: the trigger arrow `▸` reads as a typographic guide,
  // not a UI alert. It renders as the filled caret icon in the muted slate
  // `#94a3b8` shared with secondary text elsewhere — explicitly NOT the bright
  // orange `#f97316` that the draft selection ring and HUD warnings claim.
  it("renders the trigger arrow ▸ as a caret icon in muted slate, not accent orange", () => {
    const { container, root } = mount(
      <RulesText text="▸ Judgment: Draw a card." />,
    );

    const caret = container.querySelector<HTMLElement>("i.bxf.bx-caret-right");
    expect(caret).not.toBeNull();
    expect(container.textContent).not.toContain("▸");
    const style = caret?.getAttribute("style") ?? "";
    // jsdom normalizes the hex to lowercase; match either form.
    expect(style.toLowerCase()).toContain("color: rgb(148, 163, 184)");
    expect(style.toLowerCase()).not.toContain("rgb(249, 115, 22)");
    expect(style.toLowerCase()).not.toContain("#f97316");

    act(() => {
      root.unmount();
    });
  });

  // The points `⍟`, lunar `☪`, and store `⧗` glyphs each swap for their filled
  // Boxicons mark rather than printing the literal character.
  it("renders points ⍟, lunar ☪, and store ⧗ as filled boxicons marks", () => {
    const { container, root } = mount(
      <RulesText text="Gain 2⍟. ☪: Store 1⧗." />,
    );

    expect(container.querySelector("i.bxf.bx-star-circle")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-moon")).not.toBeNull();
    expect(container.querySelector("i.bxf.bx-hourglass")).not.toBeNull();
    expect(container.textContent).not.toContain("⍟");
    expect(container.textContent).not.toContain("☪");
    expect(container.textContent).not.toContain("⧗");

    act(() => {
      root.unmount();
    });
  });

  // Backlog task 029: cards with multiple abilities use a blank-line `\n\n`
  // separator in the source TOML. Each ability must render as its own block
  // with a visible vertical gap so adjacent abilities do not run together.
  it("renders each ability separated by `\\n\\n` as its own paragraph block", () => {
    const { container, root } = mount(
      <RulesText
        text={
          "▸ Materialized: Banish an enemy until this character leaves play.\n\nAbandon this character: Foresee 2."
        }
      />,
    );

    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toContain("Materialized");
    expect(paragraphs[1]?.textContent).toContain("Abandon this character");

    act(() => {
      root.unmount();
    });
  });

  // The gap between abilities is set via `margin-top` (em-based) on every
  // paragraph after the first, so the spacing scales with the surrounding
  // font size (small card vs. large card).
  it("applies a top-margin to non-first ability paragraphs", () => {
    const { container, root } = mount(
      <RulesText text={"Ability one.\n\nAbility two."} />,
    );

    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(paragraphs).toHaveLength(2);

    const firstStyle = paragraphs[0]?.getAttribute("style") ?? "";
    const secondStyle = paragraphs[1]?.getAttribute("style") ?? "";

    // First paragraph: no top margin.
    expect(firstStyle).not.toContain("margin-top");
    // Second paragraph: top margin in em so it scales with font size.
    expect(secondStyle).toContain("margin-top");
    expect(secondStyle).toContain("em");

    act(() => {
      root.unmount();
    });
  });

  // Single-ability cards keep one paragraph and no inter-ability gap.
  it("renders a single ability as one paragraph with no extra spacing", () => {
    const { container, root } = mount(
      <RulesText text="▸ Materialized: Foresee 1." />,
    );

    const paragraphs = container.querySelectorAll(
      "[data-rules-text-paragraph]",
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.getAttribute("style") ?? "").not.toContain(
      "margin-top",
    );

    act(() => {
      root.unmount();
    });
  });
});
