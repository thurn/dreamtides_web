import type { AuguryRng } from "../signals/rng";
import type { AuguryContext } from "../types";
import type { AuguryArchetypeBuilder, AuguryOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectAuguryReward,
} from "./sharedSelection";
import { AUGURY_TUNING } from "../tuning";
import { parseAuguryTargetKey } from "../../types/identifiers";

/**
 * Sites an encounter can place on the current dreamscape.
 *
 * Excludes types that are structural (Battle, Draft, Augury) or that the
 * player already controls via dedicated mechanics. The list covers all the
 * rewarding/utility sites a player would be excited to add.
 */
/** Generated compatibility view of the TOML-authored placeable site list. */
export const AUGURY_PLACEABLE_SITES = AUGURY_TUNING.placeableSites;

/**
 * `add_site` — *Add a site to the current dreamscape.*
 *
 * Samples one site uniformly from `AUGURY_PLACEABLE_SITES` and
 * adds it to the current dreamscape. The offer title names the site type.
 * Always eligible. Face-up (the offer names the site type).
 *
 * The placement delegates to `addSiteToCurrentDreamscape` via
 * `applyAuguryPayloadToState`, which derives a deterministic id from
 * (sourceId, existing site count) so the regenerate-validate-apply pattern
 * remains safe.
 */
export const addSiteBuilder: AuguryArchetypeBuilder = {
  archetypeId: "add_site",
  family: "site",
  eligible(_unused: AuguryContext): boolean {
    // Always eligible — the augury can always place a new site.
    return true;
  },
  build(
    context: AuguryContext,
    _rng: AuguryRng,
  ): AuguryOfferDraft | null {
    const selection = selectAuguryReward({
      context,
      archetypeId: "add_site",
      mechanicId: "add-site",
      policyId: augurySelectionPolicy(context, "add_site"),
      request: {
        constraints: {
          allowedSiteTypes: context.rewardSelection.tuning.placeableSites,
        },
      },
    });
    const siteType = selection?.bindings.siteTypes[0];
    if (selection === null || siteType === undefined) return null;

    return {
      archetypeId: "add_site",
      family: "site",
      gameObjects: [],
      applyPayload: {
        kind: "add_site",
        siteType,
      },
      targetKey: parseAuguryTargetKey(siteType),
      ...selectionMetadata(selection),
    };
  },
};
