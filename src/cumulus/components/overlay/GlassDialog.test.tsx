// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { renderInCumulus } from "../../testing/render";
import { GlassBackdrop, GlassDialog } from "./GlassDialog";
import { click, stubMatchMedia } from "./overlay.fixtures";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(hasInjectedDisplayCutout).mockReturnValue(false);
  stubMatchMedia(false);
});

describe("GlassDialog", () => {
  it("omits the close control when commit-gated and hides the backdrop", () => {
    const { container } = renderInCumulus(
      <>
        <GlassBackdrop />
        <GlassDialog title={"Foresee 2"}>
          <div>content</div>
        </GlassDialog>
      </>,
    );
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders a modal headed dialog whose single labeled close fires onClose", () => {
    const onClose = vi.fn();
    const { container } = renderInCumulus(
      <GlassDialog title={"Deck"} onClose={onClose} closeLabel={"Dismiss deck"}>
        <p data-testid="body">body content</p>
      </GlassDialog>,
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(container.querySelector("h2")).not.toBeNull();
    expect(container.querySelector('[data-testid="body"]')).not.toBeNull();
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Dismiss deck");
    click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    { desktop: true, layout: "horizontal" },
    { desktop: false, layout: "vertical" },
  ])(
    "lays a companion out $layout when desktop is $desktop",
    ({ desktop, layout }) => {
      stubMatchMedia(desktop);
      const { container } = renderInCumulus(
        <GlassDialog
          title={"Help"}
          presentation="popup"
          companion={<div data-testid="companion">card</div>}
          onClose={() => {}}
        >
          <div>instruction</div>
        </GlassDialog>,
      );
      expect(
        container.querySelector<HTMLElement>(
          "[data-glass-dialog-companion-layout]",
        )?.dataset.glassDialogCompanionLayout,
      ).toBe(layout);
      expect(
        container.querySelector(
          '[data-glass-dialog-companion] [data-testid="companion"]',
        ),
      ).not.toBeNull();
    },
  );

  it("floats the close disc in body flow without a header", () => {
    const { container } = renderInCumulus(
      <GlassDialog
        title={"Help"}
        presentation="popup"
        chrome="flowing-close"
        onClose={() => {}}
      >
        <p>Two paragraphs</p>
      </GlassDialog>,
    );
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const flowingClose = container.querySelector(
      "[data-glass-dialog-flowing-close]",
    );
    expect(dialog?.getAttribute("aria-label")).toBe("Help");
    expect(dialog?.querySelector("header")).toBeNull();
    expect(
      container.querySelector("[data-glass-dialog-body]")?.firstElementChild,
    ).toBe(flowingClose);
    expect(flowingClose?.querySelector("button")).not.toBeNull();
  });

  it("centers a desktop panel within the measured battlefield", () => {
    stubMatchMedia(true);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    const battlefield = document.createElement("main");
    battlefield.dataset.battleMobile = "";
    battlefield.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 1080,
        bottom: 900,
        width: 1080,
        height: 900,
      }) as DOMRect;
    document.body.append(battlefield);

    const { container } = renderInCumulus(
      <GlassDialog title={"Foresee 2"} desktopCenterTarget="battlefield">
        <div>content</div>
      </GlassDialog>,
    );
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.style.position).toBe("fixed");
    // The 360px measured beyond the battlefield's right edge is reserved.
    expect(dialog?.style.paddingRight).toContain("360px");
    battlefield.remove();
  });

  it("moves the one close control beside an injected display cutout", () => {
    const onClose = vi.fn();
    const dialog = (
      <GlassDialog title={"Title"} onClose={onClose} cutoutAwareClose>
        <div>content</div>
      </GlassDialog>
    );
    const plain = renderInCumulus(dialog);
    expect(plain.container.querySelector("header button")).not.toBeNull();
    expect(plain.container.querySelectorAll("button")).toHaveLength(1);
    plain.unmount();

    vi.mocked(hasInjectedDisplayCutout).mockReturnValue(true);
    const { container } = renderInCumulus(dialog);
    expect(container.querySelector("header button")).toBeNull();
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.parentElement?.style.position).toBe("absolute");
    click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
