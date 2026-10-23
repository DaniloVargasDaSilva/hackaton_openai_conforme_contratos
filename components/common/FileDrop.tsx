"use client";

import { useDropzone } from "react-dropzone";
import type { UploadError } from "@/lib/contracts-3vias";
import { Spinner } from "./States";

export type UploadState = {
  status: "idle" | "reading" | "sending" | "ok" | "error";
  fileName?: string;
  summary?: string; // "8 linhas lidas"
  errors: UploadError[];
};

export const idleUpload: UploadState = { status: "idle", errors: [] };

// Dropzone tracejada (.drop do design). Lê o arquivo como texto e devolve; não faz parse.
export function FileDrop({
  label,
  hint,
  accept,
  state,
  onText,
}: {
  label: string; // "Nota fiscal · XML"
  hint: string; // "arraste o XML da NF ou clique para escolher"
  accept: Record<string, string[]>;
  state: UploadState;
  onText: (text: string, fileName: string) => void;
}) {
  const busy = state.status === "reading" || state.status === "sending";
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: false,
    disabled: busy,
    onDrop: async (files) => {
      const f = files[0];
      if (!f) return;
      onText(await f.text(), f.name);
    },
  });

  const status =
    state.status === "reading"
      ? "Lendo arquivo…"
      : state.status === "sending"
        ? "Casando com os itens do contrato…"
        : state.status === "ok"
          ? state.summary ?? "Arquivo lido"
          : state.status === "error"
            ? `${state.errors.length} problema(s) no arquivo`
            : hint;

  return (
    <div
      {...getRootProps()}
      className="drop cursor-pointer"
      style={isDragActive ? { borderColor: "var(--acento)", background: "var(--acento-leve)" } : undefined}
    >
      <input {...getInputProps()} />
      <div className="drop-ico">{busy ? <Spinner /> : state.status === "ok" ? "✓" : "⇪"}</div>
      <div className="min-w-0">
        <div className="text-[13px] text-tinta-tenue">{label}</div>
        <div className="truncate font-semibold">{state.fileName ?? "Nenhum arquivo"}</div>
        <div
          className="text-[13px]"
          style={{
            color:
              state.status === "error" ? "var(--falta)" : state.status === "ok" ? "var(--dinheiro)" : "var(--tinta-fraca)",
          }}
        >
          {status}
        </div>
      </div>
    </div>
  );
}
