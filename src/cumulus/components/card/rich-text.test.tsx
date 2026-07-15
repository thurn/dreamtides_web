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
});
