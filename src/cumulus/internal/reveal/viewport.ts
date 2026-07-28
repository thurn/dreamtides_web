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
): RevealRect | undefined {
  if (boundaryElement === null) return undefined;
  const value = boundaryElement.getBoundingClientRect();
  const viewportRight = viewport.offsetLeft + viewport.width;
  const viewportBottom = viewport.offsetTop + viewport.height;
  const left = Math.max(viewport.offsetLeft, value.left);
  const top = Math.max(viewport.offsetTop, value.top);
  const right = Math.min(viewportRight, value.right);
  const bottom = Math.min(viewportBottom, value.bottom);
  if (right <= left || bottom <= top) return undefined;
  return Object.freeze({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
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
  const styles = target.getComputedStyle(target.document.documentElement);
  const safeArea = Object.freeze({
    top: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.top),
    right: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.right),
    bottom: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.bottom),
    left: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.left),
  });
  const boundary = captureBoundary(boundaryElement, {
    width,
    height,
    offsetLeft,
    offsetTop,
  });
  return Object.freeze({
    layout: width < 900 ? "mobile" : "desktop",
    width,
    height,
    offsetLeft,
    offsetTop,
    safeArea,
    ...(boundary === undefined ? {} : { boundary }),
  });
}
