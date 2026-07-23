import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichTextView, richText } from "./rich-text";

describe("RichText", () => {
  it("renders underlined runs inside continuous inline prose", () => {
    const markup = renderToStaticMarkup(
      <RichTextView
        value={richText.inline(
          richText.plain("Gain "),
          richText.underline("Rainbow Horn"),
          richText.plain("."),
        )}
      />,
    );

    expect(markup).toBe(
      '<span>Gain </span><span style="text-decoration:underline">Rainbow Horn</span><span>.</span>',
    );
  });

  it("keeps glossary labels and definitions in compact monochrome rows", () => {
    const markup = renderToStaticMarkup(
      <RichTextView
        value={richText.definitions([
          {
            term: "Bane",
            definition: "A penalty card forced into your deck.",
          },
          {
            term: "Discover",
            definition: "Reveal three matching cards and choose one to draw.",
          },
        ])}
      />,
    );

    expect(markup).toContain("<dl");
    expect(markup).toContain(
      '<dl style="display:flex;flex-direction:column;gap:var(--space-4);margin:0;color:var(--text-primary);line-height:1.25">',
    );
    expect(markup).toContain(
      '<dt style="display:inline;font-weight:700">Bane</dt>',
    );
    expect(markup).toContain(
      '<dt style="display:inline;font-weight:700">Discover</dt>',
    );
    expect(markup).toContain(": A penalty card forced into your deck.");
    expect(markup).not.toContain("--cv-rules-highlight-color");
    expect(markup).not.toContain("data-rules-text-paragraph");
  });
});
