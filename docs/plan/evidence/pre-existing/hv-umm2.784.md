# hv-umm2.784 source observations

The admitted fixture-quality issue is the enclosing-mode control in
`src/engine/effects/primitives/contracts/choose-subtype-captures.contracts.ts`
at original source `c4f568698132cabcf7f045f6ef5e1ed3e5056413`, with identical
file bytes at its introduction `c61f8874c53fa15598bdc863d4cbe0c8d6556583`
and this bead's base `7de752dff39df53e4bb441aa55cb94389e8cb77a`. Its first
shared modal draw uses `CHOSEN_SUBTYPE` before any type choice binds it;
the control relies on that unbound placeholder matching no cards. This is
a source-backed test-quality observation, with no production failure claim.

The valid contract at landed source `7de752dff39df53e4bb441aa55cb94389e8cb77a`,
`retains an enclosing zero mode through two nested substitutions for ${side}`,
in `choose-subtype-nesting.contracts.ts` covers both controllers, outer Mage,
mode 0, saved reload, inner Warrior, physical UUIDs, score, full intent replay
and exact published-event replay. D19's near-duplicate pruning applies.

No additional pre-existing issue was encountered within this bounded scope.
