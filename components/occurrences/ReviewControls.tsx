"use client";

import { useState } from "react";
import { Spinner } from "@/components/common/States";
import type { ReviewBody } from "@/lib/api-client";
import type { Occurrence3 } from "@/lib/contracts-3vias";

type Status = Occurrence3["status"];

const OPTIONS: { value: Status; label: string; on: React.CSSProperties }[] = [
  { value: "pendente", label: "Pendente", on: { background: "var(--alerta-leve)", color: "var(--alerta)" } },
  { value: "confirmada", label: "Confirmada", on: { background: "var(--dinheiro-leve)", color: "var(--dinheiro)" } },
  { value: "descartada", label: "Descartada", on: { background: "var(--superficie-2)", color: "var(--tinta)" } },
];

export function ReviewControls({
  occurrence,
  reviewer,
  onSubmit,
  saving,
}: {
  occurrence: Occurrence3;
  reviewer: string;
  onSubmit: (body: ReviewBody) => void | Promise<unknown>;
  saving: boolean;
}) {
  const [status, setStatus] = useState<Status>(occurrence.status);
  const [comment, setComment] = useState("");
  const noReviewer = reviewer.trim() === "";
  const disabled = noReviewer || saving;

  return (
    <div>
      <div role="radiogroup" aria-label="Decisão" className="flex overflow-hidden rounded-lg border border-filete-forte bg-superficie">
        {OPTIONS.map((o, i) => {
          const active = status === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setStatus(o.value)}
              className="flex-1 cursor-pointer border-0 bg-transparent py-[9px] text-center text-[14px] font-semibold text-tinta-fraca disabled:cursor-not-allowed disabled:opacity-55"
              style={{
                borderRight: i < OPTIONS.length - 1 ? "1px solid var(--filete-forte)" : 0,
                ...(active ? o.on : null),
              }}
            >
              {active && "● "}
              {o.label}
            </button>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Comentário</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={disabled}
          placeholder="Comentário (opcional)"
          rows={3}
          className="w-full resize-y rounded-lg border border-filete-forte bg-superficie p-3 text-[15px] text-tinta disabled:opacity-55"
          style={{ minHeight: 70, fontFamily: "inherit" }}
        />
      </label>

      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-3">
        {noReviewer && <span className="text-[13px] text-alerta">Preencha o revisor no topo</span>}
        <button
          type="button"
          className="btn btn-pri"
          disabled={disabled}
          onClick={async () => {
            try {
              await onSubmit({ status, comment: comment.trim(), reviewer: reviewer.trim() });
              setComment("");
            } catch {
              // o toast de erro vem da mutation; mantém o comentário digitado
            }
          }}
        >
          {saving && <Spinner />}
          Salvar revisão
        </button>
      </div>
    </div>
  );
}
