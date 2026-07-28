import { parseArgs } from "node:util";
import { DESKTOP_VIEWPORTS } from "./screenshot-devices.mjs";
import { DEFAULT_SCREENSHOT_PORT } from "./screenshot-runtime.mjs";

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export const CORE_SCENE_IDS = [
  "dream-avatar-select",
  "dreamscape",
  "atlas",
  "draft",
  "shop",
  "deckviewer",
  "poolviewer",
  "startingdeck",
  "reward-at-cap",
  "battle",
  "battle-playable",
  "journeycomplete",
  "journeyfailed",
];

export const SMOKE_SCENE_IDS = [
  "dream-avatar-select",
  "dreamscape",
  "atlas",
  "draft",
  "battle-playable",
  "journeycomplete",
];

export const VIEWPORT_PRESETS = {
  core: [
    "desktop-1366x768",
    "desktop-1440x900",
    "desktop-1920x1080",
    "desktop-3440x1440",
  ],
  extended: [
    "desktop-1366x768",
    "desktop-1440x900",
    "desktop-1920x1080",
    "desktop-3440x1440",
    "desktop-1280x720",
    "desktop-1536x864",
    "desktop-2560x1080",
    "desktop-2560x1440",
    "desktop-2560x1600",
  ],
};

export const SCENE_PRESET_NAMES = ["core", "smoke", "full"];

const JOURNEY_SCENES = new Set([
  "dream-avatar-select",
  "tutorial-dream-avatar-select",
  "dreamscape",
  "dreamscape-with-essence",
  "atlas",
  "journeycomplete",
  "journeyfailed",
]);
const COLLECTION_SCENES = new Set([
  "deckviewer",
  "poolviewer",
  "startingdeck",
]);

export function sceneGroupFor(sceneId) {
  if (sceneId === "battle" || sceneId.startsWith("battle")) return "battle";
  if (
    JOURNEY_SCENES.has(sceneId) ||
    sceneId.startsWith("atlas")
  ) {
    return "journey";
  }
  if (COLLECTION_SCENES.has(sceneId)) return "collections";
  return "sites";
}

function splitRepeated(values) {
  return (values ?? [])
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePort(raw) {
  const port = raw === undefined ? DEFAULT_SCREENSHOT_PORT : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new UsageError(`invalid --port "${String(raw)}"`);
  }
  if (port === 5173) {
    throw new UsageError("port 5173 is reserved for the developer's server");
  }
  return port;
}

function normalizeBaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UsageError(`invalid --url "${raw}"`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new UsageError("--url must use http or https");
  }
  if (parsed.port === "5173") {
    throw new UsageError("port 5173 is reserved for the developer's server");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function parseDesktopScreenshotArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        scene: { type: "string", multiple: true },
        viewport: { type: "string", multiple: true },
        "scene-preset": { type: "string" },
        "viewport-preset": { type: "string" },
        smoke: { type: "boolean" },
        extended: { type: "boolean" },
        "list-scenes": { type: "boolean" },
        "list-viewports": { type: "boolean" },
        url: { type: "string" },
        port: { type: "string" },
        start: { type: "boolean" },
        seed: { type: "string", default: "42" },
        "run-id": { type: "string" },
        session: { type: "string" },
        verbose: { type: "boolean", short: "v" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }

  const scenes = splitRepeated(values.scene);
  const viewports = splitRepeated(values.viewport);
  if (values.smoke && values["scene-preset"]) {
    throw new UsageError("--smoke and --scene-preset are mutually exclusive");
  }
  if (values.extended && values["viewport-preset"]) {
    throw new UsageError(
      "--extended and --viewport-preset are mutually exclusive",
    );
  }
  if (scenes.length > 0 && (values.smoke || values["scene-preset"])) {
    throw new UsageError(
      "--scene cannot be combined with --smoke or --scene-preset",
    );
  }
  if (
    viewports.length > 0 &&
    (values.extended || values["viewport-preset"])
  ) {
    throw new UsageError(
      "--viewport cannot be combined with --extended or --viewport-preset",
    );
  }
  if (values.start && values.url) {
    throw new UsageError("--start and --url are mutually exclusive");
  }
  if (values.url && values.port) {
    throw new UsageError("--url and --port are mutually exclusive");
  }
  if (!/^\d+$/.test(values.seed)) {
    throw new UsageError("--seed must be a non-negative integer");
  }
  if (
    values["run-id"] !== undefined &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values["run-id"])
  ) {
    throw new UsageError(
      "--run-id must contain only letters, digits, dots, underscores, or hyphens",
    );
  }

  const scenePreset = values.smoke
    ? "smoke"
    : (values["scene-preset"] ?? "core");
  if (!SCENE_PRESET_NAMES.includes(scenePreset)) {
    throw new UsageError(
      `unknown scene preset "${scenePreset}"; expected core, smoke, or full`,
    );
  }
  const viewportPreset = values.extended
    ? "extended"
    : (values["viewport-preset"] ?? "core");
  if (!(viewportPreset in VIEWPORT_PRESETS)) {
    throw new UsageError(
      `unknown viewport preset "${viewportPreset}"; expected core or extended`,
    );
  }

  const port = parsePort(values.port);
  const baseUrl = values.url
    ? normalizeBaseUrl(values.url)
    : `http://localhost:${String(port)}`;
  return {
    scenes,
    viewports,
    scenePreset,
    viewportPreset,
    listScenes: Boolean(values["list-scenes"]),
    listViewports: Boolean(values["list-viewports"]),
    start: Boolean(values.start),
    baseUrl,
    port,
    seed: values.seed,
    runId: values["run-id"] ?? null,
    session: values.session ?? null,
    verbose: Boolean(values.verbose),
    json: Boolean(values.json),
    help: Boolean(values.help),
  };
}

