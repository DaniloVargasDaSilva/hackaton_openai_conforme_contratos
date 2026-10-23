"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { resetData } from "@/lib/api-client";

// "Resetar dados" no topo: apaga contratos, NF, entregas e ocorrências do banco e limpa o cache da tela.
export function ResetDataButton() {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm("Apagar TODOS os dados (contratos, NF, entregas e ocorrências)? Não dá para desfazer.")) return;
    setBusy(true);
    try {
      await resetData("limpo");
      qc.clear();
      router.push("/");
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não consegui resetar os dados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className="chip chip-neutro cursor-pointer disabled:opacity-60">
      {busy ? "Resetando…" : "Resetar dados"}
    </button>
  );
}
