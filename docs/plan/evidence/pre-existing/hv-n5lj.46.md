# hv-n5lj.46 pre-existing issues

Seen at staging `7dca63703`.

- **`review:full` is described as what the gate runs.** `AGENTS.md`
  (Verification) calls `npm run review:full` "what the gate runs", and the
  README's command table calls it "Everything the Tollgate gate runs". In
  staged mode the gate stage runs `npm run review:gate` and the release stage
  runs `npm run review:full` (`docs/plan/workflow.md` § Staged mode).