function deduplicate(values) {
  return [...new Set(values)];
}

export function validateScenePresets(registeredSceneIds) {
  const registered = new Set(registeredSceneIds);
  const stale = [...CORE_SCENE_IDS, ...SMOKE_SCENE_IDS].filter(
    (sceneId) => !registered.has(sceneId),
  );
  if (stale.length > 0) {
    throw new UsageError(
      `desktop screenshot scene presets reference unregistered QA scenes: ${deduplicate(stale).join(", ")}`,
    );
  }
}

export function resolveSceneSelection(options, registeredScenes) {
  const catalog = new Map(
    registeredScenes.map((scene) => [scene.id, scene]),
  );
  validateScenePresets([...catalog.keys()]);
  let ids;
  if (options.scenes.length > 0) ids = options.scenes;
  else if (options.scenePreset === "smoke") ids = SMOKE_SCENE_IDS;
  else if (options.scenePreset === "full") ids = [...catalog.keys()];
  else ids = CORE_SCENE_IDS;

  return deduplicate(ids.map((id) => id.trim().toLowerCase())).map((id) => {
    const scene = catalog.get(id);
    if (!scene) {
      throw new UsageError(
        `unknown QA scene "${id}"; use --list-scenes to see valid ids`,
      );
    }
    return {
      id,
      label: scene.label ?? id,
      group: sceneGroupFor(id),
    };
  });
}

function findViewport(rawId) {
  const normalized = rawId.trim().toLowerCase();
  return (
    DESKTOP_VIEWPORTS.find((viewport) => viewport.id === normalized) ??
    DESKTOP_VIEWPORTS.find(
      (viewport) =>
        viewport.id.replace(/^desktop-/, "") ===
        normalized.replace(/^desktop-/, ""),
    ) ??
    null
  );
}

export function resolveViewportSelection(options) {
  const ids =
    options.viewports.length > 0
      ? options.viewports
      : VIEWPORT_PRESETS[options.viewportPreset];
  const selected = [];
  const seen = new Set();
  for (const id of deduplicate(ids.map((entry) => entry.trim().toLowerCase()))) {
    const viewport = findViewport(id);
    if (!viewport) {
      throw new UsageError(
        `unknown desktop viewport "${id}"; use --list-viewports to see valid ids`,
      );
    }
    if (seen.has(viewport.id)) continue;
    seen.add(viewport.id);
    selected.push({ ...viewport, dpr: 1 });
  }
  return selected;
}
