# hv-umm2.100 pre-existing issues

- Pending First Encounter `70306382-ac0d-4b08-843a-23efb3835c94` in original `hv-umm2.193` needs physical current-turn discarded membership for "Materialize all characters in your void which were discarded this turn." This bead supplies actual discard counts only and does not capture discarded physical identities. The exact capability prerequisite is `hv-umm2.691`, filed with a semantic dependency on this bead's certified count API and acceptance joins to original `hv-umm2.193` and gate `hv-umm2.46`. The inventory's shared `turnHistory` label alone is not physical-membership proof. No UUID transfers to this bead.

- `docs/plan/engine-design.md:1612` describes Windcutter as currently pending in its authoring example, while read-only `src/content/cards/windcutter-7be2e6d7.ts:25` and `:26` contain authored abilities and verifiedText. The design example's current-status wording needs its document owner's correction; this bead does not edit it.
