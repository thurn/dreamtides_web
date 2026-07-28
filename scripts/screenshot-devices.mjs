/**
 * Device registry + device-chrome wrapper renderer for the screenshot
 * CLI (scripts/device-screenshots.mjs).
 *
 * Every target is described in *logical* (CSS) pixels plus a device pixel
 * ratio. The physical resolution of a capture is therefore
 * `round(logical * dpr)` in each dimension, which is what a real device would
 * report. Phone numbers are deliberate approximations of the real hardware:
 * they reproduce each screen's aspect ratio, logical working area, and pixel
 * density closely enough for a layout mock-up. Desktop targets use 1x density
 * so the PNG dimensions match the named resolution exactly.
 *
 * Screen cut-outs (Dynamic Island / camera punch-holes) and the home
 * indicator are drawn *on top* of the rendered UI, exactly as they occlude the
 * real screen, so a mock-up shows what the player can actually see. The
 * optional device frame (`--frame`) draws a bezel/body around the screen.
 *
 * Because the app is loaded in an `<iframe>` over a headless viewport with no
 * physical display cutout, the browser reports `env(safe-area-inset-*)` as 0 —
 * so a layout that clears the notch via `env()` would collapse and slide under
 * the painted island. To make the mock-up match hardware, each target's
 * simulated safe-area insets and screen-cutout bounding box are encoded into a
 * `deviceFrame` query param on the iframe URL; the app republishes them as CSS
 * custom properties (see src/runtime/device-frame.ts) so the same layout reads
 * the simulated values in a screenshot that it reads from `env()` on device.
 */

/**
 * @typedef {Object} Cutout
 * @property {"island"|"punch-hole"|"none"} type
 * @property {number} [width]   Island width in CSS px.
 * @property {number} [height]  Island height / punch-hole diameter in CSS px.
 * @property {number} [top]     Distance from the top of the screen in CSS px.
 *
 * @typedef {Object} Bezel
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} left
 *
 * @typedef {Object} SafeArea
 * @property {number} top     Top inset in CSS px (status bar / notch region).
 * @property {number} right   Right inset in CSS px.
 * @property {number} bottom  Bottom inset in CSS px (home indicator).
 * @property {number} left    Left inset in CSS px.
 *
 * @typedef {Object} Device
 * @property {string} id             Stable kebab-case identifier used on the CLI.
 * @property {string} name           Human-readable marketing name.
 * @property {"phone"|"desktop"} kind
 * @property {string} os             "ios" | "android" | "desktop".
 * @property {number} logicalWidth   CSS width.
 * @property {number} logicalHeight  CSS height.
 * @property {number} dpr            Device pixel ratio (deviceScaleFactor).
 * @property {number} radius         Screen corner radius in CSS px.
 * @property {Cutout} cutout
 * @property {SafeArea} [safeArea]  Explicit safe-area insets. When omitted they
 *   are derived from the cutout + home-indicator geometry (see `deviceSafeArea`).
 * @property {"ios"|"android"|"none"} home  Home-indicator style ("none" = physical button).
 * @property {Bezel} bezel           Bezel thickness per side when `--frame` is set.
 * @property {string} body           Device body/bezel colour.
 * @property {boolean} [homeButton]  Draw a physical home button in the bottom bezel.
 * @property {boolean} [foldable]    Marketing note: this is a foldable's inner display.
 * @property {string} [note]         Extra note shown by `--list`.
 */

const uniform = (n) => ({ top: n, right: n, bottom: n, left: n });

