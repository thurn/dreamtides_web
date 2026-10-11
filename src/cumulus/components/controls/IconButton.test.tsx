// @vitest-environment jsdom

// IconButton and MainMenuButton: presses and disabled presses.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";
import { IconButton } from "./IconButton";
import { MainMenuButton } from "./MainMenuButton";
import { click } from "./controls.fixtures";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("IconButton and MainMenuButton", () => {
  it("fire onPress and block disabled presses", () => {
    const onIcon = vi.fn();
    const onMenu = vi.fn();
    const { container, rerender } = renderInCumulus(
      <>
        <IconButton glyph={GLYPHS.close} label="Close" onPress={onIcon} />
        <MainMenuButton label="Menu" onPress={onMenu} />
      </>,
    );
    const [icon, menu] = container.querySelectorAll("button");
    expect(icon?.getAttribute("aria-label")).toBe("Close");
    click(icon);
    click(menu);
    expect(onIcon).toHaveBeenCalledOnce();
    expect(onMenu).toHaveBeenCalledOnce();

    rerender(
      <IconButton
        glyph={GLYPHS.close}
        label="Close"
        onPress={onIcon}
        disabled
      />,
    );
    const disabled = container.querySelector("button");
    expect(disabled?.getAttribute("aria-disabled")).toBe("true");
    click(disabled);
    expect(onIcon).toHaveBeenCalledOnce();
  });
});
