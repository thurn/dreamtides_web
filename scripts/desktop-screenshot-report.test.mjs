import { describe, expect, it } from "vitest";
import {
  buildManifest,
  buildCaptureExceptionCell,
  buildSceneUrl,
  cellOutputPath,
  escapeHtml,
  evaluateCaptureHealth,
  formatCompactResult,
  relativeCellOutputPath,
  renderContactSheetHtml,
  renderIndexHtml,
  withReportDiagnostics,
} from "./desktop-screenshot-report.mjs";

const SCENES = [
  { id: "scene-a", label: "Scene <A>", group: "journey" },
  { id: "scene-b", label: "Scene & B", group: "journey" },
];
const VIEWPORTS = [
  {
    id: "desktop-1366x768",
    label: "1366 × 768",
    width: 1366,
    height: 768,
    rationale: "fixture",
    dpr: 1,
  },
  {
    id: "desktop-1920x1080",
    label: "1920 × 1080",
    width: 1920,
    height: 1080,
    rationale: "fixture",
    dpr: 1,
  },
];

function healthyMeasurement(overrides = {}) {
  return {
    ready: true,
    url: "http://localhost:5178/atlas?goto=atlas&seed=42&game=abc123",
    fontsReady: true,
    stableMeasurements: 2,
    waitMs: 750,
    viewport: {
      width: 1366,
      height: 768,
      devicePixelRatio: 1,
    },
    root: {
      childElementCount: 1,
      textLength: 20,
      visibleMediaCount: 0,
    },
    document: {
      scrollWidth: 1366,
      scrollHeight: 900,
      clientWidth: 1366,
      clientHeight: 768,
    },
    images: { total: 2, visible: 2, broken: [] },
    errors: { page: [], rejections: [], console: [] },
    ...overrides,
  };
}

function makeCell(sceneId, viewportId, status = "passed") {
  return {
    sceneId,
    viewportId,
    status,
    url: `http://localhost/${sceneId}`,
    actualUrl: `http://localhost/${sceneId}`,
    output: relativeCellOutputPath(sceneId, viewportId),
    timingMs: 100,
    readiness: { ready: true },
    geometry: {},
    images: { broken: [] },
    errors: { page: [], rejections: [], console: [] },
    diagnostics: [],
  };
}

describe("stable paths and URLs", () => {
  it("constructs scene URLs with a stable parameter order", () => {
    expect(buildSceneUrl("http://localhost:5178", "atlas", "42")).toBe(
      "http://localhost:5178/?goto=atlas&seed=42",
    );
  });

  it("constructs stable run-relative and absolute cell paths", () => {
    expect(
      relativeCellOutputPath("atlas", "desktop-1366x768"),
    ).toBe("atlas/desktop-1366x768.png");
    expect(
      cellOutputPath("/tmp/run", "atlas", "desktop-1366x768"),
    ).toBe("/tmp/run/atlas/desktop-1366x768.png");
  });
});

describe("capture health", () => {
  const expected = {
    url: "http://localhost:5178/?goto=atlas&seed=42",
    sceneId: "atlas",
    width: 1366,
    height: 768,
  };

  it("accepts a stable, correctly routed synthetic measurement", () => {
    expect(evaluateCaptureHealth(healthyMeasurement(), expected)).toEqual({
      passed: true,
      diagnostics: [],
    });
  });

  it("reports routing, geometry, root, image, and page failures together", () => {
    const result = evaluateCaptureHealth(
      healthyMeasurement({
        ready: false,
        url: "http://localhost:9999/?goto=draft",
        viewport: { width: 800, height: 600, devicePixelRatio: 1 },
        root: {
          childElementCount: 0,
          textLength: 0,
          visibleMediaCount: 0,
        },
        images: {
          total: 1,
          visible: 1,
          broken: [{ src: "broken.png" }],
        },
        errors: {
          page: ["render failed"],
          rejections: ["promise failed"],
          console: ["console failed"],
        },
      }),
      expected,
    );
    expect(result.passed).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "wrong-server-url",
      "wrong-scene",
      "wrong-viewport",
      "empty-root",
      "readiness-timeout",
      "broken-image",
      "page-error",
      "unhandled-rejection",
      "console-error",
    ]);
  });
});

