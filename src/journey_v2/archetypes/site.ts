import type { MerchantRng } from "../signals/rng";
import type { MerchantContext } from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectMerchantReward,
} from "./sharedSelection";
import { MERCHANT_TUNING } from "../tuning";
import { parseMerchantTargetKey } from "../../types/identifiers";

/**
 * Site types the merchant can place on the current dreamscape.
 *
 * Excludes types that are structural (Battle, Draft, Augury) or that the
 * player already controls via dedicated mechanics. The list covers all the
 * rewarding/utility sites a player would be excited to add.
 */
/** Generated compatibility view of the TOML-authored placeable site list. */
export const MERCHANT_PLACEABLE_SITE_TYPES = MERCHANT_TUNING.placeableSiteTypes;

/**
 * `add_site` — *Add a site to the current dreamscape.*
 *
 * Samples one site type uniformly from `MERCHANT_PLACEABLE_SITE_TYPES` and
 * adds it to the current dreamscape. The offer title names the site type.
 * Always eligible. Face-up (the offer names the site type).
 *
 * The placement delegates to `addSiteToCurrentDreamscape` via
 * `applyMerchantPayloadToState`, which derives a deterministic id from
 * (sourceId, existing site count) so the regenerate-validate-apply pattern
 * remains safe.
 */
export const addSiteBuilder: MerchantArchetypeBuilder = {
  archetypeId: "add_site",
  family: "site",
  eligible(_unused: MerchantContext): boolean {
    // Always eligible — the merchant can always place a new site.
    return true;
  },
  build(
    context: MerchantContext,
    _rng: MerchantRng,
  ): MerchantOfferDraft | null {
    const selection = selectMerchantReward({
      context,
      archetypeId: "add_site",
      mechanicId: "add-site",
      policyId: augurySelectionPolicy(context, "add_site"),
      request: {
        constraints: {
          allowedSiteTypes: context.rewardSelection.tuning.placeableSiteTypes,
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
      targetKey: parseMerchantTargetKey(siteType),
      ...selectionMetadata(selection),
    };
  },
};
