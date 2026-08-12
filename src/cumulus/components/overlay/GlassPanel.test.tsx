// @vitest-environment jsdom

import { localizationTodo } from "@trox/runtime";
import { act } from "react";
import { createRoot as createReactRoot } from "react-dom/client";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../../primitives/glyph";
import { CumulusRoot } from "../../CumulusRoot";
import { GlassPanel } from "./GlassPanel";

function createRoot(container: Element) {
  const root = createReactRoot(container);
  return {
    render: (node: ReactNode) => root.render(
      isValidElement(node) && node.type === CumulusRoot
        ? node
        : <CumulusRoot>{node}</CumulusRoot>,
    ),
    unmount: () => root.unmount(),
  };
}

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
            eyebrow={localizationTodo("Vision I")}
            title={localizationTodo("Transfigure Your Starters")}
            structuredSubtitle={[
              { kind: "text", text: "Transfigure " },
              { kind: "entity", text: "A Thread Rewoven" },
            ]}
            rightAccessory={{
              kind: "iconButton",
              button: {
                glyph: GLYPHS.close,
                overlayGlyph: GLYPHS.check,
                label: localizationTodo("Close"),
                onPress: onClose,
                ariaExpanded: true,
                ariaControls: "controlled-panel",
                testId: "close-panel",
              },
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
    expect(panel?.dataset.glassPanelHeightContract).toBe("content");
    expect(panel?.style.height).toBe("fit-content");
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
    const closeButton = panel?.querySelector<HTMLButtonElement>(
      '[data-testid="close-panel"]',
    );
    expect(closeButton?.getAttribute("aria-expanded")).toBe("true");
    expect(closeButton?.getAttribute("aria-controls")).toBe("controlled-panel");
    expect(closeButton?.querySelector("[data-icon-button-glyph-stack]")).not.toBeNull();

    act(() => {
      closeButton?.click();
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
          title={localizationTodo("Cards")}
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

  it("forwards the labeled control API while owning its surface placement", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <GlassPanel
            frame="fullBleed"
            rightAccessory={{
              kind: "glassButton",
              button: {
                label: "Action",
                onPress: () => undefined,
                essenceValue: 7,
                size: "compact",
                pressed: true,
                accessibilityLabel: "Accessible action",
                testId: "panel-action",
              },
            }}
          >
            <span />
          </GlassPanel>
        </CumulusRoot>,
      );
    });

    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="panel-action"]',
    );
    expect(action?.dataset.glassPlacement).toBe("onMedia");
    expect(action?.getAttribute("aria-pressed")).toBe("true");
    expect(action?.getAttribute("aria-label")).toBe("Accessible action");
    expect(action?.querySelector("[data-essence-value]")).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("reserves frame height for edge rails without exposing a floating-panel height knob", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GlassPanel frame="edgeRail" testId="rail-panel">
          <span>Scrollable stage</span>
        </GlassPanel>,
      );
    });

    const panel = container.querySelector<HTMLElement>(
      '[data-testid="rail-panel"]',
    );
    expect(panel?.dataset.glassPanelHeightContract).toBe("frame");
    expect(panel?.style.height).toBe("100%");
    expect(
      panel?.querySelector<HTMLElement>("[data-glass-panel-content]")?.style
        .flex,
    ).toBe("1 1 auto");

    act(() => root.unmount());
    container.remove();
  });
});
