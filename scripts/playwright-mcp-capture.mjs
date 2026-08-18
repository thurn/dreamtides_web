#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";
import { connectPlaywrightMcp, parseMcpResult } from "./screenshot-runtime.mjs";

function fail(message) {
  process.stderr.write(`playwright-mcp-capture: ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    jobs: { type: "string" },
    json: { type: "boolean" },
  },
  strict: true,
});

if (!values.jobs) fail("--jobs <json-file> is required");
const jobsPath = resolvePath(values.jobs);
const jobs = JSON.parse(readFileSync(jobsPath, "utf8"));
if (!Array.isArray(jobs) || jobs.length === 0) {
  fail("jobs file must contain a non-empty JSON array");
}

for (const [index, job] of jobs.entries()) {
  if (
    typeof job.url !== "string" ||
    !Number.isInteger(job.width) ||
    !Number.isInteger(job.height) ||
    typeof job.output !== "string"
  ) {
    fail(`job ${String(index + 1)} has invalid url, dimensions, or output`);
  }
}

const outputs = jobs.map((job) => resolvePath(job.output));
const browser = await connectPlaywrightMcp({
  name: `scripted-capture-${String(process.pid)}`,
  roots: [process.cwd(), ...new Set(outputs.map((output) => dirname(output)))],
});

const results = [];
try {
  for (const [index, job] of jobs.entries()) {
    const output = outputs[index];
    await browser.call("browser_resize", {
      width: job.width,
      height: job.height,
    });
    await browser.call("browser_navigate", { url: job.url });
    const result = parseMcpResult(
      await browser.call("browser_run_code_unsafe", {
        code: `async (page) => {
          ${job.waitSelector ? `await page.locator(${JSON.stringify(job.waitSelector)}).waitFor({ state: "visible", timeout: ${JSON.stringify(job.timeoutMs ?? 30000)} });` : ""}
          const actual = await page.evaluate(() => ({
            url: location.href,
            width: innerWidth,
            height: innerHeight,
            devicePixelRatio
          }));
          const target = ${job.selector ? `page.locator(${JSON.stringify(job.selector)})` : "page"};
          await target.screenshot({
            path: ${JSON.stringify(output)},
            scale: "css",
            ${job.fullPage && !job.selector ? "fullPage: true," : ""}
          });
          return actual;
        }`,
      }),
    );
    if (statSync(output).size === 0) fail(`empty screenshot: ${output}`);
    results.push({ ...result, output });
  }
} finally {
  await browser.close();
}

if (values.json) process.stdout.write(`${JSON.stringify({ results })}\n`);
else {
  for (const result of results) {
    process.stdout.write(
      `${result.width}×${result.height} ${result.url} -> ${result.output}\n`,
    );
  }
}
