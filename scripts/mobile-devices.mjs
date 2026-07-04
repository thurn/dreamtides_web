/**
 * Device registry + device-chrome wrapper renderer for the mobile screenshot
 * CLI (scripts/mobile-screenshot.mjs).
 *
 * Every device is described in *logical* (CSS) pixels plus a device pixel
 * ratio. The physical resolution of a capture is therefore
 * `round(logical * dpr)` in each dimension, which is what a real device would
 * report. The numbers here are deliberate approximations of the real hardware:
 * they reproduce each screen's aspect ratio, logical working area, and pixel
 * density closely enough for a layout mock-up, not a pixel-perfect emulation.
 *
 * Screen cut-outs (Dynamic Island / camera punch-holes) and the home
 * indicator are drawn *on top* of the rendered UI, exactly as they occlude the
 * real screen, so a mock-up shows what the player can actually see. The
 * optional device frame (`--frame`) draws a bezel/body around the screen.
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
 * @typedef {Object} Device
 * @property {string} id             Stable kebab-case identifier used on the CLI.
 * @property {string} name           Human-readable marketing name.
 * @property {string} os             "ios" | "android".
 * @property {number} logicalWidth   Portrait CSS width.
 * @property {number} logicalHeight  Portrait CSS height.
 * @property {number} dpr            Device pixel ratio (deviceScaleFactor).
 * @property {number} radius         Screen corner radius in CSS px.
 * @property {Cutout} cutout
 * @property {"ios"|"android"|"none"} home  Home-indicator style ("none" = physical button).
 * @property {Bezel} bezel           Bezel thickness per side when `--frame` is set.
 * @property {string} body           Device body/bezel colour.
 * @property {boolean} [homeButton]  Draw a physical home button in the bottom bezel.
 * @property {boolean} [foldable]    Marketing note: this is a foldable's inner display.
 * @property {string} [note]         Extra note shown by `--list`.
 */

const uniform = (n) => ({ top: n, right: n, bottom: n, left: n });

/** @type {Device[]} */
export const DEVICES = [
  {
    id: "iphone-16",
    name: "iPhone 16",
    os: "ios",
    logicalWidth: 393,
    logicalHeight: 852,
    dpr: 3,
    radius: 48,
    cutout: { type: "island", width: 126, height: 37, top: 11 },
    home: "ios",
    bezel: uniform(14),
    body: "#0a0a0c",
  },
  {
    id: "iphone-se-3",
    name: "iPhone SE (3rd gen)",
    os: "ios",
    logicalWidth: 375,
    logicalHeight: 667,
    dpr: 2,
    radius: 3,
    cutout: { type: "none" },
    home: "none",
    bezel: { top: 66, right: 16, bottom: 96, left: 16 },
    body: "#f4f4f5",
    homeButton: true,
    note: "Classic Touch ID design: bezels + physical home button, no cut-out.",
  },
  {
    id: "galaxy-s25-ultra",
    name: "Samsung Galaxy S25 Ultra",
    os: "android",
    logicalWidth: 480,
    logicalHeight: 1040,
    dpr: 3,
    radius: 20,
    cutout: { type: "punch-hole", height: 12, top: 15 },
    home: "android",
    bezel: uniform(10),
    body: "#050506",
    note: "QHD+ (1440×3120) at 3× density.",
  },
  {
    id: "galaxy-a16-5g",
    name: "Samsung Galaxy A16 5G",
    os: "android",
    logicalWidth: 393,
    logicalHeight: 851,
    dpr: 2.75,
    radius: 26,
    cutout: { type: "punch-hole", height: 11, top: 14 },
    home: "android",
    bezel: uniform(13),
    body: "#101014",
  },
  {
    id: "razr-plus-2025",
    name: "Motorola Razr+ 2025",
    os: "android",
    logicalWidth: 393,
    logicalHeight: 960,
    dpr: 2.75,
    radius: 28,
    cutout: { type: "punch-hole", height: 11, top: 14 },
    home: "android",
    bezel: uniform(10),
    body: "#0a0a0c",
    foldable: true,
    note: "Inner (unfolded) 6.9\" display.",
  },
  {
    id: "galaxy-z-flip7",
    name: "Samsung Galaxy Z Flip7",
    os: "android",
    logicalWidth: 393,
    logicalHeight: 916,
    dpr: 2.75,
    radius: 28,
    cutout: { type: "punch-hole", height: 11, top: 14 },
    home: "android",
    bezel: uniform(10),
    body: "#0a0a0c",
    foldable: true,
    note: "Inner (unfolded) 6.9\" display.",
  },
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
    margin = frame ? 40 : 0,
  } = options;

  const bezel = frame ? device.bezel : { top: 0, right: 0, bottom: 0, left: 0 };
  const screenW = device.logicalWidth;
  const screenH = device.logicalHeight;
  const bodyW = screenW + bezel.left + bezel.right;
  const bodyH = screenH + bezel.top + bezel.bottom;
  const pageW = bodyW + margin * 2;
  const pageH = bodyH + margin * 2;

  // Outer body radius extends the screen radius by the bezel so the corners
  // stay concentric.
  const outerRadius = frame
    ? device.radius + Math.max(bezel.left, bezel.top, bezel.right, bezel.bottom)
    : device.radius;

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
    <div class="body">
      <div class="screen">
        <iframe src="${escapeHtml(appUrl)}" title="${escapeHtml(device.name)}" scrolling="no"></iframe>
        <div class="chrome">
          ${cutout}
          ${home}
        </div>
      </div>
      ${homeButton}
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
