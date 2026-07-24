import type { GlossaryEntry } from "../../../data/glossary";
import { useRevealSource } from "../../internal/reveal/context";
import { Pressable } from "../../primitives/Pressable";
import { revealEntityId } from "../../internal/reveal/identity";
import type { Glyph } from "../../primitives/glyph";

export interface GlossaryTermProps {
  /** Canonical glossary meaning owned by this inline source. */
  entry: GlossaryEntry;
  /** Authored word form preserved in the surrounding sentence. */
  text: string;
  /** Optional named glyph used in place of the authored text. */
  glyph?: Glyph;
  /** Optional emphasis inherited from the rules-text renderer. */
  emphasized?: boolean;
}

/** Stationary inline terminology that reveals its own strict definition card. */
export function GlossaryTerm({
  entry,
  text,
  glyph,
  emphasized = false,
}: GlossaryTermProps) {
  const binding = useRevealSource({
    identity: {
      entityType: "glossary-term",
      entityId: revealEntityId("glossary-term", entry.term),
    },
    spec: {
      primary: {
        kind: "infoCard",
        card: {
          variant: "text",
          title: entry.term,
          body: { kind: "rules", text: entry.definition },
        },
      },
      secondaries: [],
    },
    feedback: "stationary",
  });
  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      pressFeedback="stationary"
      tabIndex={0}
      data-glossary-term={entry.term}
      style={{
        ...binding.sourceProps.style,
        cursor: "default",
        color: emphasized
          ? "var(--cv-rules-highlight-color, #facc15)"
          : undefined,
      }}
    >
      {glyph === undefined ? text : (
        <i
          aria-label={text}
          className={`${glyph} align-middle`}
          style={{ transform: "translateY(-0.06em)" }}
        />
      )}
    </Pressable>
  );
}
