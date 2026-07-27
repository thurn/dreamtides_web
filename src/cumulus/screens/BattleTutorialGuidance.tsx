import type { ReactElement } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import type { DreamwellCardModel } from "../components/battle/DreamwellCard";
import { DreamwellCard } from "../components/battle/DreamwellCard";
import { GlassButton } from "../components/controls/GlassButton";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import { artRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

export type BattleTutorialGuidanceSourceView =
  | {
      readonly kind: "card";
      readonly model: GameCardModel;
      readonly figment: boolean;
    }
  | {
      readonly kind: "dreamwell";
      readonly model: DreamwellCardModel;
    };

export interface BattleTutorialGuidanceView {
  readonly presentationId: string;
  readonly triggerId: string;
  readonly messageIndex: number;
  readonly messageCount: number;
  readonly text: string;
  readonly source: BattleTutorialGuidanceSourceView;
}

export interface BattleTutorialGuidanceProps {
  readonly view: BattleTutorialGuidanceView;
  readonly onContinue: () => void;
}

/** Modal battle teaching moment with its tangible source kept fully readable. */
export function BattleTutorialGuidance({
  view,
  onContinue,
}: BattleTutorialGuidanceProps): ReactElement {
  const desktop = useIsDesktop();
  return (
    <section
      aria-label="Battle tutorial"
      aria-modal="true"
      role="dialog"
      data-battle-tutorial-guidance=""
      data-presentation-id={view.presentationId}
      data-trigger-id={view.triggerId}
      data-message-index={view.messageIndex}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: desktop ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: desktop ? token("--space-10") : token("--space-4"),
        boxSizing: "border-box",
        padding: desktop
          ? `max(${token("--space-8")}, var(--safe-area-inset-top)) max(${token("--space-8")}, var(--safe-area-inset-right)) max(${token("--space-8")}, var(--safe-area-inset-bottom)) max(${token("--space-8")}, var(--safe-area-inset-left))`
          : `max(${token("--space-4")}, var(--safe-area-inset-top)) max(${token("--space-4")}, var(--safe-area-inset-right)) max(${token("--space-4")}, var(--safe-area-inset-bottom)) max(${token("--space-4")}, var(--safe-area-inset-left))`,
        overflow: "hidden",
        background: token("--scrim-strong"),
      }}
    >
      <div
        data-battle-tutorial-source=""
        style={{
          width:
            view.source.kind === "dreamwell"
              ? desktop
                ? "min(520px, 45vw)"
                : "min(92vw, 64dvh, 430px)"
              : desktop
                ? "min(320px, 34vw)"
                : "min(50vw, 34dvh, 220px)",
          maxHeight:
            desktop
              ? undefined
              : view.source.kind === "dreamwell"
                ? "40dvh"
                : "48dvh",
          flex: "0 1 auto",
        }}
      >
        {view.source.kind === "dreamwell" ? (
          <DreamwellCard
            model={view.source.model}
            testId="battle-tutorial-dreamwell"
          />
        ) : (
          <GameCard
            model={view.source.model}
            figment={view.source.figment}
            figmentTitleBar={view.source.figment}
            testId="battle-tutorial-card"
          />
        )}
      </div>
      <div
        style={{
          display: "flex",
          width: desktop ? undefined : "min(100%, 560px)",
          maxWidth: desktop ? 760 : "none",
          flex: desktop ? "1 1 480px" : "0 1 auto",
          flexDirection: "column",
          alignItems: "center",
          gap: desktop ? token("--space-6") : token("--space-3"),
        }}
      >
        <CharacterDialogue
          dialogue={{
            portrait: artRef.characterPortrait("mira"),
            portraitAlt: "Mira",
            speakerName: "Mira",
            text: view.text,
          }}
          visible
          size={desktop ? "prominent" : "compact"}
          testId="battle-tutorial-dialogue"
        />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <GlassButton
            label={
              view.messageIndex + 1 < view.messageCount ? "Next" : "Continue"
            }
            variant="accent"
            placement="onMedia"
            testId="battle-tutorial-continue"
            onPress={onContinue}
          />
        </div>
      </div>
    </section>
  );
}
