import { resolve } from "node:path";
import type { Options } from "@wdio/types";

const binary = resolve("src-tauri/target/debug/tabula");

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./e2e/specs/**/*.e2e.ts"],
  maxInstances: 1,
  services: [["tauri", {
    appBinaryPath: binary,
    driverProvider: "embedded",
    embeddedPort: 4465,
    captureBackendLogs: true,
    captureFrontendLogs: true,
    logDir: resolve("e2e/artifacts/logs"),
  }]],
  capabilities: [{
    browserName: "tauri",
    "tauri:options": { application: binary },
  }],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "silent",
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  mochaOpts: { ui: "bdd", timeout: 120_000 },
};
