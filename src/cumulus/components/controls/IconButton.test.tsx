// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("IconButton", () => {
  it("renders an accessible button labelled by `label`, carrying the glyph class", () => {
    const { container } = renderInCumulus(
      <IconButton
        glyph={GLYPHS.close}
        label={"Close deck"}
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Close deck");
    // The disc shows only its glyph — the close mark (`bx bx-x`).
    expect(button?.querySelector("i.bx-x")).not.toBeNull();
  });

  it("superimposes a smaller filled overlay glyph within the primary glyph", () => {
    const { container } = renderInCumulus(
      <IconButton
        glyph={GLYPHS.refresh}
        overlayGlyph={GLYPHS.bug}
        label={"Reroll offers"}
        onPress={() => {}}
      />,
    );

    const stack = container.querySelector("[data-icon-button-glyph-stack]");
    expect(stack?.querySelector("i.bxf.bx-refresh-cw")).not.toBeNull();
    expect(stack?.querySelector("i.bxf.bx-bug")).not.toBeNull();
  });

  it("uses the lighter tonal-lens treatment when placed on glass", () => {
    const { container } = renderInCumulus(
      <IconButton
        glyph={GLYPHS.close}
        label={"Close"}
        placement="onGlass"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassPlacement).toBe("onGlass");
  });

  it("fires `onPress` on click", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <IconButton glyph={GLYPHS.close} label={"Close"} onPress={onPress} />,
    );

    act(() => {
      container.querySelector("button")?.click();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('while disabled sets aria-disabled="true" and does not fire onPress', () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <IconButton
        glyph={GLYPHS.close}
        label={"Close"}
        onPress={onPress}
        disabled
      />,
    );

    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      button?.click();
    });
    expect(onPress).not.toHaveBeenCalled();
  });
});
