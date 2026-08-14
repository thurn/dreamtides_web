import { useState } from "react";
import {
  EditableInfoCard,
  type EditableInfoCardField,
} from "../../components/overlay/InfoCard";
import type { CumulusComponent } from "../registry";

function Demo({
  initialTitle = "Reclaim",
  initialBody = "Return a card from your void.",
  bodyFormat = "rules",
}: {
  readonly initialTitle?: string;
  readonly initialBody?: string;
  readonly bodyFormat?: "plain" | "rules";
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [titleDraft, setTitleDraft] = useState(initialTitle);
  const [bodyDraft, setBodyDraft] = useState(initialBody);
  const [editing, setEditing] = useState<"title" | "description" | null>(null);

  const field = (
    name: "title" | "description",
    value: string,
    draftValue: string,
    setDraft: (next: string) => void,
    commit: (next: string) => void,
  ): EditableInfoCardField => ({
    value,
    draftValue,
    isEditing: editing === name,
    onBeginEdit: () => {
      setDraft(value);
      setEditing(name);
    },
    onDraftChange: setDraft,
    onCancel: () => {
      setDraft(value);
      setEditing(null);
    },
    onSubmit: (next) => {
      if (next.trim() === "") return;
      commit(next.trim());
      setEditing(null);
    },
    onBlur: (next) => {
      if (next.trim() !== "") commit(next.trim());
      else setDraft(value);
      setEditing(null);
    },
  });

  return (
    <EditableInfoCard
      title={field("title", title, titleDraft, setTitleDraft, setTitle)}
      body={field("description", body, bodyDraft, setBodyDraft, setBody)}
      bodyFormat={bodyFormat}
    />
  );
}

export const editableInfoCardDemo: CumulusComponent = {
  id: "editable-info-card",
  title: "Editable Info Card",
  blurb:
    "The constrained authoring form of InfoCard. It owns its text inputs, editing states, typography, and shell; callers provide controlled strings and lifecycle callbacks.",
  callout:
    "Use only on authoring surfaces because player-facing reveals use InfoCard, and EditableInfoCard accepts no children, render callbacks, className, or style props.",
  group: "Surfaces & Overlays",
  docName: "EditableInfoCard",
  Component: Demo,
  usage: [
    {
      code: `<EditableInfoCard
  title={titleField}
  body={descriptionField}
  bodyFormat="rules"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      initialTitle: "Reclaim",
      initialBody: "Return a card from your void.",
      bodyFormat: "rules",
    },
  },
};
