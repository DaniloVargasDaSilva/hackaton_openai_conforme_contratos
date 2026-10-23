"use client";

import { useState } from "react";
import { FileDrop, idleUpload, type UploadState } from "@/components/common/FileDrop";
import { errorMessage } from "@/lib/api-error";
import type { UploadError } from "@/lib/contracts-3vias";
import { useReadInvoicePhoto, useUploadDeliveries, useUploadNf } from "@/hooks/mutations";
import { Spinner } from "@/components/common/States";
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
  const readPhoto = useReadInvoicePhoto(contractId);
  // Foto da NF: miniatura local + estado da leitura pela IA.
  const [photo, setPhoto] = useState<{ url: string; status: "reading" | "ok" | "error"; message?: string } | null>(null);

  async function onPhoto(file: File) {
    const url = URL.createObjectURL(file);
    setPhoto({ url, status: "reading" });
    setNf({ status: "sending", fileName: "foto da NF", errors: [] });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const res = await readPhoto.mutateAsync({
        imageBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        mimeType: file.type || "image/jpeg",
      });
      if (res.errors.length > 0) {
        setNf({ status: "error", fileName: "foto da NF", errors: res.errors });
        setPhoto({ url, status: "error", message: "Não deu para ler a foto. Envie o XML." });
      } else {
        setNf({ status: "ok", fileName: "foto da NF", errors: [], summary: `${res.nf?.items.length ?? res.lines.length} linhas lidas` });
        setPhoto({ url, status: "ok" });
      }
    } catch (err) {
      setNf({ status: "error", fileName: "foto da NF", errors: [{ row: null, message: errorMessage(err) }] });
      setPhoto({ url, status: "error", message: "Leitura por foto indisponível. Envie o XML." });
    }
  }
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
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className={`btn btn-peq cursor-pointer ${photo?.status === "reading" ? "pointer-events-none opacity-60" : ""}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onPhoto(f);
                }}
              />
              📷 Tirar foto da NF
            </label>
            {photo && (
              <span className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura local (blob) */}
                <img src={photo.url} alt="Foto da NF" className="h-12 w-12 rounded-md border border-filete object-cover" />
                {photo.status === "reading" && (
                  <span className="flex items-center gap-2 text-[14px] text-tinta-fraca">
                    <Spinner /> Lendo a nota com IA…
                  </span>
                )}
                {photo.status === "ok" && <span className="chip chip-neutro">lida da foto (IA) · confira os valores</span>}
                {photo.status === "error" && <span className="text-[14px] text-falta">{photo.message}</span>}
              </span>
            )}
          </div>
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
