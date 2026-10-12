# hv-umm2.503 pre-existing evidence

The existing resource-cleanup test checked that a numeric file descriptor was invalid after asynchronous cleanup. Shared test threads may reuse that descriptor. The failed check did not capture the later dev/inode, so reuse is an inference and no runtime defect is established. This bead verifies release of the original log dev/inode, accepts only EBADF or a different identity, propagates other OS errors, and records actual before/after observations.
