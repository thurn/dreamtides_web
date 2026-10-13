# Pre-existing findings for hv-umm2.647

`src/engine/effects/interpreter.ts` `publicAbilityEffect` compares origin and
effect-tree JSON serializations as strings. Object key insertion order can
change during a valid save/reload without changing their semantic data or
the public state hash, which treats object keys independently of insertion
order. The origin comparison can therefore withhold public effect inference
for semantically equal origins with reordered keys. This attribution serves
public deck-knowledge windows; no effect suppression or unrelated privacy
failure is proven by this observation. This existing interpreter
body is outside647's admitted scope and remains unchanged. The new tracker
uses exact key-order-independent data equality and its public reload
contracts reorder origin and variant objects deliberately.
