import { describe, expect, it } from "vitest";
import {
  parseTutorialInstructionMarkup,
  tutorialInstructionPlainText,
} from "./tutorial-instruction-markup";

describe("tutorial instruction markup", () => {
  it("parses multiple exact yellow spans without highlighting matching plain words", () => {
    const source =
      "Position characters to [yellow]challenge[/yellow], or [yellow]block[/yellow] a challenger.";

    expect(parseTutorialInstructionMarkup(source)).toEqual([
      {
        spans: [
          { text: "Position characters to " },
          { text: "challenge", highlight: "yellow" },
          { text: ", or " },
          { text: "block", highlight: "yellow" },
          { text: " a challenger." },
        ],
      },
    ]);
    expect(tutorialInstructionPlainText(source)).toBe(
      "Position characters to challenge, or block a challenger.",
    );
  });

  it("parses event-frame purple spans using paired purple tags", () => {
    const source =
      "An [purple]event[purple] card has a one-time effect, and then is sent to the void.";

    expect(parseTutorialInstructionMarkup(source)).toEqual([
      {
        spans: [
          { text: "An " },
          { text: "event", highlight: "purple" },
          {
            text: " card has a one-time effect, and then is sent to the void.",
          },
        ],
      },
    ]);
    expect(tutorialInstructionPlainText(source)).toBe(
      "An event card has a one-time effect, and then is sent to the void.",
    );
  });

  it("accepts an explicit purple closing tag", () => {
    expect(
      parseTutorialInstructionMarkup(
        "[purple]Events[/purple] resolve once; [yellow]characters[/yellow] remain.",
      ),
    ).toEqual([
      {
        spans: [
          { text: "Events", highlight: "purple" },
          { text: " resolve once; " },
          { text: "characters", highlight: "yellow" },
          { text: " remain." },
        ],
      },
    ]);
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
    ["[purple]wrong", /unclosed purple highlight/u],
    ["[purple][purple]", /empty purple highlight/u],
    [
      "[yellow]outer [yellow]inner[/yellow][/yellow]",
      /cannot nest yellow highlights inside yellow highlights/u,
    ],
    [
      "[yellow]outer [purple]inner[purple][/yellow]",
      /cannot nest purple highlights inside yellow highlights/u,
    ],
  ])("rejects malformed markup in %s", (source, expected) => {
    expect(() => parseTutorialInstructionMarkup(source)).toThrow(expected);
  });
});
