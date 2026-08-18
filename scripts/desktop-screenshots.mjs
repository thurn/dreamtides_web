#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CORE_SCENE_IDS,
  SMOKE_SCENE_IDS,
  UsageError,
  VIEWPORT_PRESETS,
  parseDesktopScreenshotArgs,
  resolveSceneSelection,
  resolveViewportSelection,
} from "./desktop-screenshot-config.mjs";
import {
  buildManifest,
  buildCaptureExceptionCell,
  buildSceneUrl,
  cellOutputPath,
  evaluateCaptureHealth,
  formatCompactResult,
  relativeCellOutputPath,
  renderContactSheetHtml,
  renderIndexHtml,
  withReportDiagnostics,
} from "./desktop-screenshot-report.mjs";
import {
  connectPlaywrightMcp,
  parseMcpResult,
  startScreenshotDevServer,
  stopProcessTree,
  waitForServer,
} from "./screenshot-runtime.mjs";
import { DESKTOP_VIEWPORTS } from "./screenshot-devices.mjs";

const ARTIFACT_ROOT = "artifacts/journey-desktop-screenshots";
const PAGE_READY_TIMEOUT_MS = 45_000;

const HELP = `desktop-screenshots - compact Dream Journey desktop screenshot matrices.

Usage:
  npm run screenshots:desktop -- [options]
  node scripts/desktop-screenshots.mjs [options]

Selection:
      --scene-preset <name>     core (default), smoke, or full
      --viewport-preset <name>  core (default) or extended
      --smoke                   Shortcut for --scene-preset smoke
      --extended                Shortcut for --viewport-preset extended
      --scene <id>              QA scene to capture; repeatable
      --viewport <id>           Desktop viewport to capture; repeatable
      --list-scenes             List scene presets and registered scenes
      --list-viewports          List viewport presets and dimensions

Server and repeatability:
      --start                   Start and stop one local server for this run
      --url <base>              Use a caller-supplied server
      --port <n>                Managed/default server port (default: 5178)
      --seed <n>                Deterministic QA seed (default: 42)

Output:
      --run-id <id>             Stable artifact subdirectory name
      --json                    Print one compact machine-readable result
  -v, --verbose                 Print successful-cell readiness details
  -h, --help                    Show this help

Examples:
  npm run screenshots:desktop -- --start
  npm run screenshots:desktop -- --start --smoke
  npm run screenshots:desktop -- --start --extended
  npm run screenshots:desktop -- --start --scene atlas
  npm run screenshots:desktop -- --url http://localhost:5178 \\
    --scene draft --scene battle-playable \\
    --viewport 1366x768 --viewport 1920x1080
`;

const ERROR_INIT_SCRIPT = `
(() => {
  window.__desktopCaptureErrors = { page: [], rejections: [], console: [] };
  window.addEventListener("error", (event) => {
    window.__desktopCaptureErrors.page.push(
      String(event.message || event.error || "window error").slice(0, 1500),
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    window.__desktopCaptureErrors.rejections.push(
      String(event.reason?.stack || event.reason || "unhandled rejection").slice(0, 1500),
    );
  });
  const originalConsoleError = console.error;
  console.error = (...args) => {
    window.__desktopCaptureErrors.console.push(
      args.map((entry) => entry?.stack || String(entry)).join(" | ").slice(0, 1500),
    );
    originalConsoleError.apply(console, args);
  };
})();
`;

