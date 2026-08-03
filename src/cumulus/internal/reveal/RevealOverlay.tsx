import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  DESKTOP_ADJACENT_CARD_WIDTH,
  DESKTOP_GAME_CARD_WIDTH,
  selectRevealPlacement,
  type RevealPlacementDecision,
  type RevealSize,
} from "./geometry";
import { infoCardNativeWidth } from "../../components/overlay/InfoCard";
import type { RevealCoordinatorSource, RevealGeometrySnapshot, RevealPlacementException, RevealPoint, RevealReason, RevealRect, RevealSpec } from "./model";
import { renderRevealCard, renderRevealInfoCard } from "./render-reveal-card";
import { captureVisualViewport, findRevealBoundary } from "./viewport";

export interface RevealOverlayActive {
  readonly source: RevealCoordinatorSource;
  readonly spec: RevealSpec;
  /** The one-off Dream Augury OfferTile placement exception. */
  readonly placementException?: RevealPlacementException;
  readonly element: HTMLElement;
  readonly reason: RevealReason;
  readonly touchPoint?: RevealPoint;
  readonly sourceShowsCompleteGameCard: boolean;
  readonly sourceIsBattlefieldGameCard: boolean;
  readonly interactionId: number;
  readonly sourceRect: RevealRect;
  readonly modality: "mouse" | "pen" | "touch" | "keyboard";
}

export interface RevealOverlayProps {
  readonly active: RevealOverlayActive | null;
  readonly onPlaced?: (decision: RevealPlacementDecision, geometry: RevealGeometrySnapshot) => void;
}

interface MeasuredDecision { readonly key: string; readonly decision: RevealPlacementDecision; readonly sourceRect: RevealRect }

const transparent: CSSProperties = { pointerEvents: "none" };

