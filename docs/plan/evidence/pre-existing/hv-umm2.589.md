# hv-umm2.589 — pre-existing inventory staleness

The base `ea99c699cc152574cc4923fe306dd88f97e7aa05` catalogs mark four cards authored while the generated inventory marks them pending. The sanctioned inventory generator refreshes only their status in entity and bead projections and the corresponding summary totals:

| UUID | Generated status | Catalog status |
| --- | --- | --- |
| `21965e95-0c8c-470c-a1e1-06d7b87a8d00` | pending | authored |
| `6da831c8-6fda-4078-9f2b-873db2416aad` | pending | authored |
| `c32ef131-d283-4bf1-bf65-2d5e5d232168` | pending | authored |
| `7e2f2ac0-4e3c-4520-80c6-c830581b40de` | pending | authored |

Native inventory refinement at 2026-10-14T21:24:57.616267Z admits these mechanical refreshes. Their source modules and every other entity field remain byte-equivalent to the base. The semantic audit checks all 1,209 entities: 1,204 unrelated records are equal, four change only status, and the one Berries record changes only its authorized authored status, capability tags, primitive/prompt projections and decision references. Its routing is `5.5 / dreamsigns-battle-10`.

## Updated integration base

The updated base `07f842d01d1e43aeb0e57bac5c29671e7b81b2a1` contains landed catalog and rules-decision inputs whose generated projections require a mechanical refresh. Native integration refinement at 2026-10-14T22:41:05Z admits exactly these 17 status-only rows and the existing rules-decision projection below. Every other unrelated entity field and the full UUID set remain equal to the updated inventory input.

| UUID | Updated-base projection | Current catalog |
| --- | --- | --- |
| `29d25251-8b42-4d3d-97e6-6c3abaabd9a2` | pending | authored |
| `374ec185-b0f7-40e6-9988-09e96abccebe` | pending | authored |
| `54471b31-4449-453d-9a6e-814d6225520a` | pending | authored |
| `691883df-63d8-4664-a1fe-d5f3b5becd11` | pending | authored |
| `764b62f6-6af9-40ad-8d1f-653cc1a11030` | pending | authored |
| `78673e2b-a6d1-43de-8850-3d3327de5cc6` | pending | authored |
| `874d5e8f-4e12-4426-a2e7-1ab761d2ca12` | pending | authored |
| `87f075b1-b058-4570-a75f-c4f8f544e192` | pending | authored |
| `8855e20c-e23f-4499-a5e8-a7a46ff81d2b` | pending | authored |
| `ccbefadc-aab8-4f8c-a705-07bd70c91731` | pending | authored |
| `d89f4c33-ffd3-4313-8106-0a9f7013cad8` | pending | authored |
| `d95533f4-7809-44a8-a882-7675c61cee1c` | pending | authored |
| `fed69d6e-acb5-40fb-b416-e6ef6c0e63fb` | pending | authored |
| `3ebaba62-9000-429d-b203-2a5a9724389a` | pending | authored |
| `9e19b3d1-12f2-43c1-9cb1-08de7cd32e32` | pending | authored |
| `f6208407-c4e9-42ac-b533-346704f5e39e` | pending | authored |
| `fe2510d9-bfee-4c35-97f9-30e0cd2e2851` | pending | authored |

The existing UUID `fd5b3e85-ad7b-4d87-b4db-cd6ba0e6d277` gains only its generated `rulesDecisions` reference to `RD-hv-umm2.696-1`. Berries retains its same six authorized authored/capability projection fields and its battle routing. The original four status-only refreshes documented above are already incorporated in this base.
