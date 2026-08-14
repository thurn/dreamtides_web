// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderRootRoute,
  STANDALONE_ROUTE_PATHS,
  type RootRouteId,
} from "./root-router";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const JOURNEY_ROUTE_PATHS = [
  "/",
  "/atlas",
  "/dreamscape/2-ember-wood",
  "/dreamscape/2-ember-wood/purge",
  "/complete",
  "/failed",
  "/main",
  "/loading",
  "/tutorial",
] as const;

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function stubBrowserRuntime(): void {
  vi.stubEnv("MODE", "production");
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  vi.stubGlobal("ResizeObserver", ObserverStub);
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("scrollTo", () => undefined);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

async function expectRouteToRender(
  path: string,
  expectedRoute: "standalone" | "journey",
): Promise<void> {
  window.history.replaceState(null, "", path);
  const container = document.createElement("div");
  document.body.append(container);
  const reactErrors: unknown[] = [];
  const root = createRoot(container, {
    onCaughtError: (error) => reactErrors.push(error),
    onRecoverableError: (error) => reactErrors.push(error),
    onUncaughtError: (error) => reactErrors.push(error),
  });
  let routeId: RootRouteId | null = null;

  await act(async () => {
    routeId = await renderRootRoute(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(reactErrors).toEqual([]);
  expect(routeId === "journey" ? "journey" : "standalone").toBe(expectedRoute);
  expect(container.childElementCount).toBeGreaterThan(0);
  const textLength = container.textContent?.trim().length ?? 0;
  const mediaCount = container.querySelectorAll(
    "canvas, img, svg, video",
  ).length;
  expect(textLength + mediaCount).toBeGreaterThan(0);

  act(() => root.unmount());
  container.remove();
}

beforeEach(() => {
  stubBrowserRuntime();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  document.body.innerHTML = "";
});

describe("top-level route render smoke", () => {
  it.each(STANDALONE_ROUTE_PATHS)(
    "renders standalone route %s with production runtime checks",
    async (path) => {
      await expectRouteToRender(path, "standalone");
    },
  );

  it.each(JOURNEY_ROUTE_PATHS)(
    "renders journey route %s with production runtime checks",
    async (path) => {
      await expectRouteToRender(path, "journey");
    },
  );

  it("renders the loaded Figment editor state with production runtime checks", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (requestUrl.startsWith("/api/editor/figments")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              figments: [
                {
                  id: "bb1a5acd-1a03-4aa3-826d-f0a301843845",
                  name: "Warrior",
                  subtype: "Warrior",
                  spark: 1,
                  keyword: "",
                  "rendered-text": "",
                  "image-number": 436090582,
                  art: null,
                  sourceIndex: 0,
                  source: {},
                },
              ],
              sourceRevision: "synthetic-revision",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return new Promise<Response>(() => undefined);
    });

    await expectRouteToRender("/figments", "standalone");
  });

  it.each([
    ["/editor?sort=cost#cards", "/cards?sort=cost#cards"],
    ["/avatars?identicons=1#details", "/dream-avatars?identicons=1#details"],
    [
      "/dreamavatars?identicons=1#details",
      "/dream-avatars?identicons=1#details",
    ],
  ])("canonicalizes route alias %s", async (source, canonical) => {
    await expectRouteToRender(source, "standalone");
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe(canonical);
  });
});
