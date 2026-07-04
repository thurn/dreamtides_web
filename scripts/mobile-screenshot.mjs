#!/usr/bin/env node
/**
 * mobile-screenshot — fast mobile mock-ups of the quest prototype UI.
 *
 * Renders the running quest prototype web app inside an emulated phone screen
 * (correct logical resolution, aspect ratio and pixel density) and captures a
 * PNG. This is a *mock-up*, not a real device: it never talks to a physical
 * phone, the iOS Simulator, or an Android emulator. It drives a headless
 * Chromium (via the `agent-browser` CLI) at the target device's viewport and
 * device-pixel-ratio, paints the screen cut-out (Dynamic Island / camera
 * punch-hole) and home indicator over the UI, and can wrap the whole thing in a
 * device frame.
 *
 * The status bar (clock / battery / Wi-Fi) is intentionally omitted so the UI
 * renders truly full-screen, edge to edge.
 *
 * Requires only Node 18+ plus the `agent-browser` CLI. It captures whatever the
 * app serves at `--url`, so a dev server must be reachable (or pass `--start`
 * to launch one for the duration of the run).
 *
 * Run with --help for the full flag list.
 */

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute, resolve as resolvePath, extname } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  DEVICES,
  findDevice,
  physicalResolution,
  renderWrapper,
} from "./mobile-devices.mjs";

const DEFAULT_PORT = 5178;
const DEFAULT_WAIT_MS = 4500;

const HELP = `mobile-screenshot — emulated mobile mock-ups of the quest prototype UI.

Usage:
  node scripts/mobile-screenshot.mjs [options]
  npm run mobile-screenshot -- [options]

Captures the running web app at a phone's resolution / aspect ratio / pixel
density and writes a PNG per device. This is a rendered mock-up — no real
device, simulator, or emulator is involved. The status bar is omitted (edge to
edge UI); screen cut-outs and the home indicator are painted over the UI.

Device selection:
  -d, --device <id>   Device to capture (repeatable, or comma-separated).
                      Defaults to iphone-16 if neither this nor --all is given.
      --all           Capture every known device.
      --list          List known devices (with resolutions) and exit.

Target UI:
      --url <base>    Base URL of a running dev server.
                      Default: http://localhost:${DEFAULT_PORT}
      --port <n>      Shortcut for --url http://localhost:<n>.
      --route <path>  App route/path to open. Default: /
      --scene <id>    Jump to a QA scene (adds ?goto=<id>). See
                      docs/quest_prototype/qa_scenes.md.
      --query <str>   Extra raw query string appended to the URL
                      (without a leading ? or &).
      --start         Start a dev server (npm run dev) for the run and stop it
                      afterwards. Uses --port (default ${DEFAULT_PORT}).

Appearance:
      --frame         Draw a device body / bezel around the screen. Adds a
                      small device-name caption above the frame.
      --no-cutout     Hide the Dynamic Island / camera punch-hole.
      --no-home       Hide the home indicator.
      --no-caption    Omit the device-name caption in --frame mode.
      --backdrop <c>  CSS colour behind the screen's rounded corners.
                      Default: #0e0e12
      --dark          Prefer dark colour scheme (default).
      --light         Prefer light colour scheme.

Capture:
  -o, --out <path>    Output directory, or a .png file when one device is
                      selected. Default: ./screenshots
      --wait <ms>     Delay after load before capturing. Default: ${DEFAULT_WAIT_MS}
      --scale <n>     Override the device pixel ratio (e.g. 1 for a smaller
                      file). Default: each device's true density.

Misc:
      --session <s>   agent-browser session name. Default: a per-run name.
      --json          Print machine-readable JSON describing the output.
  -h, --help          Show this help.

Examples:
  # A running dev server on port 5178, default iPhone 16, default route:
  node scripts/mobile-screenshot.mjs

  # Every device, framed, jumping to the shop QA scene:
  node scripts/mobile-screenshot.mjs --all --frame --scene shop

  # Auto-start a server, capture two devices into a folder:
  node scripts/mobile-screenshot.mjs --start -d iphone-16 -d galaxy-z-flip7 -o ./out
`;

