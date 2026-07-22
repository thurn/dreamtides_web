// InfoCard's public surface is visual content only.

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { artRef } from "../../primitives/art";
import { richText } from "../card/rich-text";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { TOKENS } from "../../primitives/tokens";
import {
  InfoCard,
  INFO_CARD_WIDTH,
  infoCardTextScale,
  infoCardWidth,
} from "./InfoCard";

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
  it("uses the shared liquid-glass material at the fixed fill opacity", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, { title: "Essence" }),
    );
    const glass = glassSurfaceStyle();

    expect(html).toContain(TOKENS["--glass-fill-popover"].var);
    expect(html).toContain(
      `-webkit-backdrop-filter:${String(glass.WebkitBackdropFilter)}`,
    );
    expect(html).toContain(`backdrop-filter:${String(glass.backdropFilter)}`);
    expect(html).toContain(`box-shadow:${String(glass.boxShadow)}`);
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

  it("keeps named authoring wrappers inside the canonical title and body containers", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, {
        title: "Essence",
        body: richText.plain("Currency carried through a quest."),
        slots: {
          title: (_context, defaultNode) =>
            React.createElement("span", { "data-title-editor": "" }, defaultNode),
          body: (_context, defaultNode) =>
            React.createElement("span", { "data-body-editor": "" }, defaultNode),
        },
      }),
    );

    expect(html).toContain('data-title-editor=""');
    expect(html).toContain('data-body-editor=""');
    expect(html).toContain("Currency carried through a quest.");
    expect(html).toContain(TOKENS["--glass-fill-popover"].var);
  });
});


describe("InfoCard public API", () => {
  it("exposes only a renderable visual component without interaction statics", () => {
    expect(Object.keys(InfoCard)).toEqual([]);
  });
});
