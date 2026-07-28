import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAMSIGN_TOML_PATH,
  dreamsignTagRegistryPathFor,
  patchDreamsignsToml,
  readDreamsignTagRegistry,
  readEditorDreamsigns,
  refreshDreamsignDataJson,
  removeTagsFromDreamsigns,
  serializeDreamsignTagRegistry,
  validateDreamsignEdit,
  validateTagRegistry,
} from "./dreamsign-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dreamsigns";
const TAGS_PATH = "/api/editor/dreamsign-tags";
const DREAMSIGN_TOML_DIR = join("data", "tabula");
const DREAMSIGN_JSON_PATH = join("public", "dreamsign-data.json");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const defaultFileSystem = {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

let saveCounter = 0;

function elapsedMs(start) {
  return Number((performance.now() - start).toFixed(3));
}

function jsonResponse(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function errorResponse(res, statusCode, code, message, details) {
  jsonResponse(res, statusCode, {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
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
    return { ok: true, relativePath: DEFAULT_DREAMSIGN_TOML_PATH };
  }

  const trimmed = requested.trim();
  if (trimmed.includes("\0")) {
    return { ok: false, message: "The toml parameter is invalid." };
  }

  const hasDirectory = trimmed.includes("/") || trimmed.includes("\\");
  const candidate = hasDirectory ? trimmed : join(DREAMSIGN_TOML_DIR, trimmed);

  if (!candidate.toLowerCase().endsWith(".toml")) {
    return { ok: false, message: "The toml file must have a .toml extension." };
  }

  const tabulaDir = resolve(rootDir, DREAMSIGN_TOML_DIR);
  const target = resolve(rootDir, candidate);
  const within = relative(tabulaDir, target);

  if (within === "" || within.startsWith("..") || isAbsolute(within) || within.includes(sep)) {
    return { ok: false, message: "The toml file must be located in data/tabula." };
  }

  return { ok: true, relativePath: join(DREAMSIGN_TOML_DIR, within) };
}

function decodePathSegment(segment) {
  try {
    return {
      ok: true,
      value: decodeURIComponent(segment),
    };
  } catch {
    return {
      ok: false,
    };
  }
}

function isDreamsignApiPath(pathname) {
  if (
    pathname === BASE_PATH ||
    pathname.startsWith(`${BASE_PATH}/`) ||
    pathname.startsWith(`${BASE_PATH}%`)
  ) {
    return true;
  }

  const rawSegments = pathname.split("/");
  if (rawSegments[1] !== "api" || rawSegments[2] !== "editor" || rawSegments.length < 4) {
    return false;
  }

  const resourceSegment = decodePathSegment(rawSegments[3]);
  return resourceSegment.ok && resourceSegment.value === "dreamsigns";
}

function routeForRawPath(rawPath) {
  const rawSegments = rawPath.split("/");
  if (rawSegments[1] === "api" && rawSegments[2] === "editor" && rawSegments.length >= 4) {
    const resourceSegment = decodePathSegment(rawSegments[3]);
    if (!resourceSegment.ok) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_API_PATH",
        message: "API path must use canonical static segments.",
      };
    }

    if (resourceSegment.value === "dreamsigns" && rawSegments[3] !== "dreamsigns") {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_API_PATH",
        message: "API path must use canonical static segments.",
      };
    }
  }

  if (rawPath === BASE_PATH) {
    return {
      ok: true,
      resource: "collection",
    };
  }

  if (!rawPath.startsWith(`${BASE_PATH}/`)) {
    if (rawPath.slice(BASE_PATH.length).startsWith("%")) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_DREAMSIGN_ID",
        message: "Route dreamsign id must be a canonical UUID.",
      };
    }

    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }

  const encodedSegment = rawPath.slice(BASE_PATH.length + 1);
  if (encodedSegment.length === 0 || encodedSegment.includes("/")) {
    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }

  let dreamsignId;
  try {
    dreamsignId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMSIGN_ID",
      message: "Route dreamsign id must be a canonical UUID.",
    };
  }

  if (encodedSegment !== dreamsignId || dreamsignId.includes("/") || !UUID_PATTERN.test(dreamsignId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMSIGN_ID",
      message: "Route dreamsign id must be a canonical UUID.",
      details: { id: dreamsignId },
    };
  }

  return {
    ok: true,
    resource: "dreamsign",
    dreamsignId,
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body);
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

