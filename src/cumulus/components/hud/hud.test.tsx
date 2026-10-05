// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  GLOSSARY,
  GLOSSARY_IDS,
  requireGlossaryEntry,
  type GlossaryEntry,
} from "../../../data/glossary";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import type { ResonanceData } from "../../../types/resonance-data";
import { semanticEntityId } from "../../../types/semantic-identity";
import {
  testAvatarId,
  testContentHash,
  testDreamsignId,
  testTideId,
} from "../../../types/test-identities";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { renderInCumulus } from "../../testing/render";
import { AvatarPortrait, type AvatarVisual } from "./AvatarPortrait";
import { AvatarStage } from "./AvatarStage";
import { Dreamsign, type LocalizedDreamsign } from "./Dreamsign";
import { EssenceValue } from "./EssenceValue";
import { TideDisc } from "./TideDisc";
import { TidesInfoLabel } from "./TidesInfoLabel";
import {
  tideAccessibilityName,
  tideResonanceLabel,
  tideVisual,
} from "./tide-spec";

const TIDES = requireGlossaryEntry(GLOSSARY_IDS.tides);

const AVATAR: AvatarVisual = {
  imageNumber: "0042",
  name: "Astra",
  title: "Title",
};

/** The accessible reveal description a reveal source points at. */
function describedBy(source: Element | null | undefined): string {
  return (
    document.getElementById(source?.getAttribute("aria-describedby") ?? "")
      ?.textContent ?? ""
  );
}

describe("Dreamsign", () => {
  /**
   * Derived live from GLOSSARY so the test never hardcodes glossary copy: the
   * first entry whose bare term is detected inside a plausible effect sentence.
   */
  function pickGlossaryFixture(): { entry: GlossaryEntry; effect: string } {
    for (const entry of GLOSSARY) {
      const effect = `A dreamsign that lets you ${entry.term} things.`;
      if (extractGlossaryTerms(effect).includes(entry)) {
        return { entry, effect };
      }
    }
    throw new Error("No glossary entry yielded a usable definition fixture");
  }

  function makeDreamsign(
    overrides: Partial<{ imageName: string; imageAlt: string; effect: string }>,
  ): LocalizedDreamsign {
    return localizedDreamsignFixture({
      name: "Sign",
      effectDescription: overrides.effect ?? "Sign effect.",
      imageName: overrides.imageName,
      imageAlt: overrides.imageAlt,
      id: testDreamsignId("00000000-0000-4000-8000-000000000031"),
    });
  }

  function tile(): HTMLElement {
    return document.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    )!;
  }

  it("owns its UUID reveal model, glossary definitions, and focus reveal", () => {
    const { entry, effect } = pickGlossaryFixture();
    const sign = makeDreamsign({ effect, imageName: "sign.png" });
    renderInCumulus(<Dreamsign dreamsign={sign} />);
    const source = tile();
    expect(source.dataset.dreamsignId).toBe(sign.id);
    expect(source.dataset.revealEntityType).toBe("dreamsign");
    expect(source.dataset.revealEntityId).toBe(sign.id);
    expect(source.dataset.revealPrimaryVariant).toBe("object");
    expect(source.tabIndex).toBe(0);
    expect(describedBy(source)).toContain(effect);
    expect(describedBy(source)).toContain(entry.definition);

    act(() => {
      source.focus();
    });
    expect(source.dataset.revealActive).toBe("true");
  });

  it("renders authored artwork and falls back to a glyph without an image", () => {
    const { unmount } = renderInCumulus(
      <Dreamsign
        dreamsign={makeDreamsign({ imageName: "horn.png", imageAlt: "Alt" })}
      />,
    );
    const img = tile().querySelector("img");
    expect(img?.getAttribute("src")).toBe("/dreamsigns/horn.png");
    expect(img?.getAttribute("alt")).toBe("Alt");
    unmount();

    renderInCumulus(<Dreamsign dreamsign={makeDreamsign({})} />);
    expect(tile().querySelector("img")).toBeNull();
    expect(tile().textContent).not.toBe("");
  });

  it("requires a stable dreamsign id for render data attributes", () => {
    const { id: _id, ...sign } = makeDreamsign({});
    expect(() => {
      renderInCumulus(<Dreamsign dreamsign={sign as LocalizedDreamsign} />);
    }).toThrow(/missing a stable id/);
  });
});