export const DESKTOP_VIEWPORTS = [
  {
    id: "desktop-1280x720",
    label: "1280 × 720",
    width: 1280,
    height: 720,
    rationale: "Smallest supported desktop and constrained-height edge case.",
  },
  {
    id: "desktop-1366x768",
    label: "1366 × 768",
    width: 1366,
    height: 768,
    rationale: "Common laptop with constrained vertical space.",
  },
  {
    id: "desktop-1440x900",
    label: "1440 × 900",
    width: 1440,
    height: 900,
    rationale: "Representative 16:10 laptop workspace.",
  },
  {
    id: "desktop-1536x864",
    label: "1536 × 864",
    width: 1536,
    height: 864,
    rationale: "Common scaled laptop viewport.",
  },
  {
    id: "desktop-1920x1080",
    label: "1920 × 1080",
    width: 1920,
    height: 1080,
    rationale: "Mainstream desktop workspace.",
  },
  {
    id: "desktop-2560x1080",
    label: "2560 × 1080",
    width: 2560,
    height: 1080,
    rationale: "Wide desktop with limited vertical space.",
  },
  {
    id: "desktop-2560x1440",
    label: "2560 × 1440",
    width: 2560,
    height: 1440,
    rationale: "Large 16:9 desktop workspace.",
  },
  {
    id: "desktop-2560x1600",
    label: "2560 × 1600",
    width: 2560,
    height: 1600,
    rationale: "Large 16:10 desktop workspace.",
  },
  {
    id: "desktop-3440x1440",
    label: "3440 × 1440",
    width: 3440,
    height: 1440,
    rationale: "Ultrawide max-width and horizontal-composition risk.",
  },
];

const desktop = ({ id, label, width, height, rationale }) => ({
  id,
  name: `${label} Desktop`,
  kind: "desktop",
  os: "desktop",
  logicalWidth: width,
  logicalHeight: height,
  dpr: 1,
  radius: 0,
  cutout: { type: "none" },
  home: "none",
  bezel: uniform(0),
  body: "#000000",
  note: rationale,
});

/** @type {Device[]} */
export const DEVICES = [
  {
    id: "iphone-16",
    name: "iPhone 16",
    kind: "phone",
    os: "ios",
    logicalWidth: 393,
    logicalHeight: 852,
    dpr: 3,
    radius: 48,
    cutout: { type: "island", width: 126, height: 37, top: 11 },
    home: "ios",
    bezel: uniform(14),
    body: "#000000",
  },
  {
    id: "iphone-se-3",
    name: "iPhone SE (3rd gen)",
    kind: "phone",
    os: "ios",
    logicalWidth: 375,
    logicalHeight: 667,
    dpr: 2,
    radius: 3,
    cutout: { type: "none" },
    home: "none",
    bezel: { top: 66, right: 16, bottom: 96, left: 16 },
    body: "#000000",
    homeButton: true,
    note: "Classic Touch ID design: bezels + physical home button, no cut-out.",
  },
  {
    id: "galaxy-s25-ultra",
    name: "Samsung Galaxy S25 Ultra",
    kind: "phone",
    os: "android",
    logicalWidth: 480,
    logicalHeight: 1040,
    dpr: 3,
    radius: 20,
    cutout: { type: "punch-hole", height: 12, top: 15 },
    home: "android",
    bezel: uniform(10),
    body: "#000000",
    note: "QHD+ (1440×3120) at 3× density.",
  },
  {
    id: "galaxy-a16-5g",
    name: "Samsung Galaxy A16 5G",
    kind: "phone",
    os: "android",
    logicalWidth: 393,
    logicalHeight: 851,
    dpr: 2.75,
    radius: 26,
    cutout: { type: "punch-hole", height: 11, top: 14 },
    home: "android",
    bezel: uniform(13),
    body: "#000000",
  },
  {
    id: "razr-plus-2025",
    name: "Motorola Razr+ 2025",
    kind: "phone",
    os: "android",
    logicalWidth: 393,
    logicalHeight: 960,
    dpr: 2.75,
    radius: 28,
    cutout: { type: "punch-hole", height: 11, top: 14 },
    home: "android",
    bezel: uniform(10),
    body: "#000000",
    foldable: true,
    note: "Inner (unfolded) 6.9\" display.",
  },
  {
    id: "galaxy-z-flip7",
    name: "Samsung Galaxy Z Flip7",
    kind: "phone",
    os: "android",
    logicalWidth: 393,
    logicalHeight: 916,
    dpr: 2.75,
    radius: 28,
    cutout: { type: "punch-hole", height: 11, top: 14 },
    home: "android",
    bezel: uniform(10),
    body: "#000000",
    foldable: true,
    note: "Inner (unfolded) 6.9\" display.",
  },
  ...DESKTOP_VIEWPORTS.map(desktop),
];

