import { join } from "node:path";
import { buildAppUrl } from "./screenshot-runtime.mjs";

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSceneUrl(baseUrl, sceneId, seed) {
  return buildAppUrl(baseUrl, {
    route: "/",
    params: [
      ["goto", sceneId],
      ["seed", seed],
    ],
  });
}

export function cellOutputPath(runDir, sceneId, viewportId) {
  return join(runDir, sceneId, `${viewportId}.png`);
}

export function relativeCellOutputPath(sceneId, viewportId) {
  return `${sceneId}/${viewportId}.png`;
}

function diagnostic(code, message) {
  return { code, message };
}

export function evaluateCaptureHealth(measurement, expected) {
  const diagnostics = [];
  if (measurement === null || typeof measurement !== "object") {
    return {
      passed: false,
      diagnostics: [
        diagnostic("missing-measurement", "Capture readiness returned no data."),
      ],
    };
  }

  let actualUrl;
  let expectedUrl;
  try {
    actualUrl = new URL(measurement.url);
    expectedUrl = new URL(expected.url);
  } catch {
    diagnostics.push(
      diagnostic("invalid-url", "The browser returned an invalid page URL."),
    );
  }
  if (actualUrl && expectedUrl) {
    const expectedPath =
      expectedUrl.pathname === "/"
        ? "/"
        : expectedUrl.pathname.replace(/\/+$/, "");
    const pathMatches =
      expectedPath === "/" ||
      actualUrl.pathname === expectedPath ||
      actualUrl.pathname.startsWith(`${expectedPath}/`);
    if (actualUrl.origin !== expectedUrl.origin || !pathMatches) {
      diagnostics.push(
        diagnostic(
          "wrong-server-url",
          `Expected server ${expectedUrl.origin}${expectedPath}, received ${actualUrl.origin}${actualUrl.pathname}.`,
        ),
      );
    }
    if (actualUrl.searchParams.get("goto") !== expected.sceneId) {
      diagnostics.push(
        diagnostic(
          "wrong-scene",
          `Expected goto=${expected.sceneId}, received goto=${String(actualUrl.searchParams.get("goto"))}.`,
        ),
      );
    }
  }
  if (
    measurement.viewport?.width !== expected.width ||
    measurement.viewport?.height !== expected.height
  ) {
    diagnostics.push(
      diagnostic(
        "wrong-viewport",
        `Expected ${String(expected.width)}×${String(expected.height)}, received ${String(measurement.viewport?.width)}×${String(measurement.viewport?.height)}.`,
      ),
    );
  }
  if (
    !measurement.root ||
    measurement.root.childElementCount < 1 ||
    measurement.root.textLength + measurement.root.visibleMediaCount < 1
  ) {
    diagnostics.push(
      diagnostic("empty-root", "The rendered #root is empty."),
    );
  }
  if (measurement.ready !== true) {
    diagnostics.push(
      diagnostic(
        "readiness-timeout",
        measurement.readinessMessage ?? "The page did not become stable in time.",
      ),
    );
  }
  for (const broken of measurement.images?.broken ?? []) {
    diagnostics.push(
      diagnostic(
        "broken-image",
        `Visible image did not load: ${broken.src || "(missing src)"}`,
      ),
    );
  }
  for (const entry of measurement.errors?.page ?? []) {
    diagnostics.push(diagnostic("page-error", String(entry)));
  }
  for (const entry of measurement.errors?.rejections ?? []) {
    diagnostics.push(diagnostic("unhandled-rejection", String(entry)));
  }
  for (const entry of measurement.errors?.console ?? []) {
    diagnostics.push(diagnostic("console-error", String(entry)));
  }

  return { passed: diagnostics.length === 0, diagnostics };
}

export function buildManifest({
  run,
  scenes,
  viewports,
  cells,
  contactSheets,
}) {
  const failures = cells.filter((cell) => cell.status !== "passed").length;
  return {
    schemaVersion: 1,
    run: {
      ...run,
      totalCaptures: cells.length,
      failures,
    },
    scenes,
    viewports,
    contactSheets,
    cells,
  };
}

export function withReportDiagnostics(
  manifest,
  contactSheets,
  reportDiagnostics,
) {
  const cellFailures = manifest.cells.filter(
    (cell) => cell.status !== "passed",
  ).length;
  return {
    ...manifest,
    run: {
      ...manifest.run,
      failures: cellFailures + reportDiagnostics.length,
    },
    contactSheets,
    ...(reportDiagnostics.length > 0 ? { reportDiagnostics } : {}),
  };
}

export function buildCaptureExceptionCell({
  sceneId,
  viewportId,
  expectedUrl,
  relativeOutput,
  timingMs,
  message,
}) {
  return {
    sceneId,
    viewportId,
    status: "failed",
    url: expectedUrl,
    actualUrl: null,
    output: null,
    timingMs,
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
    images: {
      total: null,
      visible: null,
      broken: [],
    },
    errors: {
      page: [],
      rejections: [],
      console: [],
    },
    diagnostics: [
      {
        code: "capture-error",
        message,
      },
    ],
    attemptedOutput: relativeOutput,
  };
}

function statusBadge(cell) {
  const label = cell.status === "passed" ? "PASS" : "FAIL";
  return `<span class="badge badge-${escapeHtml(cell.status)}">${label}</span>`;
}

