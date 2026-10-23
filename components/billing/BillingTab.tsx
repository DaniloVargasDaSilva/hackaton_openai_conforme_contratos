"use client";

import { useState } from "react";
import { ErrorState, Skeleton } from "@/components/common/States";
import { useContract, useCheck, useLines, useNf } from "@/hooks/queries";
import { usePatchLine } from "@/hooks/mutations";
import type { InvoiceLinePatch } from "@/lib/contracts";
import { competence } from "@/lib/format";
import { NfDocument } from "./NfDocument";
import { ThreeWayTable } from "./ThreeWayTable";
import { UploadPanel } from "./UploadPanel";

// Aba "Faturado × entregue": envio dos arquivos, NF fictícia e conferência em 3 vias.
export function BillingTab({ contractId }: { contractId: string }) {
  const contract = useContract(contractId);
  const lines = useLines(contractId);
  const nf = useNf(contractId);
  const check = useCheck(contractId);
  const patch = usePatchLine(contractId);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  async function onEdit(lineId: string, p: InvoiceLinePatch) {
    setSavingLineId(lineId);
    try {
      await patch.mutateAsync({ lineId, patch: p });
    } catch {
      // toast de erro já vem do hook; o valor volta porque o cache não mudou
    } finally {
      setSavingLineId(null);
    }
  }

  const erro = contract.error ?? lines.error ?? check.error;
  const carregando = contract.isLoading || lines.isLoading || check.isLoading;

  return (
    <div>
      <UploadPanel contractId={contractId} />

      {erro ? (
        <ErrorState
          error={erro}
          onRetry={() => {
            void contract.refetch();
            void lines.refetch();
            void check.refetch();
          }}
        />
      ) : carregando || !contract.data || !lines.data || !check.data ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <Skeleton style={{ height: 380, borderRadius: 4 }} />
          <div className="space-y-3">
            <Skeleton style={{ height: 32, width: 320 }} />
            <Skeleton style={{ height: 300, borderRadius: 12 }} />
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          {/* No celular a tabela vem antes da NF */}
          <div className="order-2 max-w-[560px] xl:order-1 xl:max-w-none">
            <NfDocument nf={nf.data ?? null} />
          </div>
          <div className="order-1 xl:order-2">
            <ThreeWayTable
              items={contract.data.items}
              lines={lines.data}
              occurrences={check.data.occurrences}
              atStake={check.data.totals.atStake}
              competence={nf.data ? competence(nf.data.competence) : null}
              onEdit={onEdit}
              savingLineId={savingLineId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
