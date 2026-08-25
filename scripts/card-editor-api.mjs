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
  DEFAULT_CARD_TOML_PATH,
  patchRenderedCardsToml,
  readEditorCards,
  readTagRegistry,
  readTideRegistry,
  refreshCardDataJson,
  removeTagsFromCards,
  removeTidesFromCards,
  serializeTagRegistry,
  serializeTideRegistry,
  tagRegistryPathFor,
  tideRegistryPathFor,
  validateCardEdit,
  validateTagRegistry,
} from "./card-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";
import { regenerateCardData } from "./setup-assets.mjs";

// API-side facet descriptors bind each card taxonomy to its registry endpoint
// and the data-layer helpers that read, serialize, and cascade it. Tags and
// tides share every handler; only this table differs.
const API_FACETS = {
  tags: {
    kind: "tags",
    field: "tags",
    basePath: "/api/editor/tags",
    Noun: "Tag",
    noun: "tag",
    invalidRegistryCode: "INVALID_TAG_REGISTRY",
    readRegistry: readTagRegistry,
    registryPathFor: tagRegistryPathFor,
    serializeRegistry: serializeTagRegistry,
    removeFromCards: removeTagsFromCards,
  },
  tides: {
    kind: "tides",
    field: "tides",
    basePath: "/api/editor/tides",
    Noun: "Tide",
    noun: "tide",
    invalidRegistryCode: "INVALID_TIDE_REGISTRY",
    readRegistry: readTideRegistry,
    registryPathFor: tideRegistryPathFor,
    serializeRegistry: serializeTideRegistry,
    removeFromCards: removeTidesFromCards,
  },
};

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/cards";
const CARD_TOML_PATH = DEFAULT_CARD_TOML_PATH;
const CARD_TOML_DIR = join("data");
const CARD_JSON_PATH = join("public", "card-data.json");
const CARD_RON_PATH = join("data", "cards.ron");
const INTERNAL_CARD_METADATA_RON_PATH = join(
  "data",
  "internal",
  "internal_card_metadata.ron",
);
const CARD_SOURCE_PATHS = [
  CARD_RON_PATH,
  INTERNAL_CARD_METADATA_RON_PATH,
];

function prepareStagedCardArtifacts(stageRoot) {
  const cardTomlPath = join(stageRoot, CARD_TOML_PATH);
  regenerateCardData({
    cardTomlPath,
    cardV2TomlPath: cardTomlPath,
    publicDir: join(stageRoot, "public"),
    cardRoleJsonPath: join(
      stageRoot,
      "src",
      "generated",
      "config",
      "card-role-data.json",
    ),
    cardLocalizationRonPath: join(
      stageRoot,
      "data",
      "generated",
      "cards_localization.ron",
    ),
    cardTransfigurationLocalizationRonPath: join(
      stageRoot,
      ".generated",
      "localization",
      "sources",
      "card_transfigurations.ron",
    ),
  });
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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

  const params = new URLSearchParams((url ?? "").slice(queryIndex + 1));
  return params.get("source") ?? params.get("toml");
}

