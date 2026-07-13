import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  isGovernedFile,
  toRepoRelativePosix,
} from "./no-purple-text-on-glass.js";

describe("isGovernedFile (no-purple-text-on-glass)", () => {
  it("governs Cumulus glass components", () => {
    expect(isGovernedFile("src/cumulus/components/overlay/SpeechBubble.tsx")).toBe(
      true,
    );
  });

  it("exempts docs and test files", () => {
    expect(isGovernedFile("src/cumulus/docs/CumulusApp.tsx")).toBe(false);
    expect(
      isGovernedFile("src/cumulus/components/overlay/InfoCard.test.tsx"),
    ).toBe(false);
  });
});

describe("toRepoRelativePosix (no-purple-text-on-glass)", () => {
  it("returns a repo-relative POSIX path", () => {
    expect(
      toRepoRelativePosix(
        "/repo/src/cumulus/components/overlay/SpeechBubble.tsx",
        "/repo",
      ),
    ).toBe("src/cumulus/components/overlay/SpeechBubble.tsx");
  });
});

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const SPEECH_BUBBLE = "src/cumulus/components/overlay/SpeechBubble.tsx";

ruleTester.run("no-purple-text-on-glass", rule, {
  valid: [
    {
      name: "glass text uses the on-glass token",
      filename: SPEECH_BUBBLE,
      code: `
        import { glassSurfaceStyle } from "../../internal/glass-surface";
        const style = { ...glassSurfaceStyle(), color: token("--text-on-glass") };
      `,
    },
    {
      name: "accent text is legal in a non-glass file",
      filename: "src/cumulus/screens/QuestStartScreen.tsx",
      code: 'const style = { color: token("--accent-bright") };',
    },
    {
      name: "docs are exempt",
      filename: "src/cumulus/docs/CumulusApp.tsx",
      code: `
        import { glassSurfaceStyle } from "../internal/glass-surface";
        const style = { color: token("--accent-bright") };
      `,
    },
  ],
  invalid: [
    {
      name: "accent text in a blurred-glass file",
      filename: SPEECH_BUBBLE,
      code: `
        import { glassSurfaceStyle } from "../../internal/glass-surface";
        const style = { ...glassSurfaceStyle(), color: token("--accent-bright") };
      `,
      errors: [{ messageId: "purpleTextOnGlass" }],
    },
    {
      name: "essence text in a glass control file",
      filename: "src/cumulus/components/controls/GlassButton.tsx",
      code: `
        import { glassTrack } from "../../internal/control-treatment";
        const style = { ...glassTrack(), color: token("--essence") };
      `,
      errors: [{ messageId: "purpleTextOnGlass" }],
    },
  ],
});