/** Look up a device by id (case-insensitive). */
export function findDevice(id) {
  const key = String(id).trim().toLowerCase();
  return DEVICES.find((d) => d.id === key) ?? null;
}

/** Physical resolution a capture of this device screen produces. */
export function physicalResolution(device) {
  return {
    width: Math.round(device.logicalWidth * device.dpr),
    height: Math.round(device.logicalHeight * device.dpr),
  };
}

/**
 * The screen cutout's bounding box in CSS px within the screen, or `null` when
 * the device has no cutout. The box is what the wrapper paints (see
 * `renderCutout`): cutouts are horizontally centered, so `left` and `right`
 * (distance from each screen edge to the box) are equal. Exposing both lets a
 * layout anchor UI to the cutout from either edge.
 */
export function deviceCutoutBox(device) {
  const c = device.cutout;
  if (!c || c.type === "none") return null;
  // A punch-hole is a circle whose diameter is its `height`; an island carries
  // an explicit width.
  const width = c.type === "island" ? c.width : c.height;
  const height = c.height;
  const inset = (device.logicalWidth - width) / 2;
  return { top: c.top, left: inset, right: inset, width, height };
}

/**
 * The simulated safe-area insets (CSS px) for a device. An explicit
 * `device.safeArea` wins; otherwise they are derived from the cutout and
 * home-indicator geometry the wrapper already paints, so the reserved region
 * always matches what visually occludes the screen. The derived top inset seats
 * the status-bar/notch band just below the cutout; the bottom inset reserves
 * the home indicator (iOS gesture bar 34px, Android 24px, physical button 0).
 */
export function deviceSafeArea(device) {
  if (device.safeArea) return device.safeArea;
  const c = device.cutout;
  let top = 0;
  if (c && c.type === "island") top = c.top + c.height + 11;
  else if (c && c.type === "punch-hole") top = c.top + c.height + 12;
  let bottom = 0;
  if (device.home === "ios") bottom = 34;
  else if (device.home === "android") bottom = 24;
  return { top, right: 0, bottom, left: 0 };
}

/**
 * Build the `deviceFrame` descriptor injected into the app so its safe-area and
 * cutout-relative layout matches the painted chrome. The cutout box is included
 * only when the wrapper is actually painting it (`showCutout`), so a
 * `--no-cutout` capture never exposes an island the player cannot see.
 */
export function deviceFrameDescriptor(device, showCutout = true) {
  const descriptor = { safeArea: deviceSafeArea(device) };
  if (showCutout) {
    const cutout = deviceCutoutBox(device);
    if (cutout) descriptor.cutout = cutout;
  }
  return descriptor;
}

/**
 * Append the `deviceFrame` query param (URL-encoded JSON descriptor) to the
 * app URL loaded in the iframe, preserving any existing query and fragment.
 */
function withDeviceFrame(appUrl, device, showCutout) {
  const descriptor = deviceFrameDescriptor(device, showCutout);
  const encoded = encodeURIComponent(JSON.stringify(descriptor));
  const hashIndex = appUrl.indexOf("#");
  const base = hashIndex === -1 ? appUrl : appUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : appUrl.slice(hashIndex);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}deviceFrame=${encoded}${hash}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the HTML wrapper page for a single device capture.
 *
 * The page draws, from the outside in:
 *   - an optional device body/bezel (frame mode);
 *   - the rounded screen, clipping an <iframe> that loads the target UI;
 *   - the screen cut-out (Dynamic Island / punch-hole) and home indicator,
 *     painted over the UI.
 *
 * The caller sizes the browser viewport to `page.width × page.height` at
 * `device.dpr`, then screenshots the whole viewport, yielding an image at the
 * device's true pixel density.
 *
 * @returns {{ html: string, width: number, height: number }}
 *   `width`/`height` are the CSS pixel dimensions the viewport must be set to.
 */