function battleHandHoverScale(active: RevealOverlayActive): number {
  if (active.reason !== "hover") return 1;
  const rawScale = active.element
    .closest<HTMLElement>("[data-battle-hand-card-hover-scale]")
    ?.getAttribute("data-battle-hand-card-hover-scale");
  if (rawScale === null || rawScale === undefined) return 1;
  const scale = Number(rawScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function RevealOverlay({ active, onPlaced }: RevealOverlayProps) {
  const key = active === null ? "" : `${active.source.registrationId}:${active.reason}:${String(active.interactionId)}`;
  const [measured, setMeasured] = useState<MeasuredDecision | null>(null);
  const viewport = useMemo(
    () =>
      active === null
        ? null
        : captureVisualViewport(
            window,
            findRevealBoundary(active.element),
          ),
    [active, key],
  );

  useLayoutEffect(() => {
    if (active === null || viewport === null) return;
    let disposed = false;
    const layer = document.querySelector<HTMLElement>("[data-reveal-measurement-layer]");
    if (layer?.dataset.revealMeasurementKey !== key) return;
    const primary = layer.querySelector<HTMLElement>("[data-reveal-measure=\"primary\"]");
    const secondaries = [...layer.querySelectorAll<HTMLElement>("[data-reveal-measure=\"secondary\"]")];
    const adjacents = [...layer.querySelectorAll<HTMLElement>("[data-reveal-measure=\"adjacent\"]")];
    if (primary === null) return;
    const measure = (): void => {
      if (disposed) return;
      if (layer.querySelector("[data-reveal-render-pending]") !== null) return;
      const primaryRect = primary.getBoundingClientRect();
      const minimumGameCardWidth =
        DESKTOP_GAME_CARD_WIDTH * battleHandHoverScale(active);
      const secondarySizes: RevealSize[] = secondaries.map((node) => {
        const value = node.getBoundingClientRect();
        return { width: value.width, height: value.height };
      });
      const adjacentSizes: RevealSize[] = adjacents.map((node) => {
        const value = node.getBoundingClientRect();
        return { width: value.width, height: value.height };
      });
      if (!(primaryRect.width > 0) || !(primaryRect.height > 0)) return;
      const decision = selectRevealPlacement({
        viewport,
        reason: active.reason,
        primaryKind: active.spec.primary.kind,
        ...(active.placementException === undefined
          ? {}
          : { placementException: active.placementException }),
        sourceRect: active.sourceRect,
        ...(active.touchPoint === undefined ? {} : { touchPoint: active.touchPoint }),
        primarySize: { width: primaryRect.width, height: primaryRect.height },
        minimumGameCardWidth,
        secondarySizes,
        adjacentSizes,
        sourceShowsCompleteGameCard: active.sourceShowsCompleteGameCard,
        sourceIsBattlefieldGameCard: active.sourceIsBattlefieldGameCard,
      });
      setMeasured({ key, decision, sourceRect: active.sourceRect });
      onPlaced?.(decision, {
        viewport: {
          layout: viewport.layout,
          width: viewport.width,
          height: viewport.height,
          offsetLeft: viewport.offsetLeft,
          offsetTop: viewport.offsetTop,
          safeArea: viewport.safeArea,
          ...(viewport.boundary === undefined
            ? {}
            : { boundary: viewport.boundary }),
        },
        sourceRect: active.sourceRect,
        ...(active.touchPoint === undefined ? {} : { touchPoint: active.touchPoint }),
        placement: { family: decision.family, orientation: decision.orientation },
        finalRects: {
          primary: decision.primaryRect,
          secondaries: decision.secondaryRects,
          ...(decision.adjacentRects.length === 0
            ? {}
            : { adjacents: decision.adjacentRects }),
        },
        ...(decision.circleClearance === undefined ? {} : { circleClearance: decision.circleClearance }),
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => { disposed = true; };
    const observer = new ResizeObserver(measure);
    observer.observe(primary);
    for (const secondary of secondaries) observer.observe(secondary);
    for (const adjacent of adjacents) observer.observe(adjacent);
    return () => { disposed = true; observer.disconnect(); };
  }, [active, key, onPlaced, viewport]);

  const decision = measured?.key === key ? measured.decision : null;
  const primaryIsCardShaped = active !== null && active.spec.primary.kind !== "infoCard";
  const sourcePrimaryInPlace = active !== null && decision !== null
    && (active.spec.primary.kind === "source"
      || (active.spec.primary.kind === "gameCard"
        && (decision.pressInPlace || (viewport?.layout === "desktop" && active.sourceShowsCompleteGameCard
          && active.sourceRect.width >= DESKTOP_GAME_CARD_WIDTH))));
  useLayoutEffect(() => {
    if (active === null || viewport?.layout !== "desktop" || !primaryIsCardShaped || decision === null || sourcePrimaryInPlace || active.sourceIsBattlefieldGameCard) return;
    const previousOpacity = active.element.style.opacity;
    active.element.style.opacity = "0";
    return () => { active.element.style.opacity = previousOpacity; };
  }, [active, decision, primaryIsCardShaped, sourcePrimaryInPlace, viewport?.layout]);

  if (active === null || viewport === null) return null;
  const mobileWidth = viewport.width * 0.45;
  const desktopGameCardWidth =
    DESKTOP_GAME_CARD_WIDTH * battleHandHoverScale(active);
  const measurePrimaryWidth = viewport.layout === "mobile"
    ? mobileWidth
    : active.spec.primary.kind === "infoCard"
      ? infoCardNativeWidth(active.spec.primary.card.variant)
      : primaryIsCardShaped
        ? Math.max(desktopGameCardWidth, active.sourceRect.width)
        : 248;
  const measureSecondaryWidth = viewport.layout === "mobile" ? mobileWidth : 248;
  const adjacentCards = viewport.layout === "desktop"
    ? active.spec.adjacentCards ?? []
    : [];

  return createPortal(
    <div className="cumulus" data-cumulus-reveal-portal="" aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: "var(--layer-reveal)", pointerEvents: "none" }}>
      <div data-reveal-measurement-layer="" data-reveal-measurement-key={key} style={{ position: "fixed", inset: 0, visibility: "hidden", pointerEvents: "none" }}>
          <div
            data-reveal-measure="primary"
            style={active.spec.primary.kind === "source"
              ? { ...transparent, width: active.sourceRect.width, height: active.sourceRect.height }
              : { ...transparent, width: measurePrimaryWidth }}
          >
            {active.spec.primary.kind === "source" ? null : renderRevealCard(active.spec.primary, measurePrimaryWidth)}
          </div>
          {active.spec.secondaries.map((card, index) => (
            <div data-reveal-measure="secondary" data-reveal-index={index} key={index} style={{ ...transparent, width: measureSecondaryWidth }}>{renderRevealInfoCard(card, measureSecondaryWidth)}</div>
          ))}
          {adjacentCards.map((card, index) => (
            <div data-reveal-measure="adjacent" data-reveal-index={index} key={card.cardId} style={{ ...transparent, width: DESKTOP_ADJACENT_CARD_WIDTH }}>{renderRevealCard(card, DESKTOP_ADJACENT_CARD_WIDTH)}</div>
          ))}
      </div>
      {decision !== null && (
        <div data-cumulus-reveal-group="" style={{ position: "fixed", inset: 0, visibility: "visible", pointerEvents: "none" }}>
          {!sourcePrimaryInPlace && <div data-cumulus-reveal-card="primary" style={{ position: "fixed", left: decision.primaryRect.x, top: decision.primaryRect.y, width: decision.primaryRect.width, height: decision.primaryRect.height, pointerEvents: "none", transition: "none" }}>
            {renderRevealCard(active.spec.primary, decision.primaryRect.width)}
          </div>}
          {decision.secondaryRects.map((cardRect, index) => (
            <div data-cumulus-reveal-card="secondary" key={index} style={{ position: "fixed", left: cardRect.x, top: cardRect.y, width: cardRect.width, height: cardRect.height, pointerEvents: "none" }}>
              {renderRevealInfoCard(active.spec.secondaries[index], cardRect.width)}
            </div>
          ))}
          {decision.adjacentRects.map((cardRect, index) => (
            <div data-cumulus-reveal-card="adjacent" key={adjacentCards[index]?.cardId ?? index} style={{ position: "fixed", left: cardRect.x, top: cardRect.y, width: cardRect.width, height: cardRect.height, pointerEvents: "none" }}>
              {renderRevealCard(adjacentCards[index], cardRect.width)}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
