import { useEffect, useState, type ReactElement } from "react";
import { txa } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import { CardBack } from "../battle/CardBack";
import { CARD_ASPECT_RATIO } from "./card-aspect";
import { GameCard, type GameCardModel } from "./CardView";
import type { DeckEntryId } from "../../../types/identifiers";

/** Semantic recipe for one resolved card change. */
export type CardChangeKind =
  "replacement" | "copy" | "transfiguration" | "keyword" | "card-type";

/** Complete before-and-after presentation for one resolved change. */
export interface CardChangePairModel<ChangeId extends string> {
  /** Stable identity for this resolved change presentation. */
  readonly changeId: ChangeId;
  /** Semantic visual and accessibility recipe. */
  readonly kind: CardChangeKind;
  /** Original deck entry and its complete card presentation. */
  readonly before: {
    /** Stable original deck-entry identity. */
    readonly entryId: DeckEntryId;
    /** Complete original card presentation. */
    readonly card: GameCardModel;
  };
  /** Result deck entry and its complete card presentation. */
  readonly after: {
    /** Stable result deck-entry identity. */
    readonly entryId: DeckEntryId;
    /** Complete result card presentation. */
    readonly card: GameCardModel;
  };
}

export interface CardChangePairProps<ChangeId extends string> {
  /** Complete resolved change to display. */
  readonly model: CardChangePairModel<ChangeId>;
  /** Controlled choreography phase for concealing or revealing the result. */
  readonly reveal: "before" | "complete";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Displays one resolved before/after card change without applying a mutation. */
export function CardChangePair<ChangeId extends string>({
  model,
  reveal,
}: CardChangePairProps<ChangeId>): ReactElement {
  const resolve = useLocalizer();
  const reducedMotion = useReducedMotion();
  const complete = reveal === "complete" || reducedMotion;
  const afterSelection =
    model.kind === "copy"
      ? "copied"
      : model.kind === "transfiguration"
        ? "transfigured"
        : "changed";

  return (
    <div
      data-card-change-pair=""
      data-card-change-id={model.changeId}
      data-card-change-kind={model.kind}
      data-card-change-reveal={complete ? "complete" : "before"}
      data-before-entry-id={model.before.entryId}
      data-before-card-id={model.before.card.cardId}
      data-after-entry-id={model.after.entryId}
      data-after-card-id={model.after.card.cardId}
      role="group"
      aria-label={resolve(
        complete
          ? txa(
              "{before_card} changed into {after_card}",
              {
                before_card: model.before.card.displaySnapshot.name,
                after_card: model.after.card.displaySnapshot.name,
              },
              "[accessibility] Name for a resolved before-and-after card presentation. Both names are UUID-resolved and may match.",
            )
          : txa(
              "The result of changing {before_card} is concealed",
              { before_card: model.before.card.displaySnapshot.name },
              "[accessibility] Name for a before-and-after card presentation while its result remains concealed. before_card is UUID-resolved.",
            ),
      )}
      style={{ width: 520, maxWidth: "100%" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-s"),
          padding: token("--space-s"),
          containerType: "inline-size",
        }}
      >
        <div
          data-card-change-face="before"
          data-card-change-selection={
            model.kind === "replacement" ? "danger" : "none"
          }
          data-entry-id={model.before.entryId}
          data-card-id={model.before.card.cardId}
          style={{
            width: "clamp(108px, 38cqw, 220px)",
            aspectRatio: CARD_ASPECT_RATIO,
          }}
        >
          <GameCard
            model={model.before.card}
            selection={model.kind === "replacement" ? "danger" : undefined}
          />
        </div>
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            fontSize: "clamp(22px, 6cqw, 30px)",
          }}
        >
          <StandaloneGlyph glyph={GLYPHS.arrowRightFilled} color="white" />
        </span>
        <div
          aria-hidden={!complete}
          data-card-change-face="after"
          data-card-change-selection={afterSelection}
          data-entry-id={model.after.entryId}
          data-card-id={model.after.card.cardId}
          style={{
            position: "relative",
            width: "clamp(108px, 38cqw, 220px)",
            aspectRatio: CARD_ASPECT_RATIO,
          }}
        >
          <div
            data-card-change-flip-stage=""
            style={{
              position: "absolute",
              inset: 0,
              transform: complete ? "rotateY(180deg)" : "rotateY(0deg)",
              transformStyle: "preserve-3d",
              perspective: 1200,
              transition: reducedMotion
                ? "none"
                : `transform var(--dur-slow) var(--ease-dream)`,
            }}
          >
            <div
              aria-hidden={complete}
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
              }}
            >
              <CardBack
                label={txa(
                  "Changed card {card}",
                  { card: model.after.card.displaySnapshot.name },
                  "[accessibility] Concealed result card label.",
                )}
              />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <GameCard model={model.after.card} selection={afterSelection} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
