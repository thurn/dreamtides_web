# Pre-existing issues found by hv-umm2.53

- `src/screens/cumulus_adapters/engine-battle-view-model.ts` (`engineStatuses`): status badges come only from floating changes in `view.floating`, so a keyword a static ability grants (Offering on hand cards from Nomad of Endless Paths `6cf545ba-b014-4333-a0da-573e8f97d734`, Reclaim on void cards, Vengeful from a banner) has no indicator; the granted Offering route shows only once a card is tapped. Recorded as the judged `fail` in `docs/plan/evidence/qa-ledger/hv-umm2.53.jsonl`.
- Same view model: a character in play with the Offering status (banished during Ending) shows no indicator of that pending banish.
- Card-lab battle at 1440×900: after a hand card is tapped, `main.cumulus` is scrolled by about 21px (`scrollHeight` 924 over `clientHeight` 900), clipping the top-left controls and leaving a dark strip under the board (captures `nomad-desktop-route-prompt.png`, `nomad-desktop-offering-played.png`).
