import { describe, expect, it } from "vitest";
import {
  parseTutorialInstructionMarkup,
  tutorialInstructionPlainText,
} from "./tutorial-instruction-markup";

describe("tutorial instruction markup", () => {
  it("parses multiple exact yellow spans without highlighting matching plain words", () => {
    const source =
      "Position characters to [yellow]challenge[/yellow], or [yellow]accept[/yellow] a challenge.";

    expect(parseTutorialInstructionMarkup(source)).toEqual([
      {
        spans: [
          { text: "Position characters to " },
          { text: "challenge", highlight: "yellow" },
          { text: ", or " },
          { text: "accept", highlight: "yellow" },
          { text: " a challenge." },
        ],
      },
    ]);
    expect(tutorialInstructionPlainText(source)).toBe(
      "Position characters to challenge, or accept a challenge.",
    );
  });

  it("preserves blank-line paragraph boundaries", () => {
    expect(
      parseTutorialInstructionMarkup(
        "First [yellow]instruction[/yellow].\n\nSecond instruction.",
      ),
    ).toEqual([
      {
        spans: [
          { text: "First " },
          { text: "instruction", highlight: "yellow" },
          { text: "." },
        ],
      },
      { spans: [{ text: "Second instruction." }] },
    ]);
  });

  it.each([
    ["[red]wrong[/red]", /unsupported highlight tag/u],
    ["[/yellow]wrong", /without an opening tag/u],
    ["[yellow]wrong", /unclosed yellow highlight/u],
    ["[yellow][/yellow]", /empty yellow highlight/u],
    [
      "[yellow]outer [yellow]inner[/yellow][/yellow]",
      /cannot nest yellow highlights/u,
    ],
  ])("rejects malformed markup in %s", (source, expected) => {
    expect(() => parseTutorialInstructionMarkup(source)).toThrow(expected);
  });
});