function readinessExpression(timeoutMs) {
  return `(async () => {
    const startedAt = Date.now();
    const deadline = startedAt + ${String(timeoutMs)};
    let stableMeasurements = 0;
    let previousSignature = null;
    let latest = null;
    let fontsReady = false;
    try {
      fontsReady = document.fonts?.ready
        ? await Promise.race([
            document.fonts.ready.then(() => true),
            new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
          ])
        : true;
    } catch {}
    while (Date.now() < deadline) {
      const root = document.getElementById("root");
      const rootRect = root?.getBoundingClientRect();
      const visibleImages = [...document.images].filter((image) => {
        const rect = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return rect.width > 0 && rect.height > 0 &&
          rect.bottom > 0 && rect.right > 0 &&
          rect.top < innerHeight && rect.left < innerWidth &&
          style.display !== "none" && style.visibility !== "hidden";
      });
      const broken = visibleImages
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => ({ src: image.currentSrc || image.src, complete: image.complete, naturalWidth: image.naturalWidth }));
      const rootText = root?.textContent?.trim() || "";
      const loadingCopy = [
        "Opening QA Scene",
        "Creating Game",
        "Joining Game",
        "Connecting to Game Service",
        "Loading Journey Content",
      ];
      const url = new URL(location.href);
      latest = {
        ready: false,
        url: location.href,
        fontsReady,
        stableMeasurements,
        waitMs: Date.now() - startedAt,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        root: {
          childElementCount: root?.childElementCount || 0,
          textLength: rootText.length,
          visibleMediaCount: root?.querySelectorAll("img, canvas, svg, video").length || 0,
          bounds: rootRect ? {
            x: rootRect.x, y: rootRect.y, width: rootRect.width, height: rootRect.height,
          } : null,
        },
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
        },
        images: {
          total: document.images.length,
          visible: visibleImages.length,
          broken,
        },
        errors: {
          page: window.__desktopCaptureErrors?.page || ["capture error buffer missing"],
          rejections: window.__desktopCaptureErrors?.rejections || [],
          console: window.__desktopCaptureErrors?.console || [],
        },
      };
      const signature = JSON.stringify({
        viewport: latest.viewport,
        root: latest.root,
        document: latest.document,
        imageCount: latest.images.total,
      });
      stableMeasurements = signature === previousSignature ? stableMeasurements + 1 : 0;
      previousSignature = signature;
      const contentReady =
        url.searchParams.has("game") &&
        latest.root.childElementCount > 0 &&
        latest.root.textLength + latest.root.visibleMediaCount > 0 &&
        !loadingCopy.some((copy) => rootText.includes(copy)) &&
        broken.length === 0;
      if (contentReady && stableMeasurements >= 2) {
        return {
          ...latest,
          ready: true,
          stableMeasurements,
          waitMs: Date.now() - startedAt,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
      ...latest,
      ready: false,
      stableMeasurements,
      waitMs: Date.now() - startedAt,
      readinessMessage: "Timed out waiting for the QA room and stable rendered layout.",
    };
  })()`;
}

