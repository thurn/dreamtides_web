import { Fragment, type ReactElement, type ReactNode } from "react";
import {
  parseTutorialInstructionMarkup,
  type TutorialInstructionParagraph,
} from "../../data/tutorial-instruction-markup";
import {
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  GlowIcon,
} from "../components/controls/GlowIcon";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";

const inlineIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  columnGap: token("--space-2"),
  whiteSpace: "nowrap",
} as const;

const parenthesizedIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
} as const;

const inlineEnergyIconStyle = {
  display: "inline-flex",
  width: "1em",
  height: "1em",
  verticalAlign: "middle",
  transform: "translateY(-0.08em)",
} as const;

function renderInstructionText(instruction: string): ReactElement {
  const parts = instruction.split(
    /(\b(?:points|spark)\s+\(\s*[⍟✦]\s*\)|\(\s*[⍟✦●]\s*\)|\d+\s+⍟|[⍟✦●])/giu,
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
              <GlowIcon
                iconClass={points ? GLYPHS.points : GLYPHS.sparkInline}
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
                <span style={inlineEnergyIconStyle}>
                  <GlowIcon
                    iconClass={ENERGY_ICON_CLASS}
                    color={ENERGY_ICON_COLOR}
                    title="energy"
                  />
                </span>
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
              <GlowIcon
                iconClass={points ? GLYPHS.points : GLYPHS.sparkInline}
                color={points ? "text-primary" : "spark"}
              />
              )
            </span>
          );
        }

        const pointsValue = /^(\d+)\s+⍟$/u.exec(part);
        if (pointsValue !== null) {
          return (
            <span key={index} style={inlineIconStyle}>
              {pointsValue[1]}
              <GlowIcon
                iconClass={GLYPHS.points}
                color="text-primary"
                title="points"
              />
            </span>
          );
        }

        if (part === "⍟" || part === "✦") {
          const points = part === "⍟";
          return (
            <span key={index} style={parenthesizedIconStyle}>
              <GlowIcon
                iconClass={points ? GLYPHS.points : GLYPHS.sparkInline}
                color={points ? "text-primary" : "spark"}
                title={points ? "points" : "spark"}
              />
            </span>
          );
        }

        if (part === "●") {
          return (
            <span key={index} style={inlineEnergyIconStyle}>
              <GlowIcon
                iconClass={ENERGY_ICON_CLASS}
                color={ENERGY_ICON_COLOR}
                title="energy"
              />
            </span>
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
        span.highlight === "yellow" ? (
          <span
            key={index}
            data-tutorial-instruction-highlight="yellow"
            style={{ color: token("--spark") }}
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
