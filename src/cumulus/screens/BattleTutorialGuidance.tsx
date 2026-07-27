import type { ReactElement } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import type { DreamwellCardModel } from "../components/battle/DreamwellCard";
import { DreamwellCard } from "../components/battle/DreamwellCard";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import { artRef } from "../primitives/art";
import { Pressable } from "../primitives/Pressable";
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
  readonly onDismiss: () => void;
}

/** Timed battle teaching moment using the tutorial's card-and-dialogue style. */
export function BattleTutorialGuidance({
  view,
  onDismiss,
}: BattleTutorialGuidanceProps): ReactElement {
  const desktop = useIsDesktop();
  return (
    <section
      aria-label="Battle tutorial"
      aria-live="polite"
      data-battle-tutorial-guidance=""
      data-presentation-id={view.presentationId}
      data-trigger-id={view.triggerId}
      data-message-index={view.messageIndex}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-reveal"),
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
        pointerEvents: "none",
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
                ? "min(240px, 45vw)"
                : "min(45vw, 34dvh)",
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
        }}
      >
        <Pressable
          as="div"
          role="button"
          tabIndex={0}
          aria-label="Dismiss Mira tutorial"
          data-testid="battle-tutorial-dismiss"
          hoverFeedback="stationary"
          pressFeedback="stationary"
          onClick={onDismiss}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onDismiss();
          }}
          style={{
            width: "100%",
            pointerEvents: "auto",
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
        </Pressable>
      </div>
    </section>
  );
}