function loadQaSceneCatalog(cwd) {
  const helper = join(cwd, "scripts/list-qa-scenes.mjs");
  const rawImportLoader = join(cwd, "scripts/register-raw-import-loader.mjs");
  const output = execFileSync(
    process.execPath,
    [`--import=${rawImportLoader}`, "--import=tsx", helper],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return JSON.parse(output);
}

function createRunId() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace("Z", "");
  return `${timestamp}-${String(process.pid)}`;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listScenes(catalog, json) {
  const result = {
    presets: {
      core: CORE_SCENE_IDS,
      smoke: SMOKE_SCENE_IDS,
      full: catalog.map((scene) => scene.id),
    },
    scenes: catalog,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(
    [
      `core: ${result.presets.core.join(", ")}`,
      `smoke: ${result.presets.smoke.join(", ")}`,
      `full: every registered QA scene (${String(catalog.length)})`,
      "",
      ...catalog.map((scene) => `${scene.id}\t${scene.label}`),
      "",
    ].join("\n"),
  );
}

function listViewports(json) {
  const result = {
    presets: VIEWPORT_PRESETS,
    viewports: DESKTOP_VIEWPORTS.map((viewport) => ({
      ...viewport,
      dpr: 1,
    })),
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(
    [
      `core: ${VIEWPORT_PRESETS.core.join(", ")}`,
      `extended: ${VIEWPORT_PRESETS.extended.join(", ")}`,
      "",
      ...result.viewports.map(
        (viewport) =>
          `${viewport.id}\t${String(viewport.width)}×${String(viewport.height)} @ 1×\t${viewport.rationale}`,
      ),
      "",
    ].join("\n"),
  );
}

async function main() {
  const options = parseDesktopScreenshotArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const cwd = process.cwd();
  const catalog = loadQaSceneCatalog(cwd);
  if (options.listScenes || options.listViewports) {
    if (options.listScenes) listScenes(catalog, options.json);
    if (options.listViewports) listViewports(options.json);
    return;
  }

  const scenes = resolveSceneSelection(options, catalog);
  const viewports = resolveViewportSelection(options);
  const runId = options.runId ?? createRunId();
  const runDir = resolvePath(cwd, ARTIFACT_ROOT, runId);
  mkdirSync(runDir, { recursive: true });

  const browserClient = `desktop-screenshots-${String(process.pid)}-${Date.now().toString(36)}`;
  const browser = await connectPlaywrightMcp({
    name: browserClient,
    roots: [cwd, runDir],
  });
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  let devServer = null;
  let browserStarted = true;
  let cleanupStarted = false;
  const cleanup = async () => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    if (browserStarted) {
      try {
        await browser.close();
      } catch {
        process.stderr.write(
          `Could not close Playwright MCP context ${browserClient}.\n`,
        );
      }
    }
    if (devServer) {
      process.stderr.write("Stopping dev server …\n");
      await stopProcessTree(devServer);
    }
  };
  const handleSignal = (signal) => {
    process.stderr.write(`Received ${signal}; cleaning up this run …\n`);
    void cleanup().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    if (options.start) {
      devServer = await startScreenshotDevServer(options.port, { cwd });
    } else {
      const ready = await waitForServer(options.baseUrl, 4_000);
      if (!ready) {
        throw new UsageError(
          `no server reachable at ${options.baseUrl}; pass --start or provide --url`,
        );
      }
    }

    await browser.call("browser_run_code_unsafe", {
      code: `async (page) => {
        await page.addInitScript({ content: ${JSON.stringify(ERROR_INIT_SCRIPT)} });
        await page.emulateMedia({ colorScheme: "dark" });
      }`,
    });
    const cells = [];
    const total = scenes.length * viewports.length;
    let current = 0;

    for (const scene of scenes) {
      mkdirSync(join(runDir, scene.id), { recursive: true });
      for (const viewport of viewports) {
        current += 1;
        const cellStartedAt = Date.now();
        const expectedUrl = buildSceneUrl(
          options.baseUrl,
          scene.id,
          options.seed,
        );
        const relativeOutput = relativeCellOutputPath(scene.id, viewport.id);
        const output = cellOutputPath(runDir, scene.id, viewport.id);
        process.stderr.write(
          `[${String(current)}/${String(total)}] ${scene.id} · ${viewport.id}\n`,
        );

        try {
          await browser.call("browser_resize", {
            width: viewport.width,
            height: viewport.height,
          });
          await browser.call("browser_navigate", { url: expectedUrl });
          const measurement = parseMcpResult(
            await browser.call("browser_evaluate", {
              function: readinessExpression(PAGE_READY_TIMEOUT_MS),
            }),
          );
          const health = evaluateCaptureHealth(measurement, {
            url: expectedUrl,
            sceneId: scene.id,
            width: viewport.width,
            height: viewport.height,
          });
          await browser.call("browser_take_screenshot", {
            filename: output,
            scale: "css",
          });
          if (statSync(output).size === 0) {
            health.diagnostics.push({
              code: "empty-screenshot",
              message: "The captured PNG is empty.",
            });
            health.passed = false;
          }
          const cell = {
            sceneId: scene.id,
            viewportId: viewport.id,
            status: health.passed ? "passed" : "failed",
            url: expectedUrl,
            actualUrl: measurement.url,
            output: relativeOutput,
            timingMs: Date.now() - cellStartedAt,
            readiness: {
              ready: measurement.ready,
              fontsReady: measurement.fontsReady,
              stableMeasurements: measurement.stableMeasurements,
              waitMs: measurement.waitMs,
            },
            geometry: {
              viewport: measurement.viewport,
              root: measurement.root,
              document: measurement.document,
            },
            images: measurement.images,
            errors: measurement.errors,
            diagnostics: health.diagnostics,
          };
          cells.push(cell);
          if (!health.passed) {
            process.stderr.write(
              `  failed: ${health.diagnostics.map((entry) => entry.message).join(" ")}\n`,
            );
          } else if (options.verbose) {
            process.stderr.write(
              `  ready in ${String(measurement.waitMs)} ms; document ${String(measurement.document.scrollWidth)}×${String(measurement.document.scrollHeight)}\n`,
            );
          }
        } catch (error) {
          const cell = buildCaptureExceptionCell({
            sceneId: scene.id,
            viewportId: viewport.id,
            expectedUrl,
            relativeOutput,
            timingMs: Date.now() - cellStartedAt,
            message: error instanceof Error ? error.message : String(error),
          });
          cells.push(cell);
          process.stderr.write(`  failed: ${cell.diagnostics[0].message}\n`);
        }
      }
    }

    const groups = [...new Set(scenes.map((scene) => scene.group))];
    const contactSheets = groups.map((group) => `contact-sheet-${group}.png`);
    const completedAt = Date.now();
    let manifest = buildManifest({
      run: {
        id: runId,
        startedAt: startedAtIso,
        completedAt: new Date(completedAt).toISOString(),
        elapsedMs: completedAt - startedAt,
        baseUrl: options.baseUrl,
        seed: options.seed,
        scenePreset:
          options.scenes.length > 0 ? "targeted" : options.scenePreset,
        viewportPreset:
          options.viewports.length > 0 ? "targeted" : options.viewportPreset,
        managedServer: options.start,
        serverPort: options.start ? options.port : null,
        browserSession: browserClient,
      },
      scenes,
      viewports,
      cells,
      contactSheets,
    });
    const manifestPath = join(runDir, "manifest.json");
    const reportPath = join(runDir, "index.html");
    writeJson(manifestPath, manifest);
    writeFileSync(reportPath, renderIndexHtml(manifest), "utf8");

    const contactDiagnostics = [];
    const completedContactSheets = [];
    for (const group of groups) {
      const htmlPath = join(runDir, `.contact-sheet-${group}.html`);
      const pngPath = join(runDir, `contact-sheet-${group}.png`);
      const contactSheetHtml = renderContactSheetHtml(manifest, group);
      writeFileSync(htmlPath, contactSheetHtml, "utf8");
      try {
        const sheetWidth = Math.min(3_200, 220 + viewports.length * 296);
        await browser.call("browser_resize", {
          width: sheetWidth,
          height: 360,
        });
        await browser.call("browser_run_code_unsafe", {
          code: `async (page) => {
            await page.goto(${JSON.stringify(pathToFileURL(htmlPath).href)}, { waitUntil: "load" });
          }`,
        });
        await browser.call("browser_evaluate", {
          function: `async () => {
            await Promise.all([...document.images].map((image) => image.complete
              ? null
              : new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                })));
            return { images: document.images.length, height: document.documentElement.scrollHeight };
          }`,
        });
        await browser.call("browser_take_screenshot", {
          filename: pngPath,
          fullPage: true,
          scale: "css",
        });
        if (statSync(pngPath).size === 0) {
          throw new Error("rendered contact sheet is empty");
        }
        completedContactSheets.push(basename(pngPath));
      } catch (error) {
        contactDiagnostics.push({
          group,
          message: error instanceof Error ? error.message : String(error),
        });
        process.stderr.write(
          `Contact sheet ${group} failed: ${contactDiagnostics.at(-1).message}\n`,
        );
      }
    }

    manifest = withReportDiagnostics(
      manifest,
      completedContactSheets,
      contactDiagnostics,
    );
    writeJson(manifestPath, manifest);
    writeFileSync(reportPath, renderIndexHtml(manifest), "utf8");

    const elapsedMs = Date.now() - startedAt;
    const result = {
      captures: cells.length,
      failures:
        cells.filter((cell) => cell.status !== "passed").length +
        contactDiagnostics.length,
      elapsedMs,
      manifest: manifestPath,
      report: reportPath,
      contactSheets: contactSheets
        .map((name) => join(runDir, name))
        .filter((path) => {
          try {
            return statSync(path).size > 0;
          } catch {
            return false;
          }
        }),
    };
    process.stdout.write(formatCompactResult(result, options.json));
    if (result.failures > 0) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    await cleanup();
  }
}

main().catch((error) => {
  const prefix =
    error instanceof UsageError
      ? "desktop-screenshots"
      : "desktop-screenshots failed";
  process.stderr.write(`${prefix}: ${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
