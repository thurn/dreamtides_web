// InfoCard's public surface is visual content only.

import * as React from "react";
import { renderToStaticMarkup as renderReactToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import { richText } from "../card/rich-text";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { TOKENS } from "../../primitives/tokens";
import {
  InfoCard,
  EditableInfoCard,
  INFO_CARD_WIDTH,
  infoCardNativeWidth,
  infoCardTextScale,
  infoCardWidth,
} from "./InfoCard";
import { TroxLocalizationProvider } from "../../../runtime/localization/context";

function renderToStaticMarkup(node: React.ReactNode): string {
  return renderReactToStaticMarkup(
    React.createElement(TroxLocalizationProvider, null, node),
  );
}

const SUBSTITUTED_RULES_SYMBOL_PATTERN = /[●✦⍏⍟☾⧗❖]/u;

describe("infoCardWidth — the viewport-driven mobile width", () => {
  it("lays a card out at ~45% of a narrow (mobile) screen", () => {
    // On a phone the native card is wider than 45% of the screen, so it narrows.
    const screenW = 390;
    const width = infoCardWidth(screenW);
    expect(width).toBeCloseTo(0.45 * screenW, 5);
    expect(width).toBeLessThan(INFO_CARD_WIDTH);
  });

  it("lets two mobile cards sit side by side within a phone screen", () => {
    const screenW = 360;
    const pairWidth = infoCardWidth(screenW) * 2 + 10;
    expect(pairWidth).toBeLessThan(screenW);
  });

  it("caps at native size on a wide (desktop) screen", () => {
    // 45% of a desktop viewport exceeds the native width.
    expect(infoCardWidth(1440)).toBe(INFO_CARD_WIDTH);
    expect(infoCardWidth(768)).toBe(INFO_CARD_WIDTH);
  });

  it("returns native width for a zero / unmeasured viewport width", () => {
    expect(infoCardWidth(0)).toBe(INFO_CARD_WIDTH);
    expect(infoCardWidth(-100)).toBe(INFO_CARD_WIDTH);
  });

  it("publishes the wider atlas reveal geometry to placement consumers", () => {
    expect(infoCardNativeWidth("text")).toBe(INFO_CARD_WIDTH);
    expect(infoCardNativeWidth(undefined)).toBe(INFO_CARD_WIDTH);
    expect(infoCardNativeWidth("atlasReveal")).toBe(360);
  });
});

describe("infoCardTextScale — the shared mobile typography multiplier", () => {
  it("keeps mobile body copy at a legible 12px while preserving the 45% card width", () => {
    const mobileScale = infoCardTextScale(390);

    expect(mobileScale).toBe(0.86);
    expect(14 * mobileScale).toBeGreaterThanOrEqual(12);
    expect(infoCardWidth(390)).toBeCloseTo(0.45 * 390, 5);
    expect(infoCardTextScale(1440)).toBe(1);
  });
});

describe("InfoCard shell treatment", () => {
  it("wraps an unbroken icon title within the narrow mobile flex slot", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, {
        variant: "icon",
        glyph: GLYPHS.copy,
        title: "X".repeat(40),
      }),
    );

    expect(html).toContain("min-width:0");
    expect(html).toContain("overflow-wrap:anywhere");
  });

  it("uses the shared liquid-glass material at the fixed fill opacity", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, { title: "Essence" }),
    );
    const glass = glassSurfaceStyle();

    expect(html).toContain(TOKENS["--glass-fill-popover"].var);
    expect(html).toContain("Essence");
    expect(html).not.toContain('aria-label="essence"');
    expect(html).toContain(
      `-webkit-backdrop-filter:${String(glass.WebkitBackdropFilter)}`,
    );
    expect(html).toContain(`backdrop-filter:${String(glass.backdropFilter)}`);
    expect(html).toContain(`box-shadow:${String(glass.boxShadow)}`);
  });

  it("gives body-only text cards even shell padding without an empty headline row", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, {
        variant: "text",
        body: richText.plain("Body only."),
      }),
    );

    expect(html).toContain("Body only.");
    expect(html).not.toContain("font-family:var(--font-title)");
  });

  it("renders the atlas reveal as an InfoCard variant with the shared glass fill", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, {
        variant: "atlasReveal",
        image: artRef.dreamscapeScene("wilderveil"),
        figure: artRef.dreamGuide("aldric"),
        title: "Wilderveil",
        subtitle: "Aldric, the Seer",
        body: richText.plain("Aldric offers curated visions of the future."),
      }),
    );

    expect(html).toContain("Wilderveil");
    expect(html).toContain("Aldric, the Seer");
    expect(html).toContain(TOKENS["--glass-fill-popover"].var);
    expect(html).toContain("width:360px");
  });

  it("keeps authoring controls inside the canonical title and body containers", () => {
    const field = {
      value: "Essence",
      draftValue: "Essence",
      isEditing: false,
      onBeginEdit: () => undefined,
      onDraftChange: () => undefined,
      onCancel: () => undefined,
      onSubmit: () => undefined,
      onBlur: () => undefined,
    };
    const html = renderToStaticMarkup(
      React.createElement(EditableInfoCard, {
        title: field,
        body: {
          ...field,
          value: "Currency carried through a journey.",
          draftValue: "Currency carried through a journey.",
        },
        bodyFormat: "plain",
      }),
    );

    expect(html).toContain('data-editable-info-card=""');
    expect(html).toContain('data-editor-field="title"');
    expect(html).toContain('data-editor-field="description"');
    expect(html).toContain("Currency carried through a journey.");
    expect(html).toContain(TOKENS["--glass-fill-popover"].var);
  });

  it("renders canonical rules symbols across every textual field and RichText shape", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, {
        variant: "text",
        title: "Costs 2● and grants 1✦",
        subtitle: "Gain ⍏3, 4⍟, pay ☾, and store 1⧗",
        body: richText.stack(
          richText.plain("▸Dawn"),
          richText.underline("❖ Fast"),
          richText.note("❖❖ Interrupt"),
          richText.definitions([
            {
              term: "Reclaim 0●",
              definition: "Gain 1✦, 2⍟, and ⍏3.",
            },
          ]),
        ),
      }),
    );

    expect(html).not.toMatch(SUBSTITUTED_RULES_SYMBOL_PATTERN);
    expect(html).toContain("<span>▸</span><span>Dawn</span>");
    expect(html.match(/aria-label="[^"]+"/g)?.length).toBeGreaterThanOrEqual(9);
    expect(html).toContain("bxf bx-fire-alt");
    expect(html).toContain("bxf bx-star-circle");
    expect(html).toContain("bxf bx-moon");
    expect(html).toContain("bxf bx-brain");
    expect(html).not.toContain("bxf bx-caret-right");
    expect(html).toContain("bxf bx-bolt");
  });

  it("keeps canonical symbol rendering at the boundary for image-backed InfoCard fields", () => {
    const fullBleed = renderToStaticMarkup(
      React.createElement(InfoCard, {
        variant: "fullBleed",
        image: artRef.dreamscapeScene("wilderveil"),
        title: "Gain 1● and score 2⍟",
        subtitle: "Store 1⧗",
        body: richText.plain("Pay ☾."),
      }),
    );
    const atlasReveal = renderToStaticMarkup(
      React.createElement(InfoCard, {
        variant: "atlasReveal",
        image: artRef.dreamscapeScene("wilderveil"),
        title: "▸Dawn",
        subtitle: "❖ Fast",
        body: richText.plain("Gain 1✦."),
      }),
    );

    expect(fullBleed).not.toMatch(SUBSTITUTED_RULES_SYMBOL_PATTERN);
    expect(atlasReveal).not.toMatch(SUBSTITUTED_RULES_SYMBOL_PATTERN);
    expect(
      fullBleed.match(/aria-label="[^"]+"/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(atlasReveal).toContain("<span>▸</span><span>Dawn</span>");
    expect(atlasReveal).not.toContain("bxf bx-caret-right");
    expect(
      atlasReveal.match(/aria-label="[^"]+"/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("InfoCard public API", () => {
  it("exposes only a renderable visual component without interaction statics", () => {
    expect(Object.keys(InfoCard)).toEqual([]);
  });
});
