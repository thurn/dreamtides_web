import { Readable } from "node:stream";
import {
  sourceRevision,
  stageAndPublishCompatibilityEdit,
} from "./game-data-pipeline.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { text += chunk; });
    req.on("end", () => resolve(text));
    req.on("error", reject);
  });
}

function invoke(middleware, { method, url, body }) {
  return new Promise((resolve, reject) => {
    const input = body === undefined ? [] : [JSON.stringify(body)];
    const req = Readable.from(input);
    req.method = method;
    req.url = url;
    req.headers = { accept: "application/json", "content-type": "application/json" };
    const headers = {};
    let status = 200;
    const res = {
      setHeader(name, value) { headers[name] = value; },
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        Object.assign(headers, nextHeaders);
      },
      end(content = "") {
        const text = String(content);
        let parsed = null;
        try { parsed = text === "" ? null : JSON.parse(text); } catch {}
        resolve({ status, headers, body: parsed, text });
      },
    };
    Promise.resolve(middleware(req, res, () => resolve({ status: 404, body: null, text: "" })))
      .catch(reject);
  });
}

function respond(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function compatibilityUrl(url) {
  const parsed = new URL(url ?? "/", "http://localhost");
  const source = parsed.searchParams.get("source");
  if (source !== null) {
    parsed.searchParams.delete("source");
    parsed.searchParams.set("toml", source.replace(/\.ron$/iu, ".toml"));
  }
  return `${parsed.pathname}${parsed.search}`;
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)) return 422;
  if (error.code === "PUBLICATION_FAILED") return 500;
  return error.statusCode ?? 500;
}

/**
 * Adapts an established compatibility-TOML middleware to canonical RON. The
 * established middleware runs only in an isolated staging root; Rust adopts
 * its validated document and the shared transaction publishes the result.
 */
export function createRonEditorBridge({
  rootDir,
  basePaths,
  collectionPath,
  datasets,
  sourcePaths,
  createLegacy,
  onChanged = () => {},
  revision = sourceRevision,
  publishEdit = stageAndPublishCompatibilityEdit,
}) {
  const legacy = createLegacy(rootDir);
  const handles = (url) => {
    const pathname = (url ?? "/").split("?", 1)[0];
    return basePaths.some((basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`));
  };
  return async function ronEditorBridge(req, res, next) {
    if (!handles(req.url)) {
      next();
      return;
    }
    try {
      if (req.method === "GET") {
        const result = await invoke(legacy, {
          method: req.method,
          url: compatibilityUrl(req.url),
        });
        if (result.body !== null && result.status >= 200 && result.status < 300) {
          result.body.sourceRevision = revision(rootDir, sourcePaths);
        }
        respond(res, result.status, result.body, result.headers);
        return;
      }
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw); } catch {
        respond(res, 400, { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } });
        return;
      }
      if (body === null || typeof body !== "object" || Array.isArray(body) ||
          typeof body.expectedSourceRevision !== "string") {
        respond(res, 400, { error: { code: "INVALID_EDIT", message: "Every save requires expectedSourceRevision." } });
        return;
      }
      const url = compatibilityUrl(req.url);
      const method = req.method;
      const result = await publishEdit({
        rootDir,
        datasets,
        sourcePaths,
        expectedSourceRevision: body.expectedSourceRevision,
        mutateStage: async (stageRoot) => {
          const staged = await invoke(createLegacy(stageRoot), { method, url, body });
          if (staged.status < 200 || staged.status >= 300) {
            const error = new Error(staged.body?.error?.message ?? "Editor validation failed.");
            error.code = staged.body?.error?.code ?? "INVALID_EDIT";
            error.statusCode = staged.status;
            error.response = staged;
            throw error;
          }
          return staged;
        },
      });
      const response = result.mutation.body ?? {};
      response.sourceRevision = result.sourceRevision;
      respond(res, result.mutation.status, response, result.mutation.headers);
      onChanged();
    } catch (error) {
      if (error.response !== undefined) {
        respond(res, error.response.status, error.response.body, error.response.headers);
        return;
      }
      let confirmed;
      if (error.code === "STALE_SOURCE") {
        const loaded = await invoke(legacy, { method: "GET", url: collectionPath });
        confirmed = loaded.body;
      }
      respond(res, statusFor(error), {
        error: {
          code: error.code ?? "PUBLICATION_FAILED",
          message: error instanceof Error ? error.message : "Editor transaction failed.",
          datasetId: datasets[0],
          source: sourcePaths[0],
          ...(error.currentSourceRevision === undefined ? {} : {
            currentSourceRevision: error.currentSourceRevision,
          }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      });
    }
  };
}
