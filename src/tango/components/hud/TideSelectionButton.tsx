import { useRef, type CSSProperties } from "react";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { richText } from "../card/rich-text";
import type { TangoColor } from "../../primitives/color";

const TIDES_DEFINITION = "Pools of cards you will see during the quest. Different tides are used every time you play.";

export interface TideSelectionButtonProps {
  id: string; label: string; description: string; tag: string; accent: TangoColor;
  active: boolean; joined: boolean; onActivate: () => void;
}

/** Selectable provenance tide with one owner for reveal and activation. */
export function TideSelectionButton({ id, label, description, tag, accent, active, joined, onActivate }: TideSelectionButtonProps) {
  const binding = useRevealSource({
    identity: { entityType: "tide", entityId: revealEntityId("tide", id) },
    spec: {
      primary: { kind: "infoCard", card: { variant: "text", title: label, body: richText.plain(description) } },
      secondaries: [{ variant: "text", title: "Tides", body: richText.plain(TIDES_DEFINITION) }],
    },
    onActivate,
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;
  const style: CSSProperties = {
    ...binding.sourceProps.style, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 6,
    border: active ? `1px solid ${accent}` : "1px solid rgba(247, 241, 223, 0.16)",
    background: active ? "rgba(45, 138, 128, 0.22)" : "#16242a", color: joined ? "#f7f1df" : "#8a9590",
    padding: "4px 9px", font: "inherit", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer",
  };
  return (
    <Pressable as="button" ref={binding.ref} {...binding.sourceProps} data-pool-tide-button={id} aria-pressed={active}
      onPointerDown={(event) => { lastPointerType.current = event.pointerType; pointerDown?.(event); }}
      onClick={() => { if (lastPointerType.current !== "touch") onActivate(); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(); } }} style={style}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: accent, opacity: joined ? 1 : 0.4 }} />
      {label}
      <span style={{ fontSize: "0.64rem", fontWeight: 600, opacity: 0.7, letterSpacing: "0.02em" }}>{tag}</span>
    </Pressable>
  );
}
