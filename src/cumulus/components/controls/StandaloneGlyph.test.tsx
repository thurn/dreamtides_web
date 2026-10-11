// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";
import { StandaloneGlyph } from "./StandaloneGlyph";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("StandaloneGlyph", () => {
  it("uses an explicit label or hides a decorative mark", () => {
    const { container } = renderInCumulus(
      <>
        <StandaloneGlyph
          glyph={GLYPHS.bolt}
          color="text-primary"
          label="Fast"
        />
        <StandaloneGlyph glyph={GLYPHS.bolt} color="text-primary" />
      </>,
    );
    expect(
      container.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toBe("Fast");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
