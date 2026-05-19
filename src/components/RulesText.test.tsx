// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("wraps recognized glossary terms with role=tooltip-able trigger spans", () => {
    const { container, root } = mount(
      <RulesText text="Reclaim this card." />,
    );

    // The "Reclaim" word should be rendered inside an interactive trigger span
    // (the underline styling indicates a glossary-recognized term).
    const allSpans = container.querySelectorAll("span");
    const triggerSpan = Array.from(allSpans).find(
      (s) => s.textContent === "Reclaim",
    );
    expect(triggerSpan).toBeDefined();
    expect(triggerSpan?.getAttribute("style")).toContain("text-decoration");

    act(() => {
      root.unmount();
    });
  });

  it("renders the energy glyph as the boxicons flame icon", () => {
    const { container, root } = mount(<RulesText text="Pay ●3." />);

    const flame = container.querySelector("i.bx.bxs-flame");
    expect(flame).not.toBeNull();
    expect(container.textContent).not.toContain("●");

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

  it("preserves keyword nobreak grouping with a glossary-wrapped trigger keyword", () => {
    const { container, root } = mount(
      <RulesText text="▸ Judgment: Draw a card." />,
    );

    // The Judgment keyword should still be a glossary trigger span.
    const judgmentSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "Judgment",
    );
    expect(judgmentSpan).toBeDefined();
    expect(judgmentSpan?.getAttribute("style")).toContain("text-decoration");

    act(() => {
      root.unmount();
    });
  });

  // Backlog task 018: the trigger arrow `▸` reads as a typographic guide,
  // not a UI alert. It uses the muted slate `#94a3b8` shared with secondary
  // text elsewhere — explicitly NOT the bright orange `#f97316` that the
  // draft selection ring and HUD warnings claim.
  it("renders the trigger arrow ▸ in muted slate, not accent orange", () => {
    const { container, root } = mount(
      <RulesText text="▸ Judgment: Draw a card." />,
    );

    const arrowSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "▸",
    );
    expect(arrowSpan).toBeDefined();
    const style = arrowSpan?.getAttribute("style") ?? "";
    // jsdom normalizes the hex to lowercase; match either form.
    expect(style.toLowerCase()).toContain("color: rgb(148, 163, 184)");
    expect(style.toLowerCase()).not.toContain("rgb(249, 115, 22)");
    expect(style.toLowerCase()).not.toContain("#f97316");

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
