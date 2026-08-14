import { assertLocalized } from "@trox/runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TroxLocalizationProvider } from "../../../runtime/localization/context";
import { requireSourceRuntime } from "../../../runtime/localization/runtime";
import { renderRichText, richText } from "./rich-text";

function renderValue(value: ReturnType<typeof richText.plain>): string {
  const runtime = requireSourceRuntime();
  return renderToStaticMarkup(
    <TroxLocalizationProvider runtime={runtime}>
      {renderRichText(value, (message) => runtime.localizer.resolve(message))}
    </TroxLocalizationProvider>,
  );
}

describe("RichText", () => {
  it("keeps glossary labels and definitions in compact monochrome rows", () => {
    const markup = renderValue(
      richText.definitions([
        {
          term: assertLocalized("Bane"),
          definition: assertLocalized(
            "The Nightmare card, a penalty card forced into your deck.",
          ),
        },
        {
          term: assertLocalized("Discover"),
          definition: assertLocalized(
            "Reveal three matching cards and choose one to draw.",
          ),
        },
      ]),
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
    expect(markup).toContain(
      ": The Nightmare card, a penalty card forced into your deck.",
    );
    expect(markup.match(/data-definition-divider=""/g)).toHaveLength(1);
    expect(markup).toContain(
      "margin:var(--space-s) auto;background:var(--border-strong)",
    );
    expect(markup).not.toContain("--cv-rules-highlight-color");
    expect(markup).not.toContain("data-rules-text-paragraph");
  });

  it("renders the defined timing and cost symbols beside their glossary labels", () => {
    const markup = renderValue(
      richText.definitions([
        {
          term: assertLocalized("Fast"),
          definition: assertLocalized("Fast definition."),
          symbol: "fast",
        },
        {
          term: assertLocalized("Interrupt"),
          definition: assertLocalized("Interrupt definition."),
          symbol: "interrupt",
        },
        {
          term: assertLocalized("Exhaust Cost"),
          definition: assertLocalized("Exhaust definition."),
          symbol: "exhaust",
          termPresentation: "symbolOnly",
        },
        {
          term: assertLocalized("Night"),
          definition: assertLocalized("Night definition."),
          symbol: "trigger",
        },
      ]),
    );

    expect(markup.match(/bxf bx-bolt/g)).toHaveLength(3);
    expect(markup.match(/bxf bx-moon/g)).toHaveLength(1);
    expect(markup).not.toContain("bxf bx-caret-right");
    expect(markup).toContain(
      '<span data-definition-symbol="trigger" style="display:inline">▸</span>Night',
    );
    expect(markup).toContain('data-definition-symbol="fast"');
    expect(markup).toContain('data-definition-symbol="interrupt"');
    expect(markup).toContain('data-definition-symbol="exhaust"');
    expect(markup).toContain('data-definition-symbol="trigger"');
    expect(markup).not.toContain(">Exhaust Cost</dt>");
    expect(markup).toContain('role="img" aria-label="Exhaust Cost"');
  });

  it("renders rules symbols inside glossary definitions as Boxicons", () => {
    const markup = renderValue(
      richText.definitions([
        {
          term: assertLocalized("Exhaust Cost"),
          definition: assertLocalized(
            "You may exhaust (☾) this character to activate this ability.",
          ),
          symbol: "exhaust",
          termPresentation: "symbolOnly",
        },
      ]),
    );

    expect(markup.match(/bxf bx-moon/g)).toHaveLength(2);
    expect(markup).not.toContain("☾");
  });
  it("renders the points symbol inside glossary definitions as a Boxicon", () => {
    const markup = renderValue(
      richText.definitions([
        {
          term: assertLocalized("Points"),
          definition: assertLocalized("The ⍟ symbol represents points."),
        },
      ]),
    );

    expect(markup).toContain("bxf bx-star-circle");
    expect(markup).not.toContain("⍟");
  });

  it("renders definition-only rows without a label or colon", () => {
    const markup = renderValue(
      richText.definitions([
        {
          term: assertLocalized("Points"),
          definition: assertLocalized(
            "Characters score points (⍟) when they challenge and are not blocked.",
          ),
          termPresentation: "definitionOnly",
        },
      ]),
    );

    expect(markup).not.toContain("<dt");
    expect(markup).not.toContain("Points:");
    expect(markup).not.toContain(": Characters score points");
    expect(markup).toContain("<span>Characters score points </span>");
    expect(markup).toContain('aria-label="points"');
  });
});
