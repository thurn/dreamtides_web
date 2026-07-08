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
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
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
  it("renders the title as an <h2>, the subtitle, the children, and a labeled close that fires onClose", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <GlassDialog title="Starting Deck" subtitle="An intro line" onClose={onClose}>
        <p data-testid="body">body content</p>
      </GlassDialog>,
    );

    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Starting Deck");

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    // Subtitle present.
    const paragraphs = Array.from(container.querySelectorAll("p"));
    expect(paragraphs.some((p) => p.textContent === "An intro line")).toBe(true);
    expect(container.querySelector('[data-testid="body"]')).not.toBeNull();

    act(() => {
      (
        container.querySelector('button[aria-label="Close"]') as HTMLButtonElement
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
