// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";
import { GlassPanel } from "./GlassPanel";
import { click, stubMatchMedia } from "./overlay.fixtures";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(hasInjectedDisplayCutout).mockReturnValue(false);
  stubMatchMedia(false);
});

describe("GlassPanel", () => {
  it("renders header, content, and footer and forwards the icon accessory", () => {
    const onClose = vi.fn();
    const { container } = renderInCumulus(
      <GlassPanel
        eyebrow={"Eyebrow"}
        title={"Title"}
        subtitle={"Subtitle"}
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: "Close",
            onPress: onClose,
            ariaExpanded: true,
            ariaControls: "controlled-panel",
            testId: "close-panel",
          },
        }}
        footer={<span data-testid="footer-content" />}
        testId="glass-panel"
      >
        <p data-testid="panel-content" />
      </GlassPanel>,
    );
    const panel = container.querySelector<HTMLElement>(
      '[data-testid="glass-panel"]',
    );
    expect(panel?.dataset.glassPanelFrame).toBe("floating");
    expect(panel?.dataset.glassPanelHeightContract).toBe("content");
    expect(panel?.querySelector("[data-glass-panel-header] h2")).not.toBeNull();
    expect(
      panel?.querySelector('[data-testid="panel-content"]'),
    ).not.toBeNull();
    expect(
      panel?.querySelector('footer [data-testid="footer-content"]'),
    ).not.toBeNull();
    const closeButton = panel?.querySelector<HTMLButtonElement>(
      '[data-testid="close-panel"]',
    );
    expect(closeButton?.getAttribute("aria-expanded")).toBe("true");
    expect(closeButton?.getAttribute("aria-controls")).toBe("controlled-panel");
    click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives edge rails the frame height contract", () => {
    const { container } = renderInCumulus(
      <GlassPanel frame="edgeRail" testId="rail-panel">
        <span />
      </GlassPanel>,
    );
    expect(
      container.querySelector<HTMLElement>('[data-testid="rail-panel"]')
        ?.dataset.glassPanelHeightContract,
    ).toBe("frame");
  });
});
