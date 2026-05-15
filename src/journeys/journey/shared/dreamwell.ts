// Dreamwell card lists.
//
// Templates that consult Dreamwell content treat empty lists as "no eligible
// cards", which flips `viable` to false and removes the option from
// manifests. Dreamwell content lands in a later phase; only this file changes
// when it does — no shape plugin is touched.

export const POSITIVE_DREAMWELL_CARDS: readonly string[] = Object.freeze([]);
export const NEGATIVE_DREAMWELL_CARDS: readonly string[] = Object.freeze([]);
