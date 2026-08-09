import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = resolve(ROOT, "data/locales/gettext/messages.pot");
const check = process.argv.includes("--check");

const sourceFiles = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
  ],
  { cwd: ROOT, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(
    (file) =>
      /\.tsx?$/u.test(file) && !/\.(?:test|spec)\.tsx?$/u.test(file),
  )
  .sort();

const temporaryDirectory = mkdtempSync(join(tmpdir(), "dreamtides-gettext-"));
const extracted = join(temporaryDirectory, "messages.pot");

try {
  try {
    execFileSync(
      "xgettext",
      [
        "--language=TypeScript",
        "--from-code=UTF-8",
        "--keyword=gettext:1",
        "--keyword=pgettext:1c,2",
        "--keyword=ngettext:1,2",
        "--keyword=npgettext:1c,2,3",
        "--add-comments=TRANSLATORS:",
        "--package-name=Dreamtides",
        "--package-version=0.1.0",
        "--msgid-bugs-address=localization@dreamtides.invalid",
        "--copyright-holder=Dreamtides contributors",
        "--sort-by-file",
        "--no-wrap",
        "--omit-header",
        `--output=${extracted}`,
        ...sourceFiles,
      ],
      {
        cwd: ROOT,
        env: { ...process.env, SOURCE_DATE_EPOCH: "0" },
        stdio: "inherit",
      },
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "xgettext is required for source extraction. Install GNU gettext and retry.",
        { cause: error },
      );
    }
    throw error;
  }

  const next = readFileSync(extracted, "utf8");
  const header = `# Dreamtides gettext message template.
# Copyright (C) Dreamtides contributors
# This file is distributed under the same license as Dreamtides.
#
msgid ""
msgstr ""
"Project-Id-Version: Dreamtides 0.1.0\\n"
"Report-Msgid-Bugs-To: localization@dreamtides.invalid\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\\n"

`;
  const catalog = header + next;

  if (check) {
    const current = readFileSync(OUTPUT, "utf8");
    if (current !== catalog) {
      throw new Error(
        `${relative(ROOT, OUTPUT)} is stale; run npm run gettext:extract.`,
      );
    }
  } else {
    writeFileSync(OUTPUT, catalog);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true });
}
