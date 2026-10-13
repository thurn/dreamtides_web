# hv-umm2.471: Existing QA layout observations

The inherited mobile battle renderer with `debug=1` places its debug opener over part of the prompt's Cancel control. The fanned hand can overlap the lower HUD and part of card copy. These observations appear in `invocations/run-u47cDj/restricted-target-mobile.png` and `invocations/run-u47cDj/discard-payment-mobile.png`. Parent and implementer inspected the retained captures; the changed decision, payer selection and target controls have usable, uncovered geometry and all eight workflows complete.

This bead changes engine target eligibility and adds synthetic lab fixtures. Renderer, HUD, debug controls, card layout and UI components stay read-only. These are inherited contextual observations, not introduced defects or a cold visual-review verdict. No entity or shared UI scope is added here.
