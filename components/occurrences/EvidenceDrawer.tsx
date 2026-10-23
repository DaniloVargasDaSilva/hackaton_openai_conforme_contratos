"use client";

import { SidePanel } from "@/components/common/SidePanel";
import { StatusChip } from "@/components/common/Chips";
import { money } from "@/lib/format";
import type { ReviewBody } from "@/lib/api-client";
import type { Occurrence3 } from "@/lib/contracts-3vias";
import { ReviewControls } from "./ReviewControls";
import { ReviewHistory } from "./ReviewHistory";

const SECAO = "mb-2 mt-5 text-[13px] font-medium uppercase tracking-[.08em] text-tinta-tenue";
const CAIXA = "rounded-[10px] border border-filete bg-superficie p-3.5";
const ROTULO = "mb-2 text-[13px] text-tinta-tenue";

export function EvidenceDrawer({
  occurrence,
  onClose,
  reviewer,
  onSubmit,
  saving,
}: {
  occurrence: Occurrence3 | null;
  onClose: () => void;
  reviewer: string;
  onSubmit: (body: ReviewBody) => void | Promise<unknown>;
  saving: boolean;
}) {
  const o = occurrence;
  return (
    <SidePanel
      open={o !== null}
      onClose={onClose}
      width={820}
      title={
        o && (
          <div>
            <div className="text-[13px] text-tinta-tenue">{o.itemName}</div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="m-0 text-[21px] font-semibold">{o.title}</h2>
              <span className="num text-[28px] font-semibold text-falta">{money(o.impact)}</span>
            </div>
            <div className="mt-2">
              <StatusChip status={o.status} />
            </div>
          </div>
        )
      }
    >
      {o && (
        <div>
          <div className="mb-2.5 text-[13px] font-medium uppercase tracking-[.08em] text-tinta-tenue">
            Evidência · três vias
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            <div className={CAIXA}>
              <div className={ROTULO}>Contrato</div>
              {o.evidence.contract.length === 0 && <div className="text-tinta-fraca">—</div>}
              {o.evidence.contract.map((c, i) => (
                <div key={`${c.clauseRef}-${i}`} className={i > 0 ? "mt-3" : ""}>
                  <div className="mb-1 text-[13px] font-semibold text-tinta-fraca">Cláusula {c.clauseRef}</div>
                  <div className="folha p-3 text-[15px] leading-[1.55]">
                    <span className="mt">{c.quote}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={CAIXA}>
              <div className={ROTULO}>Nota fiscal</div>
              {o.evidence.invoice ? (
                <>
                  <div className="mb-1 text-[13px] font-semibold text-tinta-fraca">{o.evidence.invoice.source}</div>
                  <div className="num text-[15px] leading-normal">{o.evidence.invoice.text}</div>
                </>
              ) : (
                <div className="text-tinta-fraca">—</div>
              )}
            </div>
            <div className={CAIXA}>
              <div className={ROTULO}>Entrega</div>
              <div className="mb-1 text-[13px] font-semibold text-tinta-fraca">{o.evidence.delivery.source}</div>
              <div className="num text-[15px] leading-normal">{o.evidence.delivery.text}</div>
            </div>
          </div>

          <div className={SECAO}>Explicação</div>
          <p className="m-0 text-[15px] leading-[1.55] text-tinta-fraca">{o.explanation}</p>

          <div className={SECAO}>Decisão</div>
          <ReviewControls key={o.id} occurrence={o} reviewer={reviewer} onSubmit={onSubmit} saving={saving} />

          <div className={SECAO}>Histórico</div>
          <ReviewHistory reviews={o.reviews} />
        </div>
      )}
    </SidePanel>
  );
}