export function renderWrapper(device, options = {}) {
  const {
    appUrl,
    frame = false,
    showCutout = true,
    showHome = true,
    backdrop = "#0e0e12",
    caption = null,
    margin = frame ? 40 : 0,
  } = options;

  const bezel = frame ? device.bezel : { top: 0, right: 0, bottom: 0, left: 0 };
  const screenW = device.logicalWidth;
  const screenH = device.logicalHeight;
  const bodyW = screenW + bezel.left + bezel.right;
  const bodyH = screenH + bezel.top + bezel.bottom;
  // Space reserved above the frame for the device-name caption.
  const captionBand = caption ? 26 : 0;
  const pageW = bodyW + margin * 2;
  const pageH = bodyH + captionBand + margin * 2;

  // Outer body radius extends the screen radius by the bezel so the corners
  // stay concentric.
  const outerRadius = frame
    ? device.radius + Math.max(bezel.left, bezel.top, bezel.right, bezel.bottom)
    : device.radius;

  const iframeUrl = withDeviceFrame(appUrl, device, showCutout);
  const cutout = renderCutout(device, showCutout);
  const home = renderHome(device, showHome);
  const homeButton =
    frame && device.homeButton ? renderHomeButton(device, bezel) : "";

  const frameStyles = frame
    ? `
      .body {
        background: ${device.body};
        border-radius: ${outerRadius}px;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.08) inset,
          0 18px 60px rgba(0, 0, 0, 0.55);
        padding: ${bezel.top}px ${bezel.right}px ${bezel.bottom}px ${bezel.left}px;
      }`
    : `.body { background: transparent; }`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${pageW}, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${pageW}px;
    height: ${pageH}px;
    background: ${backdrop};
    overflow: hidden;
  }
  .stage {
    width: ${pageW}px;
    height: ${pageH}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mock {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .caption {
    width: ${bodyW}px;
    height: ${captionBand}px;
    display: flex;
    align-items: center;
    padding-left: 4px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: rgba(236, 236, 241, 0.82);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ${frameStyles}
  .screen {
    position: relative;
    width: ${screenW}px;
    height: ${screenH}px;
    border-radius: ${device.radius}px;
    overflow: hidden;
    background: #000;
  }
  .screen > iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .chrome {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2147483647;
  }
  .cutout-island {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    border-radius: 999px;
  }
  .cutout-punch {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.06);
  }
  .home-ios {
    position: absolute;
    left: 50%;
    bottom: 8px;
    transform: translateX(-50%);
    width: ${Math.round(screenW * 0.36)}px;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28);
    mix-blend-mode: difference;
  }
  .home-android {
    position: absolute;
    left: 50%;
    bottom: 9px;
    transform: translateX(-50%);
    width: ${Math.round(screenW * 0.28)}px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28);
    mix-blend-mode: difference;
  }
  .home-button {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(circle at 50% 40%, #fff, #d9d9dd 70%, #bcbcc2);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(0, 0, 0, 0.12);
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="mock">
      ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ""}
      <div class="body">
        <div class="screen">
          <iframe src="${escapeHtml(iframeUrl)}" title="${escapeHtml(device.name)}" scrolling="no"></iframe>
          <div class="chrome">
            ${cutout}
            ${home}
          </div>
        </div>
        ${homeButton}
      </div>
    </div>
  </div>
</body>
</html>`;

  return { html, width: pageW, height: pageH };
}

function renderCutout(device, show) {
  if (!show || device.cutout.type === "none") return "";
  const c = device.cutout;
  if (c.type === "island") {
    return `<div class="cutout-island" style="top:${c.top}px;width:${c.width}px;height:${c.height}px;"></div>`;
  }
  // punch-hole
  return `<div class="cutout-punch" style="top:${c.top}px;width:${c.height}px;height:${c.height}px;"></div>`;
}

function renderHome(device, show) {
  if (!show || device.home === "none") return "";
  if (device.home === "ios") return `<div class="home-ios"></div>`;
  return `<div class="home-android"></div>`;
}

function renderHomeButton(device, bezel) {
  const size = 46;
  // Centre the button vertically within the bottom bezel band.
  const bottom = Math.max(6, Math.round((bezel.bottom - size) / 2));
  return `<div class="home-button" style="width:${size}px;height:${size}px;bottom:${bottom}px;"></div>`;
}