function reportCell(cell) {
  if (!cell) return '<td class="missing">Not selected</td>';
  const diagnostics = cell.diagnostics
    .map((entry) => entry.message)
    .join(" ");
  const body =
    cell.status === "passed"
      ? `<a href="${escapeHtml(cell.output)}"><img src="${escapeHtml(cell.output)}" alt="${escapeHtml(`${cell.sceneId} at ${cell.viewportId}`)}" loading="lazy" /></a>`
      : cell.output
        ? `<a href="${escapeHtml(cell.output)}"><img src="${escapeHtml(cell.output)}" alt="${escapeHtml(`${cell.sceneId} at ${cell.viewportId}`)}" loading="lazy" /></a>`
        : '<div class="failure-placeholder">Capture unavailable</div>';
  return `<td data-cell="${escapeHtml(`${cell.sceneId}/${cell.viewportId}`)}">
    <div class="cell-status">${statusBadge(cell)}<span>${escapeHtml(`${String(cell.timingMs)} ms`)}</span></div>
    ${body}
    ${diagnostics ? `<p class="diagnostic">${escapeHtml(diagnostics)}</p>` : ""}
  </td>`;
}

const REPORT_STYLES = `
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; color: #f5f4f8; background: #111016; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  .meta { margin: 0 0 20px; color: #b8b4c2; font-size: 13px; }
  .table-wrap { overflow: auto; }
  table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 8px; }
  th { position: sticky; top: 0; z-index: 2; padding: 8px; color: #d9d4e2; background: #111016; font-size: 12px; text-align: left; }
  th:first-child { left: 0; z-index: 3; min-width: 180px; }
  tbody th { position: sticky; left: 0; z-index: 1; vertical-align: top; }
  .scene-id { display: block; color: #fff; font-size: 13px; }
  .scene-label { display: block; margin-top: 4px; color: #9d98aa; font-weight: 400; }
  td { width: 280px; min-width: 280px; padding: 8px; vertical-align: top; border: 1px solid #302c39; border-radius: 8px; background: #1b1921; }
  td img { display: block; width: 100%; height: 156px; object-fit: contain; background: #08070a; }
  .cell-status { display: flex; align-items: center; justify-content: space-between; min-height: 22px; margin-bottom: 6px; color: #9d98aa; font-size: 11px; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: .05em; }
  .badge-passed { color: #aef5c5; background: #173b24; }
  .badge-failed { color: #ffb5b5; background: #4a1e23; }
  .diagnostic { margin: 7px 0 0; color: #ffb5b5; font-size: 11px; line-height: 1.35; }
  .failure-placeholder { display: grid; height: 156px; place-items: center; color: #ffb5b5; background: #2b171a; font-size: 12px; }
  .missing { color: #77717f; }
`;

export function renderIndexHtml(manifest) {
  const cells = new Map(
    manifest.cells.map((cell) => [
      `${cell.sceneId}\0${cell.viewportId}`,
      cell,
    ]),
  );
  const header = manifest.viewports
    .map(
      (viewport) =>
        `<th><span class="scene-id">${escapeHtml(viewport.id)}</span><span class="scene-label">${escapeHtml(`${String(viewport.width)}×${String(viewport.height)} @ 1×`)}</span></th>`,
    )
    .join("");
  const rows = manifest.scenes
    .map((scene) => {
      const columns = manifest.viewports
        .map((viewport) =>
          reportCell(cells.get(`${scene.id}\0${viewport.id}`)),
        )
        .join("");
      return `<tr data-scene="${escapeHtml(scene.id)}"><th><span class="scene-id">${escapeHtml(scene.id)}</span><span class="scene-label">${escapeHtml(scene.label)}</span></th>${columns}</tr>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Journey desktop screenshots — ${escapeHtml(manifest.run.id)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <h1>Journey desktop screenshot matrix</h1>
  <p class="meta">${escapeHtml(manifest.run.id)} · seed ${escapeHtml(manifest.run.seed)} · ${String(manifest.run.totalCaptures)} captures · ${String(manifest.run.failures)} failures</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Scene</th>${header}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</body>
</html>`;
}

export function renderContactSheetHtml(manifest, group) {
  const scenes = manifest.scenes.filter((scene) => scene.group === group);
  const subset = { ...manifest, scenes };
  const index = renderIndexHtml(subset);
  return index
    .replaceAll(' loading="lazy"', "")
    .replace(
      "<title>",
      `<title>${escapeHtml(group)} · `,
    )
    .replace(
      "<h1>Journey desktop screenshot matrix</h1>",
      `<h1>Journey desktop screenshots · ${escapeHtml(group)}</h1>`,
    )
    .replace(
      "</style>",
      `
        body { width: max-content; min-width: 100%; padding: 16px; }
        .table-wrap { overflow: visible; }
        th { position: static; }
        tbody th { position: static; }
      </style>`,
    );
}

export function formatCompactResult(result, json = false) {
  if (json) {
    return `${JSON.stringify({
      captures: result.captures,
      failures: result.failures,
      elapsedMs: result.elapsedMs,
      manifest: result.manifest,
      report: result.report,
      contactSheets: result.contactSheets,
    })}\n`;
  }
  return [
    `Captured ${String(result.captures)} cells (${String(result.failures)} failed) in ${(result.elapsedMs / 1000).toFixed(1)}s.`,
    `Manifest: ${result.manifest}`,
    `HTML: ${result.report}`,
    `Contact sheets: ${result.contactSheets.join(", ")}`,
    "",
  ].join("\n");
}
