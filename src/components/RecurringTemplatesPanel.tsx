"use client";

import { useEffect, useState } from "react";
import type { RecurringTemplate, Recurrence } from "@/lib/types";
import {
  subscribeRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
} from "@/lib/firestore";
import { RecurrencePicker } from "./RecurrencePicker";
import { formatRecurrence } from "@/lib/recurrence";

interface Props {
  uid: string;
}

const DEFAULT_RECURRENCE: Recurrence = {
  frequency: "monthly",
  interval: 1,
  monthlyMode: "dayOfWeek",
  dayOfWeek: 1,
  weekOfMonth: 1,
};

export function RecurringTemplatesPanel({ uid }: Props) {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence | null>(DEFAULT_RECURRENCE);

  useEffect(() => {
    return subscribeRecurringTemplates(uid, setTemplates);
  }, [uid]);

  const resetForm = () => {
    setTitle("");
    setRecurrence(DEFAULT_RECURRENCE);
    setAdding(false);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!title.trim() || !recurrence) return;
    await createRecurringTemplate(uid, { title: title.trim(), recurrence });
    resetForm();
  };

  const handleEdit = (t: RecurringTemplate) => {
    setEditingId(t.id);
    setTitle(t.title);
    setRecurrence(t.recurrence);
    setAdding(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !title.trim() || !recurrence) return;
    await updateRecurringTemplate(uid, editingId, { title: title.trim(), recurrence });
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteRecurringTemplate(uid, id);
    if (editingId === id) resetForm();
  };

  const isFormOpen = adding || editingId !== null;

  const inputCls = "font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-1.5 outline-none w-full focus:border-border-strong transition-colors placeholder:text-tx-3";
  const btnPrimary = "text-[12px] font-[inherit] px-4 py-1.5 rounded cursor-pointer bg-tx text-bg border border-tx hover:opacity-90 transition-all";
  const btnGhost = "text-[12px] font-[inherit] px-3 py-1.5 rounded cursor-pointer bg-transparent border border-border text-tx-3 hover:border-border-strong hover:text-tx-2 transition-all";

  return (
    <div className="space-y-3">

      {/* Liste des templates */}
      {templates.length === 0 && !isFormOpen && (
        <p className="text-[12px] text-tx-3 italic py-2">Aucun modèle récurrent.</p>
      )}

      {templates.map(t => (
        <div
          key={t.id}
          className={`flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors ${
            editingId === t.id ? "border-border-strong bg-bg-hover" : "border-border bg-bg-subtle"
          }`}
        >
          <div className="min-w-0">
            <p className="text-[13px] text-tx font-medium truncate">{t.title}</p>
            <p className="text-[11px] text-tx-3 mt-0.5">{formatRecurrence(t.recurrence)}</p>
          </div>
          <div className="flex gap-1.5 ml-3 shrink-0">
            <button
              onClick={() => editingId === t.id ? resetForm() : handleEdit(t)}
              className={btnGhost}
            >
              {editingId === t.id ? "Annuler" : "Modifier"}
            </button>
            <button
              onClick={() => handleDelete(t.id)}
              className="text-[12px] font-[inherit] px-2.5 py-1.5 rounded cursor-pointer bg-transparent border border-border text-red-400 hover:border-red-400 transition-all"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* Formulaire ajout / édition */}
      {isFormOpen && (
        <div className="border border-border rounded-xl p-4 space-y-4 bg-bg">
          <p className="text-[12px] font-medium text-tx-2">
            {editingId ? "Modifier le modèle" : "Nouveau modèle récurrent"}
          </p>

          <input
            type="text"
            placeholder="Nom de la tâche…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputCls}
            autoFocus
          />

          <RecurrencePicker value={recurrence} onChange={setRecurrence} />

          <div className="flex gap-2 pt-1">
            <button onClick={editingId ? handleSaveEdit : handleAdd} className={btnPrimary}>
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
            <button onClick={resetForm} className={btnGhost}>Annuler</button>
          </div>
        </div>
      )}

      {/* Bouton ouvrir formulaire */}
      {!isFormOpen && (
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="text-[12px] font-[inherit] text-tx-3 hover:text-tx-2 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          + Ajouter un modèle
        </button>
      )}
    </div>
  );
}
