"use client";

import { useReviewer } from "@/hooks/useReviewer";

// "Revisor [Carla (TI)]" no topo; quem confirma/descarta ocorrências.
export function ReviewerField() {
  const { reviewer, setReviewer } = useReviewer();
  const initial = reviewer.trim().charAt(0).toUpperCase() || "?";
  return (
    <label className="flex items-center gap-2">
      <span className="max-sm:hidden">Revisor</span>
      <span className="pilula" style={{ height: 32 }}>
        <span className="avatar" style={{ width: 22, height: 22, fontSize: 12 }}>
          {initial}
        </span>
        <input
          aria-label="Nome do revisor"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="seu nome"
          className="w-[110px] bg-transparent font-semibold text-tinta outline-none placeholder:font-normal placeholder:text-tinta-tenue"
        />
      </span>
    </label>
  );
}
