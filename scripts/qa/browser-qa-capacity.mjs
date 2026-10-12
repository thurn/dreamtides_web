// Browser QA capacity (D17): how many scenario runs and card sweeps hold a
// browser slot at once across every worktree, and how many QA ports each
// slot's servers scan. Slot `s` scans `5174 + s * QA_PORTS_PER_SLOT` upward,
// so two slot holders never pick the same port.

export const BROWSER_QA_SLOTS = 2;

export const QA_PORTS_PER_SLOT = 100;