// Resolve the `toml` query parameter to a repository-relative path that is
// guaranteed to live directly inside `data`. The value may be a bare
// filename (`cards.toml`) or the full relative path (`data/cards.toml`).
// When the parameter is absent the canonical card file (cards.toml) is used.
function resolveRequestedTomlPath(rootDir, requested) {
  if (requested === null || requested === undefined || requested.trim() === "") {
    return { ok: true, relativePath: DEFAULT_CARD_TOML_PATH };
  }

  const trimmed = requested.trim();
  if (trimmed.includes("\0")) {
    return { ok: false, message: "The toml parameter is invalid." };
  }

  const hasDirectory = trimmed.includes("/") || trimmed.includes("\\");
  const normalizedSource = trimmed === "cards" ? "cards.ron" : trimmed;
  const sourceCandidate = hasDirectory
    ? normalizedSource
    : join(CARD_TOML_DIR, normalizedSource);
  const candidate = sourceCandidate.toLowerCase().endsWith(".ron")
    ? `${sourceCandidate.slice(0, -4)}.toml`
    : sourceCandidate;

  if (!candidate.toLowerCase().endsWith(".toml")) {
    return { ok: false, message: "The toml file must have a .toml extension." };
  }

  const dataDir = resolve(rootDir, CARD_TOML_DIR);
  const target = resolve(rootDir, candidate);
  const within = relative(dataDir, target);

  if (within === "" || within.startsWith("..") || isAbsolute(within) || within.includes(sep)) {
    return { ok: false, message: "The toml file must be located in data." };
  }

  return { ok: true, relativePath: join(CARD_TOML_DIR, within) };
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

function isEditorCardsApiPath(pathname) {
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
  return resourceSegment.ok && resourceSegment.value === "cards";
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

    if (resourceSegment.value === "cards" && rawSegments[3] !== "cards") {
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
        code: "INVALID_CARD_ID",
        message: "Route card id must be a canonical UUID.",
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

  let cardId;
  try {
    cardId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_CARD_ID",
      message: "Route card id must be a canonical UUID.",
    };
  }

  if (encodedSegment !== cardId || cardId.includes("/") || !UUID_PATTERN.test(cardId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_CARD_ID",
      message: "Route card id must be a canonical UUID.",
      details: { id: cardId },
    };
  }

  return {
    ok: true,
    resource: "card",
    cardId,
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

function cardNotFound(res, cardId) {
  errorResponse(res, 404, "CARD_NOT_FOUND", "Card was not found.", { id: cardId });
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

function isCanonicalUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function generateCardDataJsonFromToml(patchedSource, fileSystem) {
  const tempRoot = fileSystem.mkdtempSync(join(tmpdir(), "journey-card-editor-refresh-"));

  try {
    fileSystem.mkdirSync(join(tempRoot, "data"), { recursive: true });
    fileSystem.mkdirSync(join(tempRoot, "public"), { recursive: true });
    fileSystem.writeFileSync(join(tempRoot, CARD_TOML_PATH), patchedSource);

    refreshCardDataJson({ rootDir: tempRoot });

    const cardJson = fileSystem.readFileSync(join(tempRoot, CARD_JSON_PATH), "utf8");
    JSON.parse(cardJson);

    return cardJson;
  } finally {
    fileSystem.rmSync(tempRoot, { recursive: true, force: true });
  }
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
  // A write whose destination does not yet exist (for example the tag registry
  // sidecar before its first save) has no prior file to back up; it is created
  // fresh and removed again if the commit rolls back. Destinations that already
  // exist are backed up so a failed commit can restore the original contents.
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
        // Restore the original file from its backup if the backup was taken.
        if (fileSystem.existsSync(write.backup)) {
          fileSystem.rmSync(write.destination, { force: true, recursive: true });
          fileSystem.renameSync(write.backup, write.destination);
        }
      } else {
        // A file that did not exist before this commit is dropped so a failed
        // commit leaves the tree exactly as it found it.
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

async function handlePatch(req, res, rootDir, cardId, cardTomlPath, fileSystem) {
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

  if (!isCanonicalUuid(body.id)) {
    errorResponse(res, 400, "INVALID_CARD_ID", "Request body id must be a canonical UUID.", {
      id: body.id,
    });
    return;
  }

  if (body.id !== cardId) {
    errorResponse(res, 400, "CARD_ID_MISMATCH", "Route card id must match request body id.", {
      routeId: cardId,
      bodyId: body.id,
    });
    return;
  }

  const ronBacked =
    cardTomlPath === DEFAULT_CARD_TOML_PATH &&
    fileSystem === defaultFileSystem &&
    fileSystem.existsSync(join(rootDir, CARD_RON_PATH));
  if (
    (ronBacked || body.sourceRevision !== undefined) &&
    typeof body.sourceRevision !== "string"
  ) {
    errorResponse(
      res,
      400,
      "INVALID_REQUEST",
      ronBacked
        ? "Every canonical RON card save requires sourceRevision."
        : "sourceRevision must be a string.",
    );
    return;
  }

  const validation = validateCardEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }

  // A card facet (tags, tides) may only reference values that exist in its
  // registry, so the card file never ends up pointing at a value the registry
  // does not define.
  if (body.field === "tags" || body.field === "tides") {
    const facet = API_FACETS[body.field];
    const registryNames = new Set(
      facet.readRegistry({ rootDir, cardTomlPath }).map((entry) => entry.name),
    );
    const unknown = validation.value.filter((value) => !registryNames.has(value));
    if (unknown.length > 0) {
      errorResponse(
        res,
        400,
        "INVALID_EDIT",
        `Unknown ${facet.noun}. Create it in Manage ${facet.noun}s first.`,
        { field: body.field, value: unknown },
      );
      return;
    }
  }


  if (ronBacked) {
    if (body.field === "tides") {
      errorResponse(
        res,
        400,
        "FIELD_NOT_APPLICABLE",
        "Per-card tides are derived and cannot be edited in the RON source.",
        { field: body.field, id: cardId },
      );
      return;
    }
    const totalStart = performance.now();
    try {
      const metadataOnly = body.field === "tags";
      const result = await stageAndPublishGameDataEdit({
        rootDir,
        dataset: "cards",
        sourcePaths: CARD_SOURCE_PATHS,
        expectedSourceRevision: body.sourceRevision,
        operations: [{
          operation: "set_card_field",
          card_id: cardId,
          field: body.field,
          value: validation.value,
        }],
        // Per-card tags live in the internal metadata sidecar and cannot alter
        // player-facing rules or cross-catalog game behavior. The Rust compiler
        // validates the typed catalog, then the shared card-only generator
        // validates and materializes every card artifact needed by the editor.
        // Other card fields retain the exhaustive cross-catalog validation.
        ...(metadataOnly
          ? {
              prepareDerivedArtifacts: ({ stageRoot }) =>
                prepareStagedCardArtifacts(stageRoot),
              validationMode: "compiled-dataset",
            }
          : {}),
      });
      const confirmedCard = readEditorCards({ rootDir, cardTomlPath }).find(
        (card) => card.id === cardId,
      );
      if (confirmedCard === undefined) {
        cardNotFound(res, cardId);
        return;
      }
      jsonResponse(res, 200, {
        card: confirmedCard,
        sourceRevision: result.sourceRevision,
        ...(Object.hasOwn(body, "clientRevision")
          ? { clientRevision: body.clientRevision }
          : {}),
        timing: { totalMs: elapsedMs(totalStart) },
      });
    } catch (error) {
      const status = error.statusCode ?? (error.code === "STALE_SOURCE" ? 409 : 422);
      errorResponse(
        res,
        status,
        error.code ?? "COMPATIBILITY_VALIDATION_FAILED",
        error instanceof Error ? error.message : "RON save failed.",
        {
          datasetId: "cards",
          source: CARD_RON_PATH,
          id: cardId,
          field: body.field,
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
        },
      );
    }
    return;
  }

  const totalStart = performance.now();
  const readStart = performance.now();
  const beforeCards = readEditorCards({ rootDir, cardTomlPath });
  const readMs = elapsedMs(readStart);

  if (!beforeCards.some((card) => card.id === cardId)) {
    cardNotFound(res, cardId);
    return;
  }

  const tomlPath = join(rootDir, cardTomlPath);
  const patchStart = performance.now();
  const source = fileSystem.readFileSync(tomlPath, "utf8");
  const patched = patchRenderedCardsToml(source, {
    cardId,
    field: body.field,
    value: body.value,
  });
  const patchMs = elapsedMs(patchStart);

  // The runtime card catalog (public/card-data.json) is generated from the
  // canonical card file (cards.toml). Editing any other source TOML writes
  // only that file so an alternate dataset never overwrites the runtime catalog.
  const refreshesCardJson = cardTomlPath === DEFAULT_CARD_TOML_PATH;
  const refreshStart = performance.now();
  const writes = [preparedWrite(tomlPath, patched.source)];
  if (refreshesCardJson) {
    const cardJson = generateCardDataJsonFromToml(patched.source, fileSystem);
    writes.push(preparedWrite(join(rootDir, CARD_JSON_PATH), cardJson));
  }
  commitFiles(writes, fileSystem);
  const refreshMs = elapsedMs(refreshStart);

  const confirmStart = performance.now();
  const confirmedCard = readEditorCards({ rootDir, cardTomlPath }).find(
    (card) => card.id === cardId,
  );
  const confirmMs = elapsedMs(confirmStart);

  if (confirmedCard === undefined) {
    cardNotFound(res, cardId);
    return;
  }

  jsonResponse(res, 200, {
    card: confirmedCard,
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

function editorFacetForPath(pathname) {
  for (const facet of Object.values(API_FACETS)) {
    if (pathname === facet.basePath) {
      return facet;
    }
  }
  return null;
}

async function handleFacetPut(req, res, rootDir, cardTomlPath, fileSystem, facet) {
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

  const ronBacked =
    cardTomlPath === DEFAULT_CARD_TOML_PATH &&
    fileSystem === defaultFileSystem &&
    fileSystem.existsSync(join(rootDir, CARD_RON_PATH));
  if (
    (ronBacked || body.sourceRevision !== undefined) &&
    typeof body.sourceRevision !== "string"
  ) {
    errorResponse(
      res,
      400,
      "INVALID_REQUEST",
      ronBacked
        ? "Every canonical RON registry save requires sourceRevision."
        : "sourceRevision must be a string.",
    );
    return;
  }

  const validation = validateTagRegistry(body.tags);
  if (!validation.ok) {
    errorResponse(res, 400, facet.invalidRegistryCode, validation.message);
    return;
  }

  const newNames = new Set(validation.tags.map((tag) => tag.name));
  const usedNames = new Set();
  for (const card of readEditorCards({ rootDir, cardTomlPath })) {
    for (const value of card[facet.field]) {
      usedNames.add(value);
    }
  }
  const removedUsed = [...usedNames].filter((name) => !newNames.has(name));

  if (ronBacked) {
    const current = facet.readRegistry({ rootDir, cardTomlPath });
    const currentByName = new Map(current.map((entry) => [entry.name, entry]));
    const operations = validation.tags.flatMap((entry) => {
      const previous = currentByName.get(entry.name);
      return previous?.color === entry.color
        ? []
        : [{
            operation: "upsert_facet",
            facet: facet.kind,
            name: entry.name,
            color: entry.color,
          }];
    });
    for (const entry of current) {
      if (!newNames.has(entry.name)) {
        operations.push({
          operation: "delete_facet",
          facet: facet.kind,
          name: entry.name,
        });
      }
    }
    try {
      const result = await stageAndPublishGameDataEdit({
        rootDir,
        dataset: "cards",
        sourcePaths: CARD_SOURCE_PATHS,
        expectedSourceRevision: body.sourceRevision,
        operations,
      });
      jsonResponse(res, 200, {
        tags: facet.readRegistry({ rootDir, cardTomlPath }),
        cards: readEditorCards({ rootDir, cardTomlPath }),
        sourceRevision: result.sourceRevision,
      });
    } catch (error) {
      errorResponse(
        res,
        error.statusCode ?? (error.code === "STALE_SOURCE" ? 409 : 422),
        error.code ?? "COMPATIBILITY_VALIDATION_FAILED",
        error instanceof Error ? error.message : "RON registry save failed.",
        {
          datasetId: "cards",
          source: CARD_RON_PATH,
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
        },
      );
    }
    return;
  }

  const registryAbsPath = join(rootDir, facet.registryPathFor(cardTomlPath));
  const cardTomlBasename = cardTomlPath.split(/[\\/]/u).pop();
  const writes = [
    preparedWrite(
      registryAbsPath,
      facet.serializeRegistry(validation.tags, { cardTomlBasename }),
    ),
  ];

  // Deleting a value from the registry strips it from every card that used it so
  // the card file never references an undefined value.
  if (removedUsed.length > 0) {
    const tomlPath = join(rootDir, cardTomlPath);
    const source = fileSystem.readFileSync(tomlPath, "utf8");
    const patchedSource = facet.removeFromCards(source, removedUsed);
    writes.push(preparedWrite(tomlPath, patchedSource));

    if (cardTomlPath === DEFAULT_CARD_TOML_PATH) {
      const cardJson = generateCardDataJsonFromToml(patchedSource, fileSystem);
      writes.push(preparedWrite(join(rootDir, CARD_JSON_PATH), cardJson));
    }
  }

  commitFiles(writes, fileSystem);

  jsonResponse(res, 200, {
    tags: facet.readRegistry({ rootDir, cardTomlPath }),
    cards: readEditorCards({ rootDir, cardTomlPath }),
  });
}

async function handleFacet(req, res, rootDir, cardTomlPath, fileSystem, facet) {
  if (req.method === "GET") {
    jsonResponse(res, 200, {
      tags: facet.readRegistry({ rootDir, cardTomlPath }),
      ...(cardTomlPath === DEFAULT_CARD_TOML_PATH &&
      fileSystem.existsSync(join(rootDir, CARD_RON_PATH))
        ? { sourceRevision: sourceRevision(rootDir, CARD_SOURCE_PATHS) }
        : {}),
    });
    return;
  }

  if (req.method === "PUT") {
    await handleFacetPut(req, res, rootDir, cardTomlPath, fileSystem, facet);
    return;
  }

  methodNotAllowed(res, ["GET", "PUT"]);
}

export function createCardEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function cardEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    const facet = editorFacetForPath(rawPath);
    if (facet !== null) {
      try {
        const tomlResolution = resolveRequestedTomlPath(rootDir, tomlParamFromUrl(req.url));
        if (!tomlResolution.ok) {
          errorResponse(res, 400, "INVALID_TOML", tomlResolution.message);
          return;
        }

        const cardTomlPath = tomlResolution.relativePath;
        if (!fileSystem.existsSync(join(rootDir, cardTomlPath))) {
          errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
            toml: cardTomlPath,
          });
          return;
        }

        await handleFacet(req, res, rootDir, cardTomlPath, fileSystem, facet);
      } catch (error) {
        errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
      }
      return;
    }

    if (!isEditorCardsApiPath(rawPath)) {
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

      const cardTomlPath = tomlResolution.relativePath;
      if (!fileSystem.existsSync(join(rootDir, cardTomlPath))) {
        errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
          toml: cardTomlPath,
        });
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          cards: readEditorCards({ rootDir, cardTomlPath }),
          ...(cardTomlPath === DEFAULT_CARD_TOML_PATH &&
          fileSystem.existsSync(join(rootDir, CARD_RON_PATH))
            ? { sourceRevision: sourceRevision(rootDir, CARD_SOURCE_PATHS) }
            : {}),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "card") {
        await handlePatch(req, res, rootDir, route.cardId, cardTomlPath, fileSystem);
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
