# QA lifecycle boundary evidence

Four surrounding boundary findings are pre-existing at assigned base `26b12691f491514bd692809f464d100ff53cb3c4`, verified by the parent against the exact prior review range. They are admitted into this bead, without attributing them to hv-umm2.542.

- A signal diagnostic can reject before abort; interruption reporting can reject before public close. The unchanged-source private actual SIGINT/SIGTERM probe recorded no browser/transport close and held kernel/evidence locks at exit entry. Its reporter subsequently called public close only to settle the private fixture; that fallback is explicitly excluded from acceptance.
- The real MCP wrapper can report only a later SDK close cause when browser closure or receipt callback also rejects. The unchanged-source private SDK-prototype probe records the callback truth and ordering and identifies the surviving actual transport error.
- Startup aggregation can invoke rejecting cause coercion instead of preserving startup and cleanup causes. The existing flow is verified at the assigned base; synthetic public startup/clear tests cover actual cause identity and remaining cleanup.
- Clear-error construction can invoke rejecting coercion instead of preserving phase, cause and unlink outcome. The unchanged-source constructor witness observes that rejection directly; all three phase contracts and real unlink/directory-flush cleanup outcomes are covered.

Scratch witnesses: `negative-wrapper.json`, `negative-wrapper.log`, `negative-signal.json`, and `negative-signal-report.json`. SDK, network and fault setup are private; no actual shared provider failure is induced. Existing exact-byte, receipt/admission, uncertain-response and retained-resource authority contracts stay covered.
