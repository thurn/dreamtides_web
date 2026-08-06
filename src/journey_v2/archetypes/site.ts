import type { MerchantRng } from "../signals/rng";
import type { SiteType } from "../../types/journey";
import type { MerchantContext } from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";
import { selectionMetadata, selectMerchantReward } from "./sharedSelection";

/**
 * Site types the merchant can place on the current dreamscape.
 *
 * Excludes types that are structural (Battle, Draft, Augury) or that the
 * player already controls via dedicated mechanics. The list covers all the
 * rewarding/utility sites a player would be excited to add.
 */
export const MERCHANT_PLACEABLE_SITE_TYPES: readonly SiteType[] = [
  "Shop",
  "Purge",
  "Transfiguration",
  "Duplication",
] as const;

/**
 * Human-readable labels for site types, used in the offer title.
 */
const SITE_TYPE_LABELS: Record<string, string> = {
  Shop: "Shop",
  Purge: "Purge Site",
  Transfiguration: "Transfiguration Site",
  Duplication: "Duplication Site",
};

function siteTypeLabel(siteType: SiteType): string {
  return SITE_TYPE_LABELS[siteType] ?? siteType;
}

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
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const selection = selectMerchantReward({
      context,
      archetypeId: "add_site",
      mechanicId: "add-site",
      policyId: "site-uniform",
      request: {
        constraints: { allowedSiteTypes: MERCHANT_PLACEABLE_SITE_TYPES },
      },
    });
    const siteType = selection?.bindings.siteTypes[0];
    if (selection === null || siteType === undefined) return null;

    const label = siteTypeLabel(siteType);

    return {
      archetypeId: "add_site",
      family: "site",
      title: `Add a ${label} to this dreamscape`,
      summary: `A ${label} will appear on the current dreamscape map.`,
      gameObjects: [],
      applyPayload: {
        kind: "add_site",
        siteType,
      },
      targetKey: siteType,
      ...selectionMetadata(selection),
    };
  },
};
