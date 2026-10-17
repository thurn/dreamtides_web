// @vitest-environment jsdom
// D97MenuPanel contract: Resume and Escape close it, and closing returns
// focus to the control that opened it.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { D97MenuPanel } from "./D97MenuPanel";

describe("D97MenuPanel", () => {
  it("closes on Resume and on Escape", () => {
    const onClose = vi.fn();
    const { container } = renderInCumulus(<D97MenuPanel onClose={onClose} />);
    act(() => container.ownerDocument.querySelector<HTMLElement>('[data-testid="d97-menu-resume"]')?.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("returns focus to its opener when it closes", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = renderInCumulus(<D97MenuPanel onClose={() => undefined} />);
    (document.activeElement as HTMLElement | null)?.blur();
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
