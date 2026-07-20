// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../../primitives/glyph";
import { CumulusRoot } from "../../CumulusRoot";
import { GlassPanel } from "./GlassPanel";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
});

describe("GlassPanel", () => {
  it("renders the shared glass frame, structured header, content, and footer", () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <GlassPanel
            eyebrow="Vision I"
            title="Transfigure Your Starters"
            structuredSubtitle={[
              { kind: "text", text: "Transfigure " },
              { kind: "entity", text: "A Thread Rewoven" },
            ]}
            rightAccessory={{
              kind: "iconButton",
              glyph: GLYPHS.close,
              label: "Close",
              onPress: onClose,
              testId: "close-panel",
            }}
            footer={<span>Footer action</span>}
            testId="glass-panel"
          >
            <p>Panel content</p>
          </GlassPanel>
        </CumulusRoot>,
      );
    });

    const panel = container.querySelector<HTMLElement>(
      '[data-testid="glass-panel"]',
    );
    expect(panel?.dataset.glassPanelFrame).toBe("floating");
    expect(panel?.style.backdropFilter).toContain("--glass-blur");
    expect(panel?.style.borderRadius).toBe("var(--radius-panel)");
    expect(panel?.querySelector("h2")?.textContent).toBe(
      "Transfigure Your Starters",
    );
    expect(
      panel?.querySelector("[data-glass-panel-subtitle-entity]")?.textContent,
    ).toBe("A Thread Rewoven");
    expect(
      panel?.querySelector<HTMLElement>("[data-glass-panel-header]")?.style
        .textAlign,
    ).toBe("left");
    expect(panel?.textContent).toContain("Vision I");
    expect(panel?.textContent).toContain("Transfigure A Thread Rewoven");
    expect(panel?.textContent).toContain("Panel content");
    expect(panel?.querySelector("footer")?.textContent).toBe("Footer action");

    act(() => {
      panel
        ?.querySelector<HTMLButtonElement>('[data-testid="close-panel"]')
        ?.click();
    });
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
    container.remove();
  });

  it("supports the strict popover tint and full-bleed gallery frame", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GlassPanel
          title="Cards"
          frame="fullBleed"
          radius="popover"
          tint="popover"
          testId="full-bleed-panel"
        >
          <span>Collection</span>
        </GlassPanel>,
      );
    });

    const panel = container.querySelector<HTMLElement>(
      '[data-testid="full-bleed-panel"]',
    );
    expect(panel?.style.background).toBe("var(--scrim-gallery)");
    expect(panel?.style.backdropFilter).toBe("");
    expect(panel?.style.borderStyle).toBe("none");
    expect(panel?.style.borderRadius).toBe("0px");
    expect(panel?.style.boxShadow).toBe("none");

    act(() => root.unmount());
    container.remove();
  });
});
