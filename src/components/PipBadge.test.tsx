// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("tooltip hover behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Find the portaled tooltip body (role=tooltip) anywhere in the document. */
    function findTooltip(): HTMLElement | null {
      return document.body.querySelector<HTMLElement>("[role=\"tooltip\"]");
    }

    it("shows the tooltip after a 1000ms hover delay", () => {
      const { root } = mount(
        <PipBadge
          variant="energy"
          value="3"
          tooltip="Energy cost. Spend this much energy to play the card."
        />,
      );

      const trigger = document.body.querySelector<HTMLElement>(
        "[data-pip-variant=\"energy\"]",
      )?.parentElement;
      expect(trigger).not.toBeNull();

      // React 18 delegates events at the root, so `mouseenter` (which doesn't
      // bubble) is delivered via a bubbling `mouseover` instead.
      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      expect(findTooltip()).toBeNull();

      // Just before the 1000ms threshold — still no tooltip.
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(findTooltip()).toBeNull();

      // Cross the 1000ms threshold — tooltip appears with the description.
      act(() => {
        vi.advanceTimersByTime(1);
      });
      const tooltip = findTooltip();
      expect(tooltip).not.toBeNull();
      expect(tooltip?.textContent).toContain(
        "Energy cost. Spend this much energy to play the card.",
      );

      act(() => {
        root.unmount();
      });
    });

    it("hides the tooltip on mouse-out", () => {
      const { root } = mount(
        <PipBadge
          variant="spark"
          value="4"
          tooltip="Spark. A character's combat power — higher spark wins combat."
        />,
      );

      const trigger = document.body.querySelector<HTMLElement>(
        "[data-pip-variant=\"spark\"]",
      )?.parentElement;
      expect(trigger).not.toBeNull();

      // Hover and let the timer elapse so the tooltip is visible.
      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(findTooltip()).not.toBeNull();

      // Mouse-out hides the tooltip immediately.
      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      });
      expect(findTooltip()).toBeNull();

      act(() => {
        root.unmount();
      });
    });

    it("cancels the pending tooltip if the cursor leaves before the delay", () => {
      const { root } = mount(
        <PipBadge variant="energy" value="2" tooltip="Energy cost." />,
      );

      const trigger = document.body.querySelector<HTMLElement>(
        "[data-pip-variant=\"energy\"]",
      )?.parentElement;
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      });
      act(() => {
        // Drain any leftover scheduled timers.
        vi.advanceTimersByTime(1000);
      });
      expect(findTooltip()).toBeNull();

      act(() => {
        root.unmount();
      });
    });

    it("also reveals the tooltip on keyboard focus of the trigger", () => {
      const { root } = mount(
        <PipBadge variant="spark" value="1" tooltip="Spark tooltip." />,
      );

      const trigger = document.body.querySelector<HTMLElement>(
        "[data-pip-variant=\"spark\"]",
      )?.parentElement;
      expect(trigger).not.toBeNull();

      // React's onFocus listens for the bubbling `focusin` event.
      act(() => {
        trigger?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const tooltip = findTooltip();
      expect(tooltip).not.toBeNull();
      expect(tooltip?.textContent).toContain("Spark tooltip.");

      // Blur hides the tooltip (React's onBlur fires from `focusout`).
      act(() => {
        trigger?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });
      expect(findTooltip()).toBeNull();

      act(() => {
        root.unmount();
      });
    });
  });
});
