import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { token } from "../primitives/tokens";

export interface CardSourceNarrativeLine { id: string; text: string; card: GameCardModel | null; }
export interface CardSourceNarrativeSection { id: string; title: string; lines: readonly CardSourceNarrativeLine[]; }
export interface CardSourceView { title: string; subtitle: string; construction: CardSourceNarrativeSection | null; cards: CardSourceNarrativeSection; }
export interface CardSourceDialogProps { isOpen: boolean; view: CardSourceView | null; onClose: () => void; }
const text: CSSProperties = { margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted"), whiteSpace: "pre-wrap" };

/** Pure Cumulus provenance reader. All algorithm mapping stays in its builder. */
export function CardSourceDialog({ isOpen, view, onClose }: CardSourceDialogProps): ReactElement | null {
  useEffect(() => { if (!isOpen) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [isOpen, onClose]);
  if (!isOpen || view === null) return null;
  return <div className="cumulus" data-card-source-dialog="" style={{ minHeight: "100vh" }}><GlassDialog title={view.title} subtitle={view.subtitle} onClose={onClose}><div style={{ display: "grid", gap: token("--space-l") }}>{view.construction === null ? null : <Narrative section={view.construction} initiallyExpanded /> }<Narrative section={view.cards} initiallyExpanded /></div></GlassDialog></div>;
}
function Narrative({ section, initiallyExpanded }: { section: CardSourceNarrativeSection; initiallyExpanded: boolean }): ReactElement { const [expanded, setExpanded] = useState(initiallyExpanded); return <DisclosureSection title={section.title} expanded={expanded} onExpandedChange={setExpanded} testId={`card-source-${section.id}`}><div style={{ display: "grid", gap: token("--space-xs"), padding: token("--space-s") }}>{section.lines.map((line) => line.card === null ? <p key={line.id} style={text}>{line.text}</p> : <div key={line.id} data-card-source-card={line.card.cardId} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)", alignItems: "center", gap: token("--space-s") }}><GameCard model={line.card} hideRulesText testId={`card-source-game-card-${line.card.cardId}`} /><p style={text}>{line.text}</p></div>)}</div></DisclosureSection>; }
