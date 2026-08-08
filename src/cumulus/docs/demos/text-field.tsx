import { useState } from "react";
import { TextField } from "../../components/controls/TextField";
import type { CumulusComponent } from "../registry";

function Demo({ label = "Search cards", placeholder = "Type a name…" }: { label?: string; placeholder?: string }) { const [value, setValue] = useState(""); return <TextField label={label} kind="search" value={value} placeholder={placeholder} onChange={setValue} onCommit={setValue} />; }
export const textFieldDemo: CumulusComponent = { id: "text-field", title: "TextField", blurb: "The reusable labeled text and search input on Cumulus control chrome, with supporting and validation messaging.", group: "Components", docName: "TextField", Component: Demo, usage: [{ code: `<TextField label="Search cards" kind="search" value={query} onChange={setQuery} />` }], demo: { defaultArgs: { label: "Search cards", placeholder: "Type a name…" } } };
