import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  previewExplorationTemplateEdit,
  readExplorationEditorData,
  updateExplorationAction,
  updateExplorationProse,
  updateExplorationTemplate,
} from "./exploration-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/exploration";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TEMPLATE_ID_PATTERN = /^\d+$/u;
const EXPLORATION_SOURCE_PATHS = [
  "data/exploration.ron",
  "data/templates.json",
];

function respond(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message) {
  respond(res, status, { error: { code, message } });
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 200_000) reject(new Error("Request body is too large."));
    });
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error("Request body must contain valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function decodeSegment(segment) {
  try {
    const value = decodeURIComponent(segment);
    return encodeURIComponent(value) === segment ? value : null;
  } catch {
    return null;
  }
}

function routeFor(url) {
  const path = (url ?? "/").split("?", 1)[0];
  if (path === BASE_PATH) return { kind: "collection" };
  if (!path.startsWith(`${BASE_PATH}/`)) return null;
  const parts = path.slice(BASE_PATH.length + 1).split("/");
  const decoded = parts.map(decodeSegment);
  if (decoded.some((entry) => entry === null)) return { kind: "invalid" };
  if (parts.length === 2 && decoded[0] === "templates") {
    return { kind: "template", templateId: decoded[1] };
  }
  if (parts.length === 2 && decoded[0] === "encounters") {
    return { kind: "encounter", cardId: decoded[1] };
  }
  if (
    parts.length === 4 &&
    decoded[0] === "encounters" &&
    decoded[2] === "actions"
  ) {
    return { kind: "action", cardId: decoded[1], slot: decoded[3] };
  }
  return { kind: "missing" };
}

