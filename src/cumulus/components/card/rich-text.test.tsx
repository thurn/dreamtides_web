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
      '<dl style="display:flex;flex-direction:column;margin:0;color:var(--text-primary);line-height:1.25">',
    );
    expect(markup).toContain(
      '<dt style="display:inline;font-weight:700">Bane</dt>',
    );
    expect(markup).toContain(
      '<dt style="display:inline;font-weight:700">Discover</dt>',
    );
    expect(markup).toContain(": A penalty card forced into your deck.");
    expect(markup.match(/data-definition-divider=""/g)).toHaveLength(1);
    expect(markup).toContain(
      "margin:var(--space-4) auto;background:var(--border-glossary-definition)",
    );
    expect(markup).not.toContain("--cv-rules-highlight-color");
    expect(markup).not.toContain("data-rules-text-paragraph");
  });

  it("renders the defined timing and cost symbols beside their glossary labels", () => {
    const markup = renderToStaticMarkup(
      <RichTextView
        value={richText.definitions([
          { term: "Fast", definition: "Fast definition.", symbol: "fast" },
          {
            term: "Interrupt",
            definition: "Interrupt definition.",
            symbol: "interrupt",
          },
          {
            term: "Exhaust Cost",
            definition: "Exhaust definition.",
            symbol: "exhaust",
            termPresentation: "symbolOnly",
          },
          {
            term: "Night",
            definition: "Night definition.",
            symbol: "trigger",
          },
        ])}
      />,
    );

    expect(markup.match(/bxf bx-bolt/g)).toHaveLength(3);
    expect(markup.match(/bxf bx-moon/g)).toHaveLength(1);
    expect(markup.match(/bxf bx-caret-right/g)).toHaveLength(1);
    expect(markup).toContain('data-definition-symbol="fast"');
    expect(markup).toContain('data-definition-symbol="interrupt"');
    expect(markup).toContain('data-definition-symbol="exhaust"');
    expect(markup).toContain('data-definition-symbol="trigger"');
    expect(markup).not.toContain(">Exhaust Cost</dt>");
    expect(markup).toContain('role="img" aria-label="Exhaust Cost"');
  });

  it("renders rules symbols inside glossary definitions as Boxicons", () => {
    const markup = renderToStaticMarkup(
      <RichTextView
        value={richText.definitions([
          {
            term: "Exhaust Cost",
            definition:
              "You may exhaust (☪) this character to activate this ability.",
            symbol: "exhaust",
            termPresentation: "symbolOnly",
          },
        ])}
      />,
    );

    expect(markup.match(/bxf bx-moon/g)).toHaveLength(2);
    expect(markup).not.toContain("☪");
  });
});
