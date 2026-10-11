// @vitest-environment jsdom

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { artRef } from "../../primitives/art";
import { renderInCumulus } from "../../testing/render";
import { richText } from "../card/rich-text";
import { testDreamscapeArtKey } from "../../../types/test-identities";
import {
  EditableInfoCard,
  INFO_CARD_WIDTH,
  InfoCard,
  infoCardNativeWidth,
  infoCardTextScale,
  infoCardWidth,
} from "./InfoCard";
import { stubMatchMedia } from "./overlay.fixtures";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(hasInjectedDisplayCutout).mockReturnValue(false);
  stubMatchMedia(false);
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
