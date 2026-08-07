// @vitest-environment node

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createRonEditorBridge } from "./ron-editor-bridge.mjs";

function request(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.setEncoding = vi.fn();
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return req;
}

function response() {
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  return {
    done,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(text) { this.body = JSON.parse(text); finish(this); },
  };
}

function legacyFor(rootDir) {
  return async (req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, {});
      res.end(JSON.stringify({ records: [{ id: "stable-id", rootDir }] }));
      return;
    }
    let text = "";
    req.on("data", (chunk) => { text += chunk; });
    req.on("end", () => {
      res.writeHead(200, {});
      res.end(JSON.stringify({ record: JSON.parse(text) }));
    });
  };
}

describe("RON editor bridge", () => {
  it("adds confirmed revisions to reads and stages revisioned writes", async () => {
    const publishEdit = vi.fn(async (options) => ({
      mutation: await options.mutateStage("/stage"),
      sourceRevision: "next-revision",
    }));
    const middleware = createRonEditorBridge({
      rootDir: "/repo",
      basePaths: ["/api/editor/records"],
      collectionPath: "/api/editor/records",
      datasets: ["records"],
      sourcePaths: ["data/records.ron"],
      createLegacy: legacyFor,
      revision: () => "confirmed-revision",
      publishEdit,
    });
    const getResponse = response();
    await middleware(request("GET", "/api/editor/records"), getResponse, vi.fn());
    expect((await getResponse.done).body.sourceRevision).toBe("confirmed-revision");

    const saveResponse = response();
    await middleware(request("PATCH", "/api/editor/records/stable-id", {
      id: "stable-id",
      expectedSourceRevision: "confirmed-revision",
    }), saveResponse, vi.fn());
    expect((await saveResponse.done).body.sourceRevision).toBe("next-revision");
    expect(publishEdit).toHaveBeenCalledWith(expect.objectContaining({
      datasets: ["records"],
      expectedSourceRevision: "confirmed-revision",
    }));
  });

  it("returns current confirmed data for a stale save", async () => {
    const error = Object.assign(new Error("STALE_SOURCE: changed"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "current",
    });
    const middleware = createRonEditorBridge({
      rootDir: "/repo",
      basePaths: ["/api/editor/records"],
      collectionPath: "/api/editor/records",
      datasets: ["records"],
      sourcePaths: ["data/records.ron"],
      createLegacy: legacyFor,
      revision: () => "current",
      publishEdit: vi.fn().mockRejectedValue(error),
    });
    const result = response();
    await middleware(request("PATCH", "/api/editor/records/stable-id", {
      id: "stable-id",
      expectedSourceRevision: "old",
    }), result, vi.fn());
    const completed = await result.done;
    expect(completed.status).toBe(409);
    expect(completed.body.error).toMatchObject({
      code: "STALE_SOURCE",
      currentSourceRevision: "current",
      confirmed: { records: [{ id: "stable-id", rootDir: "/repo" }] },
    });
  });
});
