"use client";

import { useState } from "react";
import { FileDrop, idleUpload, type UploadState } from "@/components/common/FileDrop";
import { errorMessage } from "@/lib/api-error";
import type { UploadError } from "@/lib/contracts-3vias";
import { useUploadDeliveries, useUploadNf } from "@/hooks/mutations";
import { useLines, useNf } from "@/hooks/queries";
import { UploadErrors } from "./UploadErrors";

const XML = { "text/xml": [".xml"], "application/xml": [".xml"] };
const CSV = { "text/csv": [".csv"] };

// Duas dropzones: NF (XML) e entregas (CSV). Cada uma lê o arquivo, envia e mostra o resultado.
export function UploadPanel({ contractId }: { contractId: string }) {
  const [nfLocal, setNf] = useState<UploadState>(idleUpload);
  const [csvLocal, setCsv] = useState<UploadState>(idleUpload);
  // Ao voltar para a aba, o cartão mostra o que já foi enviado (NF e linhas vêm da API).
  const nfDoc = useNf(contractId).data;
  const lines = useLines(contractId).data ?? [];
  const delivered = lines.filter(
    (l) => l.deliveredAt != null || l.measuredQty != null || l.activeUsers != null || l.measuredPct != null,
  ).length;
  const nf: UploadState =
    nfLocal.status === "idle" && nfDoc
      ? { status: "ok", fileName: `NF ${nfDoc.number} enviada`, errors: [], summary: `${nfDoc.items.length} linhas lidas` }
      : nfLocal;
  const csv: UploadState =
    csvLocal.status === "idle" && delivered > 0
      ? { status: "ok", fileName: "Entregas enviadas", errors: [], summary: `${delivered} registros` }
      : csvLocal;
  const uploadNf = useUploadNf(contractId);
  const uploadDeliveries = useUploadDeliveries(contractId);

  async function send(
    fileName: string,
    set: (s: UploadState) => void,
    run: () => Promise<{ errors: UploadError[]; count: number }>,
  ) {
    set({ status: "sending", fileName, errors: [] });
    try {
      const { errors, count } = await run();
      if (errors.length > 0) set({ status: "error", fileName, errors });
      else set({ status: "ok", fileName, errors: [], summary: `${count} linhas lidas` });
    } catch (err) {
      set({ status: "error", fileName, errors: [{ row: null, message: errorMessage(err) }] });
    }
  }

  return (
    <section aria-label="Envio de arquivos" className="mb-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FileDrop
            label="Nota fiscal · XML"
            hint="arraste o XML da NF ou clique para escolher"
            accept={XML}
            state={nf}
            onText={(xml, name) => {
              setNf({ status: "reading", fileName: name, errors: [] });
              void send(name, setNf, async () => {
                const res = await uploadNf.mutateAsync(xml);
                return { errors: res.errors, count: res.nf?.items.length ?? res.lines.length };
              });
            }}
          />
          {nf.status === "error" && <UploadErrors errors={nf.errors} />}
        </div>
        <div>
          <FileDrop
            label="Entregas · CSV"
            hint="arraste o CSV de entregas ou clique para escolher"
            accept={CSV}
            state={csv}
            onText={(text, name) => {
              setCsv({ status: "reading", fileName: name, errors: [] });
              void send(name, setCsv, async () => {
                const res = await uploadDeliveries.mutateAsync(text);
                return { errors: res.errors, count: res.lines.length };
              });
            }}
          />
          {csv.status === "error" && <UploadErrors errors={csv.errors} />}
        </div>
      </div>
      <p className="mt-2 text-[13px] text-tinta-tenue">
        Baixar arquivos de exemplo:{" "}
        <a href="/demo/nf-8812-ficticia.xml" download className="text-tinta-fraca underline">
          NF (XML)
        </a>
        {" · "}
        <a href="/demo/entregas-outubro.csv" download className="text-tinta-fraca underline">
          entregas (CSV)
        </a>
      </p>
    </section>
  );
}
