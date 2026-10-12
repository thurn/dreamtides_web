# hv-umm2.459 observations

The parent-completed install reports 17 inherited dependency advisories: 9 moderate, 7 high and 1 critical. Package files and dependency versions are unchanged.

An untimed synthetic fixture produced sampled-view differences in spark while using expiring effects from hidden or ceased sources. That exact failed fixture was malformed: it used an invalid `turnEnd` expiry tag and assigned a seed to `rng.seed` instead of `state.seed`. The raw fixture and stderr are retained as benchmark-fixture-attempt02.ts and calibration-attempt02.stderr.log under artifacts/qa/hv-umm2.459. This diagnostic does not establish a valid engine defect or justify a separate repair investigation. No valid hidden-source expiring-effect reproduction is claimed. The final workload uses the actual `endOfTurn` expiry, a branded battle seed in `state.seed`, and visible avatar sources for expiring controls; permanent effects still exercise hidden and departed sources.

The original hv-umm2.436 full-suite and fuzz timings were measured on varying loaded hosts without an equivalent paired control. They do not establish remembered-card marginal CPU cost. This bead's mixed synthetic paired comparison includes other engine/view work and therefore also does not establish absolute marginal attribution or general AI/game throughput.
