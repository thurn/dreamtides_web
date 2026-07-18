import { useEffect } from "react";
import type { CSSProperties, ReactElement } from "react";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { token } from "../primitives/tokens";

export interface CardSourceNarrativeSection { id: string; title: string; lines: readonly string[]; }
export interface CardSourceView { title: string; subtitle: string; construction: CardSourceNarrativeSection | null; cards: CardSourceNarrativeSection; }
export interface CardSourceDialogProps { isOpen: boolean; view: CardSourceView | null; onClose: () => void; }
const text: CSSProperties = { margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted"), whiteSpace: "pre-wrap" };

/** Pure Cumulus provenance reader. All algorithm mapping stays in its builder. */
export function CardSourceDialog({ isOpen, view, onClose }: CardSourceDialogProps): ReactElement | null {
  useEffect(() => { if (!isOpen) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [isOpen, onClose]);
  if (!isOpen || view === null) return null;
  return <div className="cumulus" data-card-source-dialog="" style={{ minHeight: "100vh" }}><GlassDialog title={view.title} subtitle={view.subtitle} onClose={onClose}><div style={{ display: "grid", gap: token("--space-6") }}>{view.construction === null ? null : <Narrative section={view.construction} initiallyExpanded /> }<Narrative section={view.cards} initiallyExpanded /></div></GlassDialog></div>;
}
function Narrative({ section, initiallyExpanded }: { section: CardSourceNarrativeSection; initiallyExpanded: boolean }): ReactElement { return <DisclosureSection title={section.title} expanded={initiallyExpanded} onExpandedChange={() => undefined} testId={`card-source-${section.id}`}><div style={{ display: "grid", gap: token("--space-3"), padding: token("--space-4") }}>{section.lines.map((line, index) => <p key={`${section.id}:${String(index)}`} style={text}>{line}</p>)}</div></DisclosureSection>; }
