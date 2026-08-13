import { assertLocalized } from "@trox/runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TroxLocalizationProvider } from "../../../runtime/localization/context";
import { GLYPHS } from "../../primitives/glyph";
import { InlineGlyph } from "./InlineGlyph";

function renderLocalizedToStaticMarkup(node: ReactNode): string {
  return renderToStaticMarkup(
    <TroxLocalizationProvider>{node}</TroxLocalizationProvider>,
  );
}

describe("InlineGlyph", () => {
  it("centers a square em box on the surrounding font's capital height", () => {
    const markup = renderLocalizedToStaticMarkup(
      <InlineGlyph
        glyph={GLYPHS.points}
        color="text-primary"
        label={assertLocalized("points")}
      />,
    );

    expect(markup).toMatch(/^<span /);
    expect(markup).toContain('data-inline-glyph=""');
    expect(markup).toContain('role="img" aria-label="points"');
    expect(markup).toContain('data-inline-glyph-metric="" aria-hidden="true"');
    expect(markup).toContain(
      "display:inline-grid;place-items:center;width:1em;height:1em;font-size:1em;line-height:1;vertical-align:middle;transform:translateY(calc(0.5ex - 0.5cap))",
    );
    expect(markup).toContain(
      '<i class="bxf bx-star-circle" aria-hidden="true"',
    );
  });

  it("inherits color and hides a glyph already named by surrounding copy", () => {
    const markup = renderLocalizedToStaticMarkup(
      <InlineGlyph glyph={GLYPHS.sparkInline} />,
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("color:");
  });

  it("constrains the memory mark to the one-em metric box", () => {
    const markup = renderLocalizedToStaticMarkup(
      <InlineGlyph glyph={GLYPHS.memory} label={assertLocalized("memory")} />,
    );

    expect(markup).toContain('class="bxf bx-brain"');
    expect(markup).toContain("width:1em;font-size:1em;line-height:1");
  });
});
