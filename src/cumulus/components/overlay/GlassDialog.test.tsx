// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlassBackdrop, GlassDialog } from "./GlassDialog";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

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
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Stub matchMedia → mobile: every query misses, so `useIsDesktop` is false
  // and the dialog renders its full-bleed idiom. Pressable's reduced-motion
  // probe reads the same API.
  stubMatchMedia(false);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GlassBackdrop", () => {
  it("renders a position:absolute frosted layer carrying its children", () => {
    const { container, root } = mount(
      <GlassBackdrop>
        <span data-testid="child">behind</span>
      </GlassBackdrop>,
    );

    const layer = container.firstElementChild as HTMLElement | null;
    expect(layer).not.toBeNull();
    const style = layer?.getAttribute("style") ?? "";
    expect(style).toContain("position: absolute");
    // The blur backdrop from the shared glass recipe.
    expect(style).toContain("blur(");
    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("is aria-hidden when childless", () => {
    const { container, root } = mount(<GlassBackdrop />);
    const layer = container.firstElementChild as HTMLElement | null;
    expect(layer?.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      root.unmount();
    });
  });
});

describe("GlassDialog", () => {
  it("omits the close control when the dialog is commit-gated", () => {
    const { container, root } = mount(
      <GlassDialog title="Foresee 2">
        <div>content</div>
      </GlassDialog>,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders the title as an <h2>, the subtitle, the children, and a labeled close that fires onClose", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <GlassDialog
        title="Starting Deck"
        subtitle="An intro line"
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

    expect(
      container
        .querySelector('button[aria-label="Close"]')
        ?.getAttribute("data-glass-placement"),
    ).toBe("onGlass");

    act(() => {
      (
        container.querySelector(
          'button[aria-label="Close"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("uses a custom closeLabel as the close control's aria-label", () => {
    const { container, root } = mount(
      <GlassDialog title="Title" onClose={() => {}} closeLabel="Dismiss deck">
        <div>content</div>
      </GlassDialog>,
    );

    expect(
      container.querySelector('button[aria-label="Dismiss deck"]'),
    ).not.toBeNull();
    expect(container.querySelector('button[aria-label="Close"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders no subtitle <p> in the header when subtitle is omitted", () => {
    const { container, root } = mount(
      <GlassDialog title="Title" onClose={() => {}}>
        <div data-testid="only-body">content</div>
      </GlassDialog>,
    );

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.querySelector("p")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders the desktop dialog without a full-screen frosted backdrop", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <GlassDialog title="Title" onClose={() => {}}>
        <div>content</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.children).toHaveLength(1);
    const panel = dialog?.firstElementChild as HTMLElement | null;
    expect(panel?.style.position).toBe("relative");
    expect(panel?.style.maxWidth).toBe("min(900px, 90vw)");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the popup presentation bounded and content-sized on mobile", () => {
    const { container, root } = mount(
      <GlassDialog title="How to Play" presentation="popup" onClose={() => {}}>
        <div data-testid="popup-content">content</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const panel = dialog?.querySelector<HTMLElement>(
      "[data-glass-dialog-panel]",
    );
    expect(dialog?.children).toHaveLength(1);
    expect(dialog?.getAttribute("data-glass-dialog-presentation")).toBe(
      "popup",
    );
    expect(dialog?.style.paddingTop).toBe("var(--gutter)");
    expect(panel?.style.width).toBe("fit-content");
    expect(panel?.style.maxWidth).toBe("100%");
    expect(panel?.style.maxHeight).toBe("100%");
    expect(panel?.style.height).toBe("");
    expect(panel?.style.borderRadius).not.toBe("0px");

    act(() => {
      root.unmount();
    });
  });

  it("centers a tangible companion beside a wider prose panel on desktop", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <GlassDialog
        title="How to Play"
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
    const panel = container.querySelector<HTMLElement>(
      "[data-glass-dialog-panel]",
    );
    expect(layout?.dataset.glassDialogCompanionLayout).toBe("horizontal");
    expect(layout?.style.gridTemplateColumns).toBe(
      "360px minmax(0, 460px)",
    );
    expect(layout?.style.width).toBe("calc(820px + var(--space-7))");
    expect(panel?.style.width).toBe("100%");
    expect(panel?.style.boxSizing).toBe("border-box");
    expect(container.querySelector('[data-testid="companion"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("centers a narrower companion above the prose panel on mobile", () => {
    const { container, root } = mount(
      <GlassDialog
        title="How to Play"
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
    expect(layout?.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(layout?.style.width).toBe(
      "calc(100vw - var(--gutter) - var(--gutter))",
    );
    expect(layout?.style.maxWidth).toBe("460px");
    expect(layout?.style.gap).toBe("var(--space-5)");
    const companion = container.querySelector<HTMLElement>(
      "[data-glass-dialog-companion]",
    );
    expect(companion?.style.width).toBe("76vw");
    expect(companion?.style.maxWidth).toBe("340px");
    expect(companion?.style.justifySelf).toBe("center");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the title accessible while rendering only the floating close chrome", () => {
    const { container, root } = mount(
      <GlassDialog
        title="How to Play"
        presentation="popup"
        chrome="close-only"
        onClose={() => {}}
      >
        <div>Two paragraphs</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const closeOnly = container.querySelector<HTMLElement>(
      "[data-glass-dialog-close-only]",
    );
    expect(dialog?.getAttribute("aria-label")).toBe("How to Play");
    expect(dialog?.querySelector("header")).toBeNull();
    expect(dialog?.querySelector("h2")).toBeNull();
    expect(closeOnly?.style.position).toBe("absolute");
    expect(closeOnly?.style.top).toBe("var(--space-6)");
    expect(closeOnly?.style.right).toBe("var(--space-6)");
    expect(
      closeOnly?.querySelector('button[aria-label="Close"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("floats the close disc in body flow for prose wrapping", () => {
    const { container, root } = mount(
      <GlassDialog
        title="How to Play"
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
    expect(flowingClose?.style.cssFloat).toBe("right");
    expect(flowingClose?.style.marginTop).toBe("var(--space-1)");
    expect(flowingClose?.style.marginRight).toBe("var(--space-1)");
    expect(
      flowingClose?.querySelector('button[aria-label="Close"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-glass-dialog-close-only]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
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

    const { container, root } = mount(
      <GlassDialog title="Foresee 2" desktopCenterTarget="battlefield">
        <div>content</div>
      </GlassDialog>,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.style.position).toBe("fixed");
    expect(dialog?.style.inset).toBe("0px");
    expect(dialog?.style.paddingLeft).toBe("var(--space-7)");
    expect(dialog?.style.paddingRight).toBe("calc(var(--space-7) + 360px)");
    expect(
      dialog?.getAttribute("data-glass-dialog-desktop-center-target"),
    ).toBe("battlefield");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the close disc on the header row when cutoutAwareClose is set but no cutout box is injected", () => {
    // Default: hasInjectedDisplayCutout() is false, so even on mobile the disc
    // stays on the header's trailing edge.
    const { container, root } = mount(
      <GlassDialog title="Title" onClose={() => {}} cutoutAwareClose>
        <div>content</div>
      </GlassDialog>,
    );

    const headerButton = container.querySelector("header button");
    expect(headerButton?.getAttribute("aria-label")).toBe("Close");
    // Exactly one close control — the disc moves, it never forks.
    expect(container.querySelectorAll("button")).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it("floats the close disc beside the island on a full-bleed mobile mock-up with a cutout box", () => {
    vi.mocked(hasInjectedDisplayCutout).mockReturnValue(true);
    const onClose = vi.fn();
    const { container, root } = mount(
      <GlassDialog title="Title" onClose={onClose} cutoutAwareClose>
        <div>content</div>
      </GlassDialog>,
    );

    // The disc has left the header row...
    expect(container.querySelector("header button")).toBeNull();
    // ...and floats in an absolutely positioned wrapper beside the island.
    const closeButton = container.querySelector<HTMLElement>(
      'button[aria-label="Close"]',
    );
    expect(closeButton).not.toBeNull();
    const floatWrapper = closeButton?.parentElement as HTMLElement | null;
    expect(floatWrapper?.style.position).toBe("absolute");
    // Still exactly one close control.
    expect(container.querySelectorAll("button")).toHaveLength(1);

    act(() => {
      closeButton?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
