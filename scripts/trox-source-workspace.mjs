import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runTrox } from "./trox.mjs";

const PROJECT_INPUTS = ["src", "data", "localization", "trox.ron"];
const OPTIONAL_PROJECT_INPUTS = [".generated/localization/sources"];
const BUNDLE_LOCALES = ["en-US", "ar", "es", "ja", "ru"];

export function withExtractedTroxWorkspace(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const stageRoot = mkdtempSync(join(tmpdir(), "quest-trox-source-"));
  const run = options.run ?? runTrox;
  try {
    for (const input of PROJECT_INPUTS) {
      cpSync(join(root, input), join(stageRoot, input), { recursive: true });
    }
    for (const input of OPTIONAL_PROJECT_INPUTS) {
      const source = join(root, input);
      if (existsSync(source)) {
        cpSync(source, join(stageRoot, input), { recursive: true });
      }
    }
    const troxOptions = {
      configPath: join(stageRoot, "trox.ron"),
      cwd: stageRoot,
    };
    run(["extract"], troxOptions);
    run(["check", "--deny", "warnings"], troxOptions);
    return options.afterExtract?.({ run, stageRoot, troxOptions });
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}

export function checkTroxSource(options = {}) {
  withExtractedTroxWorkspace(options);
  console.log("Trox source is valid after isolated extraction.");
}

export function buildDevelopmentTroxBundles(options = {}) {
  return withExtractedTroxWorkspace({
    ...options,
    afterExtract: ({ run, stageRoot, troxOptions }) => {
      run(["bundle", "--allow-missing"], troxOptions);
      return Object.fromEntries(BUNDLE_LOCALES.map((locale) => [
        locale,
        readFileSync(
          join(stageRoot, ".generated", "localization", "bundles", `${locale}.trox.json`),
          "utf8",
        ),
      ]));
    },
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  try {
    checkTroxSource();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
