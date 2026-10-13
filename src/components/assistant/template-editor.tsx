"use client";

import { useRef, useState } from "react";
import { Btn } from "@/components/ui/btn";
import { BUILTIN_PROMPT_TEMPLATES, MAX_TEMPLATE_LENGTH, type PromptTemplate, type TemplateAction } from "@/lib/prompt-templates";
import { PromptPanel } from "./prompt-panel";

const fieldClass = "rounded-[3px] border border-border bg-bg px-2 py-1 text-xs text-foreground outline-none focus:border-amber disabled:opacity-40";

/** Stays mounted when collapsed so the selection and unsaved edits survive. */
export function TemplateEditor({ initialTemplates, value, onChange, onLabelChange, disabled = false }: {
  initialTemplates: PromptTemplate[];
  value: string;
  onChange: (value: string) => void;
  onLabelChange: (label: string) => void;
  disabled?: boolean;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(BUILTIN_PROMPT_TEMPLATES[0].id);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mode, setMode] = useState<"create" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const selected = [...BUILTIN_PROMPT_TEMPLATES, ...templates].find((t) => t.id === selectedId)!;
  const custom = !selectedId.startsWith("builtin:");
  const dirty = value !== selected.content;
  const busy = disabled || saving;
  const validContent = value.trim().length > 0 && value.length <= MAX_TEMPLATE_LENGTH;

  function selectTemplate(id: string) {
    const next = [...BUILTIN_PROMPT_TEMPLATES, ...templates].find((t) => t.id === id);
    if (!next) return;
    setSelectedId(id);
    onChange(next.content);
    onLabelChange(next.name);
    setPendingId(null);
    setMode(null);
    setError(null);
    setNotice("");
  }

  async function mutate(action: TemplateAction) {
    if (lock.current || disabled) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const res = await fetch("/api/assistant/templates", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save the template. Try again.");
      }
      const { template }: { template: PromptTemplate | null } = await res.json();
      if (action.action === "delete") {
        setTemplates((items) => items.filter((t) => t.id !== action.id));
        selectTemplate(BUILTIN_PROMPT_TEMPLATES[0].id);
        setNotice("Template deleted. General legal is selected.");
      } else if (template) {
        setTemplates((items) => action.action === "create" ? [...items, template] : items.map((t) => t.id === template.id ? template : t));
        setSelectedId(template.id);
        onLabelChange(template.name);
        // Renaming must never discard unsaved content edits.
        if (action.action !== "rename") onChange(template.content);
        setNotice(action.action === "rename" ? "Template renamed." : "Template saved.");
      }
      setMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template. Try again.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return <section aria-label="Assistant prompt templates">
    <div className="border-b border-border-soft bg-panel px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="assistant-template" className="text-xs text-muted-foreground">Template</label>
        <select id="assistant-template" value={selectedId} disabled={busy || mode !== null} className={`${fieldClass} max-w-full`} onChange={(e) => {
          if (e.target.value === selectedId) return;
          if (dirty) setPendingId(e.target.value);
          else selectTemplate(e.target.value);
        }}>
          <optgroup label="Built-in">
            {BUILTIN_PROMPT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
          <optgroup label="Your templates">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        </select>
        <span className="text-xs text-dim">{dirty ? "Unsaved edits" : custom ? "Saved locally" : "Built-in preset"}</span>
        <Btn size="sm" disabled={busy || !validContent || mode !== null || pendingId !== null} onClick={() => { setMode("create"); setName(`${selected.name} copy`.slice(0, 120)); setError(null); }}>Save as new</Btn>
        {custom && <>
          <Btn size="sm" disabled={busy || !dirty || !validContent || mode !== null || pendingId !== null} onClick={() => void mutate({ action: "update", id: selectedId, content: value })}>Save changes</Btn>
          <Btn size="sm" variant="ghost" disabled={busy || mode !== null || pendingId !== null} onClick={() => { setMode("rename"); setName(selected.name); setError(null); }}>Rename</Btn>
          <Btn size="sm" variant="ghost" disabled={busy || mode !== null || pendingId !== null} onClick={() => { setMode("delete"); setError(null); }}>Delete</Btn>
        </>}
      </div>
      {pendingId && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" role="alert">
        <span>Switching to {[...BUILTIN_PROMPT_TEMPLATES, ...templates].find((t) => t.id === pendingId)?.name} discards your unsaved prompt edits.</span>
        <Btn size="sm" disabled={busy} onClick={() => selectTemplate(pendingId)}>Discard edits and switch</Btn>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setPendingId(null)}>Keep editing</Btn>
      </div>}
      {(mode === "create" || mode === "rename") && <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || (mode === "create" && !validContent)) return;
        void mutate(mode === "create" ? { action: "create", name: name.trim(), content: value } : { action: "rename", id: selectedId, name: name.trim() });
      }}>
        <label htmlFor="template-name" className="text-xs">Template name</label>
        <input id="template-name" autoFocus maxLength={120} value={name} disabled={busy} className={`${fieldClass} min-w-0 max-w-full`} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && !busy) setMode(null); }} />
        <Btn size="sm" type="submit" disabled={busy || !name.trim() || (mode === "create" && !validContent)}>{saving ? "Saving…" : mode === "create" ? "Save template" : "Save name"}</Btn>
        <Btn size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setMode(null)}>Cancel</Btn>
      </form>}
      {mode === "delete" && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" role="alert">
        <span>Delete “{selected.name}” permanently? General legal will replace this prompt{dirty ? ", discarding your unsaved edits" : ""}. Chat messages are kept.</span>
        <Btn size="sm" disabled={busy} onClick={() => void mutate({ action: "delete", id: selectedId })}>Delete template</Btn>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</Btn>
      </div>}
      {error && <p role="alert" className="mt-2 text-xs text-red">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p>}
      {value.length > MAX_TEMPLATE_LENGTH && <p role="alert" className="mt-2 text-xs text-amber">Shorten the prompt to 100,000 characters or fewer to save it.</p>}
      <p className="mt-2 text-xs text-dim">Custom templates are saved on this device. Reload starts with General legal; unsaved edits are lost.</p>
    </div>
    <PromptPanel value={value} onChange={(next) => { onChange(next); setNotice(""); }} onReset={() => { onChange(selected.content); setNotice(""); }} disabled={busy || mode !== null || pendingId !== null} resetTitle="Restore the selected template’s saved text" />
  </section>;
}