function statusFor(error) {
  if (["ENCOUNTER_NOT_FOUND", "ACTION_NOT_FOUND", "TEMPLATE_NOT_FOUND", "RECORD_NOT_FOUND"].includes(error.code)) {
    return 404;
  }
  if (error.code === "STALE_SOURCE") return 409;
  if (["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)) return 422;
  if (error.code === "PUBLICATION_FAILED") return 500;
  return error.statusCode ?? 400;
}

/** Vite development middleware for the TOML-backed Exploration editor. */
export function createExplorationEditorApiMiddleware(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const onChanged = options.onChanged ?? (() => {});
  const dataOptions = {
    rootDir,
    ...(options.fileSystem === undefined ? {} : { fileSystem: options.fileSystem }),
    ...(options.explorationTomlPath === undefined
      ? {}
      : { explorationTomlPath: options.explorationTomlPath }),
    ...(options.templatesPath === undefined ? {} : { templatesPath: options.templatesPath }),
    ...(options.cardsTomlPath === undefined ? {} : { cardsTomlPath: options.cardsTomlPath }),
    ...(options.dreamsignsTomlPath === undefined
      ? {}
      : { dreamsignsTomlPath: options.dreamsignsTomlPath }),
    ...(options.explorationJsonPath === undefined
      ? {}
      : { explorationJsonPath: options.explorationJsonPath }),
  };
  const ronBacked = options.explorationTomlPath === undefined &&
    options.templatesPath === undefined &&
    existsSync(join(rootDir, "data", "game-data-manifest.ron"));
  let writeQueue = Promise.resolve();

  return async function explorationEditorApi(req, res, next) {
    const route = routeFor(req.url);
    if (route === null) {
      next();
      return;
    }
    if (route.kind === "invalid" || route.kind === "missing") {
      fail(res, route.kind === "invalid" ? 400 : 404, "INVALID_API_PATH", "Exploration editor endpoint was not found.");
      return;
    }
    if (route.kind === "collection") {
      if (req.method !== "GET") {
        fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports GET.");
        return;
      }
      try {
        const data = readExplorationEditorData(dataOptions);
        respond(res, 200, ronBacked ? {
          ...data,
          sourceRevision: sourceRevision(rootDir, EXPLORATION_SOURCE_PATHS),
        } : data);
      } catch (error) {
        fail(res, statusFor(error), error.code ?? "INVALID_REQUEST", error.message);
      }
      return;
    }
    if (req.method !== "PATCH") {
      fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports PATCH.");
      return;
    }

    try {
      const body = await readBody(req);
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Request body must be an object.");
      }
      const operation = async () => {
        let data;
        if (ronBacked && typeof body.expectedSourceRevision !== "string") {
          const error = new Error("Every Exploration save requires expectedSourceRevision.");
          error.code = "INVALID_EDIT";
          throw error;
        }
        if (route.kind === "template") {
          if (!TEMPLATE_ID_PATTERN.test(route.templateId ?? "")) {
            const error = new Error("Route template id must contain digits only.");
            error.code = "INVALID_TEMPLATE_ID";
            throw error;
          }
          const edit = { templateId: Number(route.templateId), value: body.value };
          if (ronBacked) {
            const preview = previewExplorationTemplateEdit(edit, dataOptions);
            const result = await stageAndPublishGameDataEdit({
              rootDir,
              dataset: "exploration",
              expectedSourceRevision: body.expectedSourceRevision,
              sourcePaths: EXPLORATION_SOURCE_PATHS,
              stagedFiles: { "data/templates.json": preview.templateSource },
              operations: [{
                operation: "replace_template",
                template_id: edit.templateId,
                actions: preview.actions.map((entry) => ({
                  card_id: entry.cardId,
                  slot: entry.slot,
                  expected_action_id: entry.expectedActionId,
                  action: entry.action,
                })),
              }],
            });
            data = {
              ...readExplorationEditorData(dataOptions),
              sourceRevision: result.sourceRevision,
            };
          } else {
            data = updateExplorationTemplate(edit, dataOptions);
          }
          onChanged({ kind: "template", templateId: Number(route.templateId) });
        } else {
          if (!UUID_PATTERN.test(route.cardId ?? "")) {
            const error = new Error("Route card id must be a UUID.");
            error.code = "INVALID_CARD_ID";
            throw error;
          }
          if (route.kind === "encounter") {
            if (ronBacked) {
              const result = await stageAndPublishGameDataEdit({
                rootDir,
                dataset: "exploration",
                expectedSourceRevision: body.expectedSourceRevision,
                sourcePaths: EXPLORATION_SOURCE_PATHS,
                operations: [{
                  operation: "set_encounter_prose",
                  card_id: route.cardId,
                  prose: body.value,
                }],
              });
              data = {
                ...readExplorationEditorData(dataOptions),
                sourceRevision: result.sourceRevision,
              };
            } else {
              data = updateExplorationProse({ cardId: route.cardId, value: body.value }, dataOptions);
            }
            onChanged({ kind: "prose", cardId: route.cardId });
          } else {
            if (route.slot !== "0" && route.slot !== "1") {
              const error = new Error("Action slot must be 0 or 1.");
              error.code = "INVALID_ACTION_SLOT";
              throw error;
            }
            if (ronBacked) {
              const current = readExplorationEditorData(dataOptions);
              const encounter = current.encounters.find((entry) =>
                entry.cardId.toLowerCase() === route.cardId.toLowerCase());
              const expectedActionId = encounter?.actions[Number(route.slot)]?.id;
              if (expectedActionId === undefined) {
                const error = new Error("The requested Exploration action was not found.");
                error.code = "RECORD_NOT_FOUND";
                throw error;
              }
              const result = await stageAndPublishGameDataEdit({
                rootDir,
                dataset: "exploration",
                expectedSourceRevision: body.expectedSourceRevision,
                sourcePaths: EXPLORATION_SOURCE_PATHS,
                operations: [{
                  operation: "replace_action",
                  card_id: route.cardId,
                  slot: Number(route.slot),
                  expected_action_id: expectedActionId,
                  action: body.action,
                }],
              });
              data = {
                ...readExplorationEditorData(dataOptions),
                sourceRevision: result.sourceRevision,
              };
            } else {
              data = updateExplorationAction({
                cardId: route.cardId,
                slot: Number(route.slot),
                action: body.action,
              }, dataOptions);
            }
            onChanged({ kind: "action", cardId: route.cardId, slot: Number(route.slot) });
          }
        }
        return data;
      };
      const responsePromise = writeQueue.then(operation, operation);
      writeQueue = responsePromise.then(() => undefined, () => undefined);
      const data = await responsePromise;
      respond(res, 200, {
        data,
        ...(body.clientRevision === undefined ? {} : { clientRevision: body.clientRevision }),
      });
    } catch (error) {
      if (error.code === "STALE_SOURCE" && ronBacked) {
        respond(res, 409, {
          error: {
            code: "STALE_SOURCE",
            message: error.message,
            currentSourceRevision: error.currentSourceRevision,
            confirmed: readExplorationEditorData(dataOptions),
            datasetId: "exploration",
            source: EXPLORATION_SOURCE_PATHS[0],
          },
        });
      } else {
        fail(
          res,
          statusFor(error),
          error.code ?? "INVALID_REQUEST",
          error instanceof Error ? error.message : "Exploration editor request failed.",
        );
      }
    }
  };
}
