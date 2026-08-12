import { useState } from "react";
import { TextArea } from "../../components/controls/TextArea";
import type { CumulusComponent } from "../registry";

function Demo({ label = "Dialogue", placeholder = "Write a line…" }: { label?: string; placeholder?: string }) {
  const [value, setValue] = useState("Welcome, Dreamer.");
  return <TextArea authoredLabel={label} value={value} authoredPlaceholder={placeholder} onChange={setValue} />;
}

export const textAreaDemo: CumulusComponent = {
  id: "text-area",
  title: "Text Area",
  blurb: "The reusable multiline authoring field on Cumulus control chrome, with explicit draft and commit callbacks.",
  group: "Components",
  docName: "TextArea",
  Component: Demo,
  usage: [
    {
      code: `<TextArea label="Dialogue" value={text} onChange={setText} onCommit={saveText} />`,
    },
  ],
  demo: { defaultArgs: { label: "Dialogue", placeholder: "Write a line…" } },
};
