import type { RevealRect, RevealSafeArea } from "./model";
import { SAFE_AREA_INSET_PROPERTIES } from "../../primitives/safe-area";

export interface VisualViewportSnapshot {
  readonly layout: "mobile" | "desktop";
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly safeArea: RevealSafeArea;
  readonly boundary?: RevealRect;
}

function physicalInset(styles: CSSStyleDeclaration, name: string): number {
  const value = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

/** Finds the scrolling surface whose visible box bounds a source's reveal. */
export function findRevealBoundary(
  source: Element,
  target: Window = window,
): Element | null {
  let ancestor = source.parentElement;
  while (
    ancestor !== null &&
    ancestor !== target.document.body &&
    ancestor !== target.document.documentElement
  ) {
    const styles = target.getComputedStyle(ancestor);
    if (
      styles.overflowX === "auto" ||
      styles.overflowX === "scroll" ||
      styles.overflowY === "auto" ||
      styles.overflowY === "scroll"
    ) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

function captureBoundary(
  boundaryElement: Element | null,
  viewport: Pick<
    VisualViewportSnapshot,
    "width" | "height" | "offsetLeft" | "offsetTop"
  >,
  reservedBottom?: number,
): RevealRect | undefined {
  const viewportRight = viewport.offsetLeft + viewport.width;
  const viewportBottom = viewport.offsetTop + viewport.height;
  if (boundaryElement === null && reservedBottom === undefined) return undefined;
  const value = boundaryElement?.getBoundingClientRect() ?? {
    left: viewport.offsetLeft,
    top: viewport.offsetTop,
    right: viewportRight,
    bottom: viewportBottom,
  };
  const left = Math.max(viewport.offsetLeft, value.left);
  const top = Math.max(viewport.offsetTop, value.top);
  const right = Math.min(viewportRight, value.right);
  const bottom = Math.min(viewportBottom, value.bottom, reservedBottom ?? Number.POSITIVE_INFINITY);
  if (right <= left || bottom <= top) return undefined;
  return Object.freeze({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function captureDesktopStatusBarTop(
  target: Window,
  viewport: Pick<VisualViewportSnapshot, "height" | "offsetTop">,
): number | undefined {
  const anchor = target.document.querySelector<HTMLElement>(
    '[data-journey-status-bar-anchor]:not([data-journey-status-bar-variant="battle"])',
  );
  if (anchor === null) return undefined;
  const value = anchor.getBoundingClientRect();
  const viewportBottom = viewport.offsetTop + viewport.height;
  if (!(value.height > 0) || value.top <= viewport.offsetTop || value.top >= viewportBottom) return undefined;
  return value.top;
}

export function captureVisualViewport(
  target: Window = window,
  boundaryElement: Element | null = null,
): VisualViewportSnapshot {
  const visual = target.visualViewport;
  const width = visual?.width ?? target.innerWidth;
  const height = visual?.height ?? target.innerHeight;
  const offsetLeft = visual?.offsetLeft ?? 0;
  const offsetTop = visual?.offsetTop ?? 0;
  const layout = width < 900 ? "mobile" : "desktop";
  const styles = target.getComputedStyle(target.document.documentElement);
  const safeArea = Object.freeze({
    top: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.top),
    right: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.right),
    bottom: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.bottom),
    left: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.left),
  });
  const viewportRect = {
    width,
    height,
    offsetLeft,
    offsetTop,
  };
  const reservedBottom = layout === "desktop" ? captureDesktopStatusBarTop(target, viewportRect) : undefined;
  const boundary = captureBoundary(boundaryElement, viewportRect, reservedBottom);
  return Object.freeze({
    layout,
    width,
    height,
    offsetLeft,
    offsetTop,
    safeArea,
    ...(boundary === undefined ? {} : { boundary }),
  });
}
