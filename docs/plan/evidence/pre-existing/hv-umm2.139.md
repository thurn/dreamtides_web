# hv-umm2.139 observations

- Inventory metadata for `8a971ba7-9dfb-45be-bfbb-bf5e4f11974a` predicts `confirm:youMay` from the optional discard cost wording. Actual play-time cost composition uses `confirm:optionalCost` and `chooseCards:discardCost`; no resolving-effect `youMay` prompt applies. The inventory and shared script are read-only for this bead.
- Native sweep ledger rows have no direct actor field. Eligible reports retain `lab.side` and navigation `cell.controller`; ineligible skip rows rely on the exact `--as both` invocation and ordered side-specific sweep output for actor enumeration. Raw receipts and original ledger rows are retained unchanged. No gameplay or validation failure was observed.
