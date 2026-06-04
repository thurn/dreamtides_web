// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlossaryPopup } from "./GlossaryPopup";
import { GLOSSARY } from "../data/glossary";

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

// framer-motion's AnimatePresence delays unmounting in jsdom; we only
// care about the rendered DOM when open, so stub motion components to
// pass-through divs that respect the boolean visibility prop.
vi.mock("framer-motion", () => {
  type DivProps = React.ComponentProps<"div">;
  const factory = () => (props: DivProps) => <div {...props} />;
  return {
    motion: new Proxy({}, { get: () => factory() }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

import type * as React from "react";

function mount(node: React.ReactElement): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { root, container };
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GlossaryPopup", () => {
  it("renders nothing when closed", () => {
    const { container, root } = mount(
      <GlossaryPopup isOpen={false} onClose={vi.fn()} />,
    );
    expect(
      container.querySelector('[data-testid="glossary-popup-panel"]'),
    ).toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it("renders exactly one entry per term in the central glossary", () => {
    const { container, root } = mount(
      <GlossaryPopup isOpen={true} onClose={vi.fn()} />,
    );
    const entries = container.querySelectorAll(
      '[data-testid="glossary-popup-entry"]',
    );
    expect(entries.length).toBe(GLOSSARY.length);

    const renderedHeadings = Array.from(entries).map((el) =>
      el.querySelector("p")?.textContent?.trim() ?? "",
    );
    const expectedHeadings = GLOSSARY.map((entry) => entry.term);
    expect(renderedHeadings).toEqual(expectedHeadings);

    act(() => {
      root.unmount();
    });
  });


  it("closes when the close button is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <GlossaryPopup isOpen={true} onClose={onClose} />,
    );
    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close glossary"]',
    );
    expect(closeButton).not.toBeNull();
    act(() => {
      closeButton?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <GlossaryPopup isOpen={true} onClose={onClose} />,
    );
    const backdrop = container.querySelector<HTMLElement>(
      '[data-testid="glossary-popup-backdrop"]',
    );
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });

  it("closes on the Escape key", () => {
    const onClose = vi.fn();
    const { root } = mount(
      <GlossaryPopup isOpen={true} onClose={onClose} />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });

  it("scrolls its body when content overflows", () => {
    const { container, root } = mount(
      <GlossaryPopup isOpen={true} onClose={vi.fn()} />,
    );
    const body = container.querySelector<HTMLElement>(
      '[data-testid="glossary-popup-body"]',
    );
    expect(body).not.toBeNull();
    // Tailwind class signals overflow handling. The popup constrains
    // its own height (max-h on the panel) and lets the body scroll.
    expect(body?.className).toMatch(/overflow-y-auto/);
    act(() => {
      root.unmount();
    });
  });

  it("renders entry headings with natural capitalization and normal tracking", () => {
    const { container, root } = mount(
      <GlossaryPopup isOpen={true} onClose={vi.fn()} />,
    );
    const firstHeading = container.querySelector(
      '[data-testid="glossary-popup-entry"] p',
    );
    expect(firstHeading).not.toBeNull();
    expect(firstHeading?.textContent).toBe(GLOSSARY[0]?.term);
    expect(firstHeading?.className).not.toContain("uppercase");
    expect(firstHeading?.className).not.toContain("tracking-");

    act(() => {
      root.unmount();
    });
  });
});
