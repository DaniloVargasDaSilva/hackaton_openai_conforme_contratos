"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCheck, qk } from "@/hooks/queries";
import { useReport } from "@/hooks/mutations";
import type { Report } from "@/lib/contracts";
import { dateTime } from "@/lib/format";
import { SourceChip } from "@/components/common/Chips";
import { ErrorState, Spinner } from "@/components/common/States";

export function ReportTab({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const mutation = useReport(contractId);
  const check = useCheck(contractId);

  // O relatório já gerado fica no cache e não some ao trocar de aba.
  const report = mutation.data ?? qc.getQueryData<Report>(qk.report(contractId));
  const running = mutation.isPending;

  const confirmed = check.data?.occurrences.filter((o) => o.status === "confirmada").length;
  const noneConfirmed = check.data != null && confirmed === 0;
  const pending = check.data?.occurrences.filter((o) => o.status === "pendente").length ?? 0;

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      toast.success("Relatório copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold tracking-[-0.01em]">Relatório de conferência</h2>
          <p className="mt-1 text-tinta-fraca">
            {confirmed != null ? (
              <>
                <span className="num">{confirmed}</span>{" "}
                {confirmed === 1 ? "ocorrência confirmada entra" : "ocorrências confirmadas entram"} no texto.
              </>
            ) : (
              "Texto pronto para enviar ao fornecedor, com base nas ocorrências confirmadas."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button className="btn" onClick={copy} disabled={running}>
              Copiar
            </button>
          )}
          <button className="btn btn-pri" onClick={() => mutation.mutate()} disabled={running || noneConfirmed}>
            {running ? (
              <>
                <Spinner /> Redigindo…
              </>
            ) : report ? (
              "Gerar de novo"
            ) : (
              "Gerar relatório"
            )}
          </button>
        </div>
      </div>

      {noneConfirmed && (
        <div
          role="status"
          className="mb-4 rounded-xl border px-4 py-3 text-[15px] font-semibold"
          style={{ background: "var(--alerta-leve)", borderColor: "var(--alerta-borda)", color: "var(--alerta)" }}
        >
          {pending > 0
            ? `Há ${pending} ${pending === 1 ? "ocorrência pendente" : "ocorrências pendentes"}. Confirme ao menos uma na aba Ocorrências para gerar o relatório.`
            : "Não há ocorrências para o relatório. Envie a NF e as entregas na aba Faturado × entregue e confirme as ocorrências."}
        </div>
      )}

      {mutation.isError && (
        <ErrorState error={mutation.error} onRetry={() => mutation.mutate()} title="Não deu para gerar o relatório" />
      )}

      {report && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SourceChip source={report.source} />
            <span className="text-[13px] text-tinta-tenue">
              gerado em <span className="num">{dateTime(report.generatedAt)}</span>
            </span>
          </div>
          <article
            className="folha px-5 py-6 md:px-14 md:py-11"
            style={{ fontSize: 17, lineHeight: 1.7, whiteSpace: "pre-wrap", opacity: running ? 0.6 : 1 }}
          >
            {report.text}
          </article>
        </>
      )}

      {!report && !running && !mutation.isError && (
        <div className="card text-center text-tinta-fraca" style={{ padding: "32px 20px" }}>
          Nenhum relatório gerado ainda. Clique em &ldquo;Gerar relatório&rdquo;.
        </div>
      )}
    </section>
  );
}
