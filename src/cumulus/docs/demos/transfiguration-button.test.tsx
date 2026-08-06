// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/controls/TransfigurationButton", () => ({
  TransfigurationButton: ({ variant }: { variant: string }) => (
    <div data-transfiguration-button-variant={variant} />
  ),
}));

import { transfigurationButtonDemo } from "./transfiguration-button";

describe("TransfigurationButton documentation demo", () => {
  it("uses a responsive grid that collapses each variant to a full-width row", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const Demo = transfigurationButtonDemo.Component;

    act(() => root.render(<Demo />));

    const grid = container.querySelector<HTMLElement>(
      "[data-transfiguration-button-demo]",
    );

    expect(grid?.style.width).toBe("100%");
    expect(grid?.style.maxWidth).toBe("560px");
    expect(grid?.style.gridTemplateColumns).toBe(
      "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
    );
    expect(
      container.querySelectorAll("[data-transfiguration-button-variant]"),
    ).toHaveLength(4);

    act(() => root.unmount());
    container.remove();
  });
});
