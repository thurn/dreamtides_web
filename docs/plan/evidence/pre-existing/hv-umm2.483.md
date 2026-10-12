# hv-umm2.483 pre-existing observations

Fresh install reports 17 dependency advisories (9 moderate, 7 high, 1 critical) in install.out. This checker repair keeps dependency metadata unchanged.

The canonical fuzz-only-invariant trigger report exits 1 and is retained as trigger.out, trigger.err and trigger.runtime.json. Its retrospective and disposition are owned by hv-umm2.481, which waits on this repair. This bead keeps shared disposition files unchanged. Full review passes at high host load; its 67.8 s test duration is an observation, not a low-load budget measurement.