describe("AvatarPortrait", () => {
  it("registers a profile reveal only when semantic profile data is supplied", () => {
    const id = testAvatarId("00000000-0000-4000-8000-000000000061");
    const { container } = renderInCumulus(
      <>
        <AvatarPortrait
          avatar={AVATAR}
          variant="panel"
          profile={{ id, ability: "Ability." }}
        />
        <AvatarPortrait avatar={AVATAR} variant="panel" />
      </>,
    );
    const sources = container.querySelectorAll<HTMLElement>(
      "[data-reveal-entity-type]",
    );
    expect(sources).toHaveLength(1);
    const source = sources[0];
    expect(source.hasAttribute("data-avatar-source")).toBe(true);
    expect(source.dataset.revealEntityType).toBe("avatar");
    expect(source.dataset.revealEntityId).toBe(id);
    expect(source.dataset.revealPrimaryVariant).toBe("fullBleed");
    expect(source.tabIndex).toBe(0);
    expect(describedBy(source)).toContain("Ability.");
  });

  it("thumb centers the authored head coordinate in its bust crop", () => {
    const { container } = renderInCumulus(
      <AvatarPortrait
        avatar={{ ...AVATAR, portraitFocus: { x: 0.58, y: 0.23 } }}
        variant="thumb"
      />,
    );
    const img = container.querySelector("img");
    expect(Number.parseFloat(img?.style.left ?? "")).toBeCloseTo(-23.2, 8);
  });
});

describe("AvatarStage", () => {
  it("renders cutout art for every variant and falls back when the art fails", () => {
    const variants = ["standing", "cutout", "fullBleed"] as const;
    const { container } = renderInCumulus(
      <>
        {variants.map((variant) => (
          <AvatarStage key={variant} avatar={AVATAR} variant={variant} />
        ))}
      </>,
    );
    for (const variant of variants) {
      const img = container.querySelector(
        `[data-avatar-stage-art="${variant}"]`,
      );
      expect(img?.getAttribute("src") ?? "").toContain("0042");
      expect(img?.getAttribute("alt")).not.toBe("");
    }

    const standing = container.querySelector(
      '[data-avatar-stage-art="standing"]',
    );
    act(() => {
      standing?.dispatchEvent(new Event("error"));
    });
    expect(
      container.querySelector('[data-avatar-stage-art="standing"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-avatar-stage-fallback="standing"]'),
    ).not.toBeNull();
  });

  it("fullBleed centers the authored head coordinate instead of the canvas", () => {
    const { container } = renderInCumulus(
      <AvatarStage
        avatar={{ ...AVATAR, portraitFocus: { x: 0.58, y: 0.23 } }}
        variant="fullBleed"
      />,
    );
    const img = container.querySelector<HTMLImageElement>("img");
    expect(img?.style.left).toBe("50%");
    expect(img?.style.transform).toBe("translate(-58%, -23%)");
  });
});

describe("HUD reveal sources", () => {
  it("EssenceValue derives an icon reveal from Essence domain data", () => {
    const { container } = renderInCumulus(
      <EssenceValue
        amount={120}
        entity={{
          id: semanticEntityId("test:essence-source", "caller"),
          glossaryId: GLOSSARY_IDS.startingEssence,
        }}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-essence-source]",
    );
    expect(source?.dataset.revealEntityType).toBe("resource-essence");
    expect(source?.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source?.dataset.revealPrimaryVariant).toBe("icon");
  });

  it("TidesInfoLabel owns the canonical Tides reveal", () => {
    const { container } = renderInCumulus(<TidesInfoLabel />);
    const source = container.querySelector<HTMLElement>(
      "[data-tides-info-label]",
    )!;
    expect(source.getAttribute("aria-label")).toBeTruthy();
    expect(source.tabIndex).toBe(0);
    expect(source.dataset.revealPrimaryVariant).toBe("text");
    expect(describedBy(source)).toContain(TIDES.definition);
    act(() => {
      source.focus();
    });
    expect(source.dataset.revealActive).toBe("true");
  });

  it("TideDisc derives its tide primary and Tides definition secondary", () => {
    const { container } = renderInCumulus(
      <TideDisc
        tide="valor"
        id={testTideId("tide-valor")}
        label="Tide label"
        description="Tide description."
      />,
    );
    const source = container.querySelector<HTMLElement>("[data-tide-disc]")!;
    expect(source.dataset.revealEntityType).toBe("tide");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("tide");
    expect(source.dataset.revealSecondaryTitles).toBe(TIDES.term);
    expect(source.tabIndex).toBe(0);
    expect(describedBy(source)).toContain("Tide description.");
    expect(describedBy(source)).toContain(TIDES.definition);
  });
});

describe("tide-spec", () => {
  it("projects names, accessibility, glyphs, and colors from injected data", () => {
    const data = {
      schemaVersion: 1,
      contentHash: testContentHash("a"),
      resonances: [
        {
          id: "ember",
          displayName: "Synthetic Name",
          glyph: "tideEmber",
          accentColor: "#123456",
          chipBackground: "#111111",
          chipBorder: "rgba(1, 2, 3, 0.5)",
          accessibilityName: "Synthetic accessibility name",
        },
      ],
    } satisfies ResonanceData;
    const [ember] = data.resonances;
    expect(tideResonanceLabel("ember", data)).toBe(ember.displayName);
    expect(tideAccessibilityName("ember", data)).toBe(ember.accessibilityName);
    expect(tideVisual("ember", data).fg).toBe(ember.accentColor);
  });
});
