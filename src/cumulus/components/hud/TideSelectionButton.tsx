import { useRef, type CSSProperties } from "react";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { richText } from "../card/rich-text";
import { glossaryInfoCard } from "../card/glossary-info-card";
import { GLOSSARY_IDS } from "../../../data/glossary";

export type TideSelectionRole = "starter" | "facet-drawn" | "facet-fill" | "neutral-fill";

const SELECTION_PRESENTATION: Record<TideSelectionRole, { readonly tag: string; readonly accent: string }> = {
  starter: { tag: "Signature", accent: "#34c759" },
  "facet-drawn": { tag: "Theme · drawn", accent: "#2d8a80" },
  "facet-fill": { tag: "Theme · fill", accent: "#7c8a86" },
  "neutral-fill": { tag: "Broad", accent: "#5b6b78" },
};

export interface TideSelectionButtonProps {
  id: string; label: string; description: string; selectionRole: TideSelectionRole;
  active: boolean; joined: boolean; onActivate: () => void;
}

/** Selectable provenance tide with one owner for reveal and activation. */
export function TideSelectionButton({ id, label, description, selectionRole, active, joined, onActivate }: TideSelectionButtonProps) {
  const { tag, accent } = SELECTION_PRESENTATION[selectionRole];
  const binding = useRevealSource({
    identity: { entityType: "tide", entityId: revealEntityId("tide", id) },
    spec: {
      primary: { kind: "infoCard", card: { variant: "text", title: label, body: richText.plain(description) } },
      secondaries: [glossaryInfoCard(GLOSSARY_IDS.tides)],
    },
    onActivate,
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;
  const style: CSSProperties = {
    ...binding.sourceProps.style, display: "inline-flex", alignItems: "center", gap: token("--space-xs"), borderRadius: token("--radius-compact"),
    border: active ? `1px solid ${accent}` : "1px solid rgba(247, 241, 223, 0.16)",
    background: active ? "rgba(45, 138, 128, 0.22)" : "#16242a", color: joined ? "#f7f1df" : "#8a9590",
    padding: `${token("--space-xs")} ${token("--space-s")}`, font: "inherit", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer",
  };
  return (
    <Pressable as="button" ref={binding.ref} {...binding.sourceProps} data-pool-tide-button={id} aria-pressed={active}
      onPointerDown={(event) => { lastPointerType.current = event.pointerType; pointerDown?.(event); }}
      onClick={() => { if (lastPointerType.current !== "touch") onActivate(); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(); } }} style={style}>
      <span aria-hidden="true" data-tide-selection-mark={selectionRole} style={{ width: 8, height: 8, borderRadius: 999, background: accent, opacity: joined ? 1 : 0.4 }} />
      {label}
      <span style={{ fontSize: "0.64rem", fontWeight: 600, opacity: 0.7, letterSpacing: "0.02em" }}>{tag}</span>
    </Pressable>
  );
}
