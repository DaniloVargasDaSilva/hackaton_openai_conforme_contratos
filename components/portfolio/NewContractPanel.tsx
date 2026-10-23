"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { CreateContractBody } from "@/lib/contracts";
import { errorMessage } from "@/lib/api-error";
import { useCreateContract } from "@/hooks/mutations";
import { SidePanel } from "@/components/common/SidePanel";
import { Spinner } from "@/components/common/States";

type Field = "number" | "supplier" | "object" | "annualValue" | "renewsAt" | "text";

const empty = { number: "", supplier: "", object: "", annualValue: "", renewsAt: "", text: "" };

// Formulário de contrato novo: campos do CreateContractBody, texto colado ou lido de um .txt.
export function NewContractPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const create = useCreateContract();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [fileName, setFileName] = useState<string | null>(null);

  const set = (k: Field, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const drop = useDropzone({
    accept: { "text/plain": [".txt"] },
    multiple: false,
    noClick: true,
    onDrop: async (files) => {
      const f = files[0];
      if (!f) return;
      set("text", await f.text());
      setFileName(f.name);
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = CreateContractBody.safeParse({
      ...form,
      annualValue: form.annualValue.trim() === "" ? NaN : Number(form.annualValue.replace(/\./g, "").replace(",", ".")),
    });
    // O schema aceita string vazia; no formulário esses campos são obrigatórios.
    const required: Partial<Record<Field, string>> = {};
    for (const k of ["number", "supplier", "object", "renewsAt"] as const) {
      if (!form[k].trim()) required[k] = "Campo obrigatório.";
    }
    if (!parsed.success || Object.keys(required).length > 0) {
      const next: Partial<Record<Field, string>> = { ...required };
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const k = issue.path[0] as Field;
        if (next[k]) continue;
        next[k] =
          k === "text"
            ? "Cole o texto do contrato (mínimo de 50 caracteres) ou solte um .txt."
            : k === "annualValue"
              ? "Informe o valor anual em reais."
              : "Campo obrigatório.";
      }
      setErrors(next);
      return;
    }
    try {
      const detail = await create.mutateAsync(parsed.data);
      setForm(empty);
      setFileName(null);
      onClose();
      router.push(`/contratos/${detail.contract.id}?aba=contrato`);
    } catch {
      // mensagem aparece abaixo do formulário
    }
  };

  const input = (k: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-tinta-fraca">{label}</span>
      <input
        {...props}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={!!errors[k]}
        className="h-10 rounded-lg border bg-superficie px-3 text-[15px] outline-none focus:border-acento"
        style={{ borderColor: errors[k] ? "var(--falta)" : "var(--filete-forte)" }}
      />
      {errors[k] && <span className="text-[13px] text-falta">{errors[k]}</span>}
    </label>
  );

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      width={640}
      title={
        <div>
          <div className="text-[13px] text-tinta-tenue">Carteira</div>
          <div className="text-[19px] font-semibold">Novo contrato</div>
        </div>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {input("number", "Número", { placeholder: "042/2026" })}
          {input("supplier", "Fornecedor", { placeholder: "NuvemSoft Tecnologia" })}
        </div>
        {input("object", "Objeto", { placeholder: "Suíte, CRM, backup, IA e suporte" })}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {input("annualValue", "Valor anual (R$)", { inputMode: "decimal", placeholder: "318000" })}
          {input("renewsAt", "Renovação", { type: "date" })}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-tinta-fraca">Texto do contrato</span>
          <div
            {...drop.getRootProps()}
            className="rounded-xl border-[1.5px] border-dashed p-2"
            style={{
              borderColor: drop.isDragActive ? "var(--acento)" : errors.text ? "var(--falta)" : "var(--filete-forte)",
              background: drop.isDragActive ? "var(--acento-leve)" : "var(--superficie)",
            }}
          >
            <input {...drop.getInputProps()} />
            <textarea
              value={form.text}
              onChange={(e) => {
                set("text", e.target.value);
                setFileName(null);
              }}
              rows={9}
              placeholder="Cole aqui o texto do contrato, ou solte um arquivo .txt nesta área."
              className="font-doc w-full resize-y bg-transparent p-2 text-[15px] leading-relaxed outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 text-[13px] text-tinta-fraca">
              <span>
                {fileName ? `Lido de ${fileName}` : "Aceita .txt"} · <span className="num">{form.text.length}</span> caracteres
              </span>
              <button type="button" className="btn btn-peq" onClick={drop.open}>
                Escolher .txt
              </button>
            </div>
          </div>
          {errors.text && <span className="text-[13px] text-falta">{errors.text}</span>}
          <span className="text-[13px] text-tinta-tenue">
            Exemplo: <a href="/demo/contrato-042-2026-ficticio.txt" download>contrato-042-2026-ficticio.txt</a>
          </span>
        </div>

        {create.error && (
          <div role="alert" className="chip-falta rounded-lg border px-3 py-2 text-[14px]">
            {errorMessage(create.error)}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-filete pt-4">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-pri" disabled={create.isPending}>
            {create.isPending ? (
              <>
                <Spinner /> Enviando…
              </>
            ) : (
              "Criar contrato"
            )}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
