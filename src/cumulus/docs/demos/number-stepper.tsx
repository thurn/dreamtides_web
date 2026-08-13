import { assertLocalized } from "@trox/runtime";
import { useState } from "react";
import { NumberStepper } from "../../components/controls/NumberStepper";
import type { CumulusComponent } from "../registry";

function Demo({ label = "Energy", value = 3 }: { label?: string; value?: number }) {
  const [current, setCurrent] = useState(value);
  return <NumberStepper label={assertLocalized(label)} value={current} resource="energy" decrementLabel={assertLocalized(`Decrease ${label}`)} incrementLabel={assertLocalized(`Increase ${label}`)} decrementDisabled={current <= 0} onDecrement={() => setCurrent((n) => Math.max(0, n - 1))} onIncrement={() => setCurrent((n) => n + 1)} />;
}

export const numberStepperDemo: CumulusComponent = { id: "number-stepper", title: "NumberStepper", blurb: "A labeled, accessible decrement/value/increment row with optional canonical resource notation.", group: "Components", docName: "NumberStepper", Component: Demo, usage: [{ code: `<NumberStepper label={assertLocalized("Energy")} value={energy} resource="energy" decrementLabel={assertLocalized("Decrease energy")} incrementLabel={assertLocalized("Increase energy")} onDecrement={decrement} onIncrement={increment} />` }], demo: { defaultArgs: { label: "Energy", value: 3 } } };
