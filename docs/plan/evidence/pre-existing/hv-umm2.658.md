# hv-umm2.658: pre-existing observations

- Tollgate release was failing before this task; staging `cd436a759bffb5d17e955de0bd2dba80314c4e8b` led release by six commits. Last release run `01a137d8-81ac-7811-993f-05344fe797f5` reported fuzz timeout, and ordinary promotion was paused by release-lag. Existing peer-owned repair work is preserved; this scheduling task is not a release fix.
- Fresh dependency installation reported 17 audit findings (9 moderate, 7 high, 1 critical). No dependency changes are within this scheduling task.
