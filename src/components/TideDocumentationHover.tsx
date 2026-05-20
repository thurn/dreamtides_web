import type { ReactNode } from "react";
import { HoverPopover } from "./HoverPopover";
import {
  getTideDocumentation,
  type TideDocumentation,
} from "../data/tide-docs";
import type { PackageTideId } from "../types/content";

interface TideDocumentationHoverProps {
  tideId: PackageTideId;
  children: ReactNode;
  className?: string;
}

export function TideDocumentationHover({
  tideId,
  children,
  className,
}: TideDocumentationHoverProps) {
  const documentation = getTideDocumentation(tideId);

  if (documentation === null) {
    return <span className={className}>{children}</span>;
  }

  return (
    <HoverPopover
      delayMs={250}
      placement="top"
      maxWidthPx={null}
      className={className}
      style={{
        cursor: "help",
        textDecoration: "underline dotted",
        textUnderlineOffset: 2,
      }}
      content={<TideDocumentationCard documentation={documentation} />}
    >
      <span data-tide-doc-trigger={tideId}>{children}</span>
    </HoverPopover>
  );
}

function TideDocumentationCard({
  documentation,
}: {
  documentation: TideDocumentation;
}) {
  return (
    <article
      data-tide-doc-popover={documentation.id}
      className="max-h-[min(560px,70vh)] w-[min(430px,calc(100vw-16px))] overflow-y-auto rounded-lg p-3 text-left text-xs leading-relaxed"
      style={{
        background:
          "linear-gradient(180deg, rgba(7, 10, 18, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)",
        border: "1px solid rgba(125, 211, 252, 0.34)",
        boxShadow: "0 18px 48px rgba(2, 6, 23, 0.58)",
        color: "#dbeafe",
      }}
    >
      {documentation.blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <h3
              key={index}
              className="mb-2 text-sm font-bold"
              style={{ color: "#f8fafc" }}
            >
              {renderInlineMarkdown(block.text)}
            </h3>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={index} className="mt-2 list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className={index === 1 ? "" : "mt-2"}>
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </article>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/u).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded px-1 py-0.5 text-[0.92em]"
          style={{
            background: "rgba(14, 165, 233, 0.14)",
            color: "#bae6fd",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={index}>{part}</span>;
  });
}
