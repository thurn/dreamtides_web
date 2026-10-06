// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";
import { dreamsignViewFixture } from "../../test-helpers/dreamsign-fixture";
import { richText } from "../card/rich-text";
import { testDreamscapeArtKey } from "../../../types/test-identities";
import { CommandMenu, type CommandMenuItem } from "./CommandMenu";
import { DreamsignReplacementDialog } from "./DreamsignReplacementDialog";
import { GlassBackdrop, GlassDialog } from "./GlassDialog";
import { GlassPanel } from "./GlassPanel";
import {
  EditableInfoCard,
  INFO_CARD_WIDTH,
  InfoCard,
  infoCardNativeWidth,
  infoCardTextScale,
  infoCardWidth,
} from "./InfoCard";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

/** Every query matches when `desktop`, so `useIsDesktop` follows the flag. */
function stubMatchMedia(desktop: boolean): void {
  window.matchMedia = (media: string) => ({
    matches: desktop,
    media,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

function click(element: HTMLElement | null | undefined): void {
  act(() => element?.click());
}

function keydown(target: EventTarget | null | undefined, key: string): void {
  act(() => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

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

function commandActions(onLoad: () => void): readonly CommandMenuItem[] {
  return [
    {
      kind: "action",
      id: "save",
      label: "Save",
      glyph: GLYPHS.check,
      onCommand: () => undefined,
    },
    { kind: "divider", id: "divider" },
    {
      kind: "group",
      id: "more",
      label: "More",
      glyph: GLYPHS.chevronRight,
      actions: [
        {
          kind: "action",
          id: "load",
          label: "Load",
          glyph: GLYPHS.arrowRight,
          onCommand: onLoad,
        },
      ],
    },
  ];
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes(text),
  );
}

describe("CommandMenu", () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });

  it("opens app-chrome actions, dismisses on Escape, and invokes a submenu leaf", () => {
    const command = vi.fn();
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "appChrome",
          trigger: { glyph: GLYPHS.menu, label: "Open", corner: "topStart" },
          actions: commandActions(command),
        }}
      />,
    );
    const open = () =>
      click(document.querySelector<HTMLButtonElement>('[aria-label="Open"]'));
    open();
    expect(buttonWithText("Save")).toBeDefined();
    keydown(window, "Escape");
    expect(buttonWithText("Save")).toBeUndefined();
    open();
    click(buttonWithText("More"));
    click(buttonWithText("Load"));
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("presents narrow context commands in a root-level dialog", () => {
    stubMatchMedia(false);
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "context",
          title: "Card",
          actions: commandActions(() => undefined),
          anchor: { x: 12, y: 12 },
          onDismiss: () => undefined,
        }}
      />,
    );
    expect(document.querySelector('[role="dialog"]')?.parentElement).toBe(
      document.body,
    );
    expect(document.querySelector("[data-command-menu-context]")).toBeNull();
  });

  it("navigates a wide context menu by keyboard and dismisses on Escape", () => {
    const onDismiss = vi.fn();
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "context",
          title: "Card",
          subtitle: "Player",
          actions: commandActions(() => undefined),
          anchor: { x: 12, y: 12 },
          onDismiss,
        }}
      />,
    );
    expect(
      document.querySelector("[data-command-menu-context]")?.parentElement,
    ).toBe(document.body);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    keydown(menu, "ArrowDown");
    keydown(menu, "Enter");
    expect(buttonWithText("Load")).toBeDefined();
    keydown(menu, "Escape");
    keydown(menu, "Escape");
    expect(onDismiss).toHaveBeenCalled();
  });

  it("validates and commits signed whole-number field commands", () => {
    const onCommand = vi.fn<(value: number) => void>();
    const onDismiss = vi.fn();
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "context",
          title: "Card",
          actions: [
            {
              kind: "group",
              id: "spark",
              label: "Add Spark",
              glyph: GLYPHS.edit,
              actions: [
                {
                  kind: "signed-integer",
                  id: "spark-amount",
                  label: "Amount",
                  placeholder: "+3 or -2",
                  commitLabel: "Apply",
                  onCommand,
                },
              ],
            },
          ],
          anchor: { x: 12, y: 12 },
          onDismiss,
        }}
      />,
    );
    click(buttonWithText("Add Spark"));
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="command-menu-signed-integer-input"]',
    );
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    const submit = (value: string) => {
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
        buttonWithText("Apply")?.click();
      });
    };
    submit("1.5");
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    submit("-4");
    expect(onCommand).toHaveBeenCalledWith(-4);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

