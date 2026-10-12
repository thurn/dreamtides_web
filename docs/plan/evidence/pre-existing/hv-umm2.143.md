# Pre-existing issues found by hv-umm2.143

- `scripts/qa/card-sweep.mjs` with `--port`: after a lease yield the sweep reopens on whichever slot is free but keeps the explicit port, so a slot-1 session after a slot-0 session fails with "port 5174 is in use" while another run serves slot 0 on that port; omitting `--port` lets each slot pick its own port.
- `src/engine/content-catalog.ts` (`cardCosts`): the X minimum is authored per card (`xMinimum`), so a modal card whose X = 0 is meaningful in only one mode, such as Burst of Obliteration (1c8e6736-13d6-42d1-8668-46f422fec11e), also permits a 0● no-effect play of its other mode (RD-hv-umm2.143-1).
- Playwright MCP provider: a card-sweep request timed out and the next call reported "Session not found", which left this run's provider record `artifacts/qa/.browser-qa.slot-1.lock.owner.json` (`providerState: call-and-close-unconfirmed`) retained; later runs pass over slot 1 until it is reconciled.
