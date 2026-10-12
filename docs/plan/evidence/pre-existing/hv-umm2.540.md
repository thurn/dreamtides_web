# hv-umm2.540 pre-existing issue

The determinization-fidelity checker compares projected floating and payable effect records as observable data through `canonicalHash`, preserving captured-member array order and each field value. Source identity comparison follows the existing visibility and remembered-effect rules.

The issue was discovered during hv-umm2.167 weighted fuzzing in seeds `hv-umm2.167-54` and `hv-umm2.167-182`: a delayed trigger carrying both a captured cohort and departed-source spark reconstructed with equal values and ordered arrays but different object-key insertion order. The original checker reported those equivalent records as divergent. Original game JSONL and value-comparison evidence are preserved externally under that bead's checkpoint.

The bounded public regression activates a synthetic cohort-producing character, resolves its delayed trigger creation, and dissolves its source. Both controller cases check fidelity for both viewers. Counterfactual sampled states reverse the captured cohort or change the source spark, and both viewers detect each corruption. The original comparator fails the two valid-cohort cases; the corrected checker passes them.

No other pre-existing issue was encountered.
