// DreamsignName — the inline, text-only Dreamsign entity. It keeps the visible
// surface to the underlined authored name while revealing the same primary
// Dreamsign InfoCard and ordered glossary definitions as Dreamsign artwork.

import * as React from "react";
import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { dreamsignRevealSpec } from "./Dreamsign";

export interface DreamsignNameProps {
  /** The UUID-identified Dreamsign whose authored name is shown. */
  dreamsign: DreamsignData;
  /** Optional stable selector for focused screen tests. */
  testId?: string;
}

/**
 * An underlined Dreamsign name that reveals the Dreamsign's object InfoCard and
 * any glossary definitions referenced by its effect text.
 */
export function DreamsignName({
  dreamsign,
  testId = "dreamsign-name",
}: DreamsignNameProps): React.ReactElement {
  const dreamsignId = requireDreamsignId(dreamsign, "Dreamsign name");
  const binding = useRevealSource({
    identity: {
      entityType: "dreamsign",
      entityId: revealEntityId("dreamsign", dreamsignId),
    },
    spec: dreamsignRevealSpec(dreamsign, Boolean(dreamsign.imageName)),
    feedback: "stationary",
  });

  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      role="button"
      tabIndex={0}
      aria-label={`Dreamsign: ${dreamsign.name}`}
      pressFeedback="stationary"
      hoverFeedback="stationary"
      data-testid={testId}
      data-dreamsign-name=""
      data-dreamsign-id={dreamsignId}
      style={{
        display: "inline-block",
        color: "inherit",
        font: "inherit",
        textDecoration: "underline",
        ...binding.sourceProps.style,
      }}
    >
      {dreamsign.name}
    </Pressable>
  );
}
