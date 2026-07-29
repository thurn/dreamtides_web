import { Fragment, type ReactElement, type ReactNode } from "react";
import {
  parseTutorialInstructionMarkup,
  type TutorialInstructionParagraph,
} from "../../data/tutorial-instruction-markup";
import { renderRulesSymbolsInline } from "../components/card/RulesText";
import { token } from "../primitives/tokens";

const parenthesizedIconStyle = {
  whiteSpace: "nowrap",
} as const;

function renderInstructionText(instruction: string): ReactElement {
  const parts = instruction.split(
    /(\b(?:points|spark)\s+\(\s*[⍟✦]\s*\)|\(\s*[⍟✦●]\s*\))/giu,
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
              {renderRulesSymbolsInline(part)}
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
                {renderRulesSymbolsInline(part)}
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
              {renderRulesSymbolsInline(part)}
            </span>
          );
        }

        return (
          <Fragment key={index}>{renderRulesSymbolsInline(part)}</Fragment>
        );
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
              fontWeight: span.highlight === "purple" ? 700 : undefined,
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
