"use client";

import { useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { useCheck, useContract, useLines } from "@/hooks/queries";
import { useReview } from "@/hooks/mutations";
import { useReviewer } from "@/hooks/useReviewer";
import type { ReviewBody } from "@/lib/api-client";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { OccurrenceList } from "./OccurrenceList";
import { TotalsBar } from "./TotalsBar";
import { UsageRules } from "./UsageRules";

function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando ocorrências">
      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_1.4fr_1.4fr]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card">
            <Skeleton style={{ height: 14, width: "50%" }} />
            <Skeleton style={{ height: 36, width: "70%", marginTop: 12 }} />
            <Skeleton style={{ height: 13, width: "60%", marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-filete bg-superficie">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-filete px-4 py-[13px] last:border-b-0">
            <Skeleton style={{ height: 18, width: `${85 - i * 8}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OccurrencesTab({ contractId }: { contractId: string }) {
  const check = useCheck(contractId);
  const contract = useContract(contractId);
  const lines = useLines(contractId);
  const review = useReview(contractId);
  const { reviewer } = useReviewer();
  const [openId, setOpenId] = useState<string | null>(null);

  if (check.isPending) return <Loading />;
  if (check.isError) return <ErrorState error={check.error} onRetry={() => check.refetch()} />;

  const { occurrences, opportunities, totals } = check.data;
  // Lida do check atual, por id, para refletir a revisão na hora.
  const open = occurrences.find((o) => o.id === openId) ?? null;

  const submit = (body: ReviewBody) =>
    open ? review.mutateAsync({ occurrenceId: open.id, body }) : Promise.resolve();

  return (
    <div>
      <TotalsBar
        count={occurrences.length}
        pending={totals.pendingCount}
        atStake={totals.atStake}
        confirmed={totals.confirmed}
      />

      <div>
        {occurrences.length === 0 && (lines.data ?? []).length === 0 ? (
          <EmptyState title="Ainda não há conferência">
            Envie a NF e o CSV de entregas na aba Faturado × entregue.
          </EmptyState>
        ) : occurrences.length === 0 ? (
          // Verde = confere. EmptyState é neutro; retinge só aqui via variáveis do token.
          <div
            style={
              {
                "--superficie": "var(--dinheiro-leve)",
                "--filete": "var(--dinheiro-borda)",
                color: "var(--dinheiro)",
              } as React.CSSProperties
            }
          >
            <EmptyState title="Nada divergente nesta conferência">
              Tudo o que foi faturado e entregue confere com o contrato.
            </EmptyState>
          </div>
        ) : (
          <OccurrenceList occurrences={occurrences} selectedId={openId} onOpen={setOpenId} />
        )}

        <UsageRules
          opportunities={opportunities}
          items={contract.data?.items ?? []}
          lines={lines.data ?? []}
        />
      </div>

      <EvidenceDrawer
        occurrence={open}
        onClose={() => setOpenId(null)}
        reviewer={reviewer}
        onSubmit={submit}
        saving={review.isPending}
      />
    </div>
  );
}
