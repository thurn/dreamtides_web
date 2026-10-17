// D97EncounterPreview — the challenger or guardian preview (Appendix B §B11):
// who they are (an Avatar and its ability, or a generic character's deck
// source), the tier and score target, both head starts, three signature
// cards, both antes and the advertised extra, with Fight and Not now.
// PURE: it renders from a view model and reports the two choices.

import type { ReactElement } from "react";
import { GameCard, type GameCardModel } from "../../components/card/CardView";
import { RulesText } from "../../components/card/RulesText";
import { GlassButton } from "../../components/controls/GlassButton";
import { EssenceValue } from "../../components/hud/EssenceValue";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";
import type { DomTestId } from "../../types/dom";
import type { CardId } from "../../../types/card-identity";
import type { AvatarId, DreamAnchorId } from "../../../types/identifiers";

export interface D97PreviewCardView {
  readonly cardId: CardId;
  readonly model: GameCardModel;
}

export interface D97EncounterPreviewView {
  readonly anchorId: DreamAnchorId;
  readonly role: "challenger" | "guardian";
  /** An Avatar character's Avatar, or a generic character's deck source. */
  readonly avatar: {
    readonly id: AvatarId;
    readonly name: string;
    readonly title: string;
    /** The ability an Avatar character fights with; null for a generic character. */
    readonly ability: string | null;
    readonly abilityActive: boolean;
  };
  readonly tier: number;
  readonly scoreToWin: number;
  readonly headStarts: { readonly player: number; readonly opponent: number };
  readonly signatureCards: readonly D97PreviewCardView[];
  /** Null when the collection is at its floor. */
  readonly playerAnte: D97PreviewCardView | null;
  readonly opponentAnte: D97PreviewCardView | null;
  /** The Essence purse a win pays, or null. */
  readonly extraEssence: number | null;
}

export interface D97EncounterPreviewProps {
  readonly view: D97EncounterPreviewView;
  readonly onFight: () => void;
  readonly onNotNow: () => void;
}

/** Card width in the preview's rows. */
const CARD_WIDTH = 96;

function Label({ children }: { readonly children: string }) {
  return (
    <div style={{ font: token("--t-eyebrow"), color: token("--text-on-glass-muted"), letterSpacing: token("--tracking-eyebrow") }}>
      {children}
    </div>
  );
}

function CardRow({ cards, testId }: { readonly cards: readonly D97PreviewCardView[]; readonly testId: DomTestId }) {
  return (
    <div data-testid={testId} style={{ display: "flex", gap: token("--space-s"), flexWrap: "wrap" }}>
      {cards.map((card) => (
        <div key={card.cardId} data-d97-preview-card={card.cardId} style={{ width: CARD_WIDTH, flex: "none" }}>
          <GameCard model={card.model} hideRulesText />
        </div>
      ))}
    </div>
  );
}

export function D97EncounterPreview({ view, onFight, onNotNow }: D97EncounterPreviewProps): ReactElement {
  const stat = (label: string, value: string, key: string) => (
    <div key={key} data-d97-preview-stat={key}>
      <Label>{label}</Label>
      <div style={{ font: token("--t-title"), color: token("--text-on-glass") }}>{value}</div>
    </div>
  );
  return (
    <GlassDialog
      title={view.role === "guardian" ? "Guardian" : "Challenger"}
      subtitle={view.avatar.ability === null ? `Fights with ${view.avatar.name}'s deck` : `${view.avatar.name}, ${view.avatar.title}`}
      presentation="popup"
      onClose={onNotNow}
    >
      <div
        data-d97-encounter-preview={view.anchorId}
        data-d97-preview-role={view.role}
        style={{ display: "flex", flexDirection: "column", gap: token("--space-l"), color: token("--text-on-glass") }}
      >
        {view.avatar.ability !== null && (
          <div data-d97-preview-ability={view.avatar.abilityActive ? "active" : "dormant"} style={{ font: token("--t-body") }}>
            <RulesText text={view.avatar.ability} owner={{ kind: "avatar", id: view.avatar.id }} />
          </div>
        )}
        <div style={{ display: "flex", gap: token("--space-xl"), flexWrap: "wrap" }}>
          {stat("Tier", String(view.tier), "tier")}
          {stat("Score to win", String(view.scoreToWin), "score")}
          {stat("Your head start", String(view.headStarts.player), "player-head-start")}
          {stat("Their head start", String(view.headStarts.opponent), "opponent-head-start")}
        </div>
        <div>
          <Label>Signature cards</Label>
          <CardRow cards={view.signatureCards} testId="d97-preview-signature-cards" />
        </div>
        <div style={{ display: "flex", gap: token("--space-xl"), flexWrap: "wrap" }}>
          <div data-d97-preview-ante="player">
            <Label>Your ante</Label>
            {view.playerAnte === null ? (
              <div style={{ font: token("--t-body"), color: token("--text-on-glass-muted") }}>
                {"Nothing — your collection is at its floor."}
              </div>
            ) : (
              <CardRow cards={[view.playerAnte]} testId="d97-preview-player-ante" />
            )}
          </div>
          <div data-d97-preview-ante="opponent">
            <Label>Their ante</Label>
            {view.opponentAnte === null ? (
              <div style={{ font: token("--t-body"), color: token("--text-on-glass-muted") }}>{"Nothing"}</div>
            ) : (
              <CardRow cards={[view.opponentAnte]} testId="d97-preview-opponent-ante" />
            )}
          </div>
          {view.extraEssence !== null && (
            <div data-d97-preview-extra="essence">
              <Label>Essence purse</Label>
              <div style={{ font: token("--t-title") }}>
                <EssenceValue amount={view.extraEssence} />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: token("--space-s"), justifyContent: "flex-end" }}>
          <GlassButton label={"Not now"} placement="onGlass" testId="d97-preview-not-now" onPress={onNotNow} />
          <GlassButton label={"Fight"} variant="accent" placement="onGlass" testId="d97-preview-fight" onPress={onFight} />
        </div>
      </div>
    </GlassDialog>
  );
}