function dreamsignNotFound(res, dreamsignId) {
  errorResponse(res, 404, "DREAMSIGN_NOT_FOUND", "Dreamsign was not found.", {
    id: dreamsignId,
  });
}

function methodNotAllowed(res, allowedMethods) {
  jsonResponse(
    res,
    405,
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method is not allowed for this endpoint.",
      },
    },
    { Allow: allowedMethods.join(", ") },
  );
}

function assertPatchBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body must be a JSON object.",
    };
  }

  if (typeof body.id !== "string") {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body id must be a string.",
    };
  }

  if (typeof body.field !== "string") {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body field must be a string.",
    };
  }

  if (!Object.hasOwn(body, "value")) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body value is required.",
    };
  }

  return { ok: true };
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

function commitFiles(writes, fileSystem) {
  const preexisting = new Set(
    writes.filter((write) => fileSystem.existsSync(write.destination)),
  );

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

function generateDreamsignDataJsonFromToml(patchedSource, fileSystem) {
  const tempRoot = fileSystem.mkdtempSync(join(tmpdir(), "journey-dreamsign-editor-refresh-"));

  try {
    fileSystem.mkdirSync(join(tempRoot, "data", "tabula"), { recursive: true });
    fileSystem.mkdirSync(join(tempRoot, "public"), { recursive: true });
    fileSystem.writeFileSync(join(tempRoot, DEFAULT_DREAMSIGN_TOML_PATH), patchedSource);

    refreshDreamsignDataJson({ rootDir: tempRoot });

    const dreamsignJson = fileSystem.readFileSync(join(tempRoot, DREAMSIGN_JSON_PATH), "utf8");
    JSON.parse(dreamsignJson);

    return dreamsignJson;
  } finally {
    fileSystem.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function handlePatch(req, res, rootDir, dreamsignId, dreamsignTomlPath, fileSystem) {
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
    errorResponse(res, 400, bodyResult.code, bodyResult.message);
    return;
  }

  if (!UUID_PATTERN.test(body.id)) {
    errorResponse(
      res,
      400,
      "INVALID_DREAMSIGN_ID",
      "Request body id must be a canonical UUID.",
      { id: body.id },
    );
    return;
  }

  if (body.id !== dreamsignId) {
    errorResponse(
      res,
      400,
      "DREAMSIGN_ID_MISMATCH",
      "Route dreamsign id must match request body id.",
      {
        routeId: dreamsignId,
        bodyId: body.id,
      },
    );
    return;
  }

  const validation = validateDreamsignEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }

  if (body.field === "tags") {
    const registryNames = new Set(
      readDreamsignTagRegistry({ rootDir, dreamsignTomlPath }).map((entry) => entry.name),
    );
    const unknown = validation.value.filter((value) => !registryNames.has(value));
    if (unknown.length > 0) {
      errorResponse(
        res,
        400,
        "INVALID_EDIT",
        "Unknown tag. Create it in Manage tags first.",
        { field: body.field, value: unknown },
      );
      return;
    }
  }

  const totalStart = performance.now();
  const readStart = performance.now();
  const beforeDreamsigns = readEditorDreamsigns({ rootDir, dreamsignTomlPath });
  const readMs = elapsedMs(readStart);

  if (!beforeDreamsigns.some((dreamsign) => dreamsign.id === dreamsignId)) {
    dreamsignNotFound(res, dreamsignId);
    return;
  }

  const tomlPath = join(rootDir, dreamsignTomlPath);
  const patchStart = performance.now();
  const source = fileSystem.readFileSync(tomlPath, "utf8");
  const patched = patchDreamsignsToml(source, {
    dreamsignId,
    field: body.field,
    value: body.value,
  });
  const patchMs = elapsedMs(patchStart);

  const refreshesDreamsignJson = dreamsignTomlPath === DEFAULT_DREAMSIGN_TOML_PATH;
  const refreshStart = performance.now();
  const writes = [preparedWrite(tomlPath, patched.source)];
  if (refreshesDreamsignJson) {
    const dreamsignJson = generateDreamsignDataJsonFromToml(patched.source, fileSystem);
    writes.push(preparedWrite(join(rootDir, DREAMSIGN_JSON_PATH), dreamsignJson));
  }
  commitFiles(writes, fileSystem);
  const refreshMs = elapsedMs(refreshStart);

  const confirmStart = performance.now();
  const confirmedDreamsign = readEditorDreamsigns({ rootDir, dreamsignTomlPath }).find(
    (dreamsign) => dreamsign.id === dreamsignId,
  );
  const confirmMs = elapsedMs(confirmStart);

  if (confirmedDreamsign === undefined) {
    dreamsignNotFound(res, dreamsignId);
    return;
  }

  jsonResponse(res, 200, {
    dreamsign: confirmedDreamsign,
    ...(Object.hasOwn(body, "clientRevision") ? { clientRevision: body.clientRevision } : {}),
    timing: {
      readMs,
      patchMs,
      refreshMs,
      confirmMs,
      totalMs: elapsedMs(totalStart),
    },
  });
}

async function handleTagsPut(req, res, rootDir, dreamsignTomlPath, fileSystem) {
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

  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray(body.tags)
  ) {
    errorResponse(res, 400, "INVALID_REQUEST", "PUT body must include a tags array.");
    return;
  }

  const validation = validateTagRegistry(body.tags);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_TAG_REGISTRY", validation.message);
    return;
  }

  const newNames = new Set(validation.tags.map((tag) => tag.name));
  const usedNames = new Set();
  for (const dreamsign of readEditorDreamsigns({ rootDir, dreamsignTomlPath })) {
    for (const value of dreamsign.tags) {
      usedNames.add(value);
    }
  }
  const removedUsed = [...usedNames].filter((name) => !newNames.has(name));

  const registryAbsPath = join(rootDir, dreamsignTagRegistryPathFor(dreamsignTomlPath));
  const dreamsignTomlBasename = dreamsignTomlPath.split(/[\\/]/u).pop();
  const writes = [
    preparedWrite(
      registryAbsPath,
      serializeDreamsignTagRegistry(validation.tags, { dreamsignTomlBasename }),
    ),
  ];

  if (removedUsed.length > 0) {
    const tomlPath = join(rootDir, dreamsignTomlPath);
    const source = fileSystem.readFileSync(tomlPath, "utf8");
    const patchedSource = removeTagsFromDreamsigns(source, removedUsed);
    writes.push(preparedWrite(tomlPath, patchedSource));

    if (dreamsignTomlPath === DEFAULT_DREAMSIGN_TOML_PATH) {
      const dreamsignJson = generateDreamsignDataJsonFromToml(patchedSource, fileSystem);
      writes.push(preparedWrite(join(rootDir, DREAMSIGN_JSON_PATH), dreamsignJson));
    }
  }

  commitFiles(writes, fileSystem);

  jsonResponse(res, 200, {
    tags: readDreamsignTagRegistry({ rootDir, dreamsignTomlPath }),
    dreamsigns: readEditorDreamsigns({ rootDir, dreamsignTomlPath }),
  });
}

