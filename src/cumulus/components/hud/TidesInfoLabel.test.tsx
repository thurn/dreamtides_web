// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { TidesInfoLabel } from "./TidesInfoLabel";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TidesInfoLabel", () => {
  it("renders a cap-centered filled info glyph and owns the canonical Tides reveal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><TidesInfoLabel /></CumulusRoot>));

    const source = container.querySelector<HTMLElement>("[data-tides-info-label]");
    expect(source?.textContent?.trim()).toBe("Tides:");
    expect(source?.getAttribute("aria-label")).toBe("Tides information");
    expect(source?.tabIndex).toBe(0);
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.dataset.revealPrimaryVariant).toBe("text");
    expect(source?.dataset.revealSecondaryTitles).toBe("");

    const glyph = source?.querySelector<HTMLElement>("[data-inline-glyph]");
    const metric = glyph?.querySelector<HTMLElement>("[data-inline-glyph-metric]");
    expect(glyph?.querySelector("i")?.className).toBe("bxf bx-info-circle");
    expect(metric?.style.width).toBe("1em");
    expect(metric?.style.height).toBe("1em");
    expect(metric?.style.transform).toBe("translateY(calc(0.5ex - 0.5cap))");

    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain("Tides");
    expect(description?.textContent).toContain("Pools of cards");

    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");

    act(() => root.unmount());
    container.remove();
  });
});
