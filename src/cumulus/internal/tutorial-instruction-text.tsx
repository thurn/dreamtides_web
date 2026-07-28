import { Fragment, type ReactElement, type ReactNode } from "react";
import {
  parseTutorialInstructionMarkup,
  type TutorialInstructionParagraph,
} from "../../data/tutorial-instruction-markup";
import {
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
} from "../components/controls/GlowIcon";
import { InlineGlyph } from "../components/typography/InlineGlyph";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";

const inlineIconStyle = {
  whiteSpace: "nowrap",
} as const;

const parenthesizedIconStyle = {
  whiteSpace: "nowrap",
} as const;

function renderInstructionText(instruction: string): ReactElement {
  const parts = instruction.split(
    /(\b(?:points|spark)\s+\(\s*[⍟✦]\s*\)|\(\s*[⍟✦●]\s*\)|\d+\s*⍟|[⍟✦●])/giu,
  );

  return (
    <>
      {parts.map((part, index) => {
        const resourceTerm =
          /^(points|spark)\s+\(\s*([⍟✦])\s*\)$/iu.exec(part);
        if (resourceTerm !== null) {
          const points = resourceTerm[2] === "⍟";
          return (
            <span
              key={index}
              {...(points
                ? { "data-tutorial-how-to-play-points-term": "" }
                : { "data-tutorial-how-to-play-spark-term": "" })}
              style={parenthesizedIconStyle}
            >
              {resourceTerm[1]} (
              <InlineGlyph
                glyph={points ? GLYPHS.points : GLYPHS.sparkInline}
                color={points ? "text-primary" : "spark"}
              />
              )
            </span>
          );
        }

        const compact = part.replace(/\s/gu, "");
        if (compact === "(⍟)" || compact === "(✦)" || compact === "(●)") {
          if (compact === "(●)") {
            return (
              <span
                key={index}
                data-tutorial-how-to-play-energy-term=""
                style={parenthesizedIconStyle}
              >
                (
                <InlineGlyph
                  glyph={ENERGY_ICON_CLASS}
                  color={ENERGY_ICON_COLOR}
                  label="energy"
                />
                )
              </span>
            );
          }
          const points = compact === "(⍟)";
          return (
            <span
              key={index}
              {...(points
                ? { "data-tutorial-how-to-play-points-term": "" }
                : { "data-tutorial-how-to-play-spark-term": "" })}
              style={parenthesizedIconStyle}
            >
              (
              <InlineGlyph
                glyph={points ? GLYPHS.points : GLYPHS.sparkInline}
                color={points ? "text-primary" : "spark"}
              />
              )
            </span>
          );
        }

        const pointsValue = /^(\d+)(\s*)⍟$/u.exec(part);
        if (pointsValue !== null) {
          return (
            <span key={index} style={inlineIconStyle}>
              {pointsValue[1]}
              {pointsValue[2] === "" ? null : " "}
              <InlineGlyph
                glyph={GLYPHS.points}
                color="text-primary"
                label="points"
              />
            </span>
          );
        }

        if (part === "⍟" || part === "✦") {
          const points = part === "⍟";
          return (
            <InlineGlyph
              key={index}
              glyph={points ? GLYPHS.points : GLYPHS.sparkInline}
              color={points ? "text-primary" : "spark"}
              label={points ? "points" : "spark"}
            />
          );
        }

        if (part === "●") {
          return (
            <InlineGlyph
              key={index}
              glyph={ENERGY_ICON_CLASS}
              color={ENERGY_ICON_COLOR}
              label="energy"
            />
          );
        }

        return part;
      })}
    </>
  );
}

export function renderTutorialInstructionParagraph(
  paragraph: TutorialInstructionParagraph,
): ReactElement {
  return (
    <>
      {paragraph.spans.map((span, index) =>
        span.highlight !== undefined ? (
          <span
            key={index}
            data-tutorial-instruction-highlight={span.highlight}
            style={{
              color: token(
                span.highlight === "purple" ? "--accent-bright" : "--spark",
              ),
            }}
          >
            {renderInstructionText(span.text)}
          </span>
        ) : (
          <span key={index}>{renderInstructionText(span.text)}</span>
        ),
      )}
    </>
  );
}

export function renderTutorialInstructionText(text: string): ReactNode {
  return parseTutorialInstructionMarkup(text).map((paragraph, index) => (
    <Fragment key={index}>
      {index === 0 ? null : "\n\n"}
      {renderTutorialInstructionParagraph(paragraph)}
    </Fragment>
  ));
}