describe("manifest and reports", () => {
  const cells = [
    makeCell("scene-a", "desktop-1366x768"),
    makeCell("scene-a", "desktop-1920x1080"),
    makeCell("scene-b", "desktop-1366x768"),
    makeCell("scene-b", "desktop-1920x1080", "failed"),
  ];
  const manifest = buildManifest({
    run: {
      id: "fixture-run",
      seed: "42",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      elapsedMs: 1000,
    },
    scenes: SCENES,
    viewports: VIEWPORTS,
    cells,
    contactSheets: ["contact-sheet-journey.png"],
  });

  it("records deterministic metadata and per-cell failures", () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      run: {
        id: "fixture-run",
        seed: "42",
        totalCaptures: 4,
        failures: 1,
      },
      contactSheets: ["contact-sheet-journey.png"],
    });
    expect(manifest.cells).toHaveLength(4);
  });

  it("counts contact-sheet failures in persisted run metadata", () => {
    const finalized = withReportDiagnostics(
      manifest,
      [],
      [{ group: "journey", message: "sheet failed" }],
    );
    expect(finalized.run.failures).toBe(2);
    expect(finalized.contactSheets).toEqual([]);
    expect(finalized.reportDiagnostics).toEqual([
      { group: "journey", message: "sheet failed" },
    ]);
    expect(renderIndexHtml(finalized)).toContain("2 failures");
  });

  it("keeps exception-failed cells on the same predictable schema", () => {
    const cell = buildCaptureExceptionCell({
      sceneId: "scene-a",
      viewportId: "desktop-1366x768",
      expectedUrl: "http://localhost:5178/?goto=scene-a",
      relativeOutput: "scene-a/desktop-1366x768.png",
      timingMs: 50,
      message: "browser unavailable",
    });
    expect(cell).toMatchObject({
      status: "failed",
      readiness: {
        ready: false,
        fontsReady: null,
        stableMeasurements: 0,
        waitMs: null,
      },
      geometry: {
        viewport: null,
        root: null,
        document: null,
      },
      images: { total: null, visible: null, broken: [] },
      errors: { page: [], rejections: [], console: [] },
      diagnostics: [
        { code: "capture-error", message: "browser unavailable" },
      ],
    });
  });

  it("escapes labels and orders cells scene-major then viewport-major", () => {
    const html = renderIndexHtml(manifest);
    expect(html).toContain("Scene &lt;A&gt;");
    expect(html).toContain("Scene &amp; B");
    const expectedOrder = [
      "scene-a/desktop-1366x768",
      "scene-a/desktop-1920x1080",
      "scene-b/desktop-1366x768",
      "scene-b/desktop-1920x1080",
    ];
    const positions = expectedOrder.map((value) =>
      html.indexOf(`data-cell="${value}"`),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain("badge-failed");
  });

  it("keeps contact-sheet cell ordering and group selection stable", () => {
    const html = renderContactSheetHtml(manifest, "journey");
    expect(html.indexOf("scene-a/desktop-1366x768")).toBeLessThan(
      html.indexOf("scene-b/desktop-1366x768"),
    );
    expect(html).not.toContain('loading="lazy"');
  });
});

describe("compact stdout", () => {
  const result = {
    captures: 4,
    failures: 1,
    elapsedMs: 1234,
    manifest: "/tmp/run/manifest.json",
    report: "/tmp/run/index.html",
    contactSheets: ["/tmp/run/contact-sheet.png"],
  };

  it("prints a small human result without embedding the manifest", () => {
    const output = formatCompactResult(result);
    expect(output.split("\n")).toHaveLength(5);
    expect(output).toContain("Captured 4 cells (1 failed) in 1.2s.");
    expect(output).not.toContain('"cells"');
  });

  it("prints one compact JSON object", () => {
    const output = formatCompactResult(result, true);
    expect(output.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(output)).toEqual(result);
  });
});

describe("escapeHtml", () => {
  it("escapes text and attribute delimiters", () => {
    expect(escapeHtml(`<a title="'">&`)).toBe(
      "&lt;a title=&quot;&#39;&quot;&gt;&amp;",
    );
  });
});