function fail(message) {
  process.stderr.write(`mobile-screenshot: ${message}\n`);
  process.exit(1);
}

function parse(argv) {
  try {
    const { values } = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        device: { type: "string", short: "d", multiple: true },
        all: { type: "boolean" },
        list: { type: "boolean" },
        url: { type: "string" },
        port: { type: "string" },
        route: { type: "string" },
        scene: { type: "string" },
        query: { type: "string" },
        start: { type: "boolean" },
        frame: { type: "boolean" },
        "no-cutout": { type: "boolean" },
        "no-home": { type: "boolean" },
        "no-caption": { type: "boolean" },
        backdrop: { type: "string", default: "#0e0e12" },
        dark: { type: "boolean" },
        light: { type: "boolean" },
        out: { type: "string", short: "o" },
        wait: { type: "string" },
        scale: { type: "string" },
        session: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
    return values;
  } catch (error) {
    fail(error.message);
  }
}

function listDevices() {
  const rows = DEVICES.map((d) => {
    const p = physicalResolution(d);
    return {
      id: d.id,
      name: d.name,
      logical: `${d.logicalWidth}×${d.logicalHeight}`,
      physical: `${p.width}×${p.height}`,
      dpr: d.dpr,
      note: d.note ?? (d.foldable ? "Foldable inner display." : ""),
    };
  });
  const idW = Math.max(...rows.map((r) => r.id.length), 2);
  const nameW = Math.max(...rows.map((r) => r.name.length), 4);
  const logW = Math.max(...rows.map((r) => r.logical.length), 7);
  const physW = Math.max(...rows.map((r) => r.physical.length), 8);
  const header =
    `${"id".padEnd(idW)}  ${"name".padEnd(nameW)}  ` +
    `${"logical".padEnd(logW)}  ${"physical".padEnd(physW)}  dpr  note`;
  const lines = rows.map(
    (r) =>
      `${r.id.padEnd(idW)}  ${r.name.padEnd(nameW)}  ` +
      `${r.logical.padEnd(logW)}  ${r.physical.padEnd(physW)}  ` +
      `${String(r.dpr).padEnd(3)}  ${r.note}`,
  );
  process.stdout.write(`${header}\n${lines.join("\n")}\n`);
}

function resolveDevices(values) {
  if (values.all) return [...DEVICES];
  const raw = values.device ?? [];
  const ids = raw
    .flatMap((entry) => String(entry).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return [findDevice("iphone-16")];
  const result = [];
  for (const id of ids) {
    const device = findDevice(id);
    if (!device) {
      fail(
        `unknown device "${id}". Run with --list to see valid ids.`,
      );
    }
    if (!result.includes(device)) result.push(device);
  }
  return result;
}

function buildBaseUrl(values) {
  if (values.url) return values.url.replace(/\/+$/, "");
  const port = values.port ? Number(values.port) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) fail(`invalid --port "${values.port}"`);
  return `http://localhost:${port}`;
}

function buildAppUrl(values, base) {
  let route = values.route ?? "/";
  if (!route.startsWith("/")) route = `/${route}`;
  const params = [];
  if (values.scene) params.push(`goto=${encodeURIComponent(values.scene)}`);
  if (values.query) params.push(values.query.replace(/^[?&]/, ""));
  const query = params.length ? `?${params.join("&")}` : "";
  return `${base}${route}${query}`;
}

function resolveAgentBrowser() {
  if (process.env.AGENT_BROWSER) return process.env.AGENT_BROWSER.split(" ");
  const homebrew = "/opt/homebrew/bin/agent-browser";
  if (existsSync(homebrew)) return [homebrew];
  return ["agent-browser"];
}

function makeRunner(binary, session) {
  return function run(args, { capture = false } = {}) {
    const full = [...binary.slice(1), "--session", session, ...args];
    return execFileSync(binary[0], full, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
      encoding: "utf8",
    });
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base, { method: "GET" });
      if (res.ok || res.status < 500) return true;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  return false;
}

