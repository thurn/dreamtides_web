import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GLYPHS } from "../../primitives/glyph";
import { InlineGlyph } from "./InlineGlyph";

describe("InlineGlyph", () => {
  it("centers a square em box on the surrounding font's x-height", () => {
    const markup = renderToStaticMarkup(
      <InlineGlyph glyph={GLYPHS.points} color="points" label="points" />,
    );

    expect(markup).toContain('data-inline-glyph=""');
    expect(markup).toContain('role="img" aria-label="points"');
    expect(markup).toContain(
      "display:inline-grid;place-items:center;width:1em;height:1em;font-size:1em;line-height:1;vertical-align:middle",
    );
    expect(markup).not.toContain("transform:");
  });

  it("inherits color and hides a glyph already named by surrounding copy", () => {
    const markup = renderToStaticMarkup(
      <InlineGlyph glyph={GLYPHS.sparkInline} />,
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("color:");
  });
});
