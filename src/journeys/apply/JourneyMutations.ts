// Placeholder for the JourneyMutations contract. Wave 1 Task 2 widens this
// into the full mutation surface; Task 1 introduces the type so that the
// Cost/Reward `apply` signature in `journey/shared/types.ts` has a resolvable
// import while every template ships an empty `apply` stub.
//
// Until Task 2 fills in the real members, an empty type alias keeps the
// import resolving without tripping the `no-empty-object-type` lint rule.
export type JourneyMutations = Record<string, never>;
