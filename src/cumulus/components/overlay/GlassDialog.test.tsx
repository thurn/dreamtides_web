// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlassBackdrop, GlassDialog } from "./GlassDialog";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { renderInCumulus } from "../../testing/render";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  vi.mocked(hasInjectedDisplayCutout).mockReturnValue(false);
  // Stub matchMedia → mobile: every query misses, so `useIsDesktop` is false
  // and the dialog renders its full-bleed idiom. Pressable's reduced-motion
  // probe reads the same API.
  stubMatchMedia(false);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GlassBackdrop", () => {
  it("renders an aria-hidden decorative layer", () => {
    const { container } = renderInCumulus(<GlassBackdrop />);

    const layer = container.firstElementChild as HTMLElement | null;
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("GlassDialog", () => {
  it("omits the close control when the dialog is commit-gated", () => {
    const { container } = renderInCumulus(
      <GlassDialog title={"Foresee 2"}>
        <div>content</div>
      </GlassDialog>,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders the title as an <h2>, the subtitle, the children, and a labeled close that fires onClose", () => {
    const onClose = vi.fn();
    const { container } = renderInCumulus(
      <GlassDialog
        title={"Starting Deck"}
        subtitle={"An intro line"}
        onClose={onClose}
      >
        <p data-testid="body">body content</p>
      </GlassDialog>,
    );

    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Starting Deck");

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    // Subtitle present.
    const paragraphs = Array.from(container.querySelectorAll("p"));
    expect(paragraphs.some((p) => p.textContent === "An intro line")).toBe(
      true,
    );
    expect(container.querySelector('[data-testid="body"]')).not.toBeNull();

    const close = container.querySelector<HTMLButtonElement>("header button");
    expect(close?.getAttribute("aria-label")).toBeTruthy();
    expect(close?.getAttribute("data-glass-placement")).toBe("onGlass");

    act(() => {
      close?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses a custom closeLabel as the close control's aria-label", () => {
    const { container } = renderInCumulus(
      <GlassDialog
        title={"Title"}
        onClose={() => {}}
        closeLabel={"Dismiss deck"}
      >
        <div>content</div>
      </GlassDialog>,
    );

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(
      container.querySelector("button")?.getAttribute("aria-label"),
    ).toBe("Dismiss deck");
  });

  it("renders no subtitle <p> in the header when subtitle is omitted", () => {
    const { container } = renderInCumulus(
      <GlassDialog title={"Title"} onClose={() => {}}>
        <div data-testid="only-body">content</div>
      </GlassDialog>,
    );

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.querySelector("p")).toBeNull();
  });

  it("renders the desktop dialog without a full-screen frosted backdrop", () => {
    stubMatchMedia(true);
    const { container } = renderInCumulus(
      <GlassDialog title={"Title"} onClose={() => {}}>
        <div>content</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.children).toHaveLength(1);
    expect(dialog?.firstElementChild?.hasAttribute("data-glass-dialog-panel"))
      .toBe(true);
  });

  it("renders the popup presentation as one panel on mobile", () => {
    const { container } = renderInCumulus(
      <GlassDialog
        title={"How to Play"}
        presentation="popup"
        onClose={() => {}}
      >
        <div data-testid="popup-content">content</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.children).toHaveLength(1);
    expect(dialog?.getAttribute("data-glass-dialog-presentation")).toBe(
      "popup",
    );
    expect(
      dialog?.querySelector('[data-glass-dialog-panel] [data-testid="popup-content"]'),
    ).not.toBeNull();
  });

  it("centers a tangible companion beside a wider prose panel on desktop", () => {
    stubMatchMedia(true);
    const { container } = renderInCumulus(
      <GlassDialog
        title={"How to Play"}
        presentation="popup"
        companion={<div data-testid="companion">card</div>}
        onClose={() => {}}
      >
        <div>instruction</div>
      </GlassDialog>,
    );

    const layout = container.querySelector<HTMLElement>(
      "[data-glass-dialog-companion-layout]",
    );
    expect(layout?.dataset.glassDialogCompanionLayout).toBe("horizontal");
    expect(container.querySelector('[data-testid="companion"]')).not.toBeNull();
  });

  it("centers a narrower companion above the prose panel on mobile", () => {
    const { container } = renderInCumulus(
      <GlassDialog
        title={"How to Play"}
        presentation="popup"
        companion={<div data-testid="companion">card</div>}
        onClose={() => {}}
      >
        <div>instruction</div>
      </GlassDialog>,
    );

    const layout = container.querySelector<HTMLElement>(
      "[data-glass-dialog-companion-layout]",
    );
    expect(layout?.dataset.glassDialogCompanionLayout).toBe("vertical");
    expect(
      container.querySelector(
        '[data-glass-dialog-companion] [data-testid="companion"]',
      ),
    ).not.toBeNull();
  });

  it("floats the close disc in body flow for prose wrapping", () => {
    const { container } = renderInCumulus(
      <GlassDialog
        title={"How to Play"}
        presentation="popup"
        chrome="flowing-close"
        onClose={() => {}}
      >
        <p>Two paragraphs</p>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const flowingClose = container.querySelector<HTMLElement>(
      "[data-glass-dialog-flowing-close]",
    );
    const body = container.querySelector<HTMLElement>(
      "[data-glass-dialog-body]",
    );
    expect(dialog?.getAttribute("aria-label")).toBe("How to Play");
    expect(dialog?.querySelector("header")).toBeNull();
    expect(dialog?.querySelector("h2")).toBeNull();
    expect(body?.firstElementChild).toBe(flowingClose);
    expect(flowingClose?.querySelector("button")).not.toBeNull();
  });

  it("centers a desktop panel within the measured battlefield while retaining the viewport modal layer", () => {
    stubMatchMedia(true);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    const battlefield = document.createElement("main");
    battlefield.dataset.battleMobile = "";
    battlefield.getBoundingClientRect = () => ({
      bottom: 900,
      height: 900,
      left: 0,
      right: 1080,
      top: 0,
      width: 1080,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    document.body.append(battlefield);

    const { container } = renderInCumulus(
      <GlassDialog
        title={"Foresee 2"}
        desktopCenterTarget="battlefield"
      >
        <div>content</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.style.position).toBe("fixed");
    expect(dialog?.style.inset).toBe("0px");
    // The 360px measured beyond the battlefield's right edge is reserved.
    expect(dialog?.style.paddingRight).toContain("360px");
    expect(
      dialog?.getAttribute("data-glass-dialog-desktop-center-target"),
    ).toBe("battlefield");
  });

  it("keeps the close disc on the header row when cutoutAwareClose is set but no cutout box is injected", () => {
    // Default: hasInjectedDisplayCutout() is false, so even on mobile the disc
    // stays on the header's trailing edge.
    const { container } = renderInCumulus(
      <GlassDialog
        title={"Title"}
        onClose={() => {}}
        cutoutAwareClose
      >
        <div>content</div>
      </GlassDialog>,
    );

    const headerButton = container.querySelector("header button");
    expect(headerButton).not.toBeNull();
    // Exactly one close control — the disc moves, it never forks.
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("floats the close disc beside the island on a full-bleed mobile mock-up with a cutout box", () => {
    vi.mocked(hasInjectedDisplayCutout).mockReturnValue(true);
    const onClose = vi.fn();
    const { container } = renderInCumulus(
      <GlassDialog
        title={"Title"}
        onClose={onClose}
        cutoutAwareClose
      >
        <div>content</div>
      </GlassDialog>,
    );

    // The disc has left the header row...
    expect(container.querySelector("header button")).toBeNull();
    // ...and floats in an absolutely positioned wrapper beside the island.
    const closeButton = container.querySelector<HTMLElement>("button");
    expect(closeButton).not.toBeNull();
    const floatWrapper = closeButton?.parentElement as HTMLElement | null;
    expect(floatWrapper?.style.position).toBe("absolute");
    // Still exactly one close control.
    expect(container.querySelectorAll("button")).toHaveLength(1);

    act(() => {
      closeButton?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
