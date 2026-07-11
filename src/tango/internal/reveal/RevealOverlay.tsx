import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { selectRevealPlacement, type RevealPlacementDecision, type RevealSize } from "./geometry";
import type { RevealCoordinatorSource, RevealGeometrySnapshot, RevealPoint, RevealReason, RevealRect, RevealSpec } from "./model";
import { renderRevealCard, renderRevealInfoCard } from "./render-reveal-card";
import { captureVisualViewport } from "./viewport";

export interface RevealOverlayActive {
  readonly source: RevealCoordinatorSource;
  readonly spec: RevealSpec;
  readonly element: HTMLElement;
  readonly reason: RevealReason;
  readonly touchPoint?: RevealPoint;
  readonly sourceShowsCompleteGameCard: boolean;
  readonly returningGameCard?: boolean;
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

function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.tangoReducedMotion === "reduce"
    || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function RevealOverlay({ active, onPlaced }: RevealOverlayProps) {
  const key = active === null ? "" : `${active.source.registrationId}:${active.reason}:${String(active.interactionId)}`;
  const [measured, setMeasured] = useState<MeasuredDecision | null>(null);
  const viewport = useMemo(() => active === null ? null : captureVisualViewport(), [key]);

  useLayoutEffect(() => {
    if (active === null || viewport === null) return;
    let disposed = false;
    const layer = document.querySelector<HTMLElement>("[data-reveal-measurement-layer]");
    if (layer?.dataset.revealMeasurementKey !== key) return;
    const primary = layer.querySelector<HTMLElement>("[data-reveal-measure=\"primary\"]");
    const secondaries = [...layer.querySelectorAll<HTMLElement>("[data-reveal-measure=\"secondary\"]")];
    if (primary === null) return;
    const measure = (): void => {
      if (disposed) return;
      if (primary.querySelector("[data-reveal-render-pending]") !== null) return;
      const primaryRect = primary.getBoundingClientRect();
      const secondarySizes: RevealSize[] = secondaries.map((node) => {
        const value = node.getBoundingClientRect();
        return { width: value.width, height: value.height };
      });
      if (!(primaryRect.width > 0) || !(primaryRect.height > 0)) return;
      const decision = selectRevealPlacement({
        viewport,
        reason: active.reason,
        primaryKind: active.spec.primary.kind,
        sourceRect: active.sourceRect,
        ...(active.touchPoint === undefined ? {} : { touchPoint: active.touchPoint }),
        primarySize: { width: primaryRect.width, height: primaryRect.height },
        secondarySizes,
        sourceShowsCompleteGameCard: active.sourceShowsCompleteGameCard,
      });
      setMeasured({ key, decision, sourceRect: active.sourceRect });
      onPlaced?.(decision, {
        viewport: { layout: viewport.layout, width: viewport.width, height: viewport.height, offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop, safeArea: viewport.safeArea },
        sourceRect: active.sourceRect,
        ...(active.touchPoint === undefined ? {} : { touchPoint: active.touchPoint }),
        placement: { family: decision.family, orientation: decision.orientation },
        finalRects: { primary: decision.primaryRect, secondaries: decision.secondaryRects },
        ...(decision.circleClearance === undefined ? {} : { circleClearance: decision.circleClearance }),
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => { disposed = true; };
    const observer = new ResizeObserver(measure);
    observer.observe(primary);
    for (const secondary of secondaries) observer.observe(secondary);
    return () => { disposed = true; observer.disconnect(); };
  }, [active, key, onPlaced, viewport]);

  const decision = measured?.key === key ? measured.decision : null;
  const returnRect = measured?.key === key ? measured.sourceRect : null;
  const primaryIsCardShaped = active !== null && active.spec.primary.kind !== "infoCard";
  const sourcePrimaryInPlace = active !== null && decision !== null
    && active.spec.primary.kind === "gameCard"
    && (decision.pressInPlace || (viewport?.layout === "desktop" && active.sourceShowsCompleteGameCard
      && active.sourceRect.width >= 340));
  useLayoutEffect(() => {
    if (active === null || viewport?.layout !== "desktop" || !primaryIsCardShaped || decision === null || sourcePrimaryInPlace) return;
    const previousOpacity = active.element.style.opacity;
    active.element.style.opacity = "0";
    return () => { active.element.style.opacity = previousOpacity; };
  }, [active, decision, primaryIsCardShaped, sourcePrimaryInPlace, viewport?.layout]);

  if (active === null || viewport === null) return null;
  const mobileWidth = viewport.width * 0.45;
  const measurePrimaryWidth = viewport.layout === "mobile"
    ? mobileWidth
    : primaryIsCardShaped ? Math.max(340, active.sourceRect.width) : 248;
  const measureSecondaryWidth = viewport.layout === "mobile" ? mobileWidth : 248;

  return createPortal(
    <div className="tango" data-tango-reveal-portal="" aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: "var(--layer-reveal)", pointerEvents: "none" }}>
      <div data-reveal-measurement-layer="" data-reveal-measurement-key={key} style={{ position: "fixed", inset: 0, visibility: "hidden", pointerEvents: "none" }}>
          <div data-reveal-measure="primary" style={{ ...transparent, width: measurePrimaryWidth }}>{renderRevealCard(active.spec.primary, measurePrimaryWidth)}</div>
          {active.spec.secondaries.map((card, index) => (
            <div data-reveal-measure="secondary" data-reveal-index={index} key={index} style={{ ...transparent, width: measureSecondaryWidth }}>{renderRevealInfoCard(card, measureSecondaryWidth)}</div>
          ))}
      </div>
      {decision !== null && (
        <div data-tango-reveal-group="" style={{ position: "fixed", inset: 0, visibility: "visible", pointerEvents: "none" }}>
          {!sourcePrimaryInPlace && <div data-tango-reveal-card="primary" style={{ position: "fixed", left: active.returningGameCard === true && returnRect !== null ? returnRect.x : decision.primaryRect.x, top: active.returningGameCard === true && returnRect !== null ? returnRect.y : decision.primaryRect.y, width: active.returningGameCard === true && returnRect !== null ? returnRect.width : decision.primaryRect.width, height: active.returningGameCard === true && returnRect !== null ? returnRect.height : decision.primaryRect.height, pointerEvents: "none", transition: active.returningGameCard === true && !prefersReducedMotion() ? "left 160ms var(--ease-out), top 160ms var(--ease-out), width 160ms var(--ease-out), height 160ms var(--ease-out)" : "none" }}>
            {renderRevealCard(active.spec.primary, active.returningGameCard === true && returnRect !== null ? returnRect.width : decision.primaryRect.width)}
          </div>}
          {(active.returningGameCard === true ? [] : decision.secondaryRects).map((cardRect, index) => (
            <div data-tango-reveal-card="secondary" key={index} style={{ position: "fixed", left: cardRect.x, top: cardRect.y, width: cardRect.width, height: cardRect.height, pointerEvents: "none" }}>
              {renderRevealInfoCard(active.spec.secondaries[index], cardRect.width)}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