const RAW_RULES_SYMBOL = /[●✦⍏⍟☾⧗❖]/u;

function ariaLabelCount(html: string): number {
  return html.match(/aria-label="[^"]+"/g)?.length ?? 0;
}

describe("InfoCard", () => {
  it("narrows to 45% of a phone screen and caps at native width", () => {
    expect(infoCardWidth(390)).toBeCloseTo(0.45 * 390, 5);
    expect(infoCardWidth(390)).toBeLessThan(INFO_CARD_WIDTH);
    expect(infoCardWidth(360) * 2 + 10).toBeLessThan(360);
    expect(infoCardWidth(768)).toBe(INFO_CARD_WIDTH);
    expect(infoCardWidth(0)).toBe(INFO_CARD_WIDTH);
    expect(infoCardWidth(-100)).toBe(INFO_CARD_WIDTH);
    expect(infoCardNativeWidth(undefined)).toBe(INFO_CARD_WIDTH);
    expect(infoCardNativeWidth("atlasReveal")).toBeGreaterThan(INFO_CARD_WIDTH);
  });

  it("keeps mobile 14px body copy at least 12px and desktop unscaled", () => {
    expect(14 * infoCardTextScale(390)).toBeGreaterThanOrEqual(12);
    expect(infoCardTextScale(1440)).toBe(1);
  });

  it("keeps authoring controls inside the canonical title and body fields", () => {
    const noop = () => undefined;
    const field = {
      value: "Title",
      draftValue: "Title",
      isEditing: false,
      onBeginEdit: noop,
      onDraftChange: noop,
      onCancel: noop,
      onSubmit: noop,
      onBlur: noop,
    };
    const { container } = renderInCumulus(
      <EditableInfoCard title={field} body={field} bodyFormat="plain" />,
    );
    const card = container.querySelector("[data-editable-info-card]");
    for (const name of ["title", "description"]) {
      expect(
        card?.querySelector(`[data-editor-field="${name}"]`),
      ).not.toBeNull();
    }
  });

  it("replaces rules symbols with labeled icons in every textual field", () => {
    const image = artRef.dreamscapeScene(testDreamscapeArtKey("wilderveil"));
    const html = (node: ReactElement) =>
      renderInCumulus(node).container.innerHTML;
    const text = html(
      <InfoCard
        variant="text"
        title={"Costs 2● and grants 1✦"}
        subtitle={"Gain ⍏3, 4⍟, pay ☾, and store 1⧗"}
        body={richText.stack(
          richText.plain("▸Dawn"),
          richText.note("❖❖ Interrupt"),
          richText.definitions([
            { term: "Reclaim 0●", definition: "Gain 1✦, 2⍟, and ⍏3." },
          ]),
        )}
      />,
    );
    const imageBacked = html(
      <InfoCard
        variant="atlasReveal"
        image={image}
        title={"Gain 1● and score 2⍟"}
        subtitle={"Store 1⧗"}
        body={richText.plain("Pay ☾.")}
      />,
    );

    expect(text).not.toMatch(RAW_RULES_SYMBOL);
    expect(imageBacked).not.toMatch(RAW_RULES_SYMBOL);
    expect(ariaLabelCount(text)).toBeGreaterThanOrEqual(9);
    expect(ariaLabelCount(imageBacked)).toBeGreaterThanOrEqual(4);
  });
});

describe("DreamsignReplacementDialog", () => {
  it("routes replacement by UUID and both dismissal controls through one intent", () => {
    const incoming = dreamsignViewFixture({
      idSeed: "10000000-0000-4000-8000-000000000001",
      name: "Incoming",
    });
    const held = [1, 2].map((index) =>
      dreamsignViewFixture({
        idSeed: `20000000-0000-4000-8000-00000000000${String(index)}`,
        name: "Held",
      }),
    );
    const onDreamsignPress = vi.fn();
    const onDismiss = vi.fn();
    const { container } = renderInCumulus(
      <DreamsignReplacementDialog
        model={{
          incoming,
          held,
          capacity: 2,
          dismissLabel: "Dismiss",
          closeLabel: "Close",
        }}
        onDreamsignPress={onDreamsignPress}
        onDismiss={onDismiss}
      />,
    );
    expect(container.querySelectorAll("[data-reveal-entity-id]")).toHaveLength(
      3,
    );
    click(
      container.querySelector<HTMLButtonElement>(
        `[data-replace-dreamsign-id="${held[1].id}"] button`,
      ),
    );
    expect(onDreamsignPress).toHaveBeenCalledWith(held[1].id);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    click(buttons[0]);
    click(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
