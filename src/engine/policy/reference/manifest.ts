/**
 * The frozen reference policies (D25) and what freezes them: the SHA-256 of
 * every policy-owned source module and of the canonical JSON of each
 * policy's `AI.references` data. The engine, the content catalog, prompt
 * legality and determinization are shared with the live policies, so a
 * reference reproduces its decisions only while those shared sources keep
 * their behavior; `frozenAt` names the staging commit they were frozen on.
 */
import type { PolicyId } from "../types";

export interface ReferenceManifestEntry {
  /** Repository-relative module path → SHA-256 of its bytes. */
  readonly modules: Readonly<Record<string, string>>;
  /** The `AI.references` entries the modules read, by key. */
  readonly data: readonly string[];
  /** SHA-256 of the canonical JSON of those entries, keys sorted. */
  readonly dataSha256: string;
  /** The staging commit whose shared engine sources the reference was frozen on. */
  readonly frozenAt: string;
}

export const REFERENCE_MANIFEST: Readonly<Partial<Record<PolicyId, ReferenceManifestEntry>>> = {
  "greedy@5": {
    modules: {
      "src/engine/policy/reference/greedy-5.ts": "2e39b9da20bdf669dfb8548f083d7ffe1e8e57e64075f20d94ee8145363dba81",
      "src/engine/policy/reference/prompts.ts": "904605113fd34497df96d8eb20c7e632eee7c63a53f75965fbe2f19d547e0fdb",
    },
    data: ["greedy@5", "prompts@7.2"],
    dataSha256: "8f9dd174a4784cdefce575b514d26a0a6cf6e331b0843e5dc684d4105bd990a8",
    frozenAt: "7da89a0c03d32ed3e28592d810aa4973e7aa2ea1",
  },
  "greedy@7.2": {
    modules: {
      "src/engine/policy/reference/greedy-7-2.ts": "6bec933fbb5c2c88d562a50fbc12187179b5ed7da132b40118239742d25a9b7d",
      "src/engine/policy/reference/evaluation-7-2.ts": "d0587206a5ccd6721310cf1fcfa613f858bb68ae4621de3b61ab4389401f0429",
      "src/engine/policy/reference/prompts.ts": "904605113fd34497df96d8eb20c7e632eee7c63a53f75965fbe2f19d547e0fdb",
    },
    data: ["greedy@7.2", "prompts@7.2"],
    dataSha256: "037d5aefa1ccfc0b9128a9aa5c2a8918c1a697257037b31269e8683ff407903d",
    frozenAt: "7da89a0c03d32ed3e28592d810aa4973e7aa2ea1",
  },
};
