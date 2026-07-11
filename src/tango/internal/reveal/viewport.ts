import type { RevealSafeArea } from "./model";
import { SAFE_AREA_INSET_PROPERTIES } from "../../primitives/safe-area";

export interface VisualViewportSnapshot {
  readonly layout: "mobile" | "desktop";
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly safeArea: RevealSafeArea;
}

function physicalInset(styles: CSSStyleDeclaration, name: string): number {
  const value = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

export function captureVisualViewport(target: Window = window): VisualViewportSnapshot {
  const visual = target.visualViewport;
  const width = visual?.width ?? target.innerWidth;
  const height = visual?.height ?? target.innerHeight;
  const styles = target.getComputedStyle(target.document.documentElement);
  const safeArea = Object.freeze({
    top: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.top),
    right: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.right),
    bottom: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.bottom),
    left: physicalInset(styles, SAFE_AREA_INSET_PROPERTIES.left),
  });
  return Object.freeze({
    layout: width < 900 ? "mobile" : "desktop",
    width,
    height,
    offsetLeft: visual?.offsetLeft ?? 0,
    offsetTop: visual?.offsetTop ?? 0,
    safeArea,
  });
}
