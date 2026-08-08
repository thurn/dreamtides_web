import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { CardBrowserPanel } from "../../src/cumulus/components/card/CardBrowserPanel";
import { GameCard } from "../../src/cumulus/components/card/CardView";
import { GlassButton } from "../../src/cumulus/components/controls/GlassButton";
import { TextField } from "../../src/cumulus/components/controls/TextField";
import { GlassPanel } from "../../src/cumulus/components/overlay/GlassPanel";
import { Pressable } from "../../src/cumulus/primitives/Pressable";
import type { CardData } from "../../src/types/cards";
import { createTransport, searchAvailableCards, updateSignatureCards, type EditorOperation, type EditorOperationFactory, type EditorSnapshot } from "./editor";

const transport = createTransport();

function cardView(card: CardData) {
  return { entryId: card.id, model: { cardId: card.id, displaySnapshot: card } };
}

export function App() {
  const [snapshot, setSnapshot] = useState<EditorSnapshot>();
  const [selectedId, setSelectedId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftTheme, setDraftTheme] = useState("");
  const [randomMultiplier, setRandomMultiplier] = useState("");
  const [opponentMultiplier, setOpponentMultiplier] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [browserOpen, setBrowserOpen] = useState(false);
  const [status, setStatus] = useState("Opening repository…");
  const [stale, setStale] = useState(false);
  const queue = useRef(Promise.resolve<void>(undefined));
  const latest = useRef<EditorSnapshot | undefined>(undefined);

  const adopt = (next: EditorSnapshot) => {
    latest.current = next;
    setSnapshot(next);
    setSelectedId((current) => next.affiliations.some((entry) => entry.id === current)
      ? current
      : next.affiliations[0]?.id || "");
    setStatus("All changes saved");
  };

  useEffect(() => { void transport.load().then(adopt).catch((error) => setStatus(String(error))); }, []);
  const selected = snapshot?.affiliations.find((entry) => entry.id === selectedId);
  useEffect(() => {
    if (!selected) return;
    setDraftName(selected.name);
    setDraftTheme(selected.atlas_card_theme);
  }, [selected?.id, selected?.name, selected?.atlas_card_theme]);
  useEffect(() => {
    if (snapshot) setRandomMultiplier(String(snapshot.default_random_draw_max_multiplier));
  }, [snapshot?.default_random_draw_max_multiplier]);
  useEffect(() => {
    if (snapshot) setOpponentMultiplier(String(snapshot.default_opponent_deck_max_multiplier));
  }, [snapshot?.default_opponent_deck_max_multiplier]);

  const save = (operation: EditorOperation | EditorOperationFactory) => {
    if (stale) return;
    setStatus("Saving…");
    queue.current = queue.current.then(async () => {
      try {
        const current = latest.current!;
        const resolved = typeof operation === "function" ? operation(current) : operation;
        const next = await transport.save(resolved, current.sourceRevision);
        adopt(next);
      } catch (error) {
        const message = String(error);
        setStatus(message.includes("STALE_SOURCE") ? "Source changed on disk — reload to continue" : `Save failed: ${message}`);
        if (message.includes("STALE_SOURCE")) setStale(true);
      }
    });
  };

  const chooseRepository = () => {
    void open({ directory: true }).then((path) => {
      if (path) return transport.open(path).then((next) => { setStale(false); adopt(next); });
    }).catch((error) => setStatus(`Open failed: ${String(error)}`));
  };

  const selectedCards = useMemo(() => {
    if (!snapshot || !selected) return [];
    const byId = new Map<string, CardData>(snapshot.cards.map((card) => [card.id, card]));
    return selected.signature_card_ids.flatMap((id) => {
      const card = byId.get(id);
      return card ? [card] : [];
    });
  }, [snapshot, selected]);

  const availableCards = useMemo(() => {
    if (!snapshot || !selected) return [];
    return searchAvailableCards(snapshot.cards, selected.signature_card_ids, search, filter);
  }, [snapshot, selected, search, filter]);

  if (!snapshot || !selected) {
    return <main className="cumulus loading"><GlassPanel title="Tabula" subtitle={status} footer={<GlassButton label="Open repository" variant="accent" onPress={chooseRepository} />}><div /></GlassPanel></main>;
  }

  const updateCards = (update: (ids: string[]) => string[]) => {
    save(updateSignatureCards(selected.id, update));
  };
  const commitMultiplier = (field: string, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) save({ operation: "set_affiliation_catalog_field", field, value: parsed });
    else setStatus("Multipliers must be numbers of at least 1.0");
  };
  const commitText = (field: "name" | "atlas_card_theme", value: string) => {
    if (!value.trim()) {
      if (field === "name") setDraftName(selected.name);
      else setDraftTheme(selected.atlas_card_theme);
      setStatus("Affiliation text fields cannot be blank");
      return;
    }
    save({ operation: "set_affiliation_field", affiliation_id: selected.id, field, value });
  };

  return <main className="cumulus app-shell">
    <header className="topbar">
      <div><h1>Tabula</h1><p>{snapshot.repositoryRoot} · affiliations.ron</p></div>
      <div className="topbar-actions"><span className={stale ? "status stale" : "status"}>{status}</span>
        <GlassButton label="Open repository" size="compact" onPress={chooseRepository} />
        <GlassButton label="Reload" size="compact" onPress={() => void transport.load().then((next) => { setStale(false); adopt(next); }).catch((error) => setStatus(`Reload failed: ${String(error)}`))} />
      </div>
    </header>
    <section className="workspace">
      <GlassPanel eyebrow="Catalog" title="Affiliations" subtitle={`${snapshot.affiliations.length} records`} frame="edgeRail" overflow="hidden">
        <nav className="record-list" aria-label="Affiliations">
          {snapshot.affiliations.map((affiliation) => <Pressable key={affiliation.id} as="button" className="record-row" data-selected={affiliation.id === selected.id} onClick={() => setSelectedId(affiliation.id)}>
            <strong>{affiliation.name}</strong><span>{affiliation.signature_card_ids.length} signature cards</span>
          </Pressable>)}
        </nav>
      </GlassPanel>
      <div className="detail-column">
        <GlassPanel eyebrow="Global balance" title="Catalog settings" subtitle="Shared defaults applied across affiliations">
          <div className="field-grid panel-body">
            <TextField label="Random draw max multiplier" value={randomMultiplier} onChange={setRandomMultiplier} onCommit={(value) => commitMultiplier("default_random_draw_max_multiplier", value)} />
            <TextField label="Opponent deck max multiplier" value={opponentMultiplier} onChange={setOpponentMultiplier} onCommit={(value) => commitMultiplier("default_opponent_deck_max_multiplier", value)} />
          </div>
        </GlassPanel>
        <GlassPanel eyebrow={selected.id} title={selected.name} subtitle="Affiliation identity and Atlas presentation">
          <div className="field-grid panel-body">
            <TextField label="Name" value={draftName} onChange={setDraftName} onCommit={(value) => commitText("name", value)} />
            <TextField label="Atlas card theme" value={draftTheme} onChange={setDraftTheme} onCommit={(value) => commitText("atlas_card_theme", value)} />
          </div>
        </GlassPanel>
        <GlassPanel title="Signature cards" subtitle="Ordered cards that establish this affiliation’s mechanical identity" rightAccessory={{ kind: "glassButton", button: { label: "Add signature card", onPress: () => setBrowserOpen(true), variant: "accent" } }} overflow="visible">
          <div className="signature-grid panel-body">
            {selectedCards.map((card) => <div className="signature-card" key={card.id}>
              <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
              <GlassButton label="Remove" size="compact" variant="danger" disabled={selected.signature_card_ids.length === 1} onPress={() => updateCards((ids) => ids.filter((id) => id !== card.id))} />
            </div>)}
          </div>
        </GlassPanel>
      </div>
    </section>
    {browserOpen && <div className="browser-overlay">
      <CardBrowserPanel title="Add a signature card" subtitle={`Search the card catalog for ${selected.name}`} presentation="fullScreen"
        rightAccessory={{ kind: "glassButton", button: { label: "Done", onPress: () => setBrowserOpen(false) } }}
        toolbar={{ search: { label: "Search name, rules, subtype, or UUID", value: search, onChange: setSearch, placeholder: "Try a card name or UUID…" }, filter: { ariaLabel: "Card type", value: filter, onChange: setFilter, options: [{ value: "all", label: "All cards" }, { value: "Character", label: "Characters" }, { value: "Event", label: "Events" }] } }}
        cards={availableCards.slice(0, 100).map(cardView)} emptyLabel="No matching cards" onCardPress={(id) => { updateCards((ids) => ids.includes(id) ? ids : [...ids, id]); setBrowserOpen(false); setSearch(""); }} />
    </div>}
  </main>;
}
