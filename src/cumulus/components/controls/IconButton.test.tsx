// @vitest-environment jsdom

import { assertLocalized } from "@trox/runtime";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { GLYPHS } from "../../primitives/glyph";
import { CumulusRoot } from "../../CumulusRoot";

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("IconButton", () => {
  it("renders an accessible button labelled by `label`, carrying the glyph class", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label={assertLocalized("Close deck")}
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Close deck");
    // The disc shows only its glyph — the close mark (`bx bx-x`).
    expect(button?.querySelector("i.bx-x")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("superimposes a smaller filled overlay glyph within the primary glyph", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.refresh}
        overlayGlyph={GLYPHS.bug}
        label={assertLocalized("Reroll offers")}
        onPress={() => {}}
      />,
    );

    const stack = container.querySelector("[data-icon-button-glyph-stack]");
    expect(stack?.querySelector("i.bxf.bx-refresh-cw")).not.toBeNull();
    expect(stack?.querySelector("i.bxf.bx-bug")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("uses the lighter tonal-lens treatment when placed on glass", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label={assertLocalized("Close")}
        placement="onGlass"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassPlacement).toBe("onGlass");

    act(() => {
      root.unmount();
    });
  });

  it("fires `onPress` on click", () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label={assertLocalized("Close")}
        onPress={onPress}
      />,
    );

    act(() => {
      container.querySelector("button")?.click();
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('while disabled sets aria-disabled="true" and does not fire onPress', () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label={assertLocalized("Close")}
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

    act(() => {
      root.unmount();
    });
  });
});
