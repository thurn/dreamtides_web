import { assertLocalized } from "@trox/runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TroxLocalizationProvider } from "../../../runtime/localization/context";
import { GLYPHS } from "../../primitives/glyph";
import {
  GLYPH_CONTENT_PROTECTION_FILTER,
  StandaloneGlyph,
} from "./StandaloneGlyph";

function renderLocalizedToStaticMarkup(node: ReactNode): string {
  return renderToStaticMarkup(
    <TroxLocalizationProvider>{node}</TroxLocalizationProvider>,
  );
}

describe("StandaloneGlyph", () => {
  it("fills a centered one-em square owned by the surrounding layout", () => {
    const markup = renderLocalizedToStaticMarkup(
      <StandaloneGlyph glyph={GLYPHS.points} color="text-primary" />,
    );

    expect(markup).toContain('class="bxf bx-star-circle"');
    expect(markup).toContain(
      "display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;font-size:1em;line-height:1",
    );
    expect(markup).not.toContain("vertical-align");
    expect(markup).not.toContain("translateY");
  });

  it("applies content-protection depth without exposing a general glow", () => {
    const markup = renderLocalizedToStaticMarkup(
      <StandaloneGlyph
        glyph={GLYPHS.spark}
        color="spark"
        depth="content-protection"
      />,
    );

    expect(markup).toContain(`filter:${GLYPH_CONTENT_PROTECTION_FILTER}`);
  });

  it("uses an explicit label or hides a decorative mark", () => {
    const labeled = renderLocalizedToStaticMarkup(
      <StandaloneGlyph
        glyph={GLYPHS.bolt}
        color="text-primary"
        label={assertLocalized("Fast")}
      />,
    );
    const decorative = renderLocalizedToStaticMarkup(
      <StandaloneGlyph glyph={GLYPHS.bolt} color="text-primary" />,
    );

    expect(labeled).toContain('role="img" aria-label="Fast"');
    expect(decorative).toContain('aria-hidden="true"');
  });
});
