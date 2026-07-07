// Device-frame safe-area injection.
//
// The device-screenshot tool (scripts/device-screenshots.mjs) renders the app
// inside an <iframe> and paints the Dynamic Island / camera punch-hole as an
// overlay. Because the app runs in that iframe over a headless viewport with no
// physical display cutout, the browser reports `env(safe-area-inset-*)` as 0 —
// so any layout that clears the notch via `env()` collapses and slides under
// the painted island.
//
// To make a mock-up match real hardware, the tool encodes the target device's
// safe-area insets and screen-cutout bounding box into a `deviceFrame` query
// param on the iframe URL (see `deviceFrameDescriptor` there). This module
// reads that param on boot and republishes the values as CSS custom properties
// on the document root, so the same layout that reads `env()` on device reads
// the simulated values in a screenshot.
//
// The published properties (all lengths in CSS px):
//   --safe-area-inset-top / -right / -bottom / -left
//       Override the `env(safe-area-inset-*)`-backed defaults declared in
//       index.css. App code reads `var(--safe-area-inset-top)` (never `env()`
//       directly) so both the device and the screenshot resolve correctly.
//   --display-cutout          `1` when a screen cutout is present (else unset).
//   --display-cutout-top / -left / -right / -width / -height
//       The cutout's bounding box, for deliberately placing UI in the unsafe
//       region beside it (e.g. a control to the right of the Dynamic Island).
//       Published only when the target has a visible cutout.
//
// On real hardware no `deviceFrame` param is present, nothing is published, and
// the index.css `env()` defaults apply unchanged.

/** A rectangle (CSS px) locating the screen cutout within the screen. */
export interface DisplayCutout {
  top: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** Safe-area insets (CSS px) reserved on each screen edge. */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The decoded `deviceFrame` descriptor. */
export interface DeviceFrame {
  safeArea: SafeAreaInsets;
  /** Present only when the simulated device has a visible screen cutout. */
  cutout?: DisplayCutout;
}

const SAFE_AREA_VARS: Record<keyof SafeAreaInsets, `--${string}`> = {
  top: "--safe-area-inset-top",
  right: "--safe-area-inset-right",
  bottom: "--safe-area-inset-bottom",
  left: "--safe-area-inset-left",
};

const CUTOUT_VARS: Record<keyof DisplayCutout, `--${string}`> = {
  top: "--display-cutout-top",
  left: "--display-cutout-left",
  right: "--display-cutout-right",
  width: "--display-cutout-width",
  height: "--display-cutout-height",
};

/** Every custom property this module may publish (used to reset a re-apply). */
const ALL_VARS: `--${string}`[] = [
  ...Object.values(SAFE_AREA_VARS),
  "--display-cutout",
  ...Object.values(CUTOUT_VARS),
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSafeArea(value: unknown): SafeAreaInsets | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const insets: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const edge of Object.keys(insets) as (keyof SafeAreaInsets)[]) {
    const raw = record[edge];
    if (raw === undefined) continue;
    if (!isFiniteNumber(raw)) return null;
    insets[edge] = raw;
  }
  return insets;
}

function parseCutout(value: unknown): DisplayCutout | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const cutout: DisplayCutout = {
    top: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
  };
  for (const key of Object.keys(cutout) as (keyof DisplayCutout)[]) {
    const raw = record[key];
    if (!isFiniteNumber(raw)) return null;
    cutout[key] = raw;
  }
  return cutout;
}

/**
 * Decode a `deviceFrame` descriptor from a URL search string. Returns `null`
 * when the param is absent or malformed (a bad descriptor is ignored rather
 * than throwing, so a real device or a hand-edited URL never breaks the app).
 */
export function parseDeviceFrame(search: string): DeviceFrame | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const raw = params.get("deviceFrame");
  if (!raw) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) return null;

  const record = decoded as Record<string, unknown>;
  const safeArea = parseSafeArea(record.safeArea);
  if (!safeArea) return null;

  const frame: DeviceFrame = { safeArea };
  if (record.cutout !== undefined) {
    const cutout = parseCutout(record.cutout);
    if (cutout) frame.cutout = cutout;
  }
  return frame;
}

/**
 * Publish a decoded device frame as CSS custom properties on `root`
 * (defaults to `document.documentElement`). Idempotent: any previously
 * published property is cleared first, so re-applying reflects only the new
 * frame.
 */
export function applyDeviceFrame(
  frame: DeviceFrame,
  root: HTMLElement = document.documentElement,
): void {
  for (const name of ALL_VARS) root.style.removeProperty(name);

  for (const edge of Object.keys(SAFE_AREA_VARS) as (keyof SafeAreaInsets)[]) {
    root.style.setProperty(SAFE_AREA_VARS[edge], `${frame.safeArea[edge]}px`);
  }

  if (frame.cutout) {
    root.style.setProperty("--display-cutout", "1");
    for (const key of Object.keys(CUTOUT_VARS) as (keyof DisplayCutout)[]) {
      root.style.setProperty(CUTOUT_VARS[key], `${frame.cutout[key]}px`);
    }
  }
}

/**
 * Boot entry point: read a `deviceFrame` param from `search` and, when present
 * and valid, publish it. A no-op on real hardware (no param) or in a non-DOM
 * environment. Returns the applied frame for logging/tests, or `null`.
 */
export function applyDeviceFrameFromSearch(search: string): DeviceFrame | null {
  if (typeof document === "undefined") return null;
  const frame = parseDeviceFrame(search);
  if (!frame) return null;
  applyDeviceFrame(frame);
  // Screenshot-only dev path: surface which simulated frame is live so a
  // mock-up that looks wrong can be traced back to the injected metrics.
  if (import.meta.env?.DEV) {
    console.info("[device-frame] applied simulated safe area", frame);
  }
  return frame;
}
