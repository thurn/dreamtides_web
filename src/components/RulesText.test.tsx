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
      <RulesText text="Send a card to your void." />,
    );

    // The "void" word should be rendered inside an interactive trigger span
    // (the underline styling indicates a glossary-recognized term).
    const allSpans = container.querySelectorAll("span");
    const triggerSpan = Array.from(allSpans).find(
      (s) => s.textContent === "void",
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
});
