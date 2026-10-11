# Pre-existing issues found by hv-umm2.68

- `src/engine/policy/prompts.ts` (`ROLE_STRATEGIES.banishCost`): Greedy ranks a cost's cards as losses and so always pays the fewest it may; for a variable void banish it always chooses X at its least value (Fractured Veil 06f8cfff-92ec-4668-afbc-f33a274c3b1a always banishes one card and looks at one), whatever X would buy. An AI-strength observation, not a rules fault.
- Engine debug panel button (`debug=1` only): on mobile it overlaps the Battle Log's close button at the top right.
