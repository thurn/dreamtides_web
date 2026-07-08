// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverZoomCard, MAX_SCALE, TARGET_WIDTH_PX } from "./HoverZoomCard";

/** Pull the numeric scale factor out of a `... scale(N)` transform string. */
function readScale(transform: string | undefined): number {
  const match = /scale\(([\d.]+)\)/.exec(transform ?? "");
  return match ? Number(match[1]) : Number.NaN;
}

vi.mock("../../../logging", () => ({
  logEventOnce: vi.fn(),
}));

function mockRect(rect: Partial<DOMRect>): void {
  const full: DOMRect = {
    width: 100,
    height: 140,
    left: 50,
    top: 50,
    right: 150,
    bottom: 190,
    x: 50,
    y: 50,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(full);
}

function mount(element: Parameters<Root["render"]>[0]): {
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

function hover(container: HTMLDivElement): void {
  const slot = container.querySelector("[data-testid='slot']");
  act(() => {
    slot?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function overlay(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>("[data-hover-zoom-overlay]");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("HoverZoomCard", () => {
  it("grows the card into a portaled, pointer-events-none copy on hover", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot" logSurface="test">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    expect(overlay()).toBeNull();

    hover(container);

    const node = overlay();
    expect(node).not.toBeNull();
    // The copy mirrors the card content and floats above the layout without
    // intercepting the pointer.
    expect(node?.textContent).toContain("CARD BODY");
    expect(node?.classList.contains("pointer-events-none")).toBe(true);
    // Assert the scaling *rules* rather than a hardcoded factor so tweaking
    // MAX_SCALE / TARGET_WIDTH_PX never breaks this test: the card grows
    // (> 1x), never past the MAX_SCALE cap, and never past the width target
    // (340px target / 100px footprint).
    const scale = readScale(node?.style.transform);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(MAX_SCALE + 1e-9);
    expect(scale).toBeLessThanOrEqual(TARGET_WIDTH_PX / 100 + 1e-9);

    act(() => {
      root.unmount();
    });
  });

  it("shows a glossary definition stack beside the card for terms in its rules text", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot" glossaryText="Discard a bane.">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    expect(document.body.querySelector("[data-hover-zoom-glossary]")).toBeNull();

    hover(container);

    const stack = document.body.querySelector("[data-hover-zoom-glossary]");
    expect(stack).not.toBeNull();
    expect(stack?.textContent).toContain("Bane");

    // The stack collapses with the card when the pointer leaves the footprint.
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, clientY: 600 }),
      );
    });
    expect(document.body.querySelector("[data-hover-zoom-glossary]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders no glossary stack when the rules text has no gameplay terms", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot" glossaryText="Just some plain words.">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);

    expect(overlay()).not.toBeNull();
    expect(document.body.querySelector("[data-hover-zoom-glossary]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("eases the portaled copy in when gentle motion is requested", () => {
    mockRect({ width: 220, height: 308, left: 50, top: 50, right: 270, bottom: 358 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot" targetWidthPx={250} zoomMotion="gentle">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);

    const node = overlay();
    const animatedCopy = node?.querySelector<HTMLElement>(
      ".hover-zoom-card__gentle-copy",
    );
    expect(node?.dataset.hoverZoomMotion).toBe("gentle");
    expect(animatedCopy).not.toBeNull();
    expect(
      Number(animatedCopy?.style.getPropertyValue("--hover-zoom-entry-scale")),
    ).toBeCloseTo(220 / 250, 3);

    act(() => {
      root.unmount();
    });
  });

  it("keeps the card grown while the pointer stays inside the original footprint", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);
    expect(overlay()).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 120 }),
      );
    });

    expect(overlay()).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shrinks the card as soon as the pointer leaves the original footprint", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);
    expect(overlay()).not.toBeNull();

    act(() => {
      // Well outside the stored 50..150 / 50..190 footprint.
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, clientY: 600 }),
      );
    });

    expect(overlay()).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does nothing when disabled", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard testId="slot" enabled={false}>
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);

    expect(overlay()).toBeNull();
    expect(container.textContent).toContain("CARD BODY");

    act(() => {
      root.unmount();
    });
  });

  it("does not grow a card already at the target width", () => {
    // A footprint already wider than the target width yields a scale <= 1, so
    // the card never zooms. Derived from TARGET_WIDTH_PX so the test holds no
    // matter what that constant is tuned to.
    const wide = TARGET_WIDTH_PX + 60;
    const tall = Math.round(wide * 1.4);
    mockRect({
      width: wide,
      height: tall,
      left: 20,
      top: 20,
      right: 20 + wide,
      bottom: 20 + tall,
    });
    const { container, root } = mount(
      <HoverZoomCard testId="slot">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);

    expect(overlay()).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
