import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { SiteState } from "../../types/quest";
import { parseRuntimeConfig } from "../../runtime/runtime-config";
import { tangoScreenFor, tangoSiteScreenFor } from "./registry";

describe("tangoScreenFor", () => {
  it("resolves the migrated questStart screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "questStart" })).not.toBeNull();
  });

  it("resolves the migrated dreamscape screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "dreamscape" })).not.toBeNull();
  });

  it("resolves the migrated atlas screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "atlas" })).not.toBeNull();
  });

  it("returns null for screens not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(tangoScreenFor({ type: "site", siteId: "site-1" })).toBeNull();
    expect(tangoScreenFor({ type: "questComplete" })).toBeNull();
    expect(tangoScreenFor({ type: "questFailed" })).toBeNull();
  });
});

describe("tangoSiteScreenFor", () => {
  it("resolves the migrated Draft site to a Tango node", () => {
    expect(
      tangoSiteScreenFor({ type: "Draft", id: "site-1" } as SiteState),
    ).not.toBeNull();
  });

  it("resolves the migrated Purge site to a Tango node", () => {
    expect(
      tangoSiteScreenFor({ type: "Purge", id: "site-1" } as SiteState),
    ).not.toBeNull();
  });

  it("threads the purge bottom-sheet comparison flag to the Purge adapter", () => {
    const node = tangoSiteScreenFor(
      { type: "Purge", id: "site-1" } as SiteState,
      { runtimeConfig: parseRuntimeConfig("?purgeBottomSheet=1") },
    );
    expect(isValidElement(node)).toBe(true);
    expect((node as ReactElement<{ useBottomSheet?: boolean }>).props.useBottomSheet).toBe(
      true,
    );
  });

  it("accepts router-owned site context needed by future site migrations", () => {
    expect(
      tangoSiteScreenFor(
        { type: "Draft", id: "site-1" } as SiteState,
        {
          runtimeConfig: parseRuntimeConfig("?journey=classic"),
          onJourneyExplanationChange: () => {},
          onViewDeck: () => {},
        },
      ),
    ).not.toBeNull();
  });

  it("returns null for site types not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(tangoSiteScreenFor({ type: "Reward" } as SiteState)).toBeNull();
  });
});
