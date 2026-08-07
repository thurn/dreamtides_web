import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAM_AVATAR_TOML_PATH,
  TIDES4_SOURCE_PATH,
  patchDreamAvatarsToml,
  patchTides4Pool,
  readEditorDreamAvatars,
  readTideCatalog,
  refreshDreamAvatarDataJson,
  refreshTides4DataJson,
  validateDreamAvatarEdit,
  validateTidePool,
} from "./dream-avatar-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dream-avatars";
const DREAM_AVATAR_TOML_DIR = join("data");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const defaultFileSystem = {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

let saveCounter = 0;

function jsonResponse(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message, details) {
  jsonResponse(res, statusCode, {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
}

function rawPathFromUrl(url) {
  return (url ?? "/").split("?", 1)[0];
}

function tomlParamFromUrl(url) {
  const queryIndex = (url ?? "").indexOf("?");
  if (queryIndex === -1) {
    return null;
  }
  return new URLSearchParams((url ?? "").slice(queryIndex + 1)).get("toml");
}

function resolveRequestedTomlPath(rootDir, requested) {
  if (requested === null || requested === undefined || requested.trim() === "") {
    return { ok: true, relativePath: DEFAULT_DREAM_AVATAR_TOML_PATH };
  }

  const trimmed = requested.trim();
  if (trimmed.includes("\0")) {
    return { ok: false, message: "The toml parameter is invalid." };
  }

  const hasDirectory = trimmed.includes("/") || trimmed.includes("\\");
  const candidate = hasDirectory ? trimmed : join(DREAM_AVATAR_TOML_DIR, trimmed);

  if (!candidate.toLowerCase().endsWith(".toml")) {
    return { ok: false, message: "The toml file must have a .toml extension." };
  }

  const dataDir = resolve(rootDir, DREAM_AVATAR_TOML_DIR);
  const target = resolve(rootDir, candidate);
  const within = relative(dataDir, target);

  if (within === "" || within.startsWith("..") || isAbsolute(within) || within.includes(sep)) {
    return { ok: false, message: "The toml file must be located in data." };
  }

  return { ok: true, relativePath: join(DREAM_AVATAR_TOML_DIR, within) };
}

function isDreamAvatarApiPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function routeForRawPath(rawPath) {
  if (rawPath === BASE_PATH) {
    return { ok: true, resource: "collection" };
  }

  const encodedSegment = rawPath.slice(BASE_PATH.length + 1);
  if (encodedSegment.length === 0 || encodedSegment.includes("/")) {
    return { ok: false, statusCode: 404, code: "NOT_FOUND", message: "Endpoint was not found." };
  }

  let dreamAvatarId;
  try {
    dreamAvatarId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAM_AVATAR_ID",
      message: "Route dreamAvatar id must be a canonical UUID.",
    };
  }

  if (!UUID_PATTERN.test(dreamAvatarId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAM_AVATAR_ID",
      message: "Route dreamAvatar id must be a canonical UUID.",
      details: { id: dreamAvatarId },
    };
  }

  return { ok: true, resource: "dreamAvatar", dreamAvatarId };
}

function readRequestBody(req) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolvePromise(body);
    });
    req.on("error", reject);
  });
}

async function readJsonRequest(req) {
  const rawBody = await readRequestBody(req);
  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function methodNotAllowed(res, allowedMethods) {
  jsonResponse(
    res,
    405,
    { error: { code: "METHOD_NOT_ALLOWED", message: "Method is not allowed for this endpoint." } },
    { Allow: allowedMethods.join(", ") },
  );
}

function tempPathFor(destination, extension) {
  saveCounter += 1;
  return `${destination}.${process.pid}.${Date.now()}.${saveCounter}.${extension}`;
}

function preparedWrite(destination, content) {
  return {
    destination,
    temp: tempPathFor(destination, "tmp"),
    backup: tempPathFor(destination, "bak"),
    content,
  };
}

/**
 * Commit a set of file writes atomically via temp-file swap with rollback, so a
 * crash mid-save never leaves a TOML/JSONC source or its regenerated JSON
 * partially written.
 */
function commitFiles(writes, fileSystem) {
  const preexisting = new Set(writes.filter((write) => fileSystem.existsSync(write.destination)));

  try {
    for (const write of writes) {
      fileSystem.writeFileSync(write.temp, write.content);
    }
    for (const write of writes) {
      if (preexisting.has(write)) {
        fileSystem.renameSync(write.destination, write.backup);
      }
    }
    for (const write of writes) {
      fileSystem.renameSync(write.temp, write.destination);
    }
  } catch (error) {
    for (const write of writes) {
      fileSystem.rmSync(write.temp, { force: true, recursive: true });
    }
    for (const write of writes) {
      if (preexisting.has(write)) {
        if (fileSystem.existsSync(write.backup)) {
          fileSystem.rmSync(write.destination, { force: true, recursive: true });
          fileSystem.renameSync(write.backup, write.destination);
        }
      } else {
        fileSystem.rmSync(write.destination, { force: true, recursive: true });
      }
    }
    throw error;
  }

  for (const write of writes) {
    if (!preexisting.has(write)) {
      continue;
    }
    try {
      fileSystem.rmSync(write.backup, { force: true, recursive: true });
    } catch {
      // Backups are removed after every destination file is committed.
    }
  }
}

function assertPatchBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "PATCH body must be a JSON object." };
  }
  if (typeof body.id !== "string") {
    return { ok: false, message: "PATCH body id must be a string." };
  }
  if (typeof body.field !== "string") {
    return { ok: false, message: "PATCH body field must be a string." };
  }
  if (!Object.hasOwn(body, "value")) {
    return { ok: false, message: "PATCH body value is required." };
  }
  return { ok: true };
}

