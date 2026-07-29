import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TUTORIAL_JSON_PATH,
  DEFAULT_TUTORIAL_TOML_PATH,
  readTutorialConfiguration,
  serializeTutorialToml,
  validateTutorialActions,
} from "./tutorial-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/tutorial";
const MAX_BODY_BYTES = 1024 * 1024;
let writeSerial = 0;

const defaultFileSystem = {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
};

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message) {
  jsonResponse(res, statusCode, { error: { code, message } });
}

function requestPath(url) {
  return (url ?? "/").split("?", 1)[0];
}

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(Object.assign(new Error("Request body is too large."), { code: "BODY_TOO_LARGE" }));
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { code: "INVALID_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function atomicWrite(fileSystem, destination, content) {
  writeSerial += 1;
  const temporary = `${destination}.tutorial-editor-${String(process.pid)}-${String(writeSerial)}.tmp`;
  fileSystem.mkdirSync(dirname(destination), { recursive: true });
  try {
    fileSystem.writeFileSync(temporary, content);
    fileSystem.renameSync(temporary, destination);
  } catch (error) {
    try {
      fileSystem.unlinkSync(temporary);
    } catch {
      // The temporary path may not have been created.
    }
    throw error;
  }
}

/** Vite dev middleware for loading and atomically saving tutorial.toml. */
export function createTutorialEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function tutorialEditorApi(req, res, next) {
    const pathname = requestPath(req.url);
    if (pathname !== BASE_PATH) {
      next();
      return;
    }

    if (req.method === "GET") {
      try {
        const configuration = readTutorialConfiguration({ rootDir });
        jsonResponse(res, 200, configuration);
      } catch (error) {
        errorResponse(
          res,
          500,
          "TUTORIAL_LOAD_FAILED",
          error instanceof Error ? error.message : "Failed to load tutorial actions.",
        );
      }
      return;
    }

    if (req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use GET or PUT for tutorial actions.");
      return;
    }

    try {
      const body = await readJsonBody(req);
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw Object.assign(new Error("Request body must contain an actions array."), {
          code: "INVALID_TUTORIAL_ACTIONS",
        });
      }
      const actions = validateTutorialActions(body.actions);
      const { journeyStart, dreamscape, triggers, battle } =
        readTutorialConfiguration({ rootDir });
      const tomlPath = join(rootDir, DEFAULT_TUTORIAL_TOML_PATH);
      const jsonPath = join(rootDir, DEFAULT_TUTORIAL_JSON_PATH);
      atomicWrite(
        fileSystem,
        tomlPath,
        serializeTutorialToml(
          actions,
          triggers,
          battle,
          journeyStart,
          dreamscape,
        ),
      );
      atomicWrite(
        fileSystem,
        jsonPath,
        `${JSON.stringify({ journeyStart, dreamscape, actions, triggers, battle }, null, 2)}\n`,
      );
      jsonResponse(res, 200, { actions });
    } catch (error) {
      const code = error?.code;
      if (code === "BODY_TOO_LARGE") {
        errorResponse(res, 413, code, error.message);
        return;
      }
      if (code === "INVALID_JSON" || code === "INVALID_TUTORIAL_ACTIONS") {
        errorResponse(res, 400, code, error.message);
        return;
      }
      errorResponse(
        res,
        500,
        "TUTORIAL_SAVE_FAILED",
        error instanceof Error ? error.message : "Failed to save tutorial actions.",
      );
    }
  };
}
