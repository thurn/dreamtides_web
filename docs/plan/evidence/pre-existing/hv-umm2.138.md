# hv-umm2.138 pre-existing observations

- The `chooseCost` prompt for an additional cost with alternatives
  (`choiceCost`) labels its options without naming the costs. In
  `src/screens/cumulus_adapters/prompt-host-view-model.ts` the `chooseMode`
  case supplies option text only for the `chooseOne` role, so a `chooseCost`
  option falls back to the generic numbered mode copy in
  `src/runtime/battle-prompt-messages.ts`. The player sees which buttons are
  legal but not which one abandons, discards, or pays ⍟. This affects Abandon
  Constraints (`7ea13d02-9d97-492e-9edb-f326eb3b4d1c`) and, with this bead,
  Desperation (`625fe37e-8059-481c-99fd-109fd02ceedd`) and Pyrokinetic Surge
  (`97b359ee-5a7a-4f54-bd65-e6221a893208`). Observed by reading the code; the
  sweep auto-answers this prompt and does not judge its copy.