function confirmedRecord(rootDir, dreamAvatarTomlPath, dreamAvatarId) {
  return readEditorDreamAvatars({ rootDir, dreamAvatarTomlPath }).find(
    (dreamAvatar) => dreamAvatar.id === dreamAvatarId,
  );
}

async function handlePatch(req, res, rootDir, dreamAvatarId, dreamAvatarTomlPath, fileSystem) {
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (error) {
    if (error.code === "INVALID_JSON") {
      errorResponse(res, 400, "INVALID_JSON", error.message);
      return;
    }
    throw error;
  }

  const bodyResult = assertPatchBody(body);
  if (!bodyResult.ok) {
    errorResponse(res, 400, "INVALID_REQUEST", bodyResult.message);
    return;
  }

  if (!UUID_PATTERN.test(body.id)) {
    errorResponse(res, 400, "INVALID_DREAM_AVATAR_ID", "Request body id must be a canonical UUID.", {
      id: body.id,
    });
    return;
  }

  if (body.id !== dreamAvatarId) {
    errorResponse(res, 400, "DREAM_AVATAR_ID_MISMATCH", "Route dreamAvatar id must match request body id.", {
      routeId: dreamAvatarId,
      bodyId: body.id,
    });
    return;
  }

  const beforeRecord = confirmedRecord(rootDir, dreamAvatarTomlPath, dreamAvatarId);
  if (beforeRecord === undefined) {
    errorResponse(res, 404, "DREAM_AVATAR_NOT_FOUND", "DreamAvatar was not found.", { id: dreamAvatarId });
    return;
  }

  if (body.field === "tide-pool") {
    const validation = validateTidePool(body.value, readTideCatalog({ rootDir }));
    if (!validation.ok) {
      errorResponse(res, 400, "INVALID_EDIT", validation.message, { field: body.field });
      return;
    }

    const tides4Abs = join(rootDir, TIDES4_SOURCE_PATH);
    const source = fileSystem.readFileSync(tides4Abs, "utf8");
    const patched = patchTides4Pool(source, { dreamAvatarId, pool: validation.value });

    commitFiles([preparedWrite(tides4Abs, patched.source)], fileSystem);
    refreshTides4DataJson({ rootDir });
  } else {
    const validation = validateDreamAvatarEdit(body.field, body.value);
    if (!validation.ok) {
      errorResponse(res, 400, "INVALID_EDIT", validation.message, {
        field: validation.field,
        value: validation.value,
      });
      return;
    }

    const tomlAbs = join(rootDir, dreamAvatarTomlPath);
    const source = fileSystem.readFileSync(tomlAbs, "utf8");
    const patched = patchDreamAvatarsToml(source, {
      dreamAvatarId,
      field: body.field,
      value: validation.value,
    });

    commitFiles([preparedWrite(tomlAbs, patched.source)], fileSystem);
    if (dreamAvatarTomlPath === DEFAULT_DREAM_AVATAR_TOML_PATH) {
      refreshDreamAvatarDataJson({ rootDir, dreamAvatarTomlPath });
    }
  }

  const confirmed = confirmedRecord(rootDir, dreamAvatarTomlPath, dreamAvatarId);
  if (confirmed === undefined) {
    errorResponse(res, 404, "DREAM_AVATAR_NOT_FOUND", "DreamAvatar was not found.", { id: dreamAvatarId });
    return;
  }

  jsonResponse(res, 200, {
    dreamAvatar: confirmed,
    ...(Object.hasOwn(body, "clientRevision") ? { clientRevision: body.clientRevision } : {}),
  });
}

export function createDreamAvatarEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function dreamAvatarEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (!isDreamAvatarApiPath(rawPath)) {
      next();
      return;
    }

    try {
      const route = routeForRawPath(rawPath);
      if (!route.ok) {
        errorResponse(res, route.statusCode, route.code, route.message, route.details);
        return;
      }

      const tomlResolution = resolveRequestedTomlPath(rootDir, tomlParamFromUrl(req.url));
      if (!tomlResolution.ok) {
        errorResponse(res, 400, "INVALID_TOML", tomlResolution.message);
        return;
      }

      const dreamAvatarTomlPath = tomlResolution.relativePath;
      if (!fileSystem.existsSync(join(rootDir, dreamAvatarTomlPath))) {
        errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
          toml: dreamAvatarTomlPath,
        });
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          dreamAvatars: readEditorDreamAvatars({ rootDir, dreamAvatarTomlPath }),
          tides: readTideCatalog({ rootDir }),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "dreamAvatar") {
        await handlePatch(req, res, rootDir, route.dreamAvatarId, dreamAvatarTomlPath, fileSystem);
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
