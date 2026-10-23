"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/common/States";

// Célula editável da tabela de 3 vias. Clique (ou Enter) abre o campo; Enter/blur salva, Esc cancela.
// O valor mostrado vem sempre de `value` (cache da API): se o salvamento falhar, ele "volta" sozinho.
export function EditableCell({
  value,
  type,
  display,
  label,
  onSave,
  step = "any",
}: {
  value: number | string;
  type: "number" | "date";
  display: React.ReactNode;
  label: string; // "quantidade faturada" (leitores de tela)
  onSave: (v: number | string) => Promise<void>;
  step?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const closed = useRef(false); // evita salvar duas vezes (Enter + blur) ou salvar depois do Esc

  const open = () => {
    if (pending) return;
    closed.current = false;
    setDraft(type === "date" ? String(value).slice(0, 10) : String(value));
    setEditing(true);
  };

  const cancel = () => {
    closed.current = true;
    setEditing(false);
  };

  const commit = async () => {
    if (closed.current) return;
    closed.current = true;
    setEditing(false);
    let next: number | string;
    if (type === "number") {
      const n = Number(draft.trim().replace(/\./g, "").replace(",", "."));
      // aceita "62.5" também: se o ponto vier sem vírgula, trata como decimal
      const direct = Number(draft.trim());
      next = draft.includes(",") ? n : direct;
      if (draft.trim() === "" || Number.isNaN(next)) return;
    } else {
      if (!draft) return;
      next = draft;
    }
    const same = type === "number" ? next === value : next === String(value).slice(0, 10);
    if (same) return;
    setPending(true);
    try {
      await onSave(next);
    } catch {
      // o toast de erro já vem do hook; o valor volta porque o cache não mudou
    } finally {
      setPending(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={`Editar ${label}`}
        type={type === "date" ? "date" : "text"}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? step : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="num h-[30px] rounded-md border-2 border-acento bg-superficie px-2 text-[14px] text-tinta outline-none"
        style={{ width: type === "date" ? 140 : 92, boxShadow: "0 0 0 3px var(--acento-leve)" }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Editar ${label}`}
      title="Clique para corrigir"
      className="group/ed -mx-1 inline-flex cursor-text items-center gap-1 rounded px-1 text-inherit hover:bg-superficie-2"
      style={{ font: "inherit", background: "transparent", border: 0 }}
    >
      <span>{display}</span>
      {pending ? (
        <span className="text-acento">
          <Spinner />
        </span>
      ) : (
        <span aria-hidden className="text-[13px] text-tinta-tenue opacity-0 transition-opacity group-hover/ed:opacity-100 group-focus-visible/ed:opacity-100">
          ✎
        </span>
      )}
    </button>
  );
}
