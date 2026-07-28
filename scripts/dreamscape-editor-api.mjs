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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAMSCAPE_TOML_PATH,
  SITE_TYPES,
  applyDreamAvatarChanges,
  makeValidateDreamscapeEdit,
  patchDreamscapesToml,
  planDreamAvatarAssignment,
  readAffiliationOptions,
  readDreamAvatarOptions,
  readDreamGuideOptions,
  readEditorDreamscapes,
  refreshDreamscapesDataJson,
} from "./dreamscape-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dreamscapes";
const DREAMSCAPE_JSON_PATH = join("public", "dreamscapes-data.json");
// Dreamscape ids are stable lowercase slugs (e.g. `firstlight_meadow`), not
// UUIDs, so the editor keys its routes on this slug shape.
const SLUG_PATTERN = /^[a-z0-9_]+$/u;

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
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
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

function isDreamscapeApiPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function routeForRawPath(rawPath) {
  if (rawPath === BASE_PATH) {
    return { ok: true, resource: "collection" };
  }

  const remainder = rawPath.slice(BASE_PATH.length + 1);
  // A dream-avatar-assignment route is `${BASE_PATH}/:id/dream-avatars`; the bare
  // record route is `${BASE_PATH}/:id`.
  const segments = remainder.split("/");
  const isDreamAvatarRoute = segments.length === 2 && segments[1] === "dream-avatars";

  if (remainder.length === 0 || (segments.length > 1 && !isDreamAvatarRoute)) {
    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }

  let dreamscapeId;
  try {
    dreamscapeId = decodeURIComponent(segments[0]);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMSCAPE_ID",
      message: "Route dreamscape id must be a canonical slug.",
    };
  }

  if (!SLUG_PATTERN.test(dreamscapeId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMSCAPE_ID",
      message: "Route dreamscape id must be a canonical slug.",
      details: { id: dreamscapeId },
    };
  }

  if (isDreamAvatarRoute) {
    return { ok: true, resource: "dream-avatars", dreamscapeId };
  }

  return { ok: true, resource: "dreamscape", dreamscapeId };
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
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body must be a JSON object." };
  }
  if (typeof body.id !== "string") {
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body id must be a string." };
  }
  if (typeof body.field !== "string") {
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body field must be a string." };
  }
  if (!Object.hasOwn(body, "value")) {
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body value is required." };
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

function generateDreamscapesDataJsonFromToml(patchedSource, fileSystem) {
  const tempRoot = fileSystem.mkdtempSync(join(tmpdir(), "journey-dreamscape-editor-refresh-"));

  try {
    fileSystem.mkdirSync(join(tempRoot, "data", "tabula"), { recursive: true });
    fileSystem.mkdirSync(join(tempRoot, "public"), { recursive: true });
    fileSystem.writeFileSync(join(tempRoot, DEFAULT_DREAMSCAPE_TOML_PATH), patchedSource);

    refreshDreamscapesDataJson({ rootDir: tempRoot });

    const dreamscapesJson = fileSystem.readFileSync(join(tempRoot, DREAMSCAPE_JSON_PATH), "utf8");
    JSON.parse(dreamscapesJson);

    return dreamscapesJson;
  } finally {
    fileSystem.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function collectionPayload(rootDir, dreamscapeTomlPath) {
  return {
    dreamscapes: readEditorDreamscapes({ rootDir, dreamscapeTomlPath }),
    guides: readDreamGuideOptions({ rootDir }),
    affiliations: readAffiliationOptions({ rootDir }),
    dreamAvatars: readDreamAvatarOptions({ rootDir }),
    siteTypes: SITE_TYPES,
  };
}

function assertAssignmentBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  if (body.action !== "replace" && body.action !== "add" && body.action !== "remove") {
    return { ok: false, message: 'action must be "replace", "add", or "remove".' };
  }
  if (body.inId !== undefined && typeof body.inId !== "string") {
    return { ok: false, message: "inId must be a DreamAvatar id string." };
  }
  if (body.outId !== undefined && typeof body.outId !== "string") {
    return { ok: false, message: "outId must be a DreamAvatar id string." };
  }
  return { ok: true };
}

async function handleDreamAvatarAssignment(
  req,
  res,
  rootDir,
  dreamscapeId,
  dreamscapeTomlPath,
  fileSystem,
) {
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

  const bodyResult = assertAssignmentBody(body);
  if (!bodyResult.ok) {
    errorResponse(res, 400, "INVALID_REQUEST", bodyResult.message);
    return;
  }

  const totalStart = performance.now();
  const dreamscapes = readEditorDreamscapes({ rootDir, dreamscapeTomlPath });
  if (!dreamscapes.some((dreamscape) => dreamscape.id === dreamscapeId)) {
    errorResponse(res, 404, "DREAMSCAPE_NOT_FOUND", "Dreamscape was not found.", {
      id: dreamscapeId,
    });
    return;
  }

  const dreamAvatars = readDreamAvatarOptions({ rootDir });
  const catalogIds = dreamAvatars.map((dreamAvatar) => dreamAvatar.id);
  const nameById = new Map(
    dreamAvatars.map((dreamAvatar) => [dreamAvatar.id.toLowerCase(), dreamAvatar.name]),
  );

  const plan = planDreamAvatarAssignment(dreamscapes, catalogIds, {
    action: body.action,
    dreamscapeId,
    inId: body.inId,
    outId: body.outId,
  });
  if (!plan.ok) {
    errorResponse(res, 400, "INVALID_ASSIGNMENT", plan.message);
    return;
  }

  const tomlPath = join(rootDir, dreamscapeTomlPath);
  const source = fileSystem.readFileSync(tomlPath, "utf8");
  const patchedSource = applyDreamAvatarChanges(source, plan.changes, nameById);

  const refreshesJson = dreamscapeTomlPath === DEFAULT_DREAMSCAPE_TOML_PATH;
  const writes = [preparedWrite(tomlPath, patchedSource)];
  if (refreshesJson) {
    const dreamscapesJson = generateDreamscapesDataJsonFromToml(patchedSource, fileSystem);
    writes.push(preparedWrite(join(rootDir, DREAMSCAPE_JSON_PATH), dreamscapesJson));
  }
  commitFiles(writes, fileSystem);

  // Logged so a DreamAvatar reassignment can be reconstructed: the action, the
  // callers moved, and every region whose roster changed.
  console.log(
    `[dreamscape-editor] ${body.action} on ${dreamscapeId}` +
      `${body.inId !== undefined ? ` in=${body.inId}` : ""}` +
      `${body.outId !== undefined ? ` out=${body.outId}` : ""}` +
      ` -> changed [${plan.changes.map((change) => change.id).join(", ")}]`,
  );

  jsonResponse(res, 200, {
    dreamscapes: readEditorDreamscapes({ rootDir, dreamscapeTomlPath }),
    changed: plan.changes.map((change) => change.id),
    timing: { totalMs: elapsedMs(totalStart) },
  });
}

async function handlePatch(req, res, rootDir, dreamscapeId, dreamscapeTomlPath, fileSystem) {
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

  if (!SLUG_PATTERN.test(body.id)) {
    errorResponse(res, 400, "INVALID_DREAMSCAPE_ID", "Request body id must be a canonical slug.", {
      id: body.id,
    });
    return;
  }

  if (body.id !== dreamscapeId) {
    errorResponse(
      res,
      400,
      "DREAMSCAPE_ID_MISMATCH",
      "Route dreamscape id must match request body id.",
      { routeId: dreamscapeId, bodyId: body.id },
    );
    return;
  }

  const guideIds = readDreamGuideOptions({ rootDir }).map((guide) => guide.id);
  const affiliationIds = readAffiliationOptions({ rootDir }).map((affiliation) => affiliation.id);
  const validateEdit = makeValidateDreamscapeEdit({ guideIds, affiliationIds });

  const validation = validateEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }

  const totalStart = performance.now();
  const readStart = performance.now();
  const beforeDreamscapes = readEditorDreamscapes({ rootDir, dreamscapeTomlPath });
  const readMs = elapsedMs(readStart);

  if (!beforeDreamscapes.some((dreamscape) => dreamscape.id === dreamscapeId)) {
    errorResponse(res, 404, "DREAMSCAPE_NOT_FOUND", "Dreamscape was not found.", {
      id: dreamscapeId,
    });
    return;
  }

  const tomlPath = join(rootDir, dreamscapeTomlPath);
  const patchStart = performance.now();
  const source = fileSystem.readFileSync(tomlPath, "utf8");
  const patched = patchDreamscapesToml(source, {
    dreamscapeId,
    field: body.field,
    value: validation.value,
    validateEdit,
  });
  const patchMs = elapsedMs(patchStart);

  const refreshesJson = dreamscapeTomlPath === DEFAULT_DREAMSCAPE_TOML_PATH;
  const refreshStart = performance.now();
  const writes = [preparedWrite(tomlPath, patched.source)];
  if (refreshesJson) {
    const dreamscapesJson = generateDreamscapesDataJsonFromToml(patched.source, fileSystem);
    writes.push(preparedWrite(join(rootDir, DREAMSCAPE_JSON_PATH), dreamscapesJson));
  }
  commitFiles(writes, fileSystem);
  const refreshMs = elapsedMs(refreshStart);

  const confirmStart = performance.now();
  const confirmedDreamscape = readEditorDreamscapes({ rootDir, dreamscapeTomlPath }).find(
    (dreamscape) => dreamscape.id === dreamscapeId,
  );
  const confirmMs = elapsedMs(confirmStart);

  if (confirmedDreamscape === undefined) {
    errorResponse(res, 404, "DREAMSCAPE_NOT_FOUND", "Dreamscape was not found.", {
      id: dreamscapeId,
    });
    return;
  }

  // Logged so a production data edit can be reconstructed after the fact: which
  // dreamscape, which field, the saved value, and how long each stage took.
  console.log(
    `[dreamscape-editor] saved ${dreamscapeId}.${body.field} = ${JSON.stringify(
      validation.value,
    )} (read ${String(readMs)}ms, patch ${String(patchMs)}ms, refresh ${String(
      refreshMs,
    )}ms, confirm ${String(confirmMs)}ms)`,
  );

  jsonResponse(res, 200, {
    dreamscape: confirmedDreamscape,
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

export function createDreamscapeEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
} = {}) {
  return async function dreamscapeEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (!isDreamscapeApiPath(rawPath)) {
      next();
      return;
    }

    try {
      const route = routeForRawPath(rawPath);
      if (!route.ok) {
        errorResponse(res, route.statusCode, route.code, route.message, route.details);
        return;
      }

      if (!fileSystem.existsSync(join(rootDir, dreamscapeTomlPath))) {
        errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
          toml: dreamscapeTomlPath,
        });
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, collectionPayload(rootDir, dreamscapeTomlPath));
        return;
      }

      if (req.method === "PATCH" && route.resource === "dreamscape") {
        await handlePatch(req, res, rootDir, route.dreamscapeId, dreamscapeTomlPath, fileSystem);
        return;
      }

      if (req.method === "POST" && route.resource === "dream-avatars") {
        await handleDreamAvatarAssignment(
          req,
          res,
          rootDir,
          route.dreamscapeId,
          dreamscapeTomlPath,
          fileSystem,
        );
        return;
      }

      const allowed =
        route.resource === "collection"
          ? ["GET"]
          : route.resource === "dream-avatars"
            ? ["POST"]
            : ["PATCH"];
      methodNotAllowed(res, allowed);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