async function startDevServer(port) {
  process.stderr.write(`Starting dev server on port ${port} …\n`);
  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    stdio: ["ignore", "inherit", "inherit"],
    detached: false,
  });
  const base = `http://localhost:${port}`;
  const ready = await waitForServer(base, 90_000);
  if (!ready) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    fail(`dev server did not become ready at ${base} within 90s`);
  }
  return child;
}

function outputPathFor(device, values, devices) {
  const out = values.out ?? "./screenshots";
  const framed = values.frame ? "-frame" : "";
  if (extname(out).toLowerCase() === ".png") {
    if (devices.length > 1) {
      fail("--out is a single .png file but multiple devices were selected.");
    }
    return isAbsolute(out) ? out : resolvePath(process.cwd(), out);
  }
  const dir = isAbsolute(out) ? out : resolvePath(process.cwd(), out);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${device.id}${framed}.png`);
}

async function main() {
  const values = parse(process.argv.slice(2));

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.list) {
    listDevices();
    return;
  }
  if (values.dark && values.light) {
    fail("--dark and --light are mutually exclusive.");
  }

  const devices = resolveDevices(values);
  const base = buildBaseUrl(values);
  const appUrl = buildAppUrl(values, base);
  const waitMs = values.wait ? Number(values.wait) : DEFAULT_WAIT_MS;
  if (!Number.isFinite(waitMs) || waitMs < 0) fail(`invalid --wait "${values.wait}"`);
  const colorScheme = values.light ? "light" : "dark";

  const binary = resolveAgentBrowser();
  const session = values.session ?? `mobilecap-${process.pid}`;
  const run = makeRunner(binary, session);

  const tmpDir = mkdtempSync(join(tmpdir(), "mobile-screenshot-"));
  let devServer = null;

  try {
    if (values.start) {
      const port = values.port ? Number(values.port) : DEFAULT_PORT;
      devServer = await startDevServer(port);
    } else {
      const up = await waitForServer(base, 4000);
      if (!up) {
        fail(
          `no dev server reachable at ${base}. Start one (e.g. ` +
            `\`npm run dev -- --port ${values.port ?? DEFAULT_PORT}\`) or pass --start.`,
        );
      }
    }

    const results = [];
    for (const device of devices) {
      const scale = values.scale ? Number(values.scale) : device.dpr;
      if (!Number.isFinite(scale) || scale <= 0) fail(`invalid --scale "${values.scale}"`);

      const framed = Boolean(values.frame);
      const caption =
        framed && !values["no-caption"] ? device.name : null;
      const { html, width, height } = renderWrapper(device, {
        appUrl,
        frame: framed,
        showCutout: !values["no-cutout"],
        showHome: !values["no-home"],
        backdrop: values.backdrop,
        caption,
      });
      const wrapperPath = join(tmpDir, `${device.id}.html`);
      writeFileSync(wrapperPath, html, "utf8");
      const wrapperUrl = pathToFileURL(wrapperPath).href;
      const outPath = outputPathFor(device, values, devices);

      process.stderr.write(`Capturing ${device.name} → ${outPath}\n`);
      run(["set", "viewport", String(width), String(height), String(scale)]);
      run(["set", "media", colorScheme]);
      run(["open", wrapperUrl]);
      run(["wait", String(waitMs)]);
      run(["screenshot", outPath]);

      results.push({
        device: device.id,
        name: device.name,
        output: outPath,
        viewport: { width, height, deviceScaleFactor: scale },
        image: {
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        },
        framed: Boolean(values.frame),
        url: appUrl,
      });
    }

    if (values.json) {
      process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
    } else {
      process.stdout.write(`\nCaptured ${results.length} screenshot(s):\n`);
      for (const r of results) {
        process.stdout.write(
          `  ${r.name.padEnd(26)} ${r.image.width}×${r.image.height}  ${r.output}\n`,
        );
      }
    }
  } finally {
    try {
      run(["close"]);
    } catch {
      // session may not exist if we failed early
    }
    if (devServer) {
      process.stderr.write("Stopping dev server …\n");
      try {
        devServer.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  fail(error?.stack ?? String(error));
});
