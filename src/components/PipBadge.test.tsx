// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PipBadge } from "./PipBadge";

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

  it("supports a tooltip that wraps the badge in a hover anchor", () => {
    const { container, root } = mount(
      <PipBadge
        variant="spark"
        value="2"
        tooltip="Spark: damage this character deals."
      />,
    );

    // The badge itself still appears.
    const badge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"spark\"]",
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("2");

    // The badge is wrapped in an outer span (the HoverPopover trigger).
    const outerWrapper = container.firstElementChild;
    expect(outerWrapper?.tagName.toLowerCase()).toBe("span");
    // The wrapper exposes the mouse-enter handler that drives the tooltip;
    // we only assert presence of the wrapping element here, since the
    // popover content portals into the body on a delay.
    if (badge !== null) {
      expect(outerWrapper?.contains(badge)).toBe(true);
    }

    act(() => {
      root.unmount();
    });
  });
});
