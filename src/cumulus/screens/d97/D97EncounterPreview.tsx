// D97EncounterPreview — the challenger or guardian preview (Appendix B §B11).
// It leads with who the opponent is (their name as the heading, their pixel
// bust beside their epithet or role, an Avatar character's ability) and the
// stakes: the score a win takes, the ante the player risks, and what a win
// takes from them (their ante and the advertised extra). Their three
// signature cards follow, then a secondary details line (tier, score, both
// head starts), and Fight and Not now. PURE: it renders from a view model and reports the two choices.

import type { ReactElement, ReactNode } from "react";
import { GameCard, type GameCardModel } from "../../components/card/CardView";
import { RulesText } from "../../components/card/RulesText";
import { GlassButton } from "../../components/controls/GlassButton";
import { EssenceValue } from "../../components/hud/EssenceValue";
import { token } from "../../primitives/tokens";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";
import type { DomTestId } from "../../types/dom";
import type { CardId } from "../../../types/card-identity";
import type { AvatarId, D97CharacterId, DreamAnchorId } from "../../../types/identifiers";
import { D97CharacterPortrait } from "./D97CharacterPortrait";
import { D97Panel } from "./D97Panel";

export interface D97PreviewCardView {
  readonly cardId: CardId;
  readonly model: GameCardModel;
}

export interface D97EncounterPreviewView {
  readonly anchorId: DreamAnchorId;
  readonly role: "challenger" | "guardian";
  /** Who stands at the anchor: the name the preview leads with, and their character for the bust. */
  readonly opponent: {
    readonly name: string;
    /** The line under the name: an Avatar character's epithet, else the role. */
    readonly epithet: string;
    readonly characterId: D97CharacterId;
  };
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
  return <div style={{ font: token("--t-caption"), color: token("--text-on-glass-muted") }}>{children}</div>;
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

/** The preview's labeled groups. */
type StakeKind = "player" | "opponent" | "signature";

function Stake({ label, kind, children }: { readonly label: string; readonly kind: StakeKind; readonly children: ReactNode }) {
  return (
    <div data-d97-preview-stake={kind} style={{ display: "flex", flexDirection: "column", gap: token("--space-xs") }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function D97EncounterPreview({ view, onFight, onNotNow }: D97EncounterPreviewProps): ReactElement {
  useEscapeToClose(onNotNow);
  const { opponent } = view;
  const details: readonly { readonly key: string; readonly text: string }[] = [
    { key: "tier", text: `Tier ${String(view.tier)}` },
    { key: "score", text: `Score ${String(view.scoreToWin)}` },
    { key: "player-head-start", text: `Your head start ${String(view.headStarts.player)}` },
    { key: "opponent-head-start", text: `Their head start ${String(view.headStarts.opponent)}` },
  ];
  return (
    <D97Panel kind="encounter-preview" title={opponent.name} onClose={onNotNow}>
      <div
        data-d97-encounter-preview={view.anchorId}
        data-d97-preview-role={view.role}
        style={{ display: "flex", flexDirection: "column", gap: token("--space-l"), color: token("--text-on-glass") }}
      >
        <div data-d97-preview-primary="" style={{ display: "flex", gap: token("--space-l"), alignItems: "center" }}>
          <D97CharacterPortrait characterId={opponent.characterId} alt={opponent.name} />
          <div style={{ display: "flex", flexDirection: "column", gap: token("--space-xs"), minWidth: 0 }}>
            <div data-d97-preview-epithet="" style={{ font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
              {opponent.epithet}
            </div>
            <div data-d97-preview-goal="" style={{ font: token("--t-lead") }}>
              {`First to ${String(view.scoreToWin)} points wins.`}
            </div>
            {view.avatar.ability !== null && (
              <div data-d97-preview-ability={view.avatar.abilityActive ? "active" : "dormant"} style={{ font: token("--t-body") }}>
                <RulesText text={view.avatar.ability} owner={{ kind: "avatar", id: view.avatar.id }} />
              </div>
            )}
          </div>
        </div>
        <div data-d97-preview-stakes="" style={{ display: "flex", gap: token("--space-xl"), flexWrap: "wrap" }}>
          <Stake label={"You risk"} kind="player">
            <div data-d97-preview-ante="player">
              {view.playerAnte === null ? (
                <div style={{ font: token("--t-body"), color: token("--text-on-glass-muted") }}>
                  {"Nothing — your collection is at its floor."}
                </div>
              ) : (
                <CardRow cards={[view.playerAnte]} testId="d97-preview-player-ante" />
              )}
            </div>
          </Stake>
          <Stake label={"A win takes"} kind="opponent">
            <div style={{ display: "flex", gap: token("--space-m"), alignItems: "center" }}>
              <div data-d97-preview-ante="opponent">
                {view.opponentAnte === null ? (
                  <div style={{ font: token("--t-body"), color: token("--text-on-glass-muted") }}>{"Nothing"}</div>
                ) : (
                  <CardRow cards={[view.opponentAnte]} testId="d97-preview-opponent-ante" />
                )}
              </div>
              {view.extraEssence !== null && (
                <div data-d97-preview-extra="essence" style={{ font: token("--t-lead") }}>
                  <EssenceValue amount={view.extraEssence} tone="mark" />
                </div>
              )}
            </div>
          </Stake>
        </div>
        <Stake label={"Signature cards"} kind="signature">
          <CardRow cards={view.signatureCards} testId="d97-preview-signature-cards" />
        </Stake>
        <p
          data-d97-preview-details=""
          style={{
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            columnGap: token("--space-m"),
            rowGap: token("--space-xxs"),
            font: token("--t-body-sm"),
            color: token("--text-on-glass-muted"),
          }}
        >
          {details.map((detail) => (
            <span key={detail.key} data-d97-preview-stat={detail.key}>
              {detail.text}
            </span>
          ))}
        </p>
        <div style={{ display: "flex", gap: token("--space-s"), justifyContent: "flex-end" }}>
          <GlassButton label={"Not now"} placement="onGlass" testId="d97-preview-not-now" onPress={onNotNow} />
          <GlassButton label={"Fight"} variant="accent" placement="onGlass" testId="d97-preview-fight" onPress={onFight} />
        </div>
      </div>
    </D97Panel>
  );
}
