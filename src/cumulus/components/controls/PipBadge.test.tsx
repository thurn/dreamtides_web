// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PipBadge } from "./PipBadge";
import { CumulusRoot } from "../../CumulusRoot";

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
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

describe("PipBadge", () => {
  it("renders the spark variant with a gold fill, white text, and black outline", () => {
    const { container, root } = mount(<PipBadge variant="spark" value="3" />);

    const badge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"spark\"]",
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("3");
    expect(badge?.getAttribute("aria-label")).toBe("spark");
    const style = badge?.getAttribute("style") ?? "";
    // Gold fill (#facc15 = rgb(250, 204, 21)).
    expect(style.toLowerCase()).toContain("rgb(250, 204, 21)");
    // White text.
    expect(style.toLowerCase()).toContain("color: rgb(255, 255, 255)");
    // Thin black outline via text-shadow.
    expect(style.toLowerCase()).toContain("text-shadow");
    expect(style.toLowerCase()).toContain("#000");

    act(() => {
      root.unmount();
    });
  });

  it("renders the energy variant with a teal/cyan fill", () => {
    const { container, root } = mount(<PipBadge variant="energy" value="5" />);

    const badge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"energy\"]",
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("5");
    expect(badge?.getAttribute("aria-label")).toBe("energy cost");
    const style = badge?.getAttribute("style") ?? "";
    // Cyan/teal fill (#0ea5e9 = rgb(14, 165, 233)).
    expect(style.toLowerCase()).toContain("rgb(14, 165, 233)");

    act(() => {
      root.unmount();
    });
  });

  it("never renders the bare ⍏ glyph", () => {
    const { container, root } = mount(<PipBadge variant="spark" value="2" />);
    expect(container.textContent).not.toContain("⍏");
    act(() => {
      root.unmount();
    });
  });

  it("renders the value as a circular badge (rounded-full class)", () => {
    const { container, root } = mount(<PipBadge variant="spark" value="1" />);

    const badge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"spark\"]",
    );
    expect(badge?.className).toContain("rounded-full");

    act(() => {
      root.unmount();
    });
  });

  it("owns strict tooltip reveal semantics and remains keyboard focusable", () => {
    const { container, root } = mount(
      <PipBadge
        variant="spark"
        value="2"
        tooltip="Spark: damage this character deals."
      />,
    );

    const badge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"spark\"]",
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("2");
    const source = badge?.parentElement;
    expect(source?.dataset.revealFeedback).toBe("measured");
    expect(source?.dataset.revealEntityType).toBe("card-spark-pip");
    expect(source?.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source?.dataset.revealPrimaryVariant).toBe("text");
    expect(source?.dataset.revealSecondaryTitles).toBe("");
    expect(source?.tabIndex).toBe(0);
    const description = document.getElementById(source?.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Spark: damage this character deals.");

    act(() => {
      root.unmount();
    });
  });

});