async function handleTags(req, res, rootDir, dreamsignTomlPath, fileSystem) {
  if (req.method === "GET") {
    jsonResponse(res, 200, {
      tags: readDreamsignTagRegistry({ rootDir, dreamsignTomlPath }),
    });
    return;
  }

  if (req.method === "PUT") {
    await handleTagsPut(req, res, rootDir, dreamsignTomlPath, fileSystem);
    return;
  }

  methodNotAllowed(res, ["GET", "PUT"]);
}

export function createDreamsignEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function dreamsignEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (rawPath === TAGS_PATH) {
      try {
        const tomlResolution = resolveRequestedTomlPath(rootDir, tomlParamFromUrl(req.url));
        if (!tomlResolution.ok) {
          errorResponse(res, 400, "INVALID_TOML", tomlResolution.message);
          return;
        }

        const dreamsignTomlPath = tomlResolution.relativePath;
        if (!fileSystem.existsSync(join(rootDir, dreamsignTomlPath))) {
          errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
            toml: dreamsignTomlPath,
          });
          return;
        }

        await handleTags(req, res, rootDir, dreamsignTomlPath, fileSystem);
      } catch (error) {
        errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
      }
      return;
    }

    if (!isDreamsignApiPath(rawPath)) {
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

      const dreamsignTomlPath = tomlResolution.relativePath;
      if (!fileSystem.existsSync(join(rootDir, dreamsignTomlPath))) {
        errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
          toml: dreamsignTomlPath,
        });
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          dreamsigns: readEditorDreamsigns({ rootDir, dreamsignTomlPath }),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "dreamsign") {
        await handlePatch(req, res, rootDir, route.dreamsignId, dreamsignTomlPath, fileSystem);
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
